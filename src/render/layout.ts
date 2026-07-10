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

// Town-plot geometry lives in core (commute times depend on it); re-exported
// here so render code keeps a single import point for layout constants.
export { TOWER_SPACING, TOWER_SLOT_ORIGINS } from '../core/townLayout';

export function floorY(level: number): number {
  return level * FLOOR_HEIGHT;
}
