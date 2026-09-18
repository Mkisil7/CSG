/** A short structural rise, followed by furnishings and the opening sign. */
export const OPENING_DURATION = 2.2;
export function openingFrame(elapsed: number) {
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const rise = Math.min(1, time / 1.25);
  const scale = 0.04 + 0.96 * (1 - Math.pow(1 - rise, 3));
  const sign = Math.min(1, Math.max(0, (time - 1.35) / 0.85));
  return { scale, furnishings: time >= 0.7, sign, complete: time >= OPENING_DURATION };
}

export function openingDelta(dt: number): number {
  return Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
}
