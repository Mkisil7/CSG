import { describe, expect, it } from 'vitest';
import { createResident, maybeEveningOuting, planNext, FloorPicker } from './residents';
import { Tower } from './tower';
import { NIGHTLIFE } from './types';

/** A picker over a plain tower where every business floor counts as open. */
function openPicker(tower: Tower): FloorPicker {
  return (type, subtype) =>
    tower.floors.find((f) => f.type === type && (!subtype || f.subtype === subtype)) ?? null;
}

const noFloors: FloorPicker = () => null;

describe('planNext commuting', () => {
  it('routes to a commute (lobby) instead of work when the job is in another tower', () => {
    const r = createResident(1, 't0');
    r.jobFloor = 3;
    r.jobTowerId = 't1';

    // During work hours with a cross-tower job → head for the street.
    const plan = planNext(r, r.workStart + 10, noFloors, Math.random, true, false);
    expect(plan.activity.kind).toBe('commute');
    expect(plan.activity.floor).toBe(0);
  });

  it('routes home via a commute when home is in another tower', () => {
    const r = createResident(1, 't0');
    r.jobFloor = 1;
    r.jobTowerId = 't1';

    // After work, standing in the job tower: home is cross-tower.
    const plan = planNext(r, r.workEnd + 10, noFloors, () => 0.99, false, true);
    expect(plan.activity.kind).toBe('commute');
  });

  it('same-tower behavior is unchanged (work activity, not commute)', () => {
    const tower = new Tower();
    tower.addFloor('residential');
    tower.addFloor('office');
    const r = createResident(1, 't0');
    r.jobFloor = 2;
    r.jobTowerId = 't0';

    const plan = planNext(r, r.workStart + 10, openPicker(tower));
    expect(plan.activity.kind).toBe('work');
    expect(plan.activity.floor).toBe(2);
  });
});

describe('departure-time buffer (commuters leave early)', () => {
  it('cross-tower workers head out commute+wait minutes before their shift', () => {
    const r = createResident(1, 't0');
    r.jobFloor = 2;
    r.jobTowerId = 't1';
    const commute = 45;
    const wait = 15;
    const departAt = r.workStart - commute - wait;

    // Just before the departure time: stay home exactly until departAt.
    const before = planNext(r, departAt - 5, noFloors, Math.random, true, false, commute, wait);
    expect(before.activity.kind).toBe('home');
    expect(before.duration).toBe(5);

    // Inside the buffer window: leave for the street now.
    const leaving = planNext(r, departAt + 1, noFloors, Math.random, true, false, commute, wait);
    expect(leaving.activity.kind).toBe('commute');
  });

  it('same-tower workers still leave exactly at shift start', () => {
    const tower = new Tower();
    tower.addFloor('residential');
    tower.addFloor('office');
    const r = createResident(1, 't0');
    r.jobFloor = 2;
    r.jobTowerId = 't0';

    const plan = planNext(r, r.workStart - 30, openPicker(tower));
    expect(plan.activity.kind).toBe('home');
    expect(plan.duration).toBe(30);
  });

  it('a commuter already in the job tower before shift waits in the lobby (no ping-pong)', () => {
    const r = createResident(1, 't0'); // home t0
    r.jobFloor = 2;
    r.jobTowerId = 't1';

    // Standing in t1 (job tower): crossTowerJob=false, crossTowerHome=true.
    const plan = planNext(r, r.workStart - 40, noFloors, Math.random, false, true);
    expect(plan.activity.kind).toBe('lobby');
    expect(plan.duration).toBe(40);
  });
});

describe('closed businesses', () => {
  it('nobody lunches when no restaurant is open (picker returns null)', () => {
    const r = createResident(1, 't0');
    r.jobFloor = 2;
    r.jobTowerId = 't0';
    r.didLunch = false;

    const plan = planNext(r, r.workStart + 250, noFloors); // lunchtime
    expect(plan.activity.kind).toBe('work');
    expect(r.didLunch).toBe(false); // flag only set when a spot is found
  });
});

describe('evening life', () => {
  /** A tower with a residential floor, a shop, a restaurant, and a bar. */
  function nightTown(): Tower {
    const t = new Tower();
    t.addFloor('residential');
    t.addFloor('shop', 'grocery');
    t.addFloor('restaurant', 'coffee');
    t.addFloor('restaurant', 'bar');
    return t;
  }

  it('a resident heads out in the evening even with only a shop (no bar needed)', () => {
    const t = new Tower();
    t.addFloor('residential');
    t.addFloor('shop', 'grocery');
    const r = createResident(1, 't0');
    r.needs.entertainment = 0;
    const out = maybeEveningOuting(r, openPicker(t), () => 0.01);
    expect(out).not.toBeNull();
    expect(out!.activity.kind).toBe('shop');
    expect(r.didShop).toBe(true);
  });

  it('dinner refills the food need and is a one-shot per day', () => {
    const t = new Tower();
    t.addFloor('residential');
    t.addFloor('restaurant', 'coffee');
    const r = createResident(1, 't0');
    r.needs.food = 0;
    // Force the dinner branch: only a restaurant is available.
    const out = maybeEveningOuting(r, openPicker(t), () => 0.01);
    expect(out!.activity.kind).toBe('eat');
    expect(r.didDinner).toBe(true);
  });

  it('stays in when nothing is open', () => {
    const r = createResident(1, 't0');
    expect(maybeEveningOuting(r, noFloors, () => 0.01)).toBeNull();
  });

  it('an employed resident keeps re-deciding through the evening (not one dead block)', () => {
    const r = createResident(1, 't0');
    r.jobFloor = 1;
    r.jobTowerId = 't0';
    r.workStart = 480;
    r.workEnd = 960;
    r.nocturnal = false;
    // 20:00, after work, dice say "stay in this time" → idle only until the
    // next re-check, so the evening keeps getting replanned.
    const plan = planNext(r, 20 * 60, openPicker(nightTown()), () => 0.99);
    expect(plan.activity.kind).toBe('home');
    expect(plan.duration).toBe(NIGHTLIFE.recheckMinutes);
  });

  it('after bedtime the resident settles in until the next work day', () => {
    const r = createResident(1, 't0');
    r.jobFloor = 1;
    r.jobTowerId = 't0';
    r.workStart = 480;
    r.workEnd = 960;
    r.nocturnal = false;
    const plan = planNext(r, 23 * 60, openPicker(nightTown()), () => 0.99); // past 22:30 bedtime
    expect(plan.activity.kind).toBe('home');
    // Sleeps through to next morning's workStart.
    expect(plan.duration).toBe(24 * 60 - 23 * 60 + 480);
  });

  it('night owls stay up later than early-to-bed residents', () => {
    const owl = createResident(1, 't0');
    owl.nocturnal = true;
    owl.jobFloor = 1;
    owl.jobTowerId = 't0';
    owl.workStart = 480;
    owl.workEnd = 960;
    // 23:00: past the early bedtime (22:30) but before the owl bedtime (23:45).
    const plan = planNext(owl, 23 * 60, openPicker(nightTown()), () => 0.99);
    expect(plan.activity.kind).toBe('home');
    expect(plan.duration).toBe(NIGHTLIFE.recheckMinutes); // still up, re-checking
  });

  it('regression: a cross-tower resident\'s evening still routes home via commute', () => {
    const r = createResident(1, 't0'); // home t0
    r.jobFloor = 1;
    r.jobTowerId = 't1'; // works elsewhere; standing in job tower t1 after work
    // Evening, nothing open (null picker) → must fall through to the home
    // activity, which for a cross-tower resident is a commute (not a literal).
    const plan = planNext(r, 21 * 60, noFloors, () => 0.99, false, true);
    expect(plan.activity.kind).toBe('commute');
  });
});
