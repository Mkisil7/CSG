import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { createResident } from './residents';
import { visibleGoals } from './goals';
import { MISSION_DEFS } from './missions';
import { SKYLINE_REWARDS } from './identity';
import { toSaveData, townFromSaveData } from './save';

const session = (town: Town) => visibleGoals(town).find((g) => g.horizon === 'This session')!;
function townWithNeighbors(count: number) {
  const town = new Town(), game = town.towers()[0];
  for (let i = 0; i < Math.ceil(count / 4); i++) game.tower.addFloor('residential');
  game.residents = Array.from({ length: count }, (_, index) => createResident(Math.floor(index / 4) + 1, game.id));
  game.townPopulation = count;
  town.economy.coins = 200;
  town.missions.completed.add('first-neighbors');
  return town;
}

describe('reachable three-horizon goals', () => {
  it.each([['shop', 'first-shop-customer'], ['restaurant', 'first-meal']] as const)('takes the first %s customer goal to its venue, without claiming a visit', (type, id) => {
    const town = townWithNeighbors(4), game = town.towers()[0], floor = game.tower.addFloor(type);
    const before = JSON.stringify(town);
    expect(session(town)).toMatchObject({ id, current: 0, target: { kind: 'floor', towerId: game.id, level: floor.level } });
    expect(session(town).detail).toContain('needs a teammate');
    expect(JSON.stringify(town)).toBe(before);
    game.residents[0].jobTowerId = game.id; game.residents[0].jobFloor = floor.level;
    expect(session(town).detail).toContain('Watch neighbors arrive');
    expect(session(town).detail).toContain(floor.name);
    town.missions.completed.add(id);
    expect(session(town).id).not.toBe(id);
  });
  it('chooses a staffed opening in another tower, and prefers one with an actual incoming customer', () => {
    const town = townWithNeighbors(4), first = town.towers()[0]; first.tower.addFloor('shop');
    const other = new Game('t1', town.economy);
    town.slots[1] = { id: other.id, unlocked: true, zone: 'mixed', game: other };
    const shop = other.tower.addFloor('shop'), arrivingShop = other.tower.addFloor('shop');
    for (const [i, floor] of [shop, arrivingShop].entries()) {
      first.residents[i].jobTowerId = other.id; first.residents[i].jobFloor = floor.level;
    }
    expect(session(town).target).toEqual({ kind: 'floor', towerId: other.id, level: shop.level });
    const customer = createResident(1, first.id);
    customer.state = { kind: 'waiting', floor: 0, to: arrivingShop.level };
    customer.pendingActivity = { activity: { kind: 'shop', floor: arrivingShop.level }, duration: 20 };
    first.residents.push(customer);
    // An identically numbered destination in another tower is not this shop.
    expect(session(town).target).toEqual({ kind: 'floor', towerId: other.id, level: shop.level });
    first.residents.pop(); other.residents.push(customer);
    const before = JSON.stringify(town);
    expect(session(town).target).toEqual({ kind: 'floor', towerId: other.id, level: arrivingShop.level });
    expect(JSON.stringify(town)).toBe(before);
  });
  it('shows the waiting home before first arrivals instead of offering an unnecessary purchase', () => {
    const town = new Town(), game = town.towers()[0], home = game.tower.addFloor('residential');
    const coins = town.economy.coins, goal = visibleGoals(town)[0];
    expect(goal.title).toBe('Watch your first neighbors arrive');
    expect(goal.detail).toContain('choose 1×');
    expect(goal.target).toEqual({ kind: 'floor', towerId: game.id, level: home.level });
    game.residents.push(createResident(home.level, game.id));
    expect(visibleGoals(town)[0].target).toEqual({ kind: 'resident', residentId: game.residents[0].id });
    expect(town.economy.coins).toBe(coins);
  });
  it('prioritizes early housing capacity over optional fresh-business renovations, but not a struggling venue', () => {
    const town = townWithNeighbors(4), game = town.towers()[0]; town.economy.coins = 1000;
    const restaurant = game.tower.addFloor('restaurant'), shop = game.tower.addFloor('shop');
    for (const [index, floor] of [restaurant, shop].entries()) {
      game.residents[index].jobTowerId = game.id; game.residents[index].jobFloor = floor.level;
    }
    expect(visibleGoals(town)[0]).toMatchObject({ id: 'welcome', target: { kind: 'build', floorType: 'residential' } });
    restaurant.quality = 35;
    expect(visibleGoals(town)[0].id).toBe(`renovate-${game.id}-${restaurant.level}`);
    restaurant.quality = 50; town.economy.coins = 0;
    expect(visibleGoals(town)[0].detail).toContain(`${game.tower.nextFloorCost('residential')} more to save`);
  });
  it('introduces everyday services and work before endless apartment growth, without spending from goal display', () => {
    const town = townWithNeighbors(4), game = town.towers()[0]; town.economy.coins = 1000;
    expect(visibleGoals(town)[0].target).toEqual({ kind: 'build', towerId: game.id, floorType: 'restaurant' });
    game.tower.addFloor('restaurant', 'coffee');
    expect(visibleGoals(town)[0].target).toEqual({ kind: 'build', towerId: game.id, floorType: 'shop' });
    game.tower.addFloor('shop', 'grocery');
    const larger = townWithNeighbors(8), g = larger.towers()[0];
    g.tower.addFloor('restaurant', 'coffee'); g.tower.addFloor('shop', 'grocery');
    const coins = larger.economy.coins;
    expect(visibleGoals(larger)[0]).toMatchObject({ title: 'Save for an office', target: { kind: 'build', floorType: 'office' } });
    expect(larger.economy.coins).toBe(coins);
  });
  it('keeps the first-neighbors introduction, then chooses a close population milestone over a distant build', () => {
    expect(session(new Town())).toMatchObject({ id: 'first-neighbors', current: 0, total: 10, reward: 200 });
    expect(session(townWithNeighbors(24))).toMatchObject({ id: 'pop-25', current: 24, total: 25, reward: 150 });
  });
  it('does not suggest staffing a nonexistent restaurant or an unavailable second shaft', () => {
    const town = townWithNeighbors(10);
    expect(session(town).id).not.toBe('fully-staffed');
    expect(session(town).id).not.toBe('lift-second');
    town.towers()[0].tower.addFloor('restaurant', 'coffee');
    for (const mission of MISSION_DEFS) if (mission.id !== 'fully-staffed') town.missions.completed.add(mission.id);
    expect(session(town)).toMatchObject({ id: 'fully-staffed', current: 0, total: 3 });
  });
  it('shows day-end timing and exact income progress without paying a reward from the UI', () => {
    const town = townWithNeighbors(12);
    for (const mission of MISSION_DEFS) if (mission.id !== 'day-income-1000') town.missions.completed.add(mission.id);
    town.economy.incomeToday = 930;
    const coins = town.economy.coins, completed = [...town.missions.completed];
    expect(session(town)).toMatchObject({ id: 'day-income-1000', current: 930, total: 1000, reward: 200 });
    expect(session(town).detail).toContain('day’s end');
    expect(town.economy.coins).toBe(coins); expect([...town.missions.completed]).toEqual(completed);
  });
  it('advances an earned happiness streak instead of displaying a completed goal at zero', () => {
    const town = townWithNeighbors(12);
    town.missions.completed.add('first-park'); town.missions.completed.add('happy-town');
    town.missions.streaks['happy-90-3'] = 2;
    const goal = visibleGoals(town).find((g) => g.horizon === 'Your growing town');
    expect(goal).toMatchObject({ id: 'happy-90-3', current: 2, total: 3, reward: 600 });
  });
  it('keeps all three horizons after every mission and visual reward is earned, without inventing coin rewards', () => {
    const town = townWithNeighbors(12);
    for (const mission of MISSION_DEFS) town.missions.completed.add(mission.id);
    for (const reward of SKYLINE_REWARDS) town.identity.unlocked.add(reward.id);
    const goals = visibleGoals(town);
    expect(goals.length).toBeGreaterThanOrEqual(3); expect(goals.length).toBeLessThanOrEqual(5);
    expect(goals.slice(0, 3).map((g) => g.horizon)).toEqual(['Right now', 'This session', 'Your growing town']);
    expect(goals.every((g) => g.reward === undefined)).toBe(true);
    expect(session(town).target).toEqual({ kind: 'town' });
  });
  it('retains derived goals and saved streak progress across reload', () => {
    const town = townWithNeighbors(24);
    town.missions.completed.add('first-park'); town.missions.streaks['happy-town'] = 2;
    const before = visibleGoals(town);
    const loaded = townFromSaveData(JSON.parse(JSON.stringify(toSaveData(town))))!;
    expect(visibleGoals(loaded)).toEqual(before);
  });
  it('does not promote a population-locked or impossible expansion as a nearby session target', () => {
    const town = townWithNeighbors(32);
    town.slots[1] = { id: 't1', unlocked: true, zone: 'mixed', game: new Game('t1', town.economy) };
    town.slots[2] = { id: 't2', unlocked: true, zone: 'mixed', game: new Game('t2', town.economy) };
    town.economy.coins = 100000;
    for (const mission of MISSION_DEFS) if (mission.id !== 'towers-4') town.missions.completed.add(mission.id);
    expect(session(town).id).not.toBe('towers-4');
    town.towers()[0].residents = Array.from({ length: 60 }, () => createResident(1, 't0'));
    expect(session(town).id).toBe('towers-4');
    for (const slot of town.slots.filter((slot) => !slot.unlocked)) { slot.unlocked = true; slot.zone = 'park'; }
    expect(session(town).id).not.toBe('towers-4');
  });
  it('offers an earned visible business ambition when numeric milestones are exhausted', () => {
    const town = townWithNeighbors(12), game = town.towers()[0];
    for (const mission of MISSION_DEFS) town.missions.completed.add(mission.id);
    const floor = game.tower.addFloor('office', 'creative');
    expect(session(town)).toMatchObject({ id: `signature-${game.id}-${floor.level}`, target: { kind: 'floor', towerId: game.id, level: floor.level } });
    expect(session(town).detail).toContain('promoted worker');
    floor.signature = true;
    expect(session(town).id).toBe('next-chapter');
  });
});
