import { describe, expect, it } from 'vitest';
import { Economy } from './economy';
import { ECONOMY, MINUTES_PER_DAY, Resident } from './types';

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: 'r1',
    name: 'Test',
    homeFloor: 1,
    jobFloor: null,
    workStart: 480,
    workEnd: 960,
    didLunch: false,
    didShop: false,
    state: { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 999 },
    color: 0xffffff,
    ...overrides,
  };
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
    eco.accrue(MINUTES_PER_DAY, [makeResident()]);
    expect(eco.coins).toBeCloseTo(ECONOMY.rentPerResidentPerDay, 5);
  });

  it('workers at work generate extra income; idle residents do not', () => {
    const atWork = makeResident({
      state: { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 999 },
    });
    const atHome = makeResident({ id: 'r2' });

    const working = new Economy(0);
    working.accrue(60, [atWork]);
    const idle = new Economy(0);
    idle.accrue(60, [atHome]);

    expect(working.coins).toBeGreaterThan(idle.coins);
    const expectedWage = (ECONOMY.officeIncomePerWorkerDay / (8 * 60)) * 60;
    expect(working.coins - idle.coins).toBeCloseTo(expectedWage, 5);
  });

  it('spend refuses when coins are insufficient', () => {
    const eco = new Economy(100);
    expect(eco.spend(150)).toBe(false);
    expect(eco.coins).toBe(100);
    expect(eco.spend(60)).toBe(true);
    expect(eco.coins).toBe(40);
  });

  it('elevator car cost grows with each car', () => {
    const eco = new Economy();
    expect(eco.nextElevatorCarCost(2)).toBeGreaterThan(eco.nextElevatorCarCost(1));
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
