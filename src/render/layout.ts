import { TOWN } from '../core/types';

/** Shared world-space layout constants for the tower cross-section. */
export const FLOOR_HEIGHT = 3;
export const ROOM_LEFT = -6.5; // rooms span this range on x
export const ROOM_RIGHT = 8.5;
export const ROOM_DEPTH = 6; // z extent; front (+z) is open to the camera
export const SHAFT_X = -8.2; // left elevator shaft center
export const SHAFT_WIDTH = 2.6;
export const WAIT_X = -5.6; // where residents queue for the left lift

/** Second shaft mirrored to the right, derived from the same offsets. */
export const SHAFT_X_RIGHT = ROOM_RIGHT + (ROOM_LEFT - SHAFT_X); // 10.2
export const WAIT_X_RIGHT = ROOM_RIGHT - (WAIT_X - ROOM_LEFT); // 7.6

/** Horizontal spacing between tower footprints on the plot. */
export const TOWER_SPACING = 34;

/** Fixed world-space origin for each town slot, centered on the plot. */
export const TOWER_SLOT_ORIGINS: { x: number; z: number }[] = TOWN.slotCosts.map((_, i) => ({
  x: (i - (TOWN.slotCosts.length - 1) / 2) * TOWER_SPACING,
  z: 0,
}));

export function floorY(level: number): number {
  return level * FLOOR_HEIGHT;
}
