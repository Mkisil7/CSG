import { Activity, MINUTES_PER_DAY, Resident } from './types';
import { Tower } from './tower';

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

/**
 * Decide what a resident does next, given the time of day. This is the whole
 * "brain": home -> work -> lunch -> work -> maybe shop -> home. When home or
 * job is in another tower, the plan routes to the lobby as a 'commute'
 * activity instead; the Game turns that into a street-level commute.
 */
export function planNext(
  resident: Resident,
  timeOfDay: number,
  tower: Tower,
  rand: () => number = Math.random,
  crossTowerJob = false,
  crossTowerHome = false,
): PlannedActivity {
  const home: Activity = crossTowerHome
    ? { kind: 'commute', floor: 0 }
    : { kind: 'home', floor: resident.homeFloor };

  if (resident.jobFloor !== null) {
    const work: Activity = crossTowerJob
      ? { kind: 'commute', floor: 0 }
      : { kind: 'work', floor: resident.jobFloor };
    const lunchTime = resident.workStart + 240;

    if (timeOfDay < resident.workStart) {
      return { activity: home, duration: resident.workStart - timeOfDay };
    }
    if (timeOfDay < resident.workEnd) {
      // Lunch/shopping happen in whatever tower they're currently standing in.
      if (timeOfDay >= lunchTime && !resident.didLunch && !crossTowerJob) {
        resident.didLunch = true;
        const spot = tower.randomFloorOfType('restaurant', rand);
        if (spot) return { activity: { kind: 'eat', floor: spot.level }, duration: 40 };
      }
      if (crossTowerJob) return { activity: work, duration: 1 };
      const until = !resident.didLunch ? Math.min(lunchTime, resident.workEnd) : resident.workEnd;
      return { activity: work, duration: Math.max(1, until - timeOfDay) };
    }
    // After work.
    if (!resident.didShop && rand() < 0.6) {
      resident.didShop = true;
      const spot = tower.randomFloorOfType('shop', rand);
      if (spot) return { activity: { kind: 'shop', floor: spot.level }, duration: 30 };
    }
    return { activity: home, duration: MINUTES_PER_DAY - timeOfDay + resident.workStart };
  }

  // Unemployed: potter around — occasional daytime shop/restaurant visits.
  if (timeOfDay >= 600 && timeOfDay < 1200 && rand() < 0.35) {
    const kind = rand() < 0.5 ? 'shop' : 'restaurant';
    const spot = tower.randomFloorOfType(kind, rand);
    if (spot) {
      return {
        activity: { kind: kind === 'shop' ? 'shop' : 'eat', floor: spot.level },
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
