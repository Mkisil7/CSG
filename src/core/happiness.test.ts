import { describe, expect, it } from 'vitest';
import { spendingMultiplier, updateHappinessAndEvict, worstFactor } from './happiness';
import { Game } from './game';
import { Economy } from './economy';
import { createResident } from './residents';
import { HAPPINESS, Resident } from './types';
import { staffedBusinessLevels } from './business';

/** A game with a residential floor and (optionally) staffed shop+restaurant. */
function makeGame(id: string, withAmenities: boolean): Game {
  const game = new Game(id, new Economy(1000));
  game.tower.addFloor('residential');
  if (withAmenities) {
    game.tower.addFloor('shop');
    game.tower.addFloor('restaurant');
  }
  return game;
}

function addResident(game: Game, overrides: Partial<Resident> = {}): Resident {
  const r = createResident(1, game.id);
  Object.assign(r, overrides);
  game.residents.push(r);
  return r;
}

/** Staff the amenities so needs actually decay, and refresh staffedLevels. */
function refreshStaffing(game: Game): void {
  game.staffedLevels = staffedBusinessLevels(game.tower, game.id, game.residents);
}

describe('needs', () => {
  it('food/entertainment refill on active days and decay otherwise', () => {
    const game = makeGame('t0', true);
    const worker = addResident(game, { jobTowerId: 't0', jobFloor: 2 }); // staffs the shop
    const eater = addResident(game, { didLunch: true, didShop: false });
    addResident(game, { jobTowerId: 't0', jobFloor: 3 }); // staffs the restaurant
    refreshStaffing(game);

    updateHappinessAndEvict([game], 2);
    expect(eater.needs.food).toBe(100); // refilled by lunch
    expect(eater.needs.entertainment).toBe(100 - HAPPINESS.entertainmentDecayPerDay);
    expect(worker.needs.food).toBe(100 - HAPPINESS.foodDecayPerDay);
  });

  it('needs do not decay when the town has no such amenity yet', () => {
    const game = makeGame('t0', false); // no shops/restaurants at all
    const r = addResident(game);
    refreshStaffing(game);
    for (let d = 0; d < 10; d++) updateHappinessAndEvict([game], d);
    expect(r.needs.food).toBe(100);
    expect(r.needs.entertainment).toBe(100);
  });
});

describe('happiness score and eviction', () => {
  it('a well-off resident scores high; a deprived one scores low', () => {
    const game = makeGame('t0', true);
    const happy = addResident(game, { jobTowerId: 't0', jobFloor: 2, jobTier: 1, didLunch: true, didShop: true });
    addResident(game, { jobTowerId: 't0', jobFloor: 3 });
    refreshStaffing(game);
    updateHappinessAndEvict([game], 2);
    expect(happy.happiness).toBeGreaterThan(70);

    const sad = addResident(game, {
      needs: { housing: 100, employment: 100, food: 0, entertainment: 0 },
    });
    for (let d = 0; d < 3; d++) updateHappinessAndEvict([game], d + 3);
    expect(sad.happiness).toBeLessThan(happy.happiness);
  });

  it('evicts after exactly moveOutAfterDays consecutive miserable days, freeing the slots', () => {
    const game = makeGame('t0', true);
    // Keep the shop/restaurant staffed by two other residents.
    addResident(game, { jobTowerId: 't0', jobFloor: 2 });
    addResident(game, { jobTowerId: 't0', jobFloor: 3 });
    const misery = addResident(game, {
      needs: { housing: 0, employment: 0, food: 0, entertainment: 0 },
      happiness: 0,
    });
    // Pin their needs at rock bottom by never letting them eat/shop.
    refreshStaffing(game);

    for (let d = 0; d < HAPPINESS.moveOutAfterDays - 1; d++) {
      updateHappinessAndEvict([game], d);
      expect(game.residents).toContain(misery);
    }
    const events = updateHappinessAndEvict([game], HAPPINESS.moveOutAfterDays);
    expect(game.residents).not.toContain(misery);
    expect(events.some((e) => e.kind === 'move-out')).toBe(true);
  });

  it('a recovered resident resets their unhappy streak', () => {
    const game = makeGame('t0', true);
    addResident(game, { jobTowerId: 't0', jobFloor: 2 });
    addResident(game, { jobTowerId: 't0', jobFloor: 3 });
    const r = addResident(game, {
      needs: { housing: 0, employment: 0, food: 0, entertainment: 0 },
    });
    refreshStaffing(game);
    updateHappinessAndEvict([game], 1);
    expect(r.unhappyDays).toBe(1);

    // A great day: everything satisfied.
    r.needs = { housing: 100, employment: 100, food: 100, entertainment: 100 };
    r.didLunch = true;
    r.didShop = true;
    r.jobTowerId = 't0';
    r.jobFloor = 2;
    r.jobTier = 1;
    updateHappinessAndEvict([game], 2);
    expect(r.unhappyDays).toBe(0);
  });
});

describe('helpers', () => {
  it('spending multiplier is neutral at 50 and swings with mood', () => {
    expect(spendingMultiplier(50)).toBeCloseTo(1.0, 10);
    expect(spendingMultiplier(100)).toBeGreaterThan(1);
    expect(spendingMultiplier(0)).toBeLessThan(1);
  });

  it('worstFactor names the lowest need', () => {
    const game = makeGame('t0', true);
    const r = addResident(game, {
      needs: { housing: 90, employment: 80, food: 5, entertainment: 60 },
    });
    expect(worstFactor(r)).toBe('nowhere good to eat');
  });
});
