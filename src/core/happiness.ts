import { FLOOR_CONFIG, HAPPINESS, Resident } from './types';
import { Game, GameEvent } from './game';
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
