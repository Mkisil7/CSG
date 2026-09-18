import { describe, expect, it } from 'vitest';
import { advanceCare, createPreviewTown, isPaused } from './carePreview';
import { residentConcern } from '../core/stories';
import { toSaveData, townFromSaveData } from '../core/save';

describe('neighbor-care journey study', () => {
  it('arrives for a real meal before the normal daily review clears the concern', () => {
    const town = createPreviewTown(), game = town.towers()[0], maya = game.residents[0];
    expect(isPaused()).toBe(true);
    expect(residentConcern(town, maya)?.target).toEqual({ kind: 'floor', towerId: game.id, level: 2 });
    expect(maya.state.kind).toBe('waiting'); expect(maya.needs.food).toBe(10);
    advanceCare(town, 30);
    expect(maya.state).toMatchObject({ kind: 'idle', floor: 2, activity: { kind: 'eat', floor: 2 } });
    expect(game.tower.floors[2].visitsToday).toBeGreaterThan(0);
    expect(maya.needs.food).toBe(10); expect(maya.happiness).toBe(30); expect(maya.unhappyDays).toBe(2);
    advanceCare(town, 1440 - town.timeOfDay + 0.25);
    expect(maya.needs.food).toBe(100); expect(maya.happiness).toBeGreaterThanOrEqual(35); expect(maya.unhappyDays).toBe(0);
    expect(town.stories.people[maya.id].memories.some(story => story.kind === 'recovery')).toBe(true);
    const restored = townFromSaveData(toSaveData(town))!;
    expect(restored.stories.people[maya.id].memories).toEqual(town.stories.people[maya.id].memories);
    expect(restored.allResidents().find(r => r.id === maya.id)?.needs.food).toBe(100);
  });
});
