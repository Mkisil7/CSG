import { Activity, ALL_TRAITS, Floor, JobFloorType, MINUTES_PER_DAY, Resident, Trait } from './types';

const FIRST_NAMES = [
  'Ava', 'Bo', 'Cleo', 'Dex', 'Eli', 'Fern', 'Gus', 'Hana', 'Iris', 'Juno',
  'Kai', 'Lulu', 'Milo', 'Nia', 'Otis', 'Pia', 'Quinn', 'Rio', 'Sunny', 'Tess',
];

const PASTEL_COLORS = [
  0xf7a8b8, 0xa8d8f7, 0xb8f7a8, 0xf7e3a8, 0xd8a8f7, 0xf7c8a8, 0xa8f7e3, 0xc8a8f7,
];

let nextId = 1;

/** Reset the id counter (used when loading a save so new ids don't collide). */
export function bumpIdCounter(pastId: number): void {
  nextId = Math.max(nextId, pastId + 1);
}

function pickTraits(rand: () => number): Trait[] {
  const first = ALL_TRAITS[Math.floor(rand() * ALL_TRAITS.length)];
  if (rand() < 0.5) return [first];
  const rest = ALL_TRAITS.filter((t) => t !== first);
  return [first, rest[Math.floor(rand() * rest.length)]];
}

export function createResident(
  homeFloor: number,
  homeTowerId: string,
  rand: () => number = Math.random,
): Resident {
  const workStart = 480 + Math.floor(rand() * 120); // 8:00–10:00
  return {
    id: `r${nextId++}`,
    name: FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)],
    homeFloor,
    homeTowerId,
    jobFloor: null,
    jobTowerId: null,
    jobTier: 0,
    jobStartDay: null,
    blockedDays: 0,
    traits: pickTraits(rand),
    needs: { housing: 100, employment: 100, food: 100, entertainment: 100 },
    happiness: 100,
    unhappyDays: 0,
    workStart,
    workEnd: workStart + 480,
    didLunch: false,
    didShop: false,
    // New residents arrive at the lobby and ride up — real traffic from minute one.
    state: { kind: 'idle', floor: 0, activity: { kind: 'lobby', floor: 0 }, until: 0 },
    color: PASTEL_COLORS[Math.floor(rand() * PASTEL_COLORS.length)],
  };
}

export interface PlannedActivity {
  activity: Activity;
  duration: number;
}

/** Picks an open business floor of a type in the current tower, or null. */
export type FloorPicker = (type: JobFloorType) => Floor | null;

/**
 * Decide what a resident does next, given the time of day. This is the whole
 * "brain": home -> work -> lunch -> work -> maybe shop -> home. When home or
 * job is in another tower, the plan routes to the lobby as a 'commute'
 * activity instead; the Game turns that into a street-level commute.
 * Cross-tower workers leave home early enough to arrive on time:
 * departure = workStart − commute − estimated lift wait.
 */
export function planNext(
  resident: Resident,
  timeOfDay: number,
  pickFloor: FloorPicker,
  rand: () => number = Math.random,
  crossTowerJob = false,
  crossTowerHome = false,
  commuteMinutes = 0,
  estimatedWaitMinutes = 0,
): PlannedActivity {
  const home: Activity = crossTowerHome
    ? { kind: 'commute', floor: 0 }
    : { kind: 'home', floor: resident.homeFloor };

  if (resident.jobFloor !== null) {
    const work: Activity = crossTowerJob
      ? { kind: 'commute', floor: 0 }
      : { kind: 'work', floor: resident.jobFloor };
    const lunchTime = resident.workStart + 240;
    const departureBuffer = crossTowerJob
      ? Math.max(0, commuteMinutes + estimatedWaitMinutes)
      : 0;
    const departAt = Math.max(0, resident.workStart - departureBuffer);

    // A commuter already standing in their job tower ahead of shift waits in
    // the lobby — going "home" would ping-pong them across the street forever.
    if (!crossTowerJob && crossTowerHome && timeOfDay < resident.workStart) {
      return {
        activity: { kind: 'lobby', floor: 0 },
        duration: Math.max(1, resident.workStart - timeOfDay),
      };
    }
    if (timeOfDay < departAt) {
      return { activity: home, duration: departAt - timeOfDay };
    }
    if (timeOfDay < resident.workStart && !crossTowerJob) {
      return { activity: home, duration: resident.workStart - timeOfDay };
    }
    if (timeOfDay < resident.workEnd) {
      // Lunch/shopping happen in whatever tower they're currently standing in.
      if (timeOfDay >= lunchTime && !resident.didLunch && !crossTowerJob) {
        const spot = pickFloor('restaurant');
        if (spot) {
          resident.didLunch = true;
          return { activity: { kind: 'eat', floor: spot.level }, duration: 40 };
        }
      }
      if (crossTowerJob) return { activity: work, duration: 1 };
      const until = !resident.didLunch ? Math.min(lunchTime, resident.workEnd) : resident.workEnd;
      return { activity: work, duration: Math.max(1, until - timeOfDay) };
    }
    // After work.
    if (!resident.didShop && rand() < 0.6) {
      const spot = pickFloor('shop');
      if (spot) {
        resident.didShop = true;
        return { activity: { kind: 'shop', floor: spot.level }, duration: 30 };
      }
    }
    return { activity: home, duration: MINUTES_PER_DAY - timeOfDay + resident.workStart };
  }

  // Unemployed: potter around — occasional daytime shop/restaurant visits.
  if (timeOfDay >= 600 && timeOfDay < 1200 && rand() < 0.35) {
    const type: JobFloorType = rand() < 0.5 ? 'shop' : 'restaurant';
    const spot = pickFloor(type);
    if (spot) {
      if (type === 'shop') resident.didShop = true;
      else resident.didLunch = true;
      return {
        activity: { kind: type === 'shop' ? 'shop' : 'eat', floor: spot.level },
        duration: 30,
      };
    }
  }
  return { activity: home, duration: 45 + rand() * 90 };
}

/** Midnight reset of daily one-shot flags. */
export function resetDailyFlags(residents: Resident[]): void {
  for (const r of residents) {
    r.didLunch = false;
    r.didShop = false;
  }
}
