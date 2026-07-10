import { describe, expect, it } from 'vitest';
import { offlineGameMinutes, runOfflineCatchup } from './offline';
import { Town } from './town';
import { GAME_MINUTES_PER_SECOND, OFFLINE } from './types';

describe('offline catch-up', () => {
  it('caps simulated time at the configured maximum', () => {
    const dayAway = 24 * 3600;
    expect(offlineGameMinutes(dayAway)).toBe(
      OFFLINE.maxRealHours * 3600 * GAME_MINUTES_PER_SECOND,
    );
    expect(offlineGameMinutes(600)).toBe(600 * GAME_MINUTES_PER_SECOND);
  });

  it('advances the clock and reports coins earned and move-ins', () => {
    const town = new Town();
    town.slots[0].game!.tower.addFloor('residential');
    const timeBefore = town.time;
    const coinsBefore = town.economy.coins;

    // Two game days away: rent + move-ins should both happen.
    const report = runOfflineCatchup(town, 2 * 24 * 60, 3600);
    expect(town.time).toBeCloseTo(timeBefore + 2 * 24 * 60, 3);
    expect(report.moveIns).toBeGreaterThan(0);
    expect(report.coinsEarned).toBe(Math.round(town.economy.coins - coinsBefore));
    expect(report.awayRealSeconds).toBe(3600);
  });
});
