import { describe, expect, it } from 'vitest';
import { createResident, maybeNightlifeVisit, planNext, FloorPicker } from './residents';
import { Tower } from './tower';

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

describe('nightlife', () => {
  /** A tower with a residential floor and a staffed bar on level 2. */
  function barTower(): Tower {
    const t = new Tower();
    t.addFloor('residential');
    t.addFloor('restaurant', 'bar');
    return t;
  }

  it('sends a bored resident out to a bar inside the evening window', () => {
    const r = createResident(1, 't0');
    r.needs.entertainment = 0; // desperate for fun → high chance
    const out = maybeNightlifeVisit(r, 20 * 60, openPicker(barTower()), () => 0.01);
    expect(out).not.toBeNull();
    expect(out!.activity.kind).toBe('eat');
    expect(out!.activity.floor).toBe(2);
    expect(r.didNightlife).toBe(true);
    // Already went out today → no second trip.
    expect(maybeNightlifeVisit(r, 21 * 60, openPicker(barTower()), () => 0.01)).toBeNull();
  });

  it('no nightlife outside the evening window', () => {
    const r = createResident(1, 't0');
    r.needs.entertainment = 0;
    expect(maybeNightlifeVisit(r, 14 * 60, openPicker(barTower()), () => 0.01)).toBeNull();
  });

  it('no nightlife when the town has no open bar', () => {
    const t = new Tower();
    t.addFloor('restaurant', 'coffee'); // a café is not a bar
    const r = createResident(1, 't0');
    r.needs.entertainment = 0;
    expect(maybeNightlifeVisit(r, 20 * 60, openPicker(t), () => 0.01)).toBeNull();
  });

  it('regression: a cross-tower resident\'s evening still routes home via commute', () => {
    const r = createResident(1, 't0'); // home t0
    r.jobFloor = 1;
    r.jobTowerId = 't1'; // works elsewhere; standing in job tower t1 after work
    // Evening, no bar available (null picker) → must fall through to the home
    // activity, which for a cross-tower resident is a commute (not a literal).
    const plan = planNext(r, 21 * 60, noFloors, () => 0.99, false, true);
    expect(plan.activity.kind).toBe('commute');
  });

  it('before the window, an employed resident idles only until the window opens', () => {
    const r = createResident(1, 't0');
    r.jobFloor = 1;
    r.jobTowerId = 't0';
    r.workStart = 480;
    r.workEnd = 960;
    r.didShop = true; // skip the after-work errand
    // 18:00 (1080): after work, before the 19:00 nightlife window.
    const plan = planNext(r, 1080, openPicker(barTower()), () => 0.99);
    expect(plan.activity.kind).toBe('home');
    expect(plan.duration).toBe(19 * 60 - 1080); // wakes to re-check at 19:00
  });
});
