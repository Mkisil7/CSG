import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from './town';
import { visibleGoals } from './goals';
import { GAME_MINUTES_PER_SECOND } from './types';

afterEach(() => { vi.restoreAllMocks(); });

describe('fresh-town guided pacing', () => {
  it.each([7, 71, 701].flatMap(seed => [
    { seed, compareOptions: false }, { seed, compareOptions: true },
  ]))('guides seed $seed (compareOptions=$compareOptions) through fifteen minutes at 1×', ({ seed: initialSeed, compareOptions }) => {
    let seed = initialSeed;
    vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
    const town = new Town(), game = town.towers()[0];
    const snapshots: { minute: number; population: number; employed: number; coins: number; goal: string; missions: number }[] = [];
    const decisions: { seconds: number; goal: string }[] = [];
    const pauses: { seconds: number; goal: string; coins: number; title: string; affordable: string[] }[] = [];
    let emptyQueueLiftPrompts = 0;
    const offeredSessionGoals = new Set<string>(), recorded = new Set<string>();
    const sessionMilestones: { seconds: number; id: string }[] = [];
    let firstNeighborsAt: number | undefined;
    let firstMealAt: number | undefined;
    let firstSecondShaftAt: number | undefined;
    for (let elapsed = 0; elapsed <= 15 * 60 * GAME_MINUTES_PER_SECOND; elapsed += 0.5) {
      if (elapsed % (30 * GAME_MINUTES_PER_SECOND) === 0) {
        offeredSessionGoals.add(visibleGoals(town).find((goal) => goal.horizon === 'This session')!.id);
        const shown = visibleGoals(town), goal = shown[0]; let changed = false;
        if (goal.id.startsWith('lift-') && game.shafts().every(s => s.waitingCount === 0)) emptyQueueLiftPrompts++;
        // One decision every 30 seconds, from actual displayed action cards.
        // Try the urgent action first, then its explicitly offered alternative.
        for (const choice of shown.filter(g => g.horizon === 'Right now' || (compareOptions && g.horizon === 'Another option'))) {
          if (choice.target.kind === 'build') changed = game.buildFloor(choice.target.floorType);
          else if (choice.id.startsWith('renovate-') && choice.target.kind === 'floor') changed = game.renovate(choice.target.level);
          else if (choice.id.startsWith('lift-')) changed = game.canUnlockSecondShaft().ok ? game.unlockSecondShaft() : game.upgradeSpeed();
          if (changed) { decisions.push({ seconds: elapsed / GAME_MINUTES_PER_SECOND, goal: choice.id }); break; }
        }
        if (!changed) pauses.push({ seconds: elapsed / GAME_MINUTES_PER_SECOND, goal: goal.id, coins: Math.round(town.economy.coins), title: goal.title,
          affordable: [
            ...(['residential', 'shop', 'restaurant', 'office'] as const).filter(type => game.canBuild(type).ok),
            ...game.tower.floors.filter(f => game.canRenovate(f.level).ok && f.quality < 55).map(f => `renovate-${f.level}`),
          ] });
      }
      town.tick(0.5);
      for (const id of town.missions.completed) if (offeredSessionGoals.has(id) && !recorded.has(id)) {
        recorded.add(id); sessionMilestones.push({ seconds: elapsed / GAME_MINUTES_PER_SECOND, id });
      }
      if (firstMealAt === undefined && game.tower.floors.some((f) => f.type === 'restaurant' && f.visitsToday > 0 && f.revenueToday > 0)) firstMealAt = elapsed / GAME_MINUTES_PER_SECOND;
      if (firstNeighborsAt === undefined && town.missions.completed.has('first-neighbors')) firstNeighborsAt = elapsed / GAME_MINUTES_PER_SECOND;
      if (firstSecondShaftAt === undefined && game.secondElevator) firstSecondShaftAt = elapsed / GAME_MINUTES_PER_SECOND;
      if (elapsed % (60 * GAME_MINUTES_PER_SECOND) === 0) snapshots.push({ minute: elapsed / GAME_MINUTES_PER_SECOND / 60,
        population: town.population, employed: town.allResidents().filter((r) => r.jobFloor !== null).length,
        coins: Math.round(town.economy.coins), goal: visibleGoals(town)[0].id, missions: town.missions.completedCount });
    }
    const gaps = decisions.map((decision, index) => ({ seconds: decision.seconds - (decisions[index - 1]?.seconds ?? 0), after: decisions[index - 1]?.goal ?? 'start', next: decision.goal }));
    gaps.push({ seconds: 900 - decisions[decisions.length - 1].seconds, after: decisions[decisions.length - 1].goal, next: 'end' });
    console.log(JSON.stringify({ seed: initialSeed, compareOptions, firstNeighborsAt, firstMealAt, firstSecondShaftAt, decisions: decisions.length,
      emptyQueueLiftPrompts,
      longestGap: gaps.sort((a, b) => b.seconds - a.seconds)[0], timeline: decisions, pauses, sessionMilestones,
      snapshots: snapshots.filter((s) => s.minute <= 5 || [10, 15].includes(s.minute)) }));
    expect(decisions.find((d) => d.goal === 'build-t0-shop')!.seconds).toBeLessThanOrEqual(60);
    expect(decisions.find((d) => d.goal === 'build-t0-restaurant')!.seconds).toBeLessThanOrEqual(120);
    // The first ten neighbors are introductory, not an artificial five-minute
    // minimum. A displayed, subsequently earned goal must still anchor 5–15 min.
    expect(firstNeighborsAt).toBeGreaterThanOrEqual(2 * 60);
    expect(firstNeighborsAt).toBeLessThanOrEqual(15 * 60);
    expect(sessionMilestones.some((mission) => mission.seconds >= 5 * 60 && mission.seconds <= 15 * 60)).toBe(true);
    const early = decisions.filter((decision) => decision.seconds <= 300);
    expect(Math.max(...early.slice(1).map((decision, index) => decision.seconds - early[index].seconds))).toBeLessThanOrEqual(90);
    expect(snapshots[15].employed).toBeGreaterThanOrEqual(snapshots[15].population / 2);
    expect(firstMealAt).toBeLessThan(5 * 60);
    expect(decisions.length).toBeGreaterThanOrEqual(10);
    expect(snapshots.every((s) => s.coins >= 0)).toBe(true);
    expect(emptyQueueLiftPrompts).toBe(0);
    // Includes the final idle interval. These seeded bounds are not a claim
    // about every player or a requirement to spend rather than save for a lift.
    if (compareOptions) expect(Math.max(...gaps.map(gap => gap.seconds))).toBeLessThanOrEqual(120);
  });
});
