import { describe, expect, it } from 'vitest';
import { assignJobs, processPromotions, TowerContext } from './careers';
import { Tower } from './tower';
import { JOB_TIERS, POACH_AFTER_BLOCKED_DAYS, Resident } from './types';

let nextId = 1;
function makeResident(homeTowerId: string, overrides: Partial<Resident> = {}): Resident {
  return {
    id: `r${nextId++}`,
    name: 'Test',
    homeFloor: 1,
    homeTowerId,
    jobFloor: null,
    jobTowerId: null,
    jobTier: 0,
    jobStartDay: null,
    blockedDays: 0,
    traits: [],
    needs: { housing: 100, employment: 100, food: 100, entertainment: 100 },
    happiness: 100,
    unhappyDays: 0,
    workStart: 480,
    workEnd: 960,
    didLunch: false,
    didShop: false,
    didNightlife: false,
    state: { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 0 },
    color: 0xffffff,
    ...overrides,
  };
}

function makeContext(
  id: string,
  floorTypes: ('residential' | 'shop' | 'restaurant' | 'office')[],
  residents: Resident[] = [],
): TowerContext {
  const tower = new Tower();
  for (const t of floorTypes) tower.addFloor(t);
  return { id, tower, residents };
}

describe('assignJobs', () => {
  it('hires unemployed residents into tier-0 slots only', () => {
    const r = makeResident('t0');
    const ctx = makeContext('t0', ['residential', 'office'], [r]);
    assignJobs([ctx], 1);
    expect(r.jobFloor).toBe(2);
    expect(r.jobTier).toBe(0);
    expect(r.jobStartDay).toBe(1);
  });

  it('respects tier-0 slot capacity', () => {
    // Office has 2 Intern slots; a third resident stays unemployed.
    const residents = [makeResident('t0'), makeResident('t0'), makeResident('t0')];
    const ctx = makeContext('t0', ['residential', 'office'], residents);
    assignJobs([ctx], 1);
    const employed = residents.filter((r) => r.jobFloor !== null);
    expect(employed).toHaveLength(JOB_TIERS.office[0].slots);
  });

  it('prefers the home tower, then hires cross-tower', () => {
    const rHome = makeResident('t0');
    const rAway = makeResident('t0');
    const t0 = makeContext('t0', ['residential', 'shop'], [rHome, rAway]);
    const t1 = makeContext('t1', ['shop'], []);
    assignJobs([t0, t1], 1);
    // Shop tier 0 has 1 slot; first hire lands at home, second must cross over.
    expect(rHome.jobTowerId).toBe('t0');
    expect(rAway.jobTowerId).toBe('t1');
  });
});

describe('processPromotions', () => {
  it('promotes in place once tenure is met and a slot is free', () => {
    const r = makeResident('t0', { jobFloor: 2, jobTowerId: 't0', jobTier: 0, jobStartDay: 1 });
    const ctx = makeContext('t0', ['residential', 'office'], [r]);
    const day = 1 + JOB_TIERS.office[0].tenureDaysToPromote;
    const events = processPromotions([ctx], day);
    expect(r.jobTier).toBe(1);
    expect(r.jobStartDay).toBe(day);
    expect(events.some((e) => e.kind === 'promotion')).toBe(true);
  });

  it('does not promote before tenure', () => {
    const r = makeResident('t0', { jobFloor: 2, jobTowerId: 't0', jobTier: 0, jobStartDay: 5 });
    const ctx = makeContext('t0', ['residential', 'office'], [r]);
    processPromotions([ctx], 6);
    expect(r.jobTier).toBe(0);
  });

  it('blocks promotion when the higher slot is taken, then poaches elsewhere', () => {
    // Shop: 1 Clerk slot, 1 Shopkeeper slot. Shopkeeper slot occupied.
    const incumbent = makeResident('t0', { jobFloor: 2, jobTowerId: 't0', jobTier: 1, jobStartDay: 0 });
    const climber = makeResident('t0', { jobFloor: 2, jobTowerId: 't0', jobTier: 0, jobStartDay: 0 });
    const t0 = makeContext('t0', ['residential', 'shop'], [incumbent, climber]);
    const t1 = makeContext('t1', ['shop'], []); // empty shop elsewhere with a free Shopkeeper slot

    const startDay = JOB_TIERS.shop[0].tenureDaysToPromote;
    // Blocked for POACH_AFTER_BLOCKED_DAYS - 1 days: still stuck.
    for (let d = 0; d < POACH_AFTER_BLOCKED_DAYS - 1; d++) {
      processPromotions([t0, t1], startDay + d);
      expect(climber.jobTowerId).toBe('t0');
    }
    // The next blocked day triggers the switch to the earned tier elsewhere.
    const events = processPromotions([t0, t1], startDay + POACH_AFTER_BLOCKED_DAYS - 1);
    expect(climber.jobTowerId).toBe('t1');
    expect(climber.jobTier).toBe(1);
    expect(events.some((e) => e.kind === 'job-switch')).toBe(true);
  });

  it('top-tier workers never promote further', () => {
    const r = makeResident('t0', { jobFloor: 2, jobTowerId: 't0', jobTier: 1, jobStartDay: 0 });
    const ctx = makeContext('t0', ['residential', 'shop'], [r]);
    processPromotions([ctx], 100);
    expect(r.jobTier).toBe(1);
  });
});
