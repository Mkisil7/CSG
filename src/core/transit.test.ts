import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { Economy } from './economy';
import { createResident } from './residents';
import { TransitLedger, transitSnapshot } from './transit';
import { Town } from './town';
import { toSaveData, townFromSaveData } from './save';

describe('congestion consequences', () => {
  it('cancels a shopping visit without crediting income and sends the customer home by stairs', () => {
    const game = new Game('t0', new Economy());
    game.tower.addFloor('residential'); game.tower.addFloor('shop');
    const r = createResident(1, game.id);
    r.state = { kind: 'waiting', floor: 0, to: 2 };
    r.didShop = true;
    r.pendingActivity = { activity: { kind: 'shop', floor: 2 }, duration: 30,
      beforeFlags: { day: 0, didLunch: true, didDinner: false, didShop: false, didNightlife: false } };
    game.residents.push(r); game.elevator.request(r.id, 0, 2, 0);
    const now = game.elevator.maxPatience + 1;
    const coins = game.economy.coins;
    game.tick(0.1, now);
    expect(r.state).toMatchObject({ kind: 'stairs', from: 0, to: 1 });
    expect(r.didShop).toBe(false);
    expect(r.didLunch).toBe(true); // a previous completed meal is preserved
    expect(game.economy.coins).toBe(coins);
    expect(game.tower.floors[2].visitsToday).toBe(0);
    expect(game.tower.floors[2].missedVisitsToday).toBe(1);
    expect(transitSnapshot(game, now)).toMatchObject({ stairsToday: 1, missedToday: 1, waiting: 0 });
    game.tick(4, now + 4);
    expect(r.state).toMatchObject({ kind: 'idle', activity: { kind: 'home', floor: 1 } });
  });

  it('still gets an essential worker to their destination with a finite stair journey', () => {
    const game = new Game('t0', new Economy());
    game.tower.addFloor('residential'); game.tower.addFloor('office');
    const r = createResident(1, game.id);
    r.state = { kind: 'waiting', floor: 1, to: 2 };
    r.pendingActivity = { activity: { kind: 'work', floor: 2 }, duration: 60 };
    game.residents.push(r); game.elevator.request(r.id, 1, 2, 0);
    game.tick(0.1, 100);
    expect(r.state.kind).toBe('stairs');
    game.tick(4, 104);
    expect(r.state).toMatchObject({ kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 } });
    expect(game.transit.today(104).missed).toBe(0);
  });

  it('holds the before/after report until ten trips and never dilutes waits with an empty shaft', () => {
    const ledger = new TransitLedger();
    for (let i = 0; i < 20; i++) ledger.record(i, 30, false, false);
    ledger.beginImprovement('Second shaft');
    for (let i = 0; i < 9; i++) ledger.record(21 + i, 8, false, false);
    expect(ledger.improvement).toMatchObject({ beforeWait: 30, afterWait: null, observedTrips: 9 });
    ledger.record(30, 8, false, false);
    expect(ledger.improvement).toMatchObject({ beforeWait: 30, afterWait: 8, observedTrips: 10 });
  });

  it('keeps true daily totals even when the bounded sample buffer fills', () => {
    const ledger = new TransitLedger();
    for (let i = 0; i < 800; i++) ledger.record(i, 60, true, true);
    expect(ledger.trips).toHaveLength(500);
    expect(ledger.today(800)).toMatchObject({ stairs: 800, missed: 800 });
    expect(ledger.today(1440)).toMatchObject({ stairs: 0, missed: 0 });
  });
  it('keeps the first ten trips provisional and includes the slower tail of the rush', () => {
    const ledger = new TransitLedger();
    for (let i = 0; i < 20; i++) ledger.record(i, 40, false, false);
    ledger.beginImprovement('Second shaft');
    for (let i = 0; i < 10; i++) ledger.record(20 + i, 2, false, false);
    expect(ledger.improvement).toMatchObject({ afterWait: 2, observedTrips: 10 });
    const restored = new TransitLedger(); restored.restore(ledger.snapshot());
    for (let i = 0; i < 10; i++) restored.record(30 + i, 75, true, true);
    expect(restored.improvement).toMatchObject({ afterWait: 38.5, observedTrips: 20 });
    restored.record(40, 0, false, false);
    expect(restored.improvement).toMatchObject({ afterWait: 38.5, observedTrips: 20 });
  });

  it('restores transit bonuses, safely lands stair riders, and retains an in-progress upgrade report', () => {
    const town = new Town();
    const game = new Game('t0', town.economy, 'transit');
    town.slots[0].game = game; town.slots[0].zone = 'transit';
    game.tower.addFloor('residential');
    game.restoreLifts(1, true);
    const r = createResident(1, game.id);
    r.state = { kind: 'stairs', from: 1, to: 0, startedAt: 480, until: 490 };
    game.residents.push(r);
    for (let i = 0; i < 20; i++) game.transit.record(470 + i, 30, true, false);
    game.transit.beginImprovement('Lift upgrade');
    game.transit.record(491, 8, false, false);
    const loaded = townFromSaveData(JSON.parse(JSON.stringify(toSaveData(town))))!;
    const restored = loaded.towers()[0];
    expect(restored.elevator.capacity).toBe(game.elevator.capacity);
    expect(restored.elevator.doorTime).toBe(game.elevator.doorTime);
    expect(restored.secondElevator?.capacity).toBe(game.secondElevator?.capacity);
    expect(restored.transit.improvement).toMatchObject({ beforeWait: 30, observedTrips: 1, afterWait: null });
    expect(restored.residents[0].state).toMatchObject({ kind: 'idle', floor: 1 });
  });
});
