import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { toSaveData, townFromSaveData } from './save';
import { encodeTown, decodeTown } from './share';
import { MISSION_DEFS } from './missions';
import { visibleGoals } from './goals';
import { runOfflineCatchup } from './offline';

function livedInTown() {
  const town = new Town(), game = town.towers()[0];
  town.identity.rename('Juniper & Lanterns'); game.rename('Willow House');
  town.identity.renameDistrict(0, 'Old Market'); game.architecture = 'garden';
  game.tower.addFloor('residential'); const cafe = game.tower.addFloor('restaurant', 'coffee');
  cafe.name = 'Maya’s kitchen'; cafe.quality = 90; cafe.visitsToday = 10;
  game.residents = ['Maya', 'Noah'].map((name) => {
    const resident = createResident(1, game.id); resident.name = name;
    resident.jobFloor = 2; resident.jobTowerId = game.id;
    resident.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 10000 };
    return resident;
  });
  for (let day = 1; day <= 3; day++) { town.time = (day - 1) * 1440 + 600; town.stories.update(town); }
  town.identity.update(town);
  town.missions.completed = new Set(MISSION_DEFS.filter((m) => m.id !== 'day-income-1000' && m.id !== 'happy-90-3').map((m) => m.id));
  town.missions.streaks['happy-90-3'] = 2;
  town.economy.incomeToday = 930.25;
  town.cityEvents.restore({ active: [{ id: 'evt0', kind: 'tourism', startDay: 2, endsDay: 5 }] }, town.day);
  return town;
}

describe('living-town continuity', () => {
  it('keeps daily earnings, named friends, memories, Signature places and goals in saves and actual share codes', async () => {
    const town = livedInTown();
    const save = toSaveData(town), loaded = townFromSaveData(save)!;
    const shared = await decodeTown(await encodeTown(town));
    expect(shared).not.toBeNull();
    for (const restored of [loaded, shared!]) {
      expect(restored.economy.incomeToday).toBe(930.25);
      expect(restored.identity.snapshot()).toEqual(town.identity.snapshot());
      expect(restored.towers()[0]).toMatchObject({ name: 'Willow House', architecture: 'garden' });
      expect(restored.towers()[0].tower.floors[2]).toMatchObject({ name: 'Maya’s kitchen', signature: true });
      expect(restored.stories.journal.some((story) => story.kind === 'friendship')).toBe(true);
      expect(restored.stories.snapshot()).toEqual(town.stories.snapshot());
      expect(restored.cityEvents.snapshot()).toEqual(town.cityEvents.snapshot());
      expect(restored.economy.eventMultiplier).toBe(town.cityEvents.incomeMultiplier());
      expect(visibleGoals(restored)).toEqual(visibleGoals(town));
      const stories = restored.stories.journal.length, coins = restored.economy.coins;
      restored.stories.update(restored); restored.identity.update(restored);
      expect(restored.stories.journal).toHaveLength(stories); expect(restored.economy.coins).toBe(coins);
    }
  });
  it('detaches snapshots and reconstructed residents from the live town and from save input', () => {
    const town = livedInTown(), resident = town.allResidents()[0];
    const save = toSaveData(town), loaded = townFromSaveData(save)!;
    const originalFood = resident.needs.food;
    resident.needs.food = 7; resident.traits.length = 0;
    town.towers()[0].tower.floors[2].name = 'Changed later';
    expect(save.towers[0].residents[0].needs.food).toBe(originalFood);
    expect(save.towers[0].floors[2].name).toBe('Maya’s kitchen');
    loaded.allResidents()[0].needs.food = 12;
    loaded.allResidents()[0].traits.push('social');
    expect(save.towers[0].residents[0].needs.food).toBe(originalFood);
    expect(save.towers[0].residents[0].traits).not.toEqual(loaded.allResidents()[0].traits);
  });
  it('preserves negative net earnings and defaults old or invalid daily counters safely', () => {
    const town = livedInTown(); town.economy.incomeToday = -45.5;
    const save = toSaveData(town);
    expect(townFromSaveData(save)!.economy.incomeToday).toBe(-45.5);
    delete save.incomeToday;
    expect(townFromSaveData(save)!.economy.incomeToday).toBe(0);
    save.incomeToday = Infinity;
    expect(townFromSaveData(save)!.economy.incomeToday).toBe(0);
  });
  it('replans an interrupted purchase without marking an unserved shopping need complete', () => {
    const town = livedInTown(), resident = town.allResidents()[0];
    resident.didShop = true;
    resident.state = { kind: 'riding', to: 2 };
    resident.pendingActivity = { activity: { kind: 'shop', floor: 2 }, duration: 30,
      beforeFlags: { day: Math.floor(town.time / 1440), didLunch: true, didDinner: false, didShop: false, didNightlife: false } };
    const restored = townFromSaveData(toSaveData(town))!.allResidents()[0];
    expect(restored.state.kind).toBe('idle'); expect(restored.pendingActivity).toBeUndefined();
    expect(restored.didShop).toBe(false); expect(restored.didLunch).toBe(true);
    resident.state = { kind: 'idle', floor: 2, activity: { kind: 'shop', floor: 2 }, until: town.time + 30 };
    expect(townFromSaveData(toSaveData(town))!.allResidents()[0].didShop).toBe(true);
    resident.state = { kind: 'riding', to: 2 }; resident.pendingActivity.beforeFlags!.day--;
    expect(townFromSaveData(toSaveData(town))!.allResidents()[0].didShop).toBe(true);
  });
  it('uses restored daily earnings at offline rollover and awards the mission only once', () => {
    const town = livedInTown(); town.time = 3 * 1440 - 5;
    town.economy.incomeToday = 1500;
    for (const resident of town.allResidents()) {
      resident.didLunch = resident.didDinner = resident.didShop = resident.didNightlife = true;
    }
    town.missions.completed = new Set(MISSION_DEFS.filter((m) => m.id !== 'day-income-1000').map((m) => m.id));
    const restored = townFromSaveData(toSaveData(town))!;
    const report = runOfflineCatchup(restored, 10, 2);
    expect(report.missionsCompleted).toBe(1);
    expect(restored.missions.completed.has('day-income-1000')).toBe(true);
    expect(restored.economy.incomeToday).toBeLessThan(1000);
    const again = townFromSaveData(toSaveData(restored))!;
    expect(runOfflineCatchup(again, 10, 2).missionsCompleted).toBe(0);
  });
});
