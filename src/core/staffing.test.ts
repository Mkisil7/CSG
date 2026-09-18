import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { createResident } from './residents';
import { toSaveData, townFromSaveData } from './save';

describe('immediate business staffing', () => {
  it('restores commuter-staffed businesses before a paused or shared town takes any ticks', () => {
    const town = new Town(), home = town.towers()[0], work = new Game('t2', town.economy);
    town.slots[2] = { id: 't2', unlocked: true, zone: 'mixed', game: work };
    home.tower.addFloor('residential');
    work.tower.addFloor('restaurant', 'coffee'); work.tower.addFloor('shop', 'grocery');
    const resident = createResident(1, home.id);
    resident.didLandmark = false;
    resident.jobTowerId = work.id; resident.jobFloor = 1;
    home.residents.push(resident);
    const saved = toSaveData(town), restored = townFromSaveData(saved)!;
    expect([...restored.towerById(work.id)!.staffedLevels]).toEqual([1]);
    expect([...restored.towerById(home.id)!.staffedLevels]).toEqual([]);
    expect(restored.allResidents()).toEqual(town.allResidents());
    expect(restored.time).toBe(town.time);
    expect(restored.economy.coins).toBe(town.economy.coins);
  });

  it('publishes automatic hiring in the same tick as the staff assignment', () => {
    const town = new Town(), game = town.towers()[0];
    game.tower.addFloor('residential'); game.tower.addFloor('restaurant', 'coffee');
    const resident = createResident(1, game.id); game.residents.push(resident);
    expect(resident.jobFloor).toBeNull(); expect(game.staffedLevels.has(2)).toBe(false);
    town.tick(0.01);
    expect(resident.jobFloor).toBe(2); expect(game.staffedLevels.has(2)).toBe(true);
  });

  it('refreshes only derived opening state, including closing a vacated business', () => {
    const town = new Town(), game = town.towers()[0];
    game.tower.addFloor('residential'); game.tower.addFloor('office', 'tech');
    game.tower.addFloor('office', 'law');
    const resident = createResident(1, game.id); game.residents.push(resident);
    resident.jobTowerId = game.id; resident.jobFloor = 2;
    town.refreshStaffing(); expect([...game.staffedLevels]).toEqual([2]);
    resident.jobFloor = 3;
    const before = toSaveData(town);
    town.refreshStaffing(); town.refreshStaffing();
    expect([...game.staffedLevels]).toEqual([3]);
    expect({ ...toSaveData(town), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
    expect(town.events).toEqual([]); expect(town.activityLog).toEqual([]);
  });
});
