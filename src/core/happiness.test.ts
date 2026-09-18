import { describe, expect, it } from 'vitest';
import {
  happinessBreakdown,
  parkProximityBonus,
  spendingMultiplier,
  updateHappinessAndEvict,
  worstFactor,
  residentTravelPressure,
} from './happiness';
import { Game } from './game';
import { Town } from './town';
import { Economy } from './economy';
import { createResident } from './residents';
import { HAPPINESS, Resident } from './types';
import { staffedBusinessLevels } from './business';
import { TOWER_SLOT_ORIGINS } from './townLayout';

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
    expect(worstFactor(r)).toBe('missed meals');
  });
});

describe('nightlife, parks, and transit', () => {
  it('a bar visit (didNightlife) refills the entertainment need', () => {
    const game = new Game('t0', new Economy(1000));
    game.tower.addFloor('residential');
    game.tower.addFloor('restaurant', 'bar');
    // Staff the bar so the town "has entertainment" and the need can decay.
    const barStaff = addResident(game, { jobTowerId: 't0', jobFloor: 2 });
    void barStaff;
    const partier = addResident(game, {
      didNightlife: true,
      needs: { housing: 100, employment: 100, food: 100, entertainment: 10 },
    });
    refreshStaffing(game);
    updateHappinessAndEvict([game], 2);
    expect(partier.needs.entertainment).toBe(100);
  });

  it('park proximity bonus is strongest adjacent and zero far away', () => {
    const adjacent = parkProximityBonus('t0', [TOWER_SLOT_ORIGINS[1]]);
    const twoAway = parkProximityBonus('t0', [TOWER_SLOT_ORIGINS[2]]);
    expect(adjacent).toBeGreaterThan(0);
    expect(twoAway).toBe(0);
    expect(parkProximityBonus('t0', [])).toBe(0);
    expect(adjacent).toBeGreaterThan(twoAway);
  });

  it('transit-oriented zoning softens the commute happiness penalty', () => {
    function commuterHappiness(homeZone: 'mixed' | 'transit'): number {
      const home = new Game('t0', new Economy(1000), homeZone);
      home.tower.addFloor('residential');
      const job = new Game('t2', new Economy(1000), 'mixed');
      job.tower.addFloor('office');
      const r = createResident(1, 't0');
      r.jobTowerId = 't2';
      r.jobFloor = 1;
      home.residents.push(r);
      updateHappinessAndEvict([home, job], 2);
      return r.happiness;
    }
    expect(commuterHappiness('transit')).toBeGreaterThan(commuterHappiness('mixed'));
  });
});

describe('happinessBreakdown', () => {
  it.each([['mixed', 'mixed'], ['transit', 'mixed'], ['mixed', 'transit'], ['transit', 'transit']] as const)(
    'uses the daily simulation penalties with %s homes and %s jobs', (homeZone, jobZone) => {
      const town = new Town();
      const home = new Game('t0', town.economy, homeZone), job = new Game('t2', town.economy, jobZone);
      town.slots[0] = { id: home.id, unlocked: true, zone: homeZone, game: home };
      town.slots[2] = { id: job.id, unlocked: true, zone: jobZone, game: job };
      home.tower.addFloor('residential'); job.tower.addFloor('office');
      const r = addResident(home, { jobTowerId: job.id, jobFloor: 1 });
      home.averageWait = () => 36;
      const pressure = residentTravelPressure(r, home, job);
      expect(pressure.waitPenalty).toBe(13);
      const transit = homeZone === 'transit' || jobZone === 'transit';
      const expectedCommute = Math.max(0, Math.min(20, (pressure.commuteMinutes - (transit ? 60 : 30)) * (transit ? 0.15 : 0.3)));
      expect(pressure.commutePenalty).toBe(expectedCommute);
      updateHappinessAndEvict([home, job], 2);
      const base = Object.entries(HAPPINESS.weights).reduce((sum, [need, weight]) => sum + r.needs[need as keyof Resident['needs']] * weight, 0);
      expect(r.happiness).toBeCloseTo(base - pressure.waitPenalty - pressure.commutePenalty);
      const before = JSON.stringify(toSnapshot(town));
      const breakdown = happinessBreakdown(town);
      expect(breakdown.penalties.map((p) => p.value)).toEqual([pressure.waitPenalty, pressure.commutePenalty]);
      expect(JSON.stringify(toSnapshot(town))).toBe(before);
    });

  it('compares need deficits and travel on the same happiness-point scale', () => {
    const r = createResident(1, 't0');
    r.needs = { housing: 60, employment: 60, food: 100, entertainment: 100 };
    expect(worstFactor(r, 20, 0)).toBe('long lift queues');
    expect(worstFactor(r, 0, 20)).toBe('a long commute');
    r.needs.food = 0;
    expect(worstFactor(r, 20, 20)).toBe('missed meals');
    r.jobTowerId = r.homeTowerId; r.jobFloor = 1;
    expect(residentTravelPressure(r).commutePenalty).toBe(0);
  });
  it('reports a neutral breakdown when there are no residents', () => {
    const town = new Town();
    const b = happinessBreakdown(town);
    expect(b.residentCount).toBe(0);
    expect(b.average).toBe(100);
    expect(b.needs.map((n) => n.label)).toEqual(['Housing', 'Employment', 'Food', 'Entertainment']);
  });

  it('averages the four needs across residents', () => {
    const town = new Town();
    const t0 = town.slots[0].game!;
    t0.tower.addFloor('residential');
    const a = createResident(1, 't0');
    a.needs = { housing: 100, employment: 40, food: 60, entertainment: 20 };
    const b = createResident(1, 't0');
    b.needs = { housing: 80, employment: 60, food: 40, entertainment: 60 };
    t0.residents.push(a, b);

    const bd = happinessBreakdown(town);
    expect(bd.residentCount).toBe(2);
    const byLabel = Object.fromEntries(bd.needs.map((n) => [n.label, n.value]));
    expect(byLabel.Housing).toBeCloseTo(90, 5);
    expect(byLabel.Employment).toBeCloseTo(50, 5);
    expect(byLabel.Food).toBeCloseTo(50, 5);
    expect(byLabel.Entertainment).toBeCloseTo(40, 5);
    expect(bd.penalties.map((p) => p.label)).toEqual(['Lift queues', 'Long commutes']);
  });
});

function toSnapshot(town: Town) { return { residents: town.allResidents(), coins: town.economy.coins, journal: town.stories.journal }; }
