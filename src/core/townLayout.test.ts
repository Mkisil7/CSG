import { describe, expect, it } from 'vitest';
import { commuteMinutesBetween, slotIndexOfTowerId, TOWER_SLOT_ORIGINS, TOWER_SPACING } from './townLayout';
import { TOWN } from './types';

describe('townLayout', () => {
  it('parses slot indices from tower ids', () => {
    expect(slotIndexOfTowerId('t0')).toBe(0);
    expect(slotIndexOfTowerId('t3')).toBe(3);
    expect(slotIndexOfTowerId('bogus')).toBe(-1);
  });

  it('commute time is zero within a tower and symmetric between towers', () => {
    expect(commuteMinutesBetween('t0', 't0')).toBe(0);
    expect(commuteMinutesBetween('t0', 't2')).toBe(commuteMinutesBetween('t2', 't0'));
  });

  it('commute time grows with distance', () => {
    const near = commuteMinutesBetween('t0', 't1');
    const far = commuteMinutesBetween('t0', 't3');
    expect(near).toBeGreaterThan(TOWN.commuteBaseMinutes);
    expect(far).toBeGreaterThan(near);
  });

  it('adjacent towers match the hand-computed formula', () => {
    expect(commuteMinutesBetween('t0', 't1')).toBe(
      Math.round(TOWN.commuteBaseMinutes + TOWER_SPACING * TOWN.commuteMinutesPerUnit),
    );
    expect(TOWER_SLOT_ORIGINS.length).toBe(TOWN.slotCosts.length);
  });
});
