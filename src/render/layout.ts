/** Shared world-space layout constants for the tower cross-section. */
export const FLOOR_HEIGHT = 3;
export const ROOM_LEFT = -6.5; // rooms span this range on x
export const ROOM_RIGHT = 8.5;
export const ROOM_DEPTH = 6; // z extent; front (+z) is open to the camera
export const SHAFT_X = -8.2; // elevator shaft center
export const SHAFT_WIDTH = 2.6;
export const WAIT_X = -5.6; // where residents queue for the elevator

export function floorY(level: number): number {
  return level * FLOOR_HEIGHT;
}
