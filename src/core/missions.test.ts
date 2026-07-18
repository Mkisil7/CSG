import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { MISSION_DEFS } from './missions';

function addResidents(town: Town, count: number): void {
  const game = town.slots[0].game!;
  game.tower.addFloor('residential');
  game.tower.addFloor('residential');
  game.tower.addFloor('residential');
  for (let i = 0; i < count; i++) {
    game.residents.push(createResident(1, 't0'));
  }
}

describe('missions', () => {
  it('completes an instant mission once and pays its reward exactly once', () => {
    const town = new Town();
    addResidents(town, 10);
    const before = town.economy.coins;

    const first = town.missions.checkInstant(town);
    expect(first.some((e) => e.message.includes('First Neighbors'))).toBe(true);
    const afterFirst = town.economy.coins;
    expect(afterFirst).toBeGreaterThan(before); // reward(s) paid

    const second = town.missions.checkInstant(town);
    expect(second).toHaveLength(0);
    expect(town.economy.coins).toBe(afterFirst); // no double payout
  });

  it('streak missions require consecutive passing days', () => {
    const town = new Town();
    addResidents(town, 4);
    for (const r of town.allResidents()) r.happiness = 90;

    // Two passing days: not yet complete.
    town.missions.checkDaily(town);
    town.missions.checkDaily(town);
    expect(town.missions.completed.has('happy-town')).toBe(false);

    // A bad day breaks the streak.
    for (const r of town.allResidents()) r.happiness = 10;
    town.missions.checkDaily(town);
    for (const r of town.allResidents()) r.happiness = 90;
    town.missions.checkDaily(town);
    town.missions.checkDaily(town);
    expect(town.missions.completed.has('happy-town')).toBe(false);

    // Third consecutive passing day completes it.
    const events = town.missions.checkDaily(town);
    expect(town.missions.completed.has('happy-town')).toBe(true);
    expect(events.some((e) => e.kind === 'mission')).toBe(true);
  });

  it('daily income mission uses the current day total', () => {
    const town = new Town();
    town.economy.earn(600);
    town.missions.checkDaily(town);
    expect(town.missions.completed.has('big-day')).toBe(true);
  });

  it('ships well over a hundred missions with unique ids', () => {
    expect(MISSION_DEFS.length).toBeGreaterThan(100);
    const ids = new Set(MISSION_DEFS.map((m) => m.id));
    expect(ids.size).toBe(MISSION_DEFS.length); // no duplicate ids
  });
});
