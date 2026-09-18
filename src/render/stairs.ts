import { FLOOR_HEIGHT, ROOM_DEPTH, ROOM_LEFT } from './layout';

export const STAIR_STEPS = 16;
export const STAIR_RUN = 2.8;
export const STAIR_Z = ROOM_DEPTH / 2 + 0.7;
const LEFT = ROOM_LEFT + 0.7;

/** Alternating flights join at the same landing; no sideways reset at a floor. */
export function stairLandingX(level: number): number {
  return LEFT + (Math.abs(level % 2) === 1 ? STAIR_RUN : 0);
}

export function stairPosition(from: number, to: number, progress: number, pace = 0): { x: number; y: number; z: number } {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  // Individual, monotone cadence separates simultaneous departures without
  // changing departure/arrival times, floors, or simulation consequences.
  const variation = Number.isFinite(pace) ? Math.max(-0.8, Math.min(0.8, pace)) : 0;
  const floor = from + (to - from) * (p + variation * p * (1 - p));
  const lower = Math.floor(floor), fraction = floor - lower;
  const x = stairLandingX(lower) + (stairLandingX(lower + 1) - stairLandingX(lower)) * fraction;
  return { x, y: floor * FLOOR_HEIGHT, z: STAIR_Z };
}
