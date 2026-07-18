import { FLOOR_CONFIG, HAPPINESS, Resident } from './types';
import { Game, GameEvent } from './game';
import type { Town } from './town';
import { commuteMinutesBetween } from './townLayout';
import { averageBusinessQuality } from './business';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Day-rollover happiness pass: update each resident's four needs, combine
 * with environmental penalties into a 0-100 happiness score, and evict
 * residents who have been miserable for too many consecutive days.
 * Must run BEFORE resetDailyFlags (it reads didLunch/didShop) and after the
 * business quality update (it reads fresh quality for the vibrancy bonus).
 */
export function updateHappinessAndEvict(games: Game[], currentDay: number): GameEvent[] {
  const events: GameEvent[] = [];
  const all = games.flatMap((g) => g.residents);
  const byId = new Map(games.map((g) => [g.id, g]));

  // Needs only decay when the town actually offers the amenity — a town with
  // no restaurants yet shouldn't starve everyone into leaving.
  const townHasRestaurant = games.some((g) =>
    g.tower.floors.some((f) => f.type === 'restaurant' && g.staffedLevels.has(f.level)),
  );
  const townHasShop = games.some((g) =>
    g.tower.floors.some((f) => f.type === 'shop' && g.staffedLevels.has(f.level)),
  );

  const evictions: { resident: Resident; reason: string }[] = [];

  for (const resident of all) {
    const homeGame = byId.get(resident.homeTowerId);
    if (!homeGame) continue;

    // -- needs -----------------------------------------------------------
    resident.needs.food = updateDecayingNeed(
      resident.needs.food,
      resident.didLunch,
      townHasRestaurant ? HAPPINESS.foodDecayPerDay : 0,
    );
    resident.needs.entertainment = updateDecayingNeed(
      resident.needs.entertainment,
      resident.didShop,
      townHasShop ? HAPPINESS.entertainmentDecayPerDay : 0,
    );

    const occupants = all.filter(
      (r) => r.homeTowerId === resident.homeTowerId && r.homeFloor === resident.homeFloor,
    ).length;
    const crowding = occupants / FLOOR_CONFIG.residential.homes;
    resident.needs.housing = clamp(100 - crowding * HAPPINESS.housingCrowdingWeight, 0, 100);

    resident.needs.employment =
      resident.jobFloor === null
        ? HAPPINESS.unemployedBaseline
        : clamp(
            60 +
              resident.jobTier * HAPPINESS.employmentTierBonus -
              resident.blockedDays * HAPPINESS.employmentBlockedPenalty,
            0,
            100,
          );

    // -- environment -----------------------------------------------------
    const waitPenalty = clamp(
      (homeGame.averageWait() - HAPPINESS.comfortableWaitMinutes) * HAPPINESS.waitPenaltyPerMinute,
      0,
      HAPPINESS.maxWaitPenalty,
    );
    const commutes = resident.jobTowerId !== null && resident.jobTowerId !== resident.homeTowerId;
    const commutePenalty = commutes
      ? clamp(
          (commuteMinutesBetween(resident.homeTowerId, resident.jobTowerId!) -
            HAPPINESS.comfortableCommuteMinutes) *
            HAPPINESS.commutePenaltyPerMinute,
          0,
          HAPPINESS.maxCommutePenalty,
        )
      : 0;
    const vibrancy = clamp(
      ((averageBusinessQuality(homeGame.tower) - 50) / 50) * HAPPINESS.vibrancyWeight,
      -HAPPINESS.vibrancyWeight,
      HAPPINESS.vibrancyWeight,
    );

    const w = HAPPINESS.weights;
    resident.happiness = clamp(
      w.housing * resident.needs.housing +
        w.employment * resident.needs.employment +
        w.food * resident.needs.food +
        w.entertainment * resident.needs.entertainment +
        vibrancy -
        waitPenalty -
        commutePenalty,
      0,
      100,
    );

    // -- move-out --------------------------------------------------------
    if (resident.happiness < HAPPINESS.moveOutThreshold) {
      resident.unhappyDays++;
      if (resident.unhappyDays >= HAPPINESS.moveOutAfterDays) {
        evictions.push({ resident, reason: worstFactor(resident, waitPenalty, commutePenalty) });
      }
    } else {
      resident.unhappyDays = 0;
    }
  }

  // Execute evictions: home/job occupancy are derived live from the resident
  // arrays, so removal alone frees both slots for the next hiring/move-in.
  for (const { resident, reason } of evictions) {
    for (const game of games) {
      const idx = game.residents.findIndex((r) => r.id === resident.id);
      if (idx !== -1) {
        game.residents.splice(idx, 1);
        events.push({
          kind: 'move-out',
          message: `${resident.name} moved out of town (${reason})`,
        });
        break;
      }
    }
  }
  void currentDay;
  return events;
}

function updateDecayingNeed(current: number, refilledToday: boolean, decayPerDay: number): number {
  return refilledToday ? 100 : Math.max(0, current - decayPerDay);
}

/** Multiplier on a resident's per-visit spending (happiness 50 → exactly 1.0x). */
export function spendingMultiplier(happiness: number): number {
  return 1 + ((happiness - 50) / 50) * HAPPINESS.spendingSwingMax;
}

/** The single strongest reason a resident is unhappy, for UI/eviction flavor. */
export function worstFactor(
  resident: Resident,
  waitPenalty = 0,
  commutePenalty = 0,
): string {
  const candidates: [number, string][] = [
    [resident.needs.housing, 'a packed apartment'],
    [resident.needs.employment, resident.jobFloor === null ? 'no job' : 'a dead-end job'],
    [resident.needs.food, 'nowhere good to eat'],
    [resident.needs.entertainment, 'nothing to do'],
    [100 - waitPenalty * 5, 'endless lift queues'],
    [100 - commutePenalty * 5, 'a brutal commute'],
  ];
  candidates.sort((a, b) => a[0] - b[0]);
  return candidates[0][1];
}

/** Town-wide average happiness (100 when there are no residents yet). */
export function averageHappiness(residents: Resident[]): number {
  if (residents.length === 0) return 100;
  return residents.reduce((s, r) => s + r.happiness, 0) / residents.length;
}

export interface HappinessBreakdown {
  average: number;
  residentCount: number;
  /** The four needs, averaged town-wide (0-100, higher is better). */
  needs: { label: string; value: number }[];
  /** Environmental happiness penalties, averaged (points subtracted). */
  penalties: { label: string; value: number }[];
  /** Average business-vibrancy adjustment (can be negative). */
  vibrancy: number;
}

/**
 * Read-only, town-wide happiness diagnostic for the UI: averages each resident's
 * four needs and recomputes the same environmental penalties used in the
 * happiness score, so the player can see exactly what's dragging the mood down.
 * Does not mutate any state.
 */
export function happinessBreakdown(town: Town): HappinessBreakdown {
  const residents = town.allResidents();
  const n = residents.length;
  const emptyNeeds = [
    { label: 'Housing', value: 0 },
    { label: 'Employment', value: 0 },
    { label: 'Food', value: 0 },
    { label: 'Entertainment', value: 0 },
  ];
  if (n === 0) {
    return {
      average: 100,
      residentCount: 0,
      needs: emptyNeeds,
      penalties: [
        { label: 'Lift queues', value: 0 },
        { label: 'Long commutes', value: 0 },
      ],
      vibrancy: 0,
    };
  }

  const avg = (sel: (r: Resident) => number) =>
    residents.reduce((s, r) => s + sel(r), 0) / n;

  const byId = new Map(town.towers().map((g) => [g.id, g]));
  let waitSum = 0;
  let commuteSum = 0;
  let vibSum = 0;
  for (const resident of residents) {
    const homeGame = byId.get(resident.homeTowerId);
    if (!homeGame) continue;
    waitSum += clamp(
      (homeGame.averageWait() - HAPPINESS.comfortableWaitMinutes) * HAPPINESS.waitPenaltyPerMinute,
      0,
      HAPPINESS.maxWaitPenalty,
    );
    const commutes =
      resident.jobTowerId !== null && resident.jobTowerId !== resident.homeTowerId;
    commuteSum += commutes
      ? clamp(
          (commuteMinutesBetween(resident.homeTowerId, resident.jobTowerId!) -
            HAPPINESS.comfortableCommuteMinutes) *
            HAPPINESS.commutePenaltyPerMinute,
          0,
          HAPPINESS.maxCommutePenalty,
        )
      : 0;
    vibSum += clamp(
      ((averageBusinessQuality(homeGame.tower) - 50) / 50) * HAPPINESS.vibrancyWeight,
      -HAPPINESS.vibrancyWeight,
      HAPPINESS.vibrancyWeight,
    );
  }

  return {
    average: averageHappiness(residents),
    residentCount: n,
    needs: [
      { label: 'Housing', value: avg((r) => r.needs.housing) },
      { label: 'Employment', value: avg((r) => r.needs.employment) },
      { label: 'Food', value: avg((r) => r.needs.food) },
      { label: 'Entertainment', value: avg((r) => r.needs.entertainment) },
    ],
    penalties: [
      { label: 'Lift queues', value: waitSum / n },
      { label: 'Long commutes', value: commuteSum / n },
    ],
    vibrancy: vibSum / n,
  };
}
