import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { toSaveData, townFromSaveData } from './save';
import { offlineGameMinutes, runOfflineCatchup, runOfflineCatchupAsync } from './offline';

afterEach(() => { vi.restoreAllMocks(); });

function seeded(seed: number): void {
  vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
}

function fixture(): Town {
  const town = new Town(), game = town.towers()[0];
  game.tower.addFloor('residential'); game.tower.addFloor('residential');
  game.tower.addFloor('shop'); game.tower.addFloor('restaurant'); game.tower.addFloor('office');
  for (let i = 0; i < 8; i++) {
    const r = createResident(i < 4 ? 1 : 2, game.id);
    r.state = { kind: 'idle', floor: r.homeFloor, activity: { kind: 'home', floor: r.homeFloor }, until: town.time };
    game.residents.push(r);
  }
  town.tick(0.25);
  return town;
}

describe('offline simulation accuracy', () => {
  it.each([7, 71, 701])('compares identical restored towns at different steps (seed %i)', (seed) => {
    seeded(seed); const saved = toSaveData(fixture());
    const results = [0.1, 0.25, 15].map((step) => {
      seeded(seed); const town = townFromSaveData(saved)!;
      for (let elapsed = 0; elapsed < 1440 - 1e-7; elapsed += step) town.tick(Math.min(step, 1440 - elapsed));
      return { step, coins: Math.round(town.economy.coins), wait: town.towers()[0].averageWait(),
        happiness: town.allResidents().reduce((sum, r) => sum + r.happiness, 0) / town.population,
        visits: town.towers()[0].tower.floors.reduce((sum, f) => sum + f.visitsToday, 0) };
    });
    console.log(JSON.stringify({ seed, results }));
    seeded(seed); const returned = townFromSaveData(saved)!;
    const report = runOfflineCatchup(returned, 1440, 240);
    expect(report.simulatedGameMinutes).toBe(1440);
    const [fine, quarter, legacy] = results;
    expect(returned.towers()[0].averageWait()).toBeCloseTo(quarter.wait, 8);
    expect(Math.round(returned.economy.coins)).toBe(quarter.coins);
    expect(Math.abs(quarter.wait - fine.wait)).toBeLessThan(3);
    expect(Math.abs(quarter.happiness - fine.happiness)).toBeLessThan(2);
    expect(Math.abs(quarter.coins - fine.coins)).toBeLessThan(25);
    expect(legacy.wait).toBeGreaterThan(quarter.wait * 3);
    expect(quarter.happiness - legacy.happiness).toBeGreaterThan(15);
  });

  it('produces identical town state and rewards across synchronous and yielded catch-up', async () => {
    seeded(7); const saved = toSaveData(fixture());
    seeded(17); const syncTown = townFromSaveData(saved)!;
    const syncReport = runOfflineCatchup(syncTown, 1440, 240);
    const expected = toSaveData(syncTown); expected.savedAtWallClock = 0;
    seeded(17); const asyncTown = townFromSaveData(saved)!;
    const progress: number[] = [];
    const yieldControl = vi.fn(async () => {});
    const asyncReport = await runOfflineCatchupAsync(asyncTown, 1440, 240,
      { yieldControl, onProgress: (p) => progress.push(p.completedMinutes) });
    const actual = toSaveData(asyncTown); actual.savedAtWallClock = 0;
    expect(actual).toEqual(expected); expect(asyncReport).toEqual(syncReport);
    expect(yieldControl.mock.calls.length).toBeGreaterThan(2);
    expect(progress[0]).toBe(0); expect(progress[progress.length - 1]).toBe(1440);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
      expect(progress[i] - progress[i - 1]).toBeLessThanOrEqual(64);
    }
  });

  it('allows returning early without crediting unsimulated days or re-awarding completed missions', async () => {
    seeded(71); const town = fixture(), before = town.time, coins = town.economy.coins;
    const controller = new AbortController(); let yields = 0;
    const report = await runOfflineCatchupAsync(town, 1440, 240, { signal: controller.signal,
      yieldControl: async () => { if (++yields === 3) controller.abort(); } });
    expect(report.simulatedGameMinutes).toBeGreaterThan(0);
    expect(report.simulatedGameMinutes).toBeLessThan(1440);
    expect(town.time - before).toBe(report.simulatedGameMinutes);
    expect(report.coinsEarned).toBe(Math.round(town.economy.coins - coins));
    const restored = townFromSaveData(toSaveData(town))!;
    expect(restored.missions.completed).toEqual(town.missions.completed);
    expect(restored.economy.coins).toBe(town.economy.coins);
    expect(restored.time).toBe(town.time);
  });

  it('processes the full ten-hour cap with actual residents and yields throughout', async () => {
    seeded(701); const town = fixture(), before = town.time;
    let reports = 0, last = 0;
    const started = performance.now();
    const report = await runOfflineCatchupAsync(town, offlineGameMinutes(36000), 36000, {
      onProgress: (p) => {
        reports++; expect(p.completedMinutes).toBeGreaterThanOrEqual(last);
        expect(p.completedMinutes - last).toBeLessThanOrEqual(64); last = p.completedMinutes;
      },
    });
    console.log(JSON.stringify({ capMilliseconds: Math.round(performance.now() - started), progressReports: reports,
      population: town.population, coins: Math.round(town.economy.coins), gameMinutes: report.simulatedGameMinutes }));
    expect(report.simulatedGameMinutes).toBe(offlineGameMinutes(36000));
    expect(town.time - before).toBe(report.simulatedGameMinutes);
    expect(reports).toBeGreaterThan(100);
    expect(Number.isFinite(town.economy.coins)).toBe(true);
    expect(town.population).toBeGreaterThan(0);
    const friendships = town.stories.journal.filter((story) => story.kind === 'friendship');
    const pairs = friendships.map((story) => [...story.residentIds].sort().join(':'));
    expect(new Set(pairs).size).toBe(pairs.length);
  }, 60000);
});
