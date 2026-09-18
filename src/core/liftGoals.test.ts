import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { visibleGoals } from './goals';
import { toSaveData, townFromSaveData } from './save';
import { liftPressure } from './transit';
import { ELEVATOR_TIERS } from './types';
import { createPreviewTown } from '../dev/landmarkPreview';
import { createResident } from './residents';

function fixture(historical = true) {
  const town = new Town(), game = town.towers()[0]; town.time = 1200;
  town.economy.coins = 2000;
  // Completed shaft averages can outlive the journeys they measure.
  if (historical) {
    for (let i = 0; i < 3; i++) game.elevator.request(`old-${i}`, 0, 1, 1000);
    game.elevator.cars[0].state = 'loading'; game.elevator.cars[0].doorTimer = 0;
    game.elevator.tick(0, 1040); game.elevator.clear();
    expect(game.averageWait()).toBe(40);
  }
  return { town, game };
}

describe('live lift goals rather than stale upgrade pressure', () => {
  it('offers a priced renovation tradeoff without hiding unaffordable congestion or changing the town', () => {
    const { town, game } = fixture(false); game.restoreLifts(2, false); town.economy.coins = 500;
    game.tower.addFloor('residential'); const floor = game.tower.addFloor('restaurant'); floor.quality = 40;
    const resident = createResident(1, game.id); resident.jobFloor = floor.level; resident.jobTowerId = game.id; game.residents.push(resident);
    game.elevator.request('waiting', 1, 0, town.time - 26);
    const before = toSaveData(town), goals = visibleGoals(town);
    expect(goals[0].id).toBe(`lift-${game.id}`); expect(goals[0].detail).toContain('Save');
    const choice = goals.find(g => g.horizon === 'Another option')!;
    expect(choice).toMatchObject({ id: `renovate-${game.id}-${floor.level}`, target: { kind: 'floor', towerId: game.id, level: floor.level } });
    expect(choice.detail).toContain(`${game.renovateCost(floor.level)} coins`); expect(choice.detail).toContain('does not shorten its queues');
    expect(choice.reward).toBeUndefined(); expect(goals.length).toBeLessThanOrEqual(5);
    expect({ ...toSaveData(town), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
    expect(game.renovate(floor.level)).toBe(true);
    expect(visibleGoals(town).some(g => g.horizon === 'Another option')).toBe(false);
    expect(visibleGoals(town)[0].id).toBe(`lift-${game.id}`);
  });

  it('withholds alternatives when unstaffed, unaffordable, already healthy, or the lift can be bought now', () => {
    const { town, game } = fixture(false); game.restoreLifts(2, false);
    const floor = game.tower.addFloor('shop'); floor.quality = 40; town.economy.coins = 500;
    game.elevator.request('waiting', 1, 0, town.time - 26);
    const alternative = () => visibleGoals(town).find(g => g.horizon === 'Another option');
    expect(alternative()).toBeUndefined();
    const resident = createResident(1, game.id); resident.jobTowerId = game.id; resident.jobFloor = floor.level; game.residents.push(resident);
    expect(alternative()).toBeDefined();
    town.economy.coins = 0; expect(alternative()).toBeUndefined();
    town.economy.coins = 500; floor.quality = 55; expect(alternative()).toBeUndefined();
    floor.quality = 40; town.economy.coins = 20000; expect(alternative()).toBeUndefined();
    town.economy.coins = 500; game.restoreLifts(ELEVATOR_TIERS.length - 1, true); expect(alternative()).toBeUndefined();
  });

  it('keeps the invitation and all three horizons when an alternative uses the final card slot', () => {
    const town = createPreviewTown(), game = town.towers()[0];
    const floor = game.tower.addFloor('shop'); floor.quality = 40;
    const resident = town.allResidents()[0]; resident.jobTowerId = game.id; resident.jobFloor = floor.level;
    game.restoreLifts(2, false); town.economy.coins = 500;
    game.elevator.request('waiting', 1, 0, town.time - 26); town.tick(0);
    const goals = visibleGoals(town);
    expect(goals).toHaveLength(5);
    expect(goals.slice(0, 3).map(g => g.horizon)).toEqual(['Right now', 'This session', 'Your growing town']);
    expect(goals.some(g => g.horizon === 'Another option')).toBe(true);
    expect(goals.some(g => g.target.kind === 'neighborhood')).toBe(true);
  });
  it('does not demand another upgrade when historical waits are high but nobody is queued', () => {
    const { town, game } = fixture();
    for (let i = 0; i < 3; i++) game.transit.record(town.time - 2, 40, false, false);
    expect(visibleGoals(town)[0].id).not.toBe(`lift-${game.id}`);
  });

  it('does not interpret a new quick queue as the old day’s congestion', () => {
    const { town, game } = fixture();
    for (let i = 0; i < 3; i++) game.transit.record(town.time - 100, 40, false, false);
    game.elevator.request('waiting', 1, 0, town.time - 2);
    expect(visibleGoals(town)[0].id).not.toBe(`lift-${game.id}`);
  });

  it('surfaces a genuinely long live queue even before any trip has completed', () => {
    const { town, game } = fixture(false);
    game.elevator.request('waiting', 1, 0, town.time - 26);
    const goal = visibleGoals(town)[0];
    expect(goal.id).toBe(`lift-${game.id}`); expect(goal.detail).toContain('26 min');
    expect(goal.detail).toContain('1 waiting');
    expect(goal.detail).toContain('300 coins');
  });

  it('uses recent completed trips, including stair abandonments, when a queue is still active', () => {
    const { town, game } = fixture(false);
    for (let i = 0; i < 3; i++) game.transit.record(town.time - 5, 30, i === 0, i === 0);
    game.elevator.request('waiting', 1, 0, town.time - 2);
    const goal = visibleGoals(town)[0];
    expect(goal.id).toBe(`lift-${game.id}`); expect(goal.detail).toContain('recent trips averaged 30 min');
  });

  it('does not immediately sell another upgrade using pre-purchase trips, but still warns about a long current queue', () => {
    const { town, game } = fixture();
    for (let i = 0; i < 5; i++) game.transit.record(town.time - 5, 40, false, false);
    game.upgradeSpeed(); game.elevator.request('waiting', 1, 0, town.time - 2);
    const goals = visibleGoals(town), report = goals.find(g => g.id.startsWith('lift-result-'))!;
    expect(goals[0].id).not.toBe(`lift-${game.id}`);
    expect(report).toMatchObject({ current: 0, total: 20, target: { kind: 'transit', towerId: game.id } });
    expect(report.detail).toContain('10 trips');
    town.time += 25;
    expect(visibleGoals(town)[0].id).toBe(`lift-${game.id}`);
  });

  it('shows measured relief, not a promised result, then retires the card after further trips', () => {
    const { town, game } = fixture();
    for (let i = 0; i < 5; i++) game.transit.record(town.time, 40, false, false);
    game.upgradeSpeed();
    for (let i = 0; i < 10; i++) game.transit.record(town.time, 12, false, false);
    let report = visibleGoals(town).find(g => g.id.startsWith('lift-result-'))!;
    expect(report.title).toContain('40 → 12 min'); expect(report.detail).toContain('Early estimate');
    for (let i = 0; i < 10; i++) game.transit.record(town.time, 12, false, false);
    report = visibleGoals(town).find(g => g.id.startsWith('lift-result-'))!;
    expect(report.detail).toContain('20 trips'); expect(report.detail).not.toContain('Early estimate');
    for (let i = 0; i < 21; i++) game.transit.record(town.time, 12, false, false);
    expect(visibleGoals(town).some(g => g.id.startsWith('lift-result-'))).toBe(false);
  });

  it('reports unchanged or worse outcomes honestly without turning an empty queue into an urgent task', () => {
    const { town, game } = fixture();
    for (let i = 0; i < 5; i++) game.transit.record(town.time, 20, false, false);
    game.upgradeSpeed();
    for (let i = 0; i < 20; i++) game.transit.record(town.time, 30, true, true);
    const goals = visibleGoals(town), report = goals.find(g => g.id.startsWith('lift-result-'))!;
    expect(goals[0].id).not.toBe(`lift-${game.id}`);
    expect(report.title).toContain('20 → 30 min'); expect(report.detail).toContain('not improved');
    expect(report.reward).toBeUndefined();
  });

  it('keeps goals read-only and tells the exact saving gap when live relief is unaffordable', () => {
    const { town, game } = fixture(); town.economy.coins = 123;
    game.elevator.request('waiting', 1, 0, town.time - 26);
    const before = toSaveData(town), goal = visibleGoals(town)[0];
    expect(goal.detail).toContain('177 more coins');
    expect({ ...toSaveData(town), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
  });

  it('requires three recent samples, rejects future or expired trips, and always keeps current long waits', () => {
    const { town, game } = fixture(false);
    game.elevator.request('waiting', 1, 0, town.time - 2);
    for (let i = 0; i < 3; i++) game.transit.record(town.time - 61, 50, false, false);
    game.transit.record(town.time, 30, false, false); game.transit.record(town.time, 30, false, false);
    game.transit.record(town.time + 1, 50, false, false);
    expect(liftPressure(game, town.time).urgent).toBe(false);
    game.transit.record(town.time, 30, false, false);
    expect(liftPressure(game, town.time)).toMatchObject({ urgent: true, recentWait: 30 });
    town.time += 62;
    expect(liftPressure(game, town.time)).toMatchObject({ urgent: true, recentWait: null });
  });

  it('does not offer a nonexistent speed tier when both shafts are fully upgraded', () => {
    const { town, game } = fixture(); game.restoreLifts(ELEVATOR_TIERS.length - 1, true);
    game.elevator.request('waiting', 1, 0, town.time - 26);
    expect(visibleGoals(town)[0].detail).toContain('Both shafts are at top speed');
    expect(visibleGoals(town)[0].detail).not.toContain('coins');
  });

  it('does not manufacture a comparison when no pre-upgrade baseline exists', () => {
    const { town, game } = fixture(false); game.upgradeSpeed();
    for (let i = 0; i < 20; i++) game.transit.record(town.time, 8, false, false);
    const report = visibleGoals(town).find(g => g.id.startsWith('lift-result-'))!;
    expect(report.title).toBe('Lift waits after your upgrade: 8 min');
    expect(report.detail).toContain('No reliable pre-upgrade baseline');
    expect(report.detail).not.toContain('improved');
    const loaded = townFromSaveData(toSaveData(town))!;
    expect(visibleGoals(loaded).find(g => g.id === report.id)).toEqual(report);
  });

  it('preserves invitations, landmarks and the three main horizons without exceeding five cards', () => {
    const town = createPreviewTown(), game = town.towers()[0];
    game.upgradeSpeed();
    // Let the normal event evaluator offer the eligible park concert.
    town.tick(0);
    expect(town.neighborhood.pending().length).toBeGreaterThan(0);
    const goals = visibleGoals(town);
    expect(goals).toHaveLength(5);
    expect(goals.slice(0, 3).map(g => g.horizon)).toEqual(['Right now', 'This session', 'Your growing town']);
    expect(goals.some(g => g.target.kind === 'neighborhood')).toBe(true);
    expect(goals.some(g => g.target.kind === 'landmarks')).toBe(true);
    expect(goals.some(g => g.id.startsWith('lift-result-'))).toBe(false);
  });
});
