/** Decorative seconds: never accelerated by game speed or caught up after a
 * hidden tab. Simulation locations still come from the town's own clock. */
export function visualDelta(seconds: number, running = true, visible = true): number {
  return running && visible && Number.isFinite(seconds) ? Math.min(0.1, Math.max(0, seconds)) : 0;
}
