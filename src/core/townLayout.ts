import { TOWN } from './types';

/**
 * Canonical town-plot geometry. Lives in core (not render) because commute
 * time is simulation-relevant; render/layout.ts re-exports what it needs.
 */

/** Horizontal spacing between tower footprints on the plot. */
export const TOWER_SPACING = 34;

/** Fixed world-space origin for each town slot, centered on the plot. */
export const TOWER_SLOT_ORIGINS: { x: number; z: number }[] = TOWN.slotCosts.map((_, i) => ({
  x: (i - (TOWN.slotCosts.length - 1) / 2) * TOWER_SPACING,
  z: 0,
}));

/** Slot index for a tower id of the form `t${i}`; -1 if malformed. */
export function slotIndexOfTowerId(id: string): number {
  const n = parseInt(id.slice(1), 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * Street-level travel time between two towers, in game minutes: a fixed
 * lobby/street overhead plus real Euclidean distance between the plots.
 * (Euclidean rather than slot-index distance so a future transit round can
 * move plots off a single line without touching this.)
 */
export function commuteMinutesBetween(fromTowerId: string, toTowerId: string): number {
  if (fromTowerId === toTowerId) return 0;
  const a = TOWER_SLOT_ORIGINS[slotIndexOfTowerId(fromTowerId)];
  const b = TOWER_SLOT_ORIGINS[slotIndexOfTowerId(toTowerId)];
  if (!a || !b) return TOWN.commuteBaseMinutes;
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  return Math.round(TOWN.commuteBaseMinutes + dist * TOWN.commuteMinutesPerUnit);
}
