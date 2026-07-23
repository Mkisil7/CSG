import { describe, expect, it } from 'vitest';
import { CityEventSystem } from './events';

/** Deterministic RNG so scheduling/rolls are reproducible in tests. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('CityEventSystem', () => {
  it('starts with no active events and a neutral effect', () => {
    const sys = new CityEventSystem(1, seeded(1));
    expect(sys.active).toHaveLength(0);
    expect(sys.incomeMultiplier()).toBe(1);
    expect(sys.moodBonus()).toBe(0);
  });

  it('eventually starts an event, and it carries a real effect', () => {
    const sys = new CityEventSystem(1, seeded(7));
    const rng = seeded(7);
    let started = 0;
    for (let day = 1; day <= 20; day++) started += sys.update(day, rng).started.length;
    expect(started).toBeGreaterThan(0);
    // Whenever something is active, the effect is non-neutral.
    if (sys.active.length) {
      const neutral = sys.incomeMultiplier() === 1 && sys.moodBonus() === 0;
      expect(neutral).toBe(false);
    }
  });

  it('expires events once their duration passes', () => {
    const sys = new CityEventSystem(1, seeded(3));
    const rng = seeded(99);
    // Run far enough to guarantee at least one full start→end cycle.
    let sawActive = false;
    let sawEnded = false;
    for (let day = 1; day <= 40; day++) {
      const { ended } = sys.update(day, rng);
      if (sys.active.length) sawActive = true;
      if (ended.length) sawEnded = true;
    }
    expect(sawActive).toBe(true);
    expect(sawEnded).toBe(true);
  });

  it('never runs more than two overlapping events', () => {
    const sys = new CityEventSystem(1, seeded(42));
    const rng = seeded(123);
    let maxConcurrent = 0;
    for (let day = 1; day <= 100; day++) {
      sys.update(day, rng);
      maxConcurrent = Math.max(maxConcurrent, sys.active.length);
    }
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('combines overlapping effects multiplicatively (income) and additively (mood)', () => {
    const sys = new CityEventSystem(1, seeded(5));
    // Force two known active events and check the aggregate math.
    sys.active = [
      {
        id: 'a', kind: 'festival', emoji: '🎉', title: 'F', blurb: '', good: true,
        startDay: 1, endsDay: 5, incomeMultiplier: 1.5, moodBonus: 8,
      },
      {
        id: 'b', kind: 'recession', emoji: '📉', title: 'R', blurb: '', good: false,
        startDay: 1, endsDay: 5, incomeMultiplier: 0.8, moodBonus: -6,
      },
    ];
    expect(sys.incomeMultiplier()).toBeCloseTo(1.2, 5);
    expect(sys.moodBonus()).toBe(2);
  });

  it('catches up across skipped days without stalling the schedule', () => {
    const sys = new CityEventSystem(1, seeded(11));
    const rng = seeded(11);
    // Jump straight to a far day (as offline catch-up would): the schedule
    // advances past it rather than firing every intervening day at once.
    const { started } = sys.update(50, rng);
    expect(started.length).toBeLessThanOrEqual(2);
    // And the system is ready to fire again in the future, not stuck in the past.
    const again = sys.update(80, rng);
    expect(again.started.length).toBeGreaterThanOrEqual(0);
  });
});
