import { describe, expect, it } from 'vitest';
import { BUSINESS_SUBTYPES } from '../core/types';
import { ambientMix, concertLevel, openingNotes, type OpeningFloor, type SoundView } from './design';

const day: SoundView = { daylight: 1, timeOfDay: 720, viewWidth: 25, population: 25, weather: 'clear' };

describe('sound direction', () => {
  it('gives every business subtype and public landmark a distinct, short opening motif', () => {
    const floors: OpeningFloor[] = [
      { type: 'residential' },
      ...Object.entries(BUSINESS_SUBTYPES).flatMap(([type, profiles]) => profiles.map((p) => ({ type: type as OpeningFloor['type'], subtype: p.subtype }))),
      ...(['conservatory', 'gallery', 'observatory'] as const).map((landmark) => ({ type: 'landmark' as const, landmark })),
    ];
    const motifs = floors.map(openingNotes);
    expect(motifs).toHaveLength(17);
    expect(new Set(motifs.map((notes) => JSON.stringify(notes))).size).toBe(17);
    for (const notes of motifs) {
      expect(notes.length).toBeLessThanOrEqual(5);
      for (const note of notes) {
        expect(note.frequency).toBeGreaterThan(100); expect(note.frequency).toBeLessThan(2000);
        expect(note.volume).toBeLessThanOrEqual(0.1); expect(note.volume).toBeGreaterThan(0);
        expect(note.delay + note.duration).toBeLessThan(2);
      }
    }
    for (const type of ['lobby', 'shop', 'restaurant', 'office', 'factory', 'landmark'] as const) {
      expect(openingNotes({ type }).length).toBeGreaterThan(1);
    }
  });

  it('crossfades room and town continuously, not at the focus-mode boundary', () => {
    const near = ambientMix(day), middle = ambientMix({ ...day, viewWidth: 55 }), far = ambientMix({ ...day, viewWidth: 100 });
    expect(near.room).toBeGreaterThan(middle.room); expect(middle.room).toBeGreaterThan(far.room);
    for (const key of ['air', 'street', 'natureVolume'] as const) {
      expect(near[key]).toBeLessThan(middle[key]); expect(middle[key]).toBeLessThan(far[key]);
    }
    for (let width = 0; width < 130; width++) {
      const a = ambientMix({ ...day, viewWidth: width }), b = ambientMix({ ...day, viewWidth: width + 0.01 });
      expect(Math.abs(a.air - b.air)).toBeLessThan(0.0001);
      expect(Math.abs(a.room - b.room)).toBeLessThan(0.0001);
    }
  });

  it('shelters close-up rain, quiets snowy streets and removes nature calls during precipitation', () => {
    const near = ambientMix({ ...day, weather: 'rain' }), far = ambientMix({ ...day, weather: 'rain', viewWidth: 100 });
    expect(near.rain).toBeLessThan(far.rain); expect(near.rainCutoff).toBeLessThan(far.rainCutoff);
    const snow = ambientMix({ ...day, weather: 'snow' }), clear = ambientMix(day);
    expect(snow.air).toBeLessThan(clear.air); expect(snow.street).toBeLessThan(clear.street);
    expect(snow.natureVolume).toBe(0); expect(near.natureVolume).toBe(0); expect(clear.rain).toBe(0);
  });

  it('keeps evenings lively, nights quiet and unpopulated towns free of human activity', () => {
    const evening = ambientMix({ ...day, daylight: 0, timeOfDay: 1200 });
    const late = ambientMix({ ...day, daylight: 0, timeOfDay: 120 });
    expect(evening.street).toBeGreaterThan(late.street * 2);
    expect(evening.room).toBeGreaterThan(late.room);
    const empty = ambientMix({ ...day, population: 0 });
    expect(empty.room).toBe(0); expect(empty.street).toBe(0); expect(empty.air).toBeGreaterThan(0);
    expect(ambientMix({ ...day, timeOfDay: -60 })).toEqual(ambientMix({ ...day, timeOfDay: 1380 }));
  });

  it('bounds malformed/large inputs and attenuates park music smoothly', () => {
    for (const value of [NaN, Infinity, -1000, 0, 100000]) {
      const mix = ambientMix({ ...day, daylight: value, timeOfDay: value, viewWidth: value, population: value });
      for (const [key, target] of Object.entries(mix)) {
        expect(Number.isFinite(target)).toBe(true); expect(target).toBeGreaterThanOrEqual(0);
        expect(target).toBeLessThanOrEqual(key === 'rainCutoff' ? 2400 : key === 'natureInterval' ? 24 : 1);
      }
    }
    expect(concertLevel(0)).toBe(1); expect(concertLevel(125)).toBe(0); expect(concertLevel(NaN)).toBe(0);
    expect(concertLevel(40)).toBeGreaterThan(concertLevel(80));
    expect(Math.abs(concertLevel(64.99) - concertLevel(65.01))).toBeLessThan(0.001);
  });
});
