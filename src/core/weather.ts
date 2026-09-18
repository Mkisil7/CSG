import { MINUTES_PER_DAY } from './types';

export type WeatherKind = 'clear' | 'rain' | 'snow';
export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export interface WeatherSave { seed: number; wetness: number; snow: number; observedAt: number }
export const WEATHER_LABELS: Record<WeatherKind, string> = { clear: 'Clear skies', rain: 'Passing rain', snow: 'Soft snowfall' };
const PERIOD = MINUTES_PER_DAY / 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** A repeatable local climate. Reloading does not reroll the forecast. */
export class TownWeather {
  private seed: number;
  private observedAt = 0;
  kind: WeatherKind = 'clear';
  wetness = 0;
  snow = 0;

  constructor(seed = Math.floor(Math.random() * 0x100000000)) { this.seed = seed >>> 0; }

  seasonAt(time: number): Season {
    return (['Spring', 'Summer', 'Autumn', 'Winter'] as const)[Math.floor(Math.max(0, time) / (MINUTES_PER_DAY * 8)) % 4];
  }

  at(time: number): WeatherKind {
    if (time < MINUTES_PER_DAY) return 'clear'; // a gentle first day
    const period = Math.floor(time / PERIOD);
    let hash = Math.imul(period ^ this.seed, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    const roll = ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
    const season = this.seasonAt(time);
    if (season === 'Winter') return roll < 0.48 ? 'snow' : 'clear';
    return roll < (season === 'Summer' ? 0.15 : season === 'Autumn' ? 0.4 : 0.3) ? 'rain' : 'clear';
  }

  nextChangeAt(time: number): number { return (Math.floor(time / PERIOD) + 1) * PERIOD; }

  /** Integrate each forecast interval separately, including offline catch-up.
   * Exponential approach makes results independent of the simulation tick size. */
  update(now: number): void {
    if (!Number.isFinite(now) || now < this.observedAt) return;
    let cursor = Math.max(this.observedAt, now - MINUTES_PER_DAY * 32);
    while (cursor < now) {
      const end = Math.min(now, this.nextChangeAt(cursor));
      const kind = this.at(cursor);
      const dt = end - cursor;
      this.wetness = approach(this.wetness, kind === 'rain' ? 1 : 0, dt, kind === 'rain' ? 35 : 160);
      this.snow = approach(this.snow, kind === 'snow' ? 1 : 0, dt, kind === 'snow' ? 150 : this.seasonAt(cursor) === 'Winter' ? 1200 : 300);
      cursor = end;
    }
    this.kind = this.at(now);
    this.observedAt = now;
  }

  snapshot(): WeatherSave { return { seed: this.seed, wetness: this.wetness, snow: this.snow, observedAt: this.observedAt }; }

  restore(data: WeatherSave | undefined, now: number): void {
    if (data && Number.isFinite(data.seed)) {
      this.seed = data.seed >>> 0;
      this.wetness = Number.isFinite(data.wetness) ? clamp(data.wetness) : 0;
      this.snow = Number.isFinite(data.snow) ? clamp(data.snow) : 0;
      this.observedAt = Number.isFinite(data.observedAt) ? Math.max(0, Math.min(now, data.observedAt)) : now;
    } else this.observedAt = now; // old saves start with clean surfaces
    this.update(now);
  }
}

function approach(value: number, target: number, dt: number, minutes: number): number {
  return target + (value - target) * Math.exp(-dt / minutes);
}

/** Shelter only mitigates the weather penalty; it never makes a dry trip faster. */
export function weatherTravelMultiplier(kind: WeatherKind, shelteredEnds = 0): number {
  const penalty = kind === 'snow' ? 0.22 : kind === 'rain' ? 0.12 : 0;
  return 1 + penalty * (1 - Math.max(0, Math.min(2, shelteredEnds)) * 0.35);
}

export function weatherCoffeeMultiplier(kind: WeatherKind): number { return kind === 'clear' ? 1 : 1.15; }
