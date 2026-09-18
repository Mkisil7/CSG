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

/** A street journey includes walking out of each lobby, not through neighboring rooms. */
export function streetJourneyPosition(fromTowerId: string, toTowerId: string, progress: number): { x: number; z: number } {
  const a = TOWER_SLOT_ORIGINS[slotIndexOfTowerId(fromTowerId)] ?? TOWER_SLOT_ORIGINS[0];
  const b = TOWER_SLOT_ORIGINS[slotIndexOfTowerId(toTowerId)] ?? a;
  const distance = Math.abs(b.x - a.x);
  const entry = 6.9;
  const travelled = Math.max(0, Math.min(1, progress)) * (distance + entry * 2);
  if (travelled < entry) return { x: a.x + 1, z: 1.6 + travelled };
  if (travelled < entry + distance) return { x: a.x + 1 + Math.sign(b.x - a.x) * (travelled - entry), z: 8.5 };
  return { x: b.x + 1, z: 8.5 - (travelled - entry - distance) };
}
