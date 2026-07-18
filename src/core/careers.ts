import {
  Floor,
  JOB_TIERS,
  JobFloorType,
  POACH_AFTER_BLOCKED_DAYS,
  Resident,
} from './types';
import { Tower } from './tower';

/** Minimal view of one tower that career logic needs (Game satisfies this). */
export interface TowerContext {
  id: string;
  tower: Tower;
  residents: Resident[];
}

export interface CareerEvent {
  kind: 'hire' | 'promotion' | 'job-switch';
  message: string;
}

function isJobFloorType(type: string): type is JobFloorType {
  return type === 'shop' || type === 'restaurant' || type === 'office' || type === 'factory';
}

/** All residents across every tower (residents live in their home tower's array). */
function allResidents(contexts: TowerContext[]): Resident[] {
  return contexts.flatMap((c) => c.residents);
}

/** How many residents hold the given tier on a specific floor of a specific tower. */
function workersAt(
  contexts: TowerContext[],
  towerId: string,
  level: number,
  tier: number,
): number {
  let n = 0;
  for (const r of allResidents(contexts)) {
    if (r.jobTowerId === towerId && r.jobFloor === level && r.jobTier === tier) n++;
  }
  return n;
}

function tierHasVacancy(
  contexts: TowerContext[],
  towerId: string,
  floor: Floor,
  tier: number,
): boolean {
  if (!isJobFloorType(floor.type)) return false;
  const config = JOB_TIERS[floor.type][tier];
  if (!config) return false;
  return workersAt(contexts, towerId, floor.level, tier) < config.slots;
}

/**
 * Fill open entry-level (tier 0) slots with unemployed residents.
 * Hiring prefers the resident's home tower, then any other tower.
 */
export function assignJobs(
  contexts: TowerContext[],
  currentDay: number,
  events: CareerEvent[] = [],
): CareerEvent[] {
  for (const ctx of contexts) {
    for (const resident of ctx.residents) {
      if (resident.jobFloor !== null) continue;

      const ordered = [
        ...contexts.filter((c) => c.id === resident.homeTowerId),
        ...contexts.filter((c) => c.id !== resident.homeTowerId),
      ];
      outer: for (const target of ordered) {
        for (const floor of target.tower.floors) {
          if (!isJobFloorType(floor.type)) continue;
          if (tierHasVacancy(contexts, target.id, floor, 0)) {
            resident.jobTowerId = target.id;
            resident.jobFloor = floor.level;
            resident.jobTier = 0;
            resident.jobStartDay = currentDay;
            resident.blockedDays = 0;
            break outer;
          }
        }
      }
    }
  }
  return events;
}

/**
 * Day-rollover career step: promote residents whose tenure is met when a slot
 * is free on their own floor; residents blocked for POACH_AFTER_BLOCKED_DAYS
 * days will take an already-earned promotion on another floor (any tower).
 */
export function processPromotions(
  contexts: TowerContext[],
  currentDay: number,
): CareerEvent[] {
  const events: CareerEvent[] = [];
  const byId = new Map(contexts.map((c) => [c.id, c]));

  for (const resident of allResidents(contexts)) {
    if (resident.jobFloor === null || resident.jobTowerId === null) continue;
    const jobCtx = byId.get(resident.jobTowerId);
    if (!jobCtx) continue;
    const floor = jobCtx.tower.floors[resident.jobFloor];
    if (!floor || !isJobFloorType(floor.type)) continue;

    const tiers = JOB_TIERS[floor.type];
    const current = tiers[resident.jobTier];
    const tenure = currentDay - (resident.jobStartDay ?? currentDay);
    if (!current || !Number.isFinite(current.tenureDaysToPromote)) continue;
    if (tenure < current.tenureDaysToPromote) continue;

    const nextTier = resident.jobTier + 1;

    // Promote in place if their own floor has a free higher slot.
    if (tierHasVacancy(contexts, jobCtx.id, floor, nextTier)) {
      resident.jobTier = nextTier;
      resident.jobStartDay = currentDay;
      resident.blockedDays = 0;
      events.push({
        kind: 'promotion',
        message: `${resident.name} was promoted to ${tiers[nextTier].title} at ${floor.name}!`,
      });
      continue;
    }

    // Blocked: after enough days, jump to an earned slot elsewhere.
    resident.blockedDays++;
    if (resident.blockedDays < POACH_AFTER_BLOCKED_DAYS) continue;

    let moved = false;
    for (const target of contexts) {
      for (const other of target.tower.floors) {
        if (other.type !== floor.type) continue;
        if (target.id === jobCtx.id && other.level === floor.level) continue;
        if (tierHasVacancy(contexts, target.id, other, nextTier)) {
          resident.jobTowerId = target.id;
          resident.jobFloor = other.level;
          resident.jobTier = nextTier;
          resident.jobStartDay = currentDay;
          resident.blockedDays = 0;
          events.push({
            kind: 'job-switch',
            message: `${resident.name} left ${floor.name} for a promotion at ${other.name}!`,
          });
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
  }

  return events;
}

/** The job title for a resident, or null if unemployed / floor missing. */
export function jobTitle(resident: Resident, jobFloor: Floor | undefined): string | null {
  if (!jobFloor || !isJobFloorType(jobFloor.type)) return null;
  return JOB_TIERS[jobFloor.type][resident.jobTier]?.title ?? null;
}
