import type { BusinessSubtype, Floor, FloorType, LandmarkKind } from '../core/types';
import type { WeatherKind } from '../core/weather';

export type OpeningFloor = Pick<Floor, 'type' | 'subtype' | 'landmark'>;
export type Timbre = 'bell' | 'glass' | 'pluck' | 'wood' | 'soft';
export interface Cue {
  root: number;
  steps: readonly number[];
  spacing: number;
  duration: number;
  timbre: Timbre;
}
export interface Note {
  frequency: number;
  volume: number;
  duration: number;
  delay: number;
  timbre: Timbre;
}

// Small, deliberately different motifs, not the same chord transposed for every shop.
const BUSINESS_CUES: Record<BusinessSubtype, Cue> = {
  grocery: { root: 72, steps: [0, 4, 7], spacing: 0.11, duration: 0.3, timbre: 'wood' },
  boutique: { root: 76, steps: [0, 7, 12], spacing: 0.16, duration: 0.65, timbre: 'bell' },
  electronics: { root: 79, steps: [0, 2, 7, 12], spacing: 0.075, duration: 0.24, timbre: 'glass' },
  coffee: { root: 60, steps: [0, 7, 9, 12], spacing: 0.14, duration: 0.45, timbre: 'pluck' },
  fastfood: { root: 67, steps: [0, 4, 7, 4, 12], spacing: 0.075, duration: 0.22, timbre: 'wood' },
  'fine-dining': { root: 65, steps: [0, 4, 11, 14], spacing: 0.2, duration: 0.85, timbre: 'bell' },
  bar: { root: 55, steps: [0, 3, 7, 10], spacing: 0.18, duration: 0.9, timbre: 'soft' },
  creative: { root: 69, steps: [0, 5, 9, 12], spacing: 0.11, duration: 0.5, timbre: 'pluck' },
  tech: { root: 72, steps: [0, 7, 14, 19], spacing: 0.09, duration: 0.4, timbre: 'glass' },
  law: { root: 57, steps: [0, 7, 12], spacing: 0.21, duration: 0.9, timbre: 'soft' },
  assembly: { root: 48, steps: [0, 7, 0, 12], spacing: 0.105, duration: 0.2, timbre: 'wood' },
  foodproc: { root: 53, steps: [0, 4, 7, 12], spacing: 0.12, duration: 0.28, timbre: 'wood' },
  'electronics-fab': { root: 64, steps: [0, 12, 7, 19], spacing: 0.1, duration: 0.35, timbre: 'glass' },
};
const FLOOR_CUES: Record<FloorType, Cue> = {
  lobby: { root: 55, steps: [0, 7], spacing: 0.16, duration: 0.6, timbre: 'soft' },
  residential: { root: 60, steps: [0, 4, 7, 12], spacing: 0.18, duration: 0.7, timbre: 'soft' },
  shop: BUSINESS_CUES.grocery,
  restaurant: BUSINESS_CUES.coffee,
  office: BUSINESS_CUES.creative,
  factory: BUSINESS_CUES.assembly,
  landmark: { root: 69, steps: [0, 7, 12, 19], spacing: 0.2, duration: 0.9, timbre: 'bell' },
};
const LANDMARK_CUES: Record<LandmarkKind, Cue> = {
  conservatory: { root: 74, steps: [0, 7, 12, 16], spacing: 0.17, duration: 0.8, timbre: 'bell' },
  gallery: { root: 62, steps: [0, 5, 9, 14], spacing: 0.22, duration: 0.75, timbre: 'pluck' },
  observatory: { root: 69, steps: [0, 12, 19, 24], spacing: 0.24, duration: 1.1, timbre: 'glass' },
};

export function openingNotes(floor: OpeningFloor): Note[] {
  const cue = (floor.type === 'landmark' && floor.landmark ? LANDMARK_CUES[floor.landmark] :
    floor.subtype ? BUSINESS_CUES[floor.subtype] : undefined) ?? FLOOR_CUES[floor.type];
  return cue.steps.map((step, i) => ({ frequency: 440 * Math.pow(2, (cue.root + step - 69) / 12),
    volume: i === 0 ? 0.1 : 0.075, duration: cue.duration,
    delay: i * cue.spacing, timbre: cue.timbre }));
}

export interface SoundView {
  daylight: number;
  timeOfDay: number;
  /** Width of the visible world at the focus plane, corrected for portrait screens. */
  viewWidth: number;
  population: number;
  weather: WeatherKind;
}
const clamp = (value: number, min: number, max: number, fallback = min) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
function smooth(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Continuous targets; the audio graph smooths changes rather than switching beds. */
export function ambientMix(view: SoundView) {
  const light = clamp(view.daylight, 0, 1);
  const near = 1 - smooth(24, 95, clamp(view.viewWidth, 0, 1000, 95));
  const population = clamp(view.population / 50, 0, 1);
  const minute = Number.isFinite(view.timeOfDay) ? (view.timeOfDay % 1440 + 1440) % 1440 : 720;
  const evening = smooth(960, 1080, minute) * (1 - smooth(1320, 1440, minute));
  const snow = view.weather === 'snow' ? 0.45 : 1;
  return {
    air: (0.025 + light * 0.055) * (1 - near * 0.7) * snow,
    room: population * (0.008 + near * 0.016) * (0.4 + light * 0.4 + evening * 0.2),
    street: population * (0.022 + light * 0.025 + evening * 0.038) * (1 - near * 0.78) * snow,
    rain: view.weather === 'rain' ? 0.55 - near * 0.32 : 0,
    rainCutoff: 2400 - near * 1450,
    natureVolume: view.weather === 'clear' ? (0.007 + light * 0.012) * (1 - near * 0.8) : 0,
    natureInterval: 24 - light * 9,
  };
}

/** Concerts fade with listener distance instead of switching off at a lot boundary. */
export function concertLevel(distance: number): number {
  return 1 - smooth(12, 125, clamp(distance, 0, 10000, 125));
}
