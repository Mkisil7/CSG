import {
  BUSINESS,
  BUSINESS_SUBTYPES,
  BusinessProfile,
  ECONOMY,
  FLOOR_CONFIG,
  Floor,
  JOB_TIERS,
  JobFloorType,
  MINUTES_PER_DAY,
  Resident,
  Trait,
} from './types';
import { Tower } from './tower';
import { Economy } from './economy';
import { TowerContext } from './careers';

export function isJobFloorType(type: string): type is JobFloorType {
  return type === 'shop' || type === 'restaurant' || type === 'office';
}

export function subtypeProfile(floor: Floor): BusinessProfile | null {
  if (!isJobFloorType(floor.type) || !floor.subtype) return null;
  return BUSINESS_SUBTYPES[floor.type].find((p) => p.subtype === floor.subtype) ?? null;
}

/** Residents assigned to work a given floor (regardless of where they stand now). */
export function assignedStaff(
  allResidents: Resident[],
  towerId: string,
  level: number,
): Resident[] {
  return allResidents.filter((r) => r.jobTowerId === towerId && r.jobFloor === level);
}

/**
 * Which business levels in a tower are open (have at least one hired staffer).
 * Assigned-based rather than presence-based, so businesses don't flicker
 * closed during shift changes and evening shoppers aren't locked out.
 */
export function staffedBusinessLevels(
  tower: Tower,
  towerId: string,
  allResidents: Resident[],
): Set<number> {
  const levels = new Set<number>();
  for (const floor of tower.floors) {
    if (!isJobFloorType(floor.type)) continue;
    if (assignedStaff(allResidents, towerId, floor.level).length > 0) levels.add(floor.level);
  }
  return levels;
}

/**
 * Quality/trait-weighted pick of an open business floor. Replaces the old
 * uniform-random floor choice: better-run and taste-matching businesses pull
 * more traffic. Returns null when nothing suitable is open.
 */
export function pickBusinessFloor(
  tower: Tower,
  staffedLevels: Set<number>,
  type: JobFloorType,
  traits: Trait[],
  rand: () => number = Math.random,
): Floor | null {
  const open = tower.floors.filter((f) => f.type === type && staffedLevels.has(f.level));
  if (open.length === 0) return null;

  const weights = open.map((f) => {
    const profile = subtypeProfile(f);
    const appeal = profile?.appealTags.some((t) => traits.includes(t))
      ? BUSINESS.traitAppealBoost
      : 1;
    return Math.max(5, f.quality) * appeal;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < open.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return open[i];
  }
  return open[open.length - 1];
}

/** Visit income multiplier from a floor's quality (50 → exactly 1.0x). */
export function qualityIncomeMultiplier(quality: number): number {
  const { qualityIncomeMinMult, qualityIncomeMaxMult } = BUSINESS;
  return qualityIncomeMinMult + (qualityIncomeMaxMult - qualityIncomeMinMult) * (quality / 100);
}

/**
 * Day-rollover business bookkeeping across the whole town: each business
 * floor's quality drifts toward a target computed from staffing, load, and
 * staff seniority; upkeep is charged; expenses recorded; daily stats reset.
 * Run BEFORE resetDailyFlags/newDay so yesterday's numbers are still intact.
 */
export function updateBusinessDay(contexts: TowerContext[], economy: Economy): void {
  const all = contexts.flatMap((c) => c.residents);

  for (const ctx of contexts) {
    for (const floor of ctx.tower.floors) {
      if (!isJobFloorType(floor.type)) continue;

      const staff = assignedStaff(all, ctx.id, floor.level);
      const tiers = JOB_TIERS[floor.type];

      let target = 0;
      if (staff.length > 0) {
        const staffingFactor = Math.min(1, staff.length / FLOOR_CONFIG[floor.type].jobs);
        const avgTier = staff.reduce((s, r) => s + r.jobTier, 0) / staff.length;
        const avgPayMult =
          staff.reduce((s, r) => s + (tiers[r.jobTier]?.payMultiplier ?? 1), 0) / staff.length;
        const tierFactor = tiers.length > 1 ? Math.min(1, avgTier / (tiers.length - 1)) : 1;

        const idealVisits =
          staff.length * BUSINESS.baseCustomersPerStaffPerHour * avgPayMult * BUSINESS.operatingHoursPerDay;
        const utilization = idealVisits > 0 ? floor.visitsToday / idealVisits : 0;
        const loadFactor = Math.max(0, Math.min(1, 1 - Math.abs(utilization - 1)));

        target = 100 * (0.4 * staffingFactor + 0.35 * loadFactor + 0.25 * tierFactor);
      }
      floor.quality = Math.max(
        0,
        Math.min(100, floor.quality + (target - floor.quality) * BUSINESS.qualityAdaptRate),
      );

      // Yesterday's costs: nominal staff wages plus fixed upkeep (staffed only).
      let expenses = 0;
      for (const worker of staff) {
        expenses +=
          ECONOMY.baseWagePerWorkerDay[floor.type] * (tiers[worker.jobTier]?.payMultiplier ?? 1);
      }
      if (staff.length > 0) {
        expenses += BUSINESS.upkeepPerDay;
        economy.charge(BUSINESS.upkeepPerDay);
      }
      floor.expensesToday = Math.round(expenses);
    }
  }
}

/** Reset per-day business counters; call after quality/grades have consumed them. */
export function resetBusinessDay(contexts: TowerContext[]): void {
  for (const ctx of contexts) {
    for (const floor of ctx.tower.floors) {
      floor.visitsToday = 0;
      floor.revenueToday = 0;
    }
  }
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Visible performance rating combining reputation, staffing, and yesterday's P&L. */
export function businessGrade(
  floor: Floor,
  staffCount: number,
): { score: number; grade: Grade } {
  if (!isJobFloorType(floor.type)) return { score: 0, grade: 'F' };
  const staffingRatio = Math.min(1, staffCount / FLOOR_CONFIG[floor.type].jobs);
  const net = floor.revenueToday - floor.expensesToday;
  const breakEven = Math.max(20, floor.expensesToday);
  const profitFactor = Math.max(0, Math.min(1.5, net / breakEven + 1)) / 1.5;

  const score = 0.4 * (floor.quality / 100) + 0.3 * staffingRatio + 0.3 * profitFactor;
  const grade: Grade =
    score >= 0.85 ? 'A' : score >= 0.7 ? 'B' : score >= 0.5 ? 'C' : score >= 0.3 ? 'D' : 'F';
  return { score, grade };
}

/** Average business quality in a tower (for the happiness vibrancy bonus). */
export function averageBusinessQuality(tower: Tower): number {
  const floors = tower.floors.filter((f) => isJobFloorType(f.type));
  if (floors.length === 0) return 50; // neutral when there's nothing yet
  return floors.reduce((s, f) => s + f.quality, 0) / floors.length;
}

/** Convenience: rent-per-minute constant used by tests and accrual. */
export const RENT_PER_MINUTE = ECONOMY.rentPerResidentPerDay / MINUTES_PER_DAY;
