import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { MISSION_DEFS } from './missions';
import { toSaveData, townFromSaveData } from './save';
import { encodeTown, decodeTown } from './share';
import { visibleGoals } from './goals';

describe('earned opening milestones', () => {
  it.each([
    ['shop', 'shop', 'first-shop-customer', 60],
    ['restaurant', 'eat', 'first-meal', 90],
  ] as const)('awards %s only after a paid arrival and preserves its reward/memory through saves and sharing', async (type, activity, id, reward) => {
    const town = new Town(), game = town.towers()[0]; town.time = 1080;
    game.tower.addFloor('residential'); const floor = game.tower.addFloor(type);
    floor.name = 'The first neighborhood stop';
    const staff = createResident(1, game.id), customer = createResident(1, game.id);
    staff.jobTowerId = game.id; staff.jobFloor = floor.level;
    staff.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, until: town.time + 180 };
    customer.state = { kind: 'waiting', floor: 1, to: floor.level };
    customer.pendingActivity = { activity: { kind: activity, floor: floor.level }, duration: 40 };
    game.residents = [staff, customer]; game.staffedLevels.add(floor.level);
    game.elevator.request(customer.id, 1, floor.level, town.time);
    // Isolate this reward without changing any other mission's definition.
    town.missions.completed = new Set(MISSION_DEFS.filter((m) => m.id !== id).map((m) => m.id));
    expect(town.missions.checkInstant(town)).toEqual([]);
    expect(visibleGoals(town).find((goal) => goal.horizon === 'This session')).toMatchObject({ id, reward, current: 0, total: 1 });
    const coins = town.economy.coins;
    for (let minute = 0; minute < 60 && floor.visitsToday === 0; minute++) {
      town.time += 0.5; game.tick(0.5, town.time); town.missions.checkInstant(town);
    }
    expect(floor.visitsToday).toBe(1); expect(floor.revenueToday).toBeGreaterThan(0);
    expect(town.economy.coins - coins).toBeCloseTo(floor.revenueToday + reward);
    expect(town.missions.completed.has(id)).toBe(true);
    const memories = town.stories.journal.filter((story) => story.title.includes('welcomed its first customer'));
    expect(memories).toHaveLength(1); expect(memories[0].text).toContain(`${reward} milestone coins`);
    expect(memories[0].place).toEqual({ kind: 'floor', towerId: game.id, level: floor.level });
    for (const restored of [townFromSaveData(JSON.parse(JSON.stringify(toSaveData(town))))!, (await decodeTown(await encodeTown(town)))!]) {
      const balance = restored.economy.coins, stories = restored.stories.journal.length;
      expect(restored.missions.checkInstant(restored)).toEqual([]);
      expect(restored.economy.coins).toBe(balance); expect(restored.stories.journal).toHaveLength(stories);
      expect(restored.missions.completed.has(id)).toBe(true);
      expect(restored.stories.journal.find(s => s.id === memories[0].id)?.place).toEqual(memories[0].place);
    }
  });

  it('does not confuse workers, unpaid visits, or a different venue’s takings with a paid opening', () => {
    const town = new Town(), game = town.towers()[0];
    const shop = game.tower.addFloor('shop'), restaurant = game.tower.addFloor('restaurant');
    const sale = MISSION_DEFS.find((mission) => mission.id === 'first-shop-customer')!;
    const meal = MISSION_DEFS.find((mission) => mission.id === 'first-meal')!;
    shop.visitsToday = 1; restaurant.revenueToday = 10;
    expect(sale.check(town)).toBe(false); expect(meal.check(town)).toBe(false);
    const coins = town.economy.coins, stories = town.stories.journal.length;
    visibleGoals(town); visibleGoals(town);
    expect(town.economy.coins).toBe(coins); expect(town.stories.journal).toHaveLength(stories);
  });
});
