import { describe, expect, it } from 'vitest';
import { FrameClock } from './frameClock';
import { Town } from './town';
import { createResident } from './residents';
import { GAME_MINUTES_PER_SECOND } from './types';

describe('live frame clock', () => {
  it('starts at the first callback without charging startup time to the town', () => {
    const clock = new FrameClock();
    expect(clock.step(8500)).toBe(0);
    expect(clock.step(8516)).toBeCloseTo(0.016);
    expect(clock.step(8533)).toBeCloseTo(0.017);
  });

  it('ignores earlier or duplicate callbacks without double-counting the next frame', () => {
    const clock = new FrameClock(); clock.step(1000);
    expect(clock.step(990)).toBe(0);
    expect(clock.step(1000)).toBe(0);
    expect(clock.step(1016)).toBeCloseTo(0.016);
  });

  it.each([NaN, Infinity, -Infinity, -1])('ignores an invalid timestamp %s without poisoning the clock', now => {
    const clock = new FrameClock();
    expect(clock.step(now)).toBe(0);
    expect(clock.step(1000)).toBe(0);
    expect(clock.step(now)).toBe(0);
    expect(clock.step(1016)).toBeCloseTo(0.016);
  });

  it('caps a long gap once, then resumes with the ordinary frame interval', () => {
    const clock = new FrameClock(); clock.step(0);
    expect(clock.step(600000)).toBe(0.1);
    expect(clock.step(600016)).toBeCloseTo(0.016);
  });

  it('never reverses the town day or withdraws accrued rent on stale startup frames', () => {
    const town = new Town(), game = town.towers()[0];
    game.tower.addFloor('residential');
    game.residents.push(createResident(1, game.id, () => 0.2));
    town.time = 1440; town.tick(0);
    const before = { time: town.time, day: town.day, coins: town.economy.coins, income: town.economy.incomeToday };
    const clock = new FrameClock();
    for (const now of [1000, 998, NaN, 1000]) town.tick(clock.step(now) * GAME_MINUTES_PER_SECOND);
    expect({ time: town.time, day: town.day, coins: town.economy.coins, income: town.economy.incomeToday }).toEqual(before);
    town.tick(clock.step(1016) * GAME_MINUTES_PER_SECOND);
    expect(town.time).toBeGreaterThan(before.time);
    expect(town.economy.coins).toBeGreaterThan(before.coins);
  });
});
