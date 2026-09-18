import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { roomPoses } from './roomLife';
import { processPromotions } from './careers';
import { toSaveData, townFromSaveData } from './save';
import type { RestaurantSubtype } from './types';
import { createPreviewTown, preparePromotionStudy } from '../dev/roomPreview';

const styles: RestaurantSubtype[] = ['coffee', 'fastfood', 'fine-dining', 'bar'];
function fixture(subtype: RestaurantSubtype = 'fine-dining') {
  const town = new Town(), game = town.towers()[0]; town.time = 2 * 1440 + 610; town.economy.coins = 1000;
  game.tower.addFloor('residential'); const floor = game.tower.addFloor('restaurant', subtype);
  const workers = ['Maya', 'Fern'].map((name, index) => {
    const resident = createResident(1, game.id); resident.id = `r900${index + 1}`; resident.name = name;
    resident.jobTowerId = game.id; resident.jobFloor = floor.level; resident.jobTier = 0;
    resident.jobStartDay = town.day - index * 2;
    resident.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, until: town.time + 180 };
    game.residents.push(resident); return resident;
  });
  town.stories.update(town);
  const poses = () => roomPoses(game.tower.floors, game.residents, game.id, town.time);
  return { town, game, floor, workers, poses };
}

describe('visible restaurant careers', () => {
  it.each(styles)('gives only the actual promoted worker the senior uniform in %s', (subtype) => {
    const { town, game, floor, workers: [maya, fern], poses } = fixture(subtype);
    const before = poses(); expect([...before.values()].every((pose) => pose.chef === false)).toBe(true);
    expect(town.promoteAt(game.id, floor.level)).toBe(true);
    const state = JSON.stringify(game.residents), result = poses();
    expect(result.get(fern.id)?.chef).toBe(true); expect(result.get(maya.id)?.chef).toBe(false);
    if (subtype === 'coffee' || subtype === 'bar') {
      expect(result.get(maya.id)?.action).toBe('barista');
      expect(result.get(fern.id)).toMatchObject({ action: 'server', x: 4.9, chef: true });
    } else {
      expect(before.get(maya.id)?.action).toBe('cook');
      expect(result.get(fern.id)).toMatchObject({ action: 'chef', x: 4.9 });
      expect(result.get(maya.id)).toMatchObject({ action: 'server', x: 5.6 });
    }
    expect(JSON.stringify(game.residents)).toBe(state);
    game.residents.reverse(); expect(poses()).toEqual(result);
  });

  it('records a paid promotion before any clock tick or save and never repeats it on sampling/reload', () => {
    const { town, game, floor, workers: [, fern] } = fixture(), time = town.time;
    const coins = town.economy.coins, cost = town.promoteCostAt(game.id, floor.level)!;
    expect(town.promoteAt(game.id, floor.level)).toBe(true);
    expect(town.time).toBe(time); expect(town.economy.coins).toBe(coins - cost);
    const memories = () => town.stories.people[fern.id].memories.filter((story) => story.title === 'Fern earned a promotion');
    expect(memories()).toHaveLength(1); expect(memories()[0].text).toContain(`Chef at ${floor.name}`);
    const restored = townFromSaveData(toSaveData(town))!;
    expect(restored.allResidents().find((r) => r.id === fern.id)?.jobTier).toBe(1);
    expect(restored.stories.people[fern.id].memories).toEqual(town.stories.people[fern.id].memories);
    town.time += 1; town.stories.update(town); expect(memories()).toHaveLength(1);
    restored.time += 1; restored.stories.update(restored);
    expect(restored.stories.people[fern.id].memories.filter((story) => story.title === 'Fern earned a promotion')).toHaveLength(1);
    const count = town.stories.journal.length;
    expect(town.promoteAt(game.id, floor.level)).toBe(false); expect(town.stories.journal).toHaveLength(count);
  });

  it('does not grant a senior uniform for an absent Chef, stale workplace or mismatched activity', () => {
    const { town, game, floor, workers: [maya, fern], poses } = fixture();
    town.promoteAt(game.id, floor.level);
    fern.state = { kind: 'waiting', floor: 0, to: floor.level };
    expect(poses().get(maya.id)).toMatchObject({ action: 'cook', chef: false }); expect(poses().has(fern.id)).toBe(false);
    fern.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, until: town.time + 180 };
    fern.jobTowerId = 't1'; expect(poses().has(fern.id)).toBe(false);
    fern.jobTowerId = game.id; fern.state.activity.floor = 0; expect(poses().has(fern.id)).toBe(false);
  });

  it('lets a Chef cover a coffee counter alone without inventing a second worker', () => {
    const { town, game, floor, workers: [maya, fern], poses } = fixture('coffee');
    town.promoteAt(game.id, floor.level); maya.state = { kind: 'waiting', floor: 0, to: floor.level };
    expect(poses().size).toBe(1); expect(poses().get(fern.id)).toMatchObject({ action: 'barista', chef: true, x: 0.15 });
  });

  it('uses the same earned uniform for an ordinary day-review promotion', () => {
    const { town, game, floor, workers: [, fern], poses } = fixture();
    const events = processPromotions([{ id: game.id, tower: game.tower, residents: game.residents }], town.day);
    expect(events.some((event) => event.message.includes('Fern was promoted to Chef'))).toBe(true);
    expect(poses().get(fern.id)).toMatchObject({ action: 'chef', chef: true });
    town.time += 1; town.stories.update(town);
    expect(town.stories.people[fern.id].memories.filter((story) => story.title === 'Fern earned a promotion')).toHaveLength(1);
    expect(floor.type).toBe('restaurant');
  });

  it('leaves rank and memories unchanged when the player cannot afford promotion', () => {
    const { town, game, floor, workers: [, fern] } = fixture(); town.economy.coins = 0;
    const stories = town.stories.snapshot(); expect(town.promoteAt(game.id, floor.level)).toBe(false);
    expect(fern.jobTier).toBe(0); expect(town.stories.snapshot()).toEqual(stories);
  });

  it('prepares only tenure/presence in the development study and uses the normal charged promotion', () => {
    const town = createPreviewTown(), game = town.towers()[0], before = town.economy.coins;
    preparePromotionStudy(town);
    const staff = game.residents.filter((r) => r.jobFloor === 2 && r.jobTowerId === game.id);
    expect(staff.map((r) => r.name)).toEqual(['Maya', 'Fern']); expect(staff.every((r) => r.jobTier === 0)).toBe(true);
    expect(town.economy.coins).toBe(before);
    const cost = town.promoteCostAt(game.id, 2)!;
    expect(town.promoteAt(game.id, 2)).toBe(true); expect(town.economy.coins).toBe(before - cost);
    expect(staff.find((r) => r.name === 'Fern')?.jobTier).toBe(1);
    expect(staff.find((r) => r.name === 'Maya')?.jobTier).toBe(0);
  });
});
