import { describe, expect, it } from 'vitest';
import {
  businessGrade,
  goodsBalance,
  pickBusinessFloor,
  qualityIncomeMultiplier,
  staffedBusinessLevels,
  updateBusinessDay,
} from './business';
import { Tower } from './tower';
import { Economy } from './economy';
import { createResident } from './residents';
import { Resident } from './types';

function staffFloor(tower: Tower, towerId: string, level: number, count: number): Resident[] {
  const staff: Resident[] = [];
  for (let i = 0; i < count; i++) {
    const r = createResident(1, towerId);
    r.jobTowerId = towerId;
    r.jobFloor = level;
    staff.push(r);
  }
  void tower;
  return staff;
}

describe('staffing and openness', () => {
  it('a business with hired staff is open; without staff it is closed', () => {
    const tower = new Tower();
    tower.addFloor('residential');
    tower.addFloor('shop');
    tower.addFloor('restaurant');
    const staff = staffFloor(tower, 't0', 2, 1);

    const open = staffedBusinessLevels(tower, 't0', staff);
    expect(open.has(2)).toBe(true); // staffed shop
    expect(open.has(3)).toBe(false); // unstaffed restaurant
  });
});

describe('pickBusinessFloor', () => {
  it('never picks a closed business', () => {
    const tower = new Tower();
    tower.addFloor('shop'); // level 1, staffed
    tower.addFloor('shop'); // level 2, unstaffed
    const staff = staffFloor(tower, 't0', 1, 1);
    for (let i = 0; i < 50; i++) {
      const pick = pickBusinessFloor(tower, staffedBusinessLevels(tower, 't0', staff), 'shop', []);
      expect(pick?.level).toBe(1);
    }
  });

  it('returns null when nothing of the type is open', () => {
    const tower = new Tower();
    tower.addFloor('shop');
    expect(pickBusinessFloor(tower, new Set(), 'shop', [])).toBeNull();
  });

  it('biases toward higher quality and matching traits', () => {
    const tower = new Tower();
    const grocery = tower.addFloor('shop', 'grocery'); // appeals to 'practical'
    const boutique = tower.addFloor('shop', 'boutique');
    grocery.quality = 50;
    boutique.quality = 50;
    const open = new Set([grocery.level, boutique.level]);

    let groceryPicks = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const pick = pickBusinessFloor(tower, open, 'shop', ['practical']);
      if (pick?.level === grocery.level) groceryPicks++;
    }
    // Weight 1.5 vs 1.0 → expected share 60%; allow generous noise margin.
    expect(groceryPicks / trials).toBeGreaterThan(0.52);
  });
});

describe('quality evolution', () => {
  it('an unstaffed business decays toward zero; a well-run one climbs', () => {
    const tower = new Tower();
    const shop = tower.addFloor('shop');
    const towerId = 't0';
    const eco = new Economy(1000);

    // Unstaffed: quality collapses from 50 toward 0.
    updateBusinessDay([{ id: towerId, tower, residents: [] }], eco);
    expect(shop.quality).toBeLessThan(50);

    // Fully staffed with sensible traffic: quality climbs.
    const staff = staffFloor(tower, towerId, shop.level, 2);
    const before = shop.quality;
    shop.visitsToday = 16; // 2 staff × 1/hr × 8h = ideal
    updateBusinessDay([{ id: towerId, tower, residents: staff }], eco);
    expect(shop.quality).toBeGreaterThan(before);
  });

  it('charges upkeep for staffed businesses only', () => {
    const tower = new Tower();
    tower.addFloor('shop');
    const eco = new Economy(1000);
    updateBusinessDay([{ id: 't0', tower, residents: [] }], eco);
    expect(eco.coins).toBe(1000); // unstaffed → no upkeep

    const staff = staffFloor(tower, 't0', 1, 1);
    updateBusinessDay([{ id: 't0', tower, residents: staff }], eco);
    expect(eco.coins).toBeLessThan(1000);
  });
});

describe('factory floors', () => {
  it('a staffed factory builds quality with no customer visits at all', () => {
    const tower = new Tower();
    const factory = tower.addFloor('factory');
    factory.quality = 50;
    factory.visitsToday = 0;
    const staff = staffFloor(tower, 't0', factory.level, 4);
    updateBusinessDay([{ id: 't0', tower, residents: staff }], new Economy(1000));
    // A shop with zero visits would sink; a factory doesn't serve customers.
    expect(factory.quality).toBeGreaterThan(50);
  });
});

describe('goods supply (factory → shop)', () => {
  it('goodsBalance sums factory supply and shop demand', () => {
    const tower = new Tower();
    const factory = tower.addFloor('factory', 'assembly');
    const shop = tower.addFloor('shop', 'electronics');
    const staff = [
      ...staffFloor(tower, 't0', factory.level, 4),
      ...staffFloor(tower, 't0', shop.level, 2),
    ];
    const bal = goodsBalance([{ id: 't0', tower, residents: staff }], staff);
    expect(bal.supply).toBeGreaterThan(0);
    expect(bal.demand).toBeGreaterThan(0);
    expect(bal.supplyRatio).toBeGreaterThan(0);
  });

  it('a supplying factory lifts a shop quality vs an identical unsupplied shop', () => {
    const withFactory = new Tower();
    const fac = withFactory.addFloor('factory', 'electronics-fab');
    const shopA = withFactory.addFloor('shop', 'electronics');
    shopA.quality = 50;
    shopA.visitsToday = 16; // 2 staff × 1/hr × 8h = ideal load
    const staffA = [
      ...staffFloor(withFactory, 't0', fac.level, 4),
      ...staffFloor(withFactory, 't0', shopA.level, 2),
    ];
    updateBusinessDay([{ id: 't0', tower: withFactory, residents: staffA }], new Economy(1000));

    const noFactory = new Tower();
    const shopB = noFactory.addFloor('shop', 'electronics');
    shopB.quality = 50;
    shopB.visitsToday = 16;
    const staffB = staffFloor(noFactory, 't0', shopB.level, 2);
    updateBusinessDay([{ id: 't0', tower: noFactory, residents: staffB }], new Economy(1000));

    expect(shopA.quality).toBeGreaterThan(shopB.quality);
  });
});

describe('income multipliers and grades', () => {
  it('quality 50 is exactly neutral', () => {
    expect(qualityIncomeMultiplier(50)).toBeCloseTo(1.0, 10);
    expect(qualityIncomeMultiplier(100)).toBeGreaterThan(1);
    expect(qualityIncomeMultiplier(0)).toBeLessThan(1);
  });

  it('grades order sensibly from great to failing', () => {
    const tower = new Tower();
    const shop = tower.addFloor('shop');
    shop.quality = 95;
    shop.revenueToday = 100;
    shop.expensesToday = 40;
    const good = businessGrade(shop, 2);

    shop.quality = 5;
    shop.revenueToday = 0;
    shop.expensesToday = 45;
    const bad = businessGrade(shop, 0);

    expect(good.score).toBeGreaterThan(bad.score);
    expect(['A', 'B']).toContain(good.grade);
    expect(['D', 'F']).toContain(bad.grade);
  });
});
