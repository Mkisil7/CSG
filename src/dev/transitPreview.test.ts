import { describe, expect, it } from 'vitest';
import { createPreviewTown, studyTightBudget } from './transitPreview';
import { visibleGoals } from '../core/goals';

describe('disposable tight-budget transit study', () => {
  it('uses actual queued riders and exposes a real affordable alternative', () => {
    const town = createPreviewTown(); studyTightBudget(town);
    const game = town.towers()[0], goals = visibleGoals(town);
    expect(goals[0].id).toBe(`lift-${game.id}`);
    expect(goals[0].detail).toContain('50 more coins');
    const alternative = goals.find(g => g.horizon === 'Another option')!;
    expect(alternative.target).toEqual({ kind: 'floor', towerId: game.id, level: 13 });
    expect(game.renovateCost(13)).toBe(240); expect(town.economy.coins).toBe(250);
    const queued = [...game.elevator.queues.values()].flat();
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.every(q => game.residents.some(r => r.id === q.residentId))).toBe(true);
    expect(game.renovate(13)).toBe(true); expect(town.economy.coins).toBe(10);
    expect(visibleGoals(town).some(g => g.horizon === 'Another option')).toBe(false);
  });
});
