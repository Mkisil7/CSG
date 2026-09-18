import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { createResident } from './residents';
import { type NeighborhoodEvent, type NeighborhoodKind } from './neighborhood';
import { toSaveData, townFromSaveData } from './save';
import { assignedStaff } from './business';

function fixture() {
  const t = new Town(); t.time = 1440 + 600; t.economy.coins = 10000;
  const g = t.towers()[0];
  for (let i = 0; i < 4; i++) g.tower.addFloor('residential');
  g.tower.addFloor('restaurant', 'coffee'); g.tower.addFloor('office', 'tech');
  g.tower.addFloor('office', 'law'); g.tower.addFloor('shop', 'grocery'); g.tower.addFloor('shop', 'boutique');
  for (let i = 0; i < 16; i++) {
    const r = createResident(1 + i % 4, g.id); r.traits = ['social']; r.workStart = 540; r.workEnd = 1020;
    r.jobTowerId = g.id; r.jobFloor = i < 3 ? 5 : i < 7 ? 6 : i < 9 ? 8 : i < 11 ? 9 : 6;
    r.jobTier = i === 5 ? 1 : 0; r.jobStartDay = 1;
    r.state = { kind: 'idle', floor: r.homeFloor, activity: { kind: 'home', floor: r.homeFloor }, until: t.time + 2000 };
    g.residents.push(r);
  }
  g.tower.floors[5].quality = 75; g.tower.floors[5].visitsToday = 5;
  g.tower.floors[6].quality = 75; g.staffedLevels = new Set([5, 6, 8, 9]);
  t.slots[1] = { id: 't1', unlocked: true, zone: 'park', game: null };
  t.stories.update(t);
  return t;
}

function invite(town: Town, kind: NeighborhoodKind): NeighborhoodEvent {
  // Use the real discovery predicates; ignore earlier invitations without charging.
  for (let i = 0; i < 10; i++) {
    town.neighborhood.discover(town);
    const found = town.neighborhood.events.find((e) => e.kind === kind && e.status === 'offered');
    if (found) return found;
    for (const e of town.neighborhood.pending()) town.neighborhood.decline(town, e.id);
    town.time += 1440;
  }
  throw new Error(`No ${kind} invitation`);
}

describe('contextual invitations', () => {
  it('offers nothing to an empty town and explains a restaurant invitation with actual facts', () => {
    const empty = new Town(); empty.time = 5000; empty.neighborhood.discover(empty);
    expect(empty.neighborhood.events).toHaveLength(0);
    const t = fixture(); const event = invite(t, 'critic');
    expect(event.reason).toContain('75 quality, 3 staff and 5 visits');
    t.neighborhood.discover(t); expect(t.neighborhood.events).toHaveLength(1);
  });

  it('keeps invitations open and charges exactly once after rechecking requirements', () => {
    const t = fixture(); const event = invite(t, 'critic'); const coins = t.economy.coins;
    t.time += 1440 * 10; t.neighborhood.update(t); expect(event.status).toBe('offered');
    expect(t.neighborhood.respond(t, event.id)).toBe(true);
    expect(t.neighborhood.respond(t, event.id)).toBe(false);
    expect(t.economy.coins).toBe(coins - 60);
    expect(t.neighborhood.decline(t, event.id)).toBe(false);
  });

  it('declines without penalty and refuses stale staffing or an unaffordable action', () => {
    const t = fixture(); const event = invite(t, 'critic');
    t.economy.coins = 20; expect(t.neighborhood.respond(t, event.id)).toBe(false);
    t.economy.coins = 1000;
    for (const r of t.allResidents()) r.jobFloor = null;
    expect(t.neighborhood.respond(t, event.id)).toBe(false);
    expect(t.neighborhood.decline(t, event.id)).toBe(true);
    expect(t.economy.coins).toBe(1000);
  });

  it('expands the actual startup team into an empty office and does not overwrite an occupied office', () => {
    const t = fixture(), g = t.towers()[0]; const event = invite(t, 'startup');
    const before = assignedStaff(t.allResidents(), g.id, 6).length;
    expect(t.neighborhood.respond(t, event.id, { towerId: g.id, level: 6 })).toBe(false);
    expect(t.neighborhood.respond(t, event.id, { towerId: g.id, level: 7 })).toBe(true);
    expect(assignedStaff(t.allResidents(), g.id, 6)).toHaveLength(before - 2);
    expect(assignedStaff(t.allResidents(), g.id, 7)).toHaveLength(2);
    expect(g.tower.floors[7]).toMatchObject({ subtype: 'tech', variant: 'innovation-hub', quality: 75 });
    expect(g.tower.floors[6].variant).toBe('founders-studio');
    expect(event.status).toBe('completed');
    expect(t.stories.journal.slice(-1)[0].place).toEqual({ kind: 'floor', towerId: g.id, level: 7 });
  });

  it('honors a real long-term friend and ties the benefit to their home tower', () => {
    const t = fixture(); const r = t.allResidents()[0];
    t.stories.people[r.id].arrivalDay = 1;
    t.stories.people[r.id].friends = t.allResidents().slice(1, 3).map((f) => ({ residentId: f.id, daysTogether: 4, lastDay: 6 }));
    t.time = 6 * 1440 + 600;
    const event = invite(t, 'character'); expect(event.residentId).toBe(r.id);
    expect(t.neighborhood.respond(t, event.id)).toBe(true);
    expect(r.townRole).toBe('Neighborhood host'); expect(t.towers()[0].communityMood).toBe(2);
    t.towers()[0].residents = t.towers()[0].residents.filter((p) => p.id !== r.id);
    t.neighborhood.update(t); expect(t.towers()[0].communityMood).toBe(0);
  });

  it.each([false, true])('opens an expanded studio immediately without advancing its people or clock (cross-tower: %s)', (crossTower) => {
    const town = fixture(), source = town.towers()[0];
    // Keep the minimum eligible team: two relocate, one stays behind. Spare
    // unemployed residents expose any accidental hiring via a simulation tick.
    const originalTeam = assignedStaff(town.allResidents(), source.id, 6);
    for (const r of originalTeam.slice(3)) { r.jobFloor = null; r.jobTowerId = null; }
    const destination = crossTower ? new Game('t2', town.economy) : source;
    if (crossTower) {
      town.slots[2] = { id: 't2', unlocked: true, zone: 'mixed', game: destination };
      destination.tower.addFloor('office', 'law');
    }
    const level = crossTower ? 1 : 7, event = invite(town, 'startup');
    const people = town.allResidents(), before = structuredClone(people);
    const time = town.time, coins = town.economy.coins, income = town.economy.incomeToday;
    expect(destination.staffedLevels.has(level)).toBe(false);
    expect(town.neighborhood.respond(town, event.id, { towerId: destination.id, level })).toBe(true);
    expect(destination.staffedLevels.has(level)).toBe(true);
    expect(source.staffedLevels.has(6)).toBe(true);
    expect(assignedStaff(people, source.id, 6)).toHaveLength(1);
    const moved = assignedStaff(people, destination.id, level);
    expect(moved).toHaveLength(2);
    for (const [index, resident] of people.entries()) {
      const expected = before[index];
      if (moved.includes(resident)) {
        expected.jobTowerId = destination.id; expected.jobFloor = level;
        expected.jobStartDay = town.day; expected.blockedDays = 0;
        if (expected.state.kind === 'idle') expected.state.until = time;
      }
      expect(resident).toEqual(expected);
    }
    expect(town.time).toBe(time); expect(town.economy.incomeToday).toBe(income);
    expect(town.economy.coins).toBe(coins - 350);
    expect(town.neighborhood.respond(town, event.id, { towerId: destination.id, level })).toBe(false);
    expect(town.economy.coins).toBe(coins - 350);
    const restored = townFromSaveData(toSaveData(town))!;
    expect(restored.towerById(destination.id)!.staffedLevels.has(level)).toBe(true);
    expect(restored.towerById(source.id)!.staffedLevels.has(6)).toBe(true);
    expect(restored.time).toBe(time); expect(restored.economy.coins).toBe(coins - 350);
  });

  it('retains the exact expanded studio and staff through a detached save without replaying its charge', () => {
    const town = fixture(), game = town.towers()[0], event = invite(town, 'startup');
    town.neighborhood.respond(town, event.id, { towerId: game.id, level: 7 });
    const saved = toSaveData(town), restored = townFromSaveData(saved)!;
    const memory = restored.neighborhood.events.find((e) => e.id === event.id)!;
    expect(memory.studio).toEqual({ towerId: game.id, level: 7 });
    expect(assignedStaff(restored.allResidents(), game.id, 7)).toHaveLength(2);
    expect(restored.economy.coins).toBe(town.economy.coins);
    expect(restored.neighborhood.respond(restored, event.id, memory.studio)).toBe(false);
    saved.neighborhood!.events.find((e) => e.id === event.id)!.studio!.level = 999;
    expect(memory.studio!.level).toBe(7);
    const invalid = townFromSaveData(saved)!;
    expect(invalid.neighborhood.events.find((e) => e.id === event.id)!.studio).toBeUndefined();
    delete saved.neighborhood!.events.find((e) => e.id === event.id)!.studio;
    expect(townFromSaveData(saved)!.neighborhood.events.find((e) => e.id === event.id)!.status).toBe('completed');
  });
});

describe('real event visits and persistence', () => {
  it('publishes a review only after a critic reaches the restaurant and credits no rent for guests', () => {
    const t = fixture(), g = t.towers()[0]; const e = invite(t, 'critic');
    t.neighborhood.respond(t, e.id); t.neighborhood.update(t);
    expect(g.visitors).toHaveLength(1); expect(t.population).toBe(16); expect(e.served).toBe(0);
    const visitor = g.visitors[0]; expect(visitor.visit.credited).toBe(false);
    g.restoreLifts(3, true);
    for (let i = 0; i < 100 && e.served === 0; i++) {
      t.time += 1; g.tick(1, t.time); t.neighborhood.afterTrips(t);
    }
    expect(e.served).toBe(1); expect(e.reviewPublished).toBe(true);
    expect(g.tower.floors[5].variant).toBe('critics-choice');
    expect(t.stories.journal.slice(-1)[0].place).toEqual({ kind: 'floor', towerId: g.id, level: 5 });
    t.neighborhood.update(t); expect(g.floorVisitBonuses.get(5)).toBe(1.25);
    const rent = new Town(); const rg = rent.towers()[0]; rg.visitors = g.visitors;
    const balance = rent.economy.coins; rent.economy.accrue(60, [rg]); expect(rent.economy.coins).toBe(balance);
  });

  it('counts a missed festival visit without paying the business and keeps visitor pressure bounded', () => {
    const t = fixture(), g = t.towers()[0]; const e = invite(t, 'festival');
    t.time = Math.floor(t.time / 1440) * 1440 + 1080;
    t.neighborhood.respond(t, e.id); t.neighborhood.update(t);
    expect(g.visitors).toHaveLength(1); const guest = g.visitors[0];
    g.tick(0, t.time); const revenue = g.tower.floors[guest.visit.target].revenueToday;
    t.time += 100; g.tick(0.01, t.time); t.neighborhood.afterTrips(t);
    expect(e.missed).toBe(1); expect(e.served).toBe(0);
    expect(g.tower.floors[guest.visit.target].revenueToday).toBe(revenue);
    for (let i = 0; i < 100; i++) { e.nextVisitorAt = 0; t.neighborhood.update(t); }
    expect(g.visitors.length).toBeLessThanOrEqual(28);
    expect(t.population).toBe(16);
  });

  it('keeps park listeners on an actual timed arrival path and applies a nearby-only benefit', () => {
    const t = fixture(); const e = invite(t, 'band');
    t.time = Math.floor(t.time / 1440) * 1440 + 1080;
    t.slots[9] = { id: 't9', unlocked: true, zone: 'mixed', game: new Game('t9', t.economy) };
    t.neighborhood.respond(t, e.id); t.neighborhood.update(t);
    expect(e.arrivals).toBe(0); expect(t.neighborhood.parkGuests).toHaveLength(1);
    expect(t.stories.journal.slice(-1)[0].place).toEqual({ kind: 'slot', index: e.parkIndex });
    expect(t.towers()[0].communityMood).toBeGreaterThan(0); expect(t.towerById('t9')!.communityMood).toBe(0);
    t.time += 12; t.neighborhood.update(t); expect(e.arrivals).toBe(1);
    t.neighborhood.update(t); expect(e.arrivals).toBe(1);
    t.time = e.endsAt; t.neighborhood.update(t);
    expect(e.status).toBe('completed'); expect(t.towers()[0].communityMood).toBe(0);
  });

  it('round-trips offers, outcomes and in-flight visitors without double-charging or replaying a review', () => {
    const t = fixture(); const e = invite(t, 'critic'); t.neighborhood.respond(t, e.id); t.neighborhood.update(t);
    const saved = toSaveData(t); const restored = townFromSaveData(saved)!;
    expect(restored.neighborhood.events).toEqual(t.neighborhood.events);
    expect(restored.towers()[0].visitors).toHaveLength(1);
    expect(restored.towers()[0].visitors[0].state.kind).toBe('idle');
    expect(restored.neighborhood.respond(restored, e.id)).toBe(false);
    expect(restored.economy.coins).toBe(t.economy.coins);
    const detached = t.neighborhood.snapshot(); detached.events[0].served = 999;
    expect(t.neighborhood.events[0].served).toBe(0);
    delete saved.neighborhood; delete saved.towers[0].visitors;
    expect(townFromSaveData(saved)!.neighborhood.events).toEqual([]);
  });

  it('consumes trip results once and retains the earned critic sign after the temporary boost ends', () => {
    const t = fixture(), g = t.towers()[0], e = invite(t, 'critic');
    t.neighborhood.respond(t, e.id);
    g.visitorOutcomes.push({ eventId: e.id, served: true });
    t.neighborhood.afterTrips(t); t.neighborhood.afterTrips(t);
    expect(e.served).toBe(1); expect(g.visitorOutcomes).toEqual([]);
    t.neighborhood.update(t); expect(g.floorVisitBonuses.get(5)).toBe(1.25);
    t.time = e.endsAt; t.neighborhood.update(t);
    const restored = townFromSaveData(toSaveData(t))!;
    expect(restored.towers()[0].floorVisitBonuses.size).toBe(0);
    expect(restored.towers()[0].tower.floors[5].variant).toBe('critics-choice');
  });

  it('does not send a missed guest back to the business after reload', () => {
    const t = fixture(), g = t.towers()[0], e = invite(t, 'critic');
    t.neighborhood.respond(t, e.id); t.neighborhood.update(t);
    const visitor = g.visitors[0];
    g.tick(0, t.time); t.time += 100; g.tick(0.01, t.time); t.neighborhood.afterTrips(t);
    expect(visitor.visit.resolved).toBe(true); expect(visitor.visit.credited).toBe(false);
    // Keep the departing guest in the save even if the lobby removed it this tick.
    g.visitors = [visitor];
    const restored = townFromSaveData(toSaveData(t))!, rg = restored.towers()[0];
    rg.tick(0, restored.time); restored.neighborhood.afterTrips(restored);
    expect(rg.visitors).toHaveLength(0);
    expect(restored.neighborhood.events.find((event) => event.id === e.id)).toMatchObject({ missed: 1, served: 0 });
  });

  it('serves twelve festival guests through the lifts before awarding the host storefront', () => {
    const t = fixture(), g = t.towers()[0], e = invite(t, 'festival');
    t.time = Math.floor(t.time / 1440) * 1440 + 1020;
    g.restoreLifts(3, true); t.neighborhood.respond(t, e.id);
    for (let minute = 0; minute < 280 && e.served < 12; minute++) {
      t.time++; t.neighborhood.update(t); g.tick(1, t.time); t.neighborhood.afterTrips(t);
      if (e.served < 12) expect(g.tower.floors[e.level!].variant).toBeUndefined();
    }
    expect(e.served).toBeGreaterThanOrEqual(12);
    expect(g.tower.floors[e.level!].variant).toBe('festival-market');
    expect(t.stories.journal.slice(-1)[0].place).toEqual({ kind: 'floor', towerId: e.towerId, level: e.level });
    expect(e.reviewPublished).toBe(true);
    expect(t.population).toBe(16);
    const restored = townFromSaveData(toSaveData(t))!;
    expect(restored.towers()[0].tower.floors[e.level!].variant).toBe('festival-market');
  });

  it('does not reserve the same storefront for simultaneous critic and festival invitations', () => {
    const t = fixture(); const critic = invite(t, 'critic');
    let festival: NeighborhoodEvent | undefined;
    for (let i = 0; i < 6 && !festival; i++) {
      t.time += 1440; t.neighborhood.discover(t);
      festival = t.neighborhood.events.find((e) => e.kind === 'festival');
      for (const e of t.neighborhood.pending()) if (e.kind !== 'critic' && e.kind !== 'festival') t.neighborhood.decline(t, e.id);
    }
    expect(festival).toBeDefined();
    expect(`${festival!.towerId}:${festival!.level}`).not.toBe(`${critic.towerId}:${critic.level}`);
  });

  it('keeps an earned bandstand after the concert leaves the bounded history', () => {
    const t = fixture(), e = invite(t, 'band'); t.neighborhood.respond(t, e.id);
    t.time = e.endsAt; t.neighborhood.update(t);
    expect(t.neighborhood.bandstands.has(1)).toBe(true);
    t.neighborhood.events = [];
    const restored = townFromSaveData(toSaveData(t))!;
    expect(restored.neighborhood.events).toEqual([]);
    expect([...restored.neighborhood.bandstands]).toEqual([1]);
  });

  it('rejects broken event references, duplicated guests, and impossible park paths in shared saves', () => {
    const t = fixture(), e = invite(t, 'band');
    t.time = Math.floor(t.time / 1440) * 1440 + 1080;
    t.neighborhood.respond(t, e.id); t.neighborhood.update(t);
    const saved = toSaveData(t), ns = saved.neighborhood!;
    const original = ns.events.find((event) => event.id === e.id)!;
    ns.events.push({ ...original }, { ...original, id: 'ne90', parkIndex: 999 },
      { ...original, id: 'ne91', served: -2 }, { ...original, id: 'ne92', kind: 'critic', towerId: 't0', level: 999 });
    ns.bandstands = [1, 999, -1, 0];
    const guest = ns.parkGuests[0];
    ns.parkGuests.push({ ...guest }, { ...guest, id: 'pg99', arrivesAt: guest.startedAt },
      { ...guest, id: 'pg100', parkIndex: 999 });
    const restored = townFromSaveData(saved)!;
    expect(restored.neighborhood.events.filter((event) => event.kind === 'band')).toHaveLength(1);
    expect(restored.neighborhood.events.some((event) => ['ne90', 'ne91', 'ne92'].includes(event.id))).toBe(false);
    expect(restored.neighborhood.parkGuests).toHaveLength(1);
    expect([...restored.neighborhood.bandstands]).toEqual([1]);
  });

  it('pays innovation wages only when relocated staff have reached the new office', () => {
    const t = fixture(), g = t.towers()[0], e = invite(t, 'startup');
    t.neighborhood.respond(t, e.id, { towerId: g.id, level: 7 });
    const moved = assignedStaff(t.allResidents(), g.id, 7)[0];
    moved.state = { kind: 'idle', floor: 6, activity: { kind: 'work', floor: 6 }, until: t.time + 60 };
    let before = t.economy.coins; t.economy.accrue(10, [g]); const rentOnly = t.economy.coins - before;
    moved.state.floor = 7; moved.state.activity.floor = 7;
    before = t.economy.coins; t.economy.accrue(10, [g]); const withInnovation = t.economy.coins - before - rentOnly;
    g.tower.floors[7].variant = undefined;
    before = t.economy.coins; t.economy.accrue(10, [g]); const regularWages = t.economy.coins - before - rentOnly;
    expect(withInnovation).toBeGreaterThan(0); expect(withInnovation).toBeCloseTo(regularWages * 1.2);
  });
});
