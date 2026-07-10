import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { Tower } from './tower';
import { TowerContext } from './careers';
import { ECONOMY, MINUTES_PER_DAY, Resident } from './types';

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: 'r1',
    name: 'Test',
    homeFloor: 1,
    homeTowerId: 't0',
    jobFloor: null,
    jobTowerId: null,
    jobTier: 0,
    jobStartDay: null,
    blockedDays: 0,
    workStart: 480,
    workEnd: 960,
    didLunch: false,
    didShop: false,
    state: { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 999 },
    color: 0xffffff,
    ...overrides,
  };
}

function makeContext(residents: Resident[], floorTypes: ('residential' | 'shop' | 'restaurant' | 'office')[] = []): TowerContext {
  const tower = new Tower();
  for (const t of floorTypes) tower.addFloor(t);
  return { id: 't0', tower, residents };
}

describe('Economy', () => {
  it('earns per shop and restaurant visit', () => {
    const eco = new Economy(0);
    expect(eco.recordVisit('shop')).toBe(ECONOMY.shopVisitIncome);
    expect(eco.recordVisit('eat')).toBe(ECONOMY.restaurantVisitIncome);
    expect(eco.coins).toBe(ECONOMY.shopVisitIncome + ECONOMY.restaurantVisitIncome);
  });

  it('non-visit activities earn nothing', () => {
    const eco = new Economy(0);
    expect(eco.recordVisit('home')).toBe(0);
    expect(eco.coins).toBe(0);
  });

  it('accrues a full day of rent per resident', () => {
    const eco = new Economy(0);
    eco.accrue(MINUTES_PER_DAY, [makeContext([makeResident()], ['residential'])]);
    expect(eco.coins).toBeCloseTo(ECONOMY.rentPerResidentPerDay, 5);
  });

  it('workers physically at work generate wages; idle residents do not', () => {
    const atWork = makeResident({
      jobFloor: 2,
      jobTowerId: 't0',
      state: { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 999 },
    });
    const atHome = makeResident({ id: 'r2', jobFloor: 2, jobTowerId: 't0' });

    const working = new Economy(0);
    working.accrue(60, [makeContext([atWork], ['residential', 'office'])]);
    const idle = new Economy(0);
    idle.accrue(60, [makeContext([atHome], ['residential', 'office'])]);

    expect(working.coins).toBeGreaterThan(idle.coins);
    const expectedWage = (ECONOMY.baseWagePerWorkerDay.office / (8 * 60)) * 60;
    expect(working.coins - idle.coins).toBeCloseTo(expectedWage, 5);
  });

  it('higher job tiers earn multiplied wages', () => {
    const base = makeResident({
      jobFloor: 2,
      jobTowerId: 't0',
      jobTier: 0,
      state: { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 999 },
    });
    const manager = makeResident({
      id: 'r2',
      jobFloor: 2,
      jobTowerId: 't0',
      jobTier: 2, // office Manager, ×2.2
      state: { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 999 },
    });

    const lowEco = new Economy(0);
    lowEco.accrue(60, [makeContext([base], ['residential', 'office'])]);
    const highEco = new Economy(0);
    highEco.accrue(60, [makeContext([manager], ['residential', 'office'])]);

    expect(highEco.coins).toBeGreaterThan(lowEco.coins);
  });

  it('cross-tower workers are paid using the job tower floor type', () => {
    const homeTower = makeContext([], ['residential']);
    const commuter = makeResident({
      homeTowerId: 't0',
      jobTowerId: 't1',
      jobFloor: 1,
      state: { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 999 },
    });
    const jobTowerObj = new Tower();
    jobTowerObj.addFloor('office');
    const jobTower: TowerContext = { id: 't1', tower: jobTowerObj, residents: [commuter] };

    const eco = new Economy(0);
    eco.accrue(60, [homeTower, jobTower]);
    const expectedWage = (ECONOMY.baseWagePerWorkerDay.office / (8 * 60)) * 60;
    const rent = (ECONOMY.rentPerResidentPerDay / MINUTES_PER_DAY) * 60;
    expect(eco.coins).toBeCloseTo(expectedWage + rent, 5);
  });

  it('spend refuses when coins are insufficient', () => {
    const eco = new Economy(100);
    expect(eco.spend(150)).toBe(false);
    expect(eco.coins).toBe(100);
    expect(eco.spend(60)).toBe(true);
    expect(eco.coins).toBe(40);
  });

  it('resets daily income on newDay but keeps coins', () => {
    const eco = new Economy(0);
    eco.recordVisit('shop');
    expect(eco.incomeToday).toBeGreaterThan(0);
    eco.newDay();
    expect(eco.incomeToday).toBe(0);
    expect(eco.coins).toBe(ECONOMY.shopVisitIncome);
  });
});
