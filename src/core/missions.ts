import { ELEVATOR_TIERS, FLOOR_CONFIG, JOB_TIERS, ZONE_CONFIGS } from './types';
import { GameEvent } from './game';
import { Town } from './town';
import { averageHappiness } from './happiness';
import { assignedStaff, businessGrade, isJobFloorType } from './business';

export interface MissionDef {
  id: string;
  label: string;
  description: string;
  reward: number;
  /** 'instant' checks run every tick; 'daily' checks run at day rollover. */
  cadence: 'instant' | 'daily';
  /** For daily missions, how many consecutive passing days are required. */
  streakDays?: number;
  check: (town: Town) => boolean;
}

export const MISSION_DEFS: MissionDef[] = [
  {
    id: 'first-neighbors',
    label: 'First Neighbors',
    description: 'Reach 10 residents',
    reward: 200,
    cadence: 'instant',
    check: (t) => t.population >= 10,
  },
  {
    id: 'fully-staffed',
    label: 'Fully Staffed',
    description: 'Fully staff a restaurant',
    reward: 150,
    cadence: 'instant',
    check: (t) =>
      t.towers().some((g) =>
        g.tower.floors.some(
          (f) =>
            f.type === 'restaurant' &&
            assignedStaff(t.allResidents(), g.id, f.level).length >= FLOOR_CONFIG.restaurant.jobs,
        ),
      ),
  },
  {
    id: 'first-manager',
    label: 'Corner Office',
    description: 'Promote your first office Manager',
    reward: 300,
    cadence: 'instant',
    check: (t) =>
      t.allResidents().some((r) => {
        if (r.jobTowerId === null || r.jobFloor === null) return false;
        const floor = t.towerById(r.jobTowerId)?.tower.floors[r.jobFloor];
        return floor?.type === 'office' && r.jobTier === JOB_TIERS.office.length - 1;
      }),
  },
  {
    id: 'skyscraper',
    label: 'Skyscraper',
    description: 'Build a tower with at least 10 floors',
    reward: 300,
    cadence: 'instant',
    check: (t) => t.towers().some((g) => g.tower.floors.length >= 10),
  },
  {
    id: 'commuter-town',
    label: 'Commuter Town',
    description: 'Have 5 residents commute between towers',
    reward: 400,
    cadence: 'instant',
    check: (t) =>
      t.allResidents().filter((r) => r.jobTowerId !== null && r.jobTowerId !== r.homeTowerId)
        .length >= 5,
  },
  {
    id: 'mogul',
    label: 'Property Mogul',
    description: 'Own 3 towers',
    reward: 500,
    cadence: 'instant',
    check: (t) => t.towers().length >= 3,
  },
  {
    id: 'big-day',
    label: 'Big Day',
    description: 'Earn 500 coins in one day',
    reward: 250,
    cadence: 'daily',
    check: (t) => t.economy.incomeToday >= 500,
  },
  {
    id: 'smooth-lifts',
    label: 'Smooth Operator',
    description: 'End a day with average lift wait under 8 minutes (10+ residents)',
    reward: 250,
    cadence: 'daily',
    check: (t) => t.population >= 10 && t.towers().every((g) => g.averageWait() < 8),
  },
  {
    id: 'happy-town',
    label: 'Happy Town',
    description: 'Keep average happiness at 80+ for 3 days in a row',
    reward: 500,
    cadence: 'daily',
    streakDays: 3,
    check: (t) => t.population > 0 && averageHappiness(t.allResidents()) >= 80,
  },
];

// A big pile of extra milestones, generated from a few families so there's
// always a next goal to chase. Appended to the core list above.
MISSION_DEFS.push(...buildExtraMissions());

// ---- extra-mission helpers ----------------------------------------------

function kfmt(n: number): string {
  return n >= 1000 ? `${n / 1000}k` : `${n}`;
}

function countType(t: Town, type: string): number {
  return t.towers().reduce((s, g) => s + g.tower.floors.filter((f) => f.type === type).length, 0);
}
function tallest(t: Town): number {
  return t.towers().reduce((m, g) => Math.max(m, g.tower.floors.length), 0);
}
function totalFloors(t: Town): number {
  return t.towers().reduce((s, g) => s + (g.tower.floors.length - 1), 0); // exclude the free lobby
}
function employedCount(t: Town): number {
  return t.allResidents().filter((r) => r.jobFloor !== null).length;
}
function commuterCount(t: Town): number {
  return t.allResidents().filter((r) => r.jobTowerId !== null && r.jobTowerId !== r.homeTowerId).length;
}
function hasZone(t: Town, zone: string): boolean {
  return t.slots.some((s) => s.unlocked && s.zone === zone);
}
function zonesOwned(t: Town): number {
  return new Set(t.slots.filter((s) => s.unlocked).map((s) => s.zone)).size;
}
function parkCount(t: Town): number {
  return t.slots.filter((s) => s.unlocked && ZONE_CONFIGS[s.zone].isPark).length;
}
function barCount(t: Town): number {
  return t.towers().reduce(
    (s, g) => s + g.tower.floors.filter((f) => f.type === 'restaurant' && f.subtype === 'bar').length,
    0,
  );
}
function gradeACount(t: Town): number {
  let n = 0;
  for (const g of t.towers())
    for (const f of g.tower.floors)
      if (
        isJobFloorType(f.type) &&
        businessGrade(f, assignedStaff(t.allResidents(), g.id, f.level).length).grade === 'A'
      )
        n++;
  return n;
}
function hasGradeA(t: Town, type: string): boolean {
  return t.towers().some((g) =>
    g.tower.floors.some(
      (f) =>
        f.type === type &&
        businessGrade(f, assignedStaff(t.allResidents(), g.id, f.level).length).grade === 'A',
    ),
  );
}
function fullyStaffedCount(t: Town): number {
  let n = 0;
  for (const g of t.towers())
    for (const f of g.tower.floors)
      if (isJobFloorType(f.type) && assignedStaff(t.allResidents(), g.id, f.level).length >= FLOOR_CONFIG[f.type].jobs)
        n++;
  return n;
}
function fullyStaffedType(t: Town, type: 'shop' | 'restaurant' | 'office' | 'factory'): boolean {
  return t.towers().some((g) =>
    g.tower.floors.some(
      (f) => f.type === type && assignedStaff(t.allResidents(), g.id, f.level).length >= FLOOR_CONFIG[type].jobs,
    ),
  );
}
function topTierCount(t: Town): number {
  let n = 0;
  for (const r of t.allResidents()) {
    if (r.jobTowerId === null || r.jobFloor === null) continue;
    const f = t.towerById(r.jobTowerId)?.tower.floors[r.jobFloor];
    if (f && isJobFloorType(f.type) && r.jobTier === JOB_TIERS[f.type].length - 1) n++;
  }
  return n;
}
function hasTopTierOfType(t: Town, type: 'shop' | 'restaurant' | 'office' | 'factory'): boolean {
  return t.allResidents().some((r) => {
    if (r.jobTowerId === null || r.jobFloor === null) return false;
    const f = t.towerById(r.jobTowerId)?.tower.floors[r.jobFloor];
    return f?.type === type && r.jobTier === JOB_TIERS[type].length - 1;
  });
}

function buildExtraMissions(): MissionDef[] {
  const M: MissionDef[] = [];
  const add = (
    id: string,
    label: string,
    description: string,
    reward: number,
    check: (t: Town) => boolean,
    cadence: 'instant' | 'daily' = 'instant',
    streakDays?: number,
  ) => M.push({ id, label, description, reward, cadence, streakDays, check });

  // Population milestones.
  [25, 50, 75, 100, 150, 200, 300, 450, 600, 800, 1000].forEach((n, i) =>
    add(`pop-${n}`, `Population ${kfmt(n)}`, `Reach ${n} residents`, 150 + i * 80, (t) => t.population >= n),
  );
  // Treasury (coins on hand).
  [2000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000].forEach((n, i) =>
    add(`rich-${n}`, `Treasury ${kfmt(n)}`, `Have ${kfmt(n)} coins saved`, 120 + i * 130, (t) => t.economy.coins >= n),
  );
  // Big earning days (daily).
  [1000, 2000, 3500, 5000, 7500, 10000, 15000].forEach((n, i) =>
    add(`day-income-${n}`, `Big Earner ${kfmt(n)}`, `Earn ${kfmt(n)} coins in one day`, 200 + i * 110, (t) => t.economy.incomeToday >= n, 'daily'),
  );
  // Towers owned.
  [4, 5, 6, 7, 8, 9, 10].forEach((n, i) =>
    add(`towers-${n}`, `Skyline ${n}`, `Own ${n} towers`, 500 + i * 200, (t) => t.towers().length >= n),
  );
  // Tallest tower.
  [15, 20, 25, 30, 40, 50, 60].forEach((n, i) =>
    add(`tall-${n}`, `Highrise ${n}`, `Raise a tower ${n} floors tall`, 250 + i * 120, (t) => tallest(t) >= n),
  );
  // Total floors town-wide.
  [25, 50, 100, 150, 200].forEach((n, i) =>
    add(`floors-${n}`, `Developer ${n}`, `Build ${n} floors across town`, 250 + i * 150, (t) => totalFloors(t) >= n),
  );
  // Zoning.
  add('zone-res', 'Bedroom Community', 'Own a residential-zoned lot', 200, (t) => hasZone(t, 'residential'));
  add('zone-com', 'Shopping District', 'Own a commercial-zoned lot', 200, (t) => hasZone(t, 'commercial'));
  add('zone-off', 'Business District', 'Own an office-zoned lot', 200, (t) => hasZone(t, 'office'));
  add('zone-ind', 'Industrial Park', 'Own an industrial-zoned lot', 250, (t) => hasZone(t, 'industrial'));
  add('zone-tod', 'On the Line', 'Own a transit-oriented lot', 300, (t) => hasZone(t, 'transit'));
  add('zone-3', 'Zoning Board', 'Own lots of 3 different zones', 350, (t) => zonesOwned(t) >= 3);
  add('zone-all', 'Master Planner', 'Own a lot of every zone type', 900, (t) =>
    ['residential', 'commercial', 'office', 'industrial', 'transit', 'park', 'mixed'].every((z) => hasZone(t, z)),
  );
  // Business counts.
  [3, 6, 10].forEach((n, i) => add(`shops-${n}`, `Retailer ${n}`, `Build ${n} shops`, 200 + i * 120, (t) => countType(t, 'shop') >= n));
  [3, 6].forEach((n, i) => add(`rest-${n}`, `Restaurateur ${n}`, `Build ${n} restaurants`, 200 + i * 150, (t) => countType(t, 'restaurant') >= n));
  [3, 5].forEach((n, i) => add(`off-${n}`, `Corporate ${n}`, `Build ${n} offices`, 250 + i * 150, (t) => countType(t, 'office') >= n));
  [2, 4].forEach((n, i) => add(`fac-${n}`, `Industrialist ${n}`, `Build ${n} factories`, 250 + i * 150, (t) => countType(t, 'factory') >= n));
  add('first-factory', 'Assembly Line', 'Build your first factory', 200, (t) => countType(t, 'factory') >= 1);
  add('first-bar', 'Last Call', 'Build a Bar & Lounge', 200, (t) => barCount(t) >= 1);
  add('first-park', 'Green Space', 'Open a park', 200, (t) => parkCount(t) >= 1);
  add('bars-3', 'Night District', 'Build 3 bars', 400, (t) => barCount(t) >= 3);
  [2, 3].forEach((n, i) => add(`parks-${n}`, `Park System ${n}`, `Open ${n} parks`, 300 + i * 150, (t) => parkCount(t) >= n));
  // Quality (A grades).
  add('grade-shop', 'Retail Excellence', 'Get an A-grade shop', 300, (t) => hasGradeA(t, 'shop'));
  add('grade-rest', 'Michelin Star', 'Get an A-grade restaurant', 300, (t) => hasGradeA(t, 'restaurant'));
  add('grade-off', 'Blue Chip', 'Get an A-grade office', 300, (t) => hasGradeA(t, 'office'));
  add('grade-fac', 'Precision Plant', 'Get an A-grade factory', 300, (t) => hasGradeA(t, 'factory'));
  [3, 5, 10, 15].forEach((n, i) =>
    add(`grade-a-${n}`, `Quality Town ${n}`, `Run ${n} A-grade businesses at once`, 300 + i * 200, (t) => gradeACount(t) >= n),
  );
  // Full staffing.
  add('staff-shop', 'Shop Team', 'Fully staff a shop', 150, (t) => fullyStaffedType(t, 'shop'));
  add('staff-rest', 'Kitchen Brigade', 'Fully staff a restaurant', 180, (t) => fullyStaffedType(t, 'restaurant'));
  add('staff-off', 'Full House', 'Fully staff an office', 220, (t) => fullyStaffedType(t, 'office'));
  add('staff-fac', 'Full Shift', 'Fully staff a factory', 200, (t) => fullyStaffedType(t, 'factory'));
  [5, 10].forEach((n, i) => add(`staffed-${n}`, `Employer ${n}`, `Fully staff ${n} businesses`, 300 + i * 200, (t) => fullyStaffedCount(t) >= n));
  // Careers & promotions.
  add('promo-shop', 'Shopkeeper', 'Promote your first Shopkeeper', 250, (t) => hasTopTierOfType(t, 'shop'));
  add('promo-rest', 'Head Chef', 'Promote your first Chef', 250, (t) => hasTopTierOfType(t, 'restaurant'));
  add('promo-fac', 'Foreman', 'Promote your first Foreman', 250, (t) => hasTopTierOfType(t, 'factory'));
  [3, 5, 10].forEach((n, i) =>
    add(`top-tier-${n}`, `Leadership ${n}`, `Have ${n} residents at the top of their careers`, 300 + i * 200, (t) => topTierCount(t) >= n),
  );
  [10, 25, 50, 100].forEach((n, i) => add(`employed-${n}`, `Workforce ${n}`, `Employ ${n} residents`, 200 + i * 140, (t) => employedCount(t) >= n));
  // Commuters.
  [10, 25, 50, 75].forEach((n, i) => add(`commuters-${n}`, `Rush Hour ${n}`, `Have ${n} cross-tower commuters`, 300 + i * 150, (t) => commuterCount(t) >= n));
  // Happiness streaks.
  add('happy-70', 'Content', 'Reach 70+ average happiness', 200, (t) => t.population > 0 && averageHappiness(t.allResidents()) >= 70);
  add('happy-90-3', 'Delighted', 'Keep 90+ happiness for 3 days', 600, (t) => t.population > 0 && averageHappiness(t.allResidents()) >= 90, 'daily', 3);
  add('happy-85-5', 'Beloved Town', 'Keep 85+ happiness for 5 days', 700, (t) => t.population > 0 && averageHappiness(t.allResidents()) >= 85, 'daily', 5);
  add('happy-80-7', 'Utopia', 'Keep 80+ happiness for 7 days', 900, (t) => t.population > 0 && averageHappiness(t.allResidents()) >= 80, 'daily', 7);
  // Lifts.
  add('lift-max', 'Express Elevator', 'Upgrade a lift to top speed', 300, (t) => t.towers().some((g) => g.elevatorTier >= ELEVATOR_TIERS.length - 1));
  add('lift-second', 'Double Shaft', 'Install a second lift shaft', 250, (t) => t.towers().some((g) => !!g.secondElevator));
  add('lift-smooth-25', 'Smooth Operator II', 'Avg lift wait under 8 min with 25+ residents', 400, (t) => t.population >= 25 && t.towers().every((g) => g.averageWait() < 8), 'daily');
  add('lift-smooth-50', 'Flow Master', 'Avg lift wait under 6 min with 50+ residents', 600, (t) => t.population >= 50 && t.towers().every((g) => g.averageWait() < 6), 'daily');
  // Longevity.
  [10, 25, 50, 100, 150].forEach((n, i) => add(`day-${n}`, `Day ${n}`, `Keep your town running to day ${n}`, 200 + i * 130, (t) => t.day >= n));

  return M;
}

/**
 * Milestone tracker: instant missions checked every tick, daily/streak
 * missions at day rollover (before daily counters reset). Completion pays a
 * one-time coin reward and is persisted in the save.
 */
export class Missions {
  completed = new Set<string>();
  /** Consecutive passing days for streak missions (not persisted; rough edge). */
  streaks: Record<string, number> = {};

  get completedCount(): number {
    return this.completed.size;
  }

  checkInstant(town: Town): GameEvent[] {
    return this.evaluate(town, 'instant');
  }

  checkDaily(town: Town): GameEvent[] {
    return this.evaluate(town, 'daily');
  }

  private evaluate(town: Town, cadence: 'instant' | 'daily'): GameEvent[] {
    const events: GameEvent[] = [];
    for (const def of MISSION_DEFS) {
      if (def.cadence !== cadence || this.completed.has(def.id)) continue;

      let passed = def.check(town);
      if (passed && def.streakDays) {
        this.streaks[def.id] = (this.streaks[def.id] ?? 0) + 1;
        passed = this.streaks[def.id] >= def.streakDays;
      } else if (!passed && def.streakDays) {
        this.streaks[def.id] = 0;
      }

      if (passed) {
        this.completed.add(def.id);
        town.economy.earn(def.reward);
        events.push({
          kind: 'mission',
          message: `🎯 Mission complete: ${def.label} (+${def.reward} coins)`,
        });
      }
    }
    return events;
  }
}
