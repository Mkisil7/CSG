import { describe, expect, it, vi } from 'vitest';
import { offlineGameMinutes, runOfflineCatchup } from './offline';
import { Town } from './town';
import { GAME_MINUTES_PER_SECOND, OFFLINE } from './types';
import { toSaveData, townFromSaveData } from './save';

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

  it('returns only new, bounded, detached memories with the actual town name', () => {
    const town = new Town(); town.identity.name = 'Willow & Lantern';
    const game = town.towers()[0];
    game.tower.addFloor('residential'); game.tower.addFloor('residential');
    game.tower.addFloor('shop'); game.tower.addFloor('restaurant');
    town.stories.record(1, 'place', [], 'Old memory', 'Before leaving');
    const report = runOfflineCatchup(town, 1440, 240);
    expect(report.highlights.length).toBeGreaterThan(0);
    expect(report.highlights.length).toBeLessThanOrEqual(3);
    expect(report.townName).toBe('Willow & Lantern');
    for (const story of report.highlights) {
      expect(story.id).toBeGreaterThan(1);
      const original = town.stories.journal.find((entry) => entry.id === story.id)!;
      expect(story).toEqual(original); expect(story).not.toBe(original);
      expect(story.residentIds).not.toBe(original.residentIds);
    }
    const snapshot = JSON.stringify(report);
    runOfflineCatchup(town, 1440, 240);
    expect(JSON.stringify(report)).toBe(snapshot);
  });

  it.each([-10, NaN, Infinity])('ignores invalid away duration %s without advancing or inventing memories', (invalid) => {
    const town = new Town(), time = town.time;
    expect(offlineGameMinutes(invalid)).toBe(0);
    const report = runOfflineCatchup(town, invalid, invalid);
    expect(report.simulatedGameMinutes).toBe(0); expect(report.awayRealSeconds).toBe(0);
    expect(report.highlights).toEqual([]); expect(report.coinsEarned).toBe(0);
    expect(town.time).toBe(time);
  });

  it('caps direct callers too, without an unbounded catch-up loop', () => {
    const town = new Town(), tick = vi.spyOn(town, 'tick').mockImplementation(() => {});
    const report = runOfflineCatchup(town, 1e12, 1e12);
    expect(report.simulatedGameMinutes).toBe(offlineGameMinutes(OFFLINE.maxRealHours * 3600));
    expect(tick.mock.calls.reduce((sum, [dt]) => sum + dt, 0)).toBe(report.simulatedGameMinutes);
  });

  it('keeps catch-up rewards, memories and processed time through a detached save restore', () => {
    const town = new Town(); town.towers()[0].tower.addFloor('residential');
    const report = runOfflineCatchup(town, 1440, 240);
    const saved = toSaveData(town), restored = townFromSaveData(saved)!;
    expect(restored.time).toBe(town.time);
    expect(restored.economy.coins).toBe(town.economy.coins);
    expect(restored.missions.completed).toEqual(town.missions.completed);
    for (const story of report.highlights) expect(restored.stories.journal).toContainEqual(story);
    const noTime = runOfflineCatchup(restored, 0, 0);
    expect(noTime.coinsEarned).toBe(0); expect(noTime.highlights).toEqual([]);
  });
});
