/** One solar clock for the sky, shadows, street lamps and interior lights. */
export function smoothBand(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function lightingAt(timeOfDay: number, cloudCover = 0) {
  const minute = ((Number.isFinite(timeOfDay) ? timeOfDay : 720) % 1440 + 1440) % 1440;
  const cloud = Math.max(0, Math.min(1, Number.isFinite(cloudCover) ? cloudCover : 0));
  const angle = (minute / 1440 - 0.25) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const daylight = smoothBand(-0.22, 0.32, elevation);
  const twilight = smoothBand(-0.25, -0.02, elevation) * (1 - smoothBand(0.10, 0.42, elevation));
  const golden = smoothBand(-0.09, 0.03, elevation) * (1 - smoothBand(0.20, 0.65, elevation));
  // Switch to moonlight only while the solar key is already fully extinguished.
  const moon = elevation < -0.18;
  const key = moon ? 0.28 * (1 - smoothBand(-0.50, -0.18, elevation)) : 1.8 * smoothBand(-0.08, 0.28, elevation);
  return {
    angle, elevation, daylight, twilight, golden, moon, cloud,
    keyIntensity: key * (1 - cloud * 0.78),
    // The low sun leaves broad skylight after direct shadows soften. Preserve
    // that twilight fill rather than dropping the landscape into a dark void.
    ambientIntensity: (0.65 + daylight * 0.35 + twilight * 0.16) * (1 - cloud * 0.12),
    fillIntensity: 0.62 - daylight * 0.27,
    stars: (1 - smoothBand(-0.34, -0.12, elevation)) * (1 - cloud),
  };
}

/** Stable staggered switch-on, with dim bedside light after household bedtime. */
export function windowLight(daylight: number, phase: number, occupied: boolean, residential: boolean, timeOfDay: number): number {
  if (!occupied) return 0;
  const variation = ((phase % 7) + 7) % 7 / 6;
  const evening = 1 - smoothBand(0.16 + variation * 0.10, 0.55 + variation * 0.20, daylight);
  const minute = ((timeOfDay % 1440) + 1440) % 1440;
  const awake = residential
    ? smoothBand(360 + variation * 60, 420 + variation * 60, minute) * (1 - smoothBand(1320 + variation * 50, 1380 + variation * 50, minute))
    : 1;
  return evening * (0.58 + variation * 0.22) * (residential ? 0.12 + 0.88 * awake : 1);
}
