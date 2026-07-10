import { describe, expect, it } from 'vitest';
import { createResident, planNext } from './residents';
import { Tower } from './tower';

describe('planNext commuting', () => {
  it('routes to a commute (lobby) instead of work when the job is in another tower', () => {
    const tower = new Tower();
    tower.addFloor('residential');
    const r = createResident(1, 't0');
    r.jobFloor = 3;
    r.jobTowerId = 't1';

    // During work hours with a cross-tower job → head for the street.
    const plan = planNext(r, r.workStart + 10, tower, Math.random, true, false);
    expect(plan.activity.kind).toBe('commute');
    expect(plan.activity.floor).toBe(0);
  });

  it('routes home via a commute when home is in another tower', () => {
    const tower = new Tower();
    const r = createResident(1, 't0');
    r.jobFloor = 1;
    r.jobTowerId = 't1';

    // After work, standing in the job tower: home is cross-tower.
    const plan = planNext(r, r.workEnd + 10, tower, () => 0.99, false, true);
    expect(plan.activity.kind).toBe('commute');
  });

  it('same-tower behavior is unchanged (work activity, not commute)', () => {
    const tower = new Tower();
    tower.addFloor('residential');
    tower.addFloor('office');
    const r = createResident(1, 't0');
    r.jobFloor = 2;
    r.jobTowerId = 't0';

    const plan = planNext(r, r.workStart + 10, tower);
    expect(plan.activity.kind).toBe('work');
    expect(plan.activity.floor).toBe(2);
  });
});
