import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { createResident } from './residents';
import { findStoryPlace, storyPlace, type StoryPlace, type ResidentStory } from './stories';
import { toSaveData, townFromSaveData } from './save';
import { encodeTown, decodeTown } from './share';
import { storyRow } from '../ui/storyViews';

function fixture() {
  const town = new Town(), first = town.towers()[0], game = new Game('t1', town.economy);
  town.slots[1] = { id: game.id, unlocked: true, zone: 'mixed', game };
  town.slots[2] = { id: 't2', unlocked: true, zone: 'park', game: null };
  first.tower.addFloor('residential'); first.tower.addFloor('restaurant').name = 'Same name';
  game.tower.addFloor('residential'); game.tower.addFloor('restaurant').name = 'Same name';
  const resident = createResident(1, first.id); first.residents.push(resident); town.stories.update(town);
  const target: StoryPlace = { kind: 'floor', towerId: game.id, level: 2 };
  town.stories.record(1, 'place', [resident.id], 'A glowing review', '<A & B>', target);
  const story = town.stories.journal.slice(-1)[0];
  return { town, first, game, resident, target, story };
}

describe('durable place memories', () => {
  it('records a detached exact destination and keeps it through renames, staff moves and missing event history', () => {
    const { town, game, resident, target, story } = fixture();
    target.level = 0; resident.jobTowerId = 't0'; resident.jobFloor = 0;
    game.tower.floors[2].name = 'Renamed'; town.neighborhood.events = [];
    expect(storyPlace(town, story)).toEqual({ kind: 'floor', towerId: 't1', level: 2 });
    const html = storyRow(story, new Set([resident.id]), town);
    expect(html).toContain(`data-story-place="${story.id}"`); expect(html).not.toContain('data-resident=');
    expect(html).toContain('&lt;A &amp; B&gt;');
  });

  it('round-trips places in journal and personal memories through saves and shared towns without changing money', async () => {
    const { town, story, resident } = fixture();
    town.stories.record(1, 'place', [], 'A concert', 'At the park', { kind: 'slot', index: 2 });
    const parkId = town.stories.journal.slice(-1)[0].id;
    for (const restored of [townFromSaveData(toSaveData(town))!, (await decodeTown(await encodeTown(town)))!]) {
      expect(findStoryPlace(restored, story.id)).toEqual({ kind: 'floor', towerId: 't1', level: 2 });
      expect(findStoryPlace(restored, parkId)).toEqual({ kind: 'slot', index: 2 });
      expect(restored.stories.people[resident.id].memories.slice(-1)[0]?.place).toEqual(story.place);
      expect(restored.economy.coins).toBe(town.economy.coins);
    }
  });

  it('still resolves a personal place memory after it leaves the public archive', () => {
    const { town, story, resident } = fixture();
    for (let i = 0; i < 85; i++) town.stories.record(1, 'place', [], 'Another opening', 'Elsewhere');
    expect(town.stories.journal.some(s => s.id === story.id)).toBe(false);
    const restored = townFromSaveData(toSaveData(town))!;
    expect(findStoryPlace(restored, story.id)).toEqual(story.place);
    expect(storyRow(restored.stories.people[resident.id].memories.slice(-1)[0], new Set(), restored)).toContain('data-story-place=');
  });

  it('preserves legacy and personal story behavior without guessing a location from names', () => {
    const { town, resident, story } = fixture(); delete story.place;
    const restored = townFromSaveData(toSaveData(town))!;
    expect(findStoryPlace(restored, story.id)).toBeNull();
    expect(storyRow(story, new Set([resident.id]), town)).toContain('data-resident=');
    expect(storyRow(story, new Set(), town)).not.toContain('<button');
    town.stories.record(1, 'career', [resident.id], 'Promotion', 'A new job', { kind: 'floor', towerId: 't1', level: 2 });
    expect(town.stories.journal.slice(-1)[0].place).toBeUndefined();
  });

  it('rechecks missing floors, missing towers, locked parks and changed park zoning without altering memories', () => {
    const { town, game, story } = fixture(), snapshot = JSON.stringify(story);
    game.tower.floors.pop(); expect(storyPlace(town, story)).toBeNull();
    town.slots[1].game = null; expect(findStoryPlace(town, story.id)).toBeNull();
    const park = { ...story, place: { kind: 'slot' as const, index: 2 } };
    expect(storyPlace(town, park)).toEqual(park.place);
    town.slots[2].unlocked = false; expect(storyPlace(town, park)).toBeNull();
    town.slots[2].unlocked = true; town.slots[2].zone = 'mixed'; expect(storyPlace(town, park)).toBeNull();
    expect(JSON.stringify(story)).toBe(snapshot);
  });

  it('drops malformed destinations from both saved archives without dropping their readable memories', () => {
    const { town, resident, story } = fixture();
    for (const place of [null, 't1', {}, { kind: 'floor', towerId: {}, level: 2 }, { kind: 'floor', towerId: 't1', level: -1 },
      { kind: 'floor', towerId: 't1', level: 1.5 }, { kind: 'slot', index: '2' }, { kind: 'slot', index: Infinity },
      { kind: 'build', towerId: 't1', level: 2 }]) {
      const data = toSaveData(town);
      data.stories!.journal.slice(-1)[0].place = place as StoryPlace;
      data.stories!.people[resident.id].memories.slice(-1)[0].place = place as StoryPlace;
      const restored = townFromSaveData(data)!;
      expect(restored.stories.journal.slice(-1)[0].place).toBeUndefined();
      expect(restored.stories.people[resident.id].memories.slice(-1)[0].place).toBeUndefined();
      expect(restored.stories.journal.slice(-1)[0].title).toBe(story.title);
      expect(findStoryPlace(restored, story.id)).toBeNull();
      expect(storyPlace(town, { ...story, place } as ResidentStory)).toBeNull();
    }
  });
});
