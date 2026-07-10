import { FLOOR_CONFIG, JOB_TIERS } from './types';
import { GameEvent } from './game';
import { Town } from './town';
import { averageHappiness } from './happiness';
import { assignedStaff } from './business';

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
