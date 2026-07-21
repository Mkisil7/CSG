import { describe, expect, it } from 'vitest';
import { chooseShaft, Game } from './game';
import { ElevatorSystem } from './elevator';
import { Economy } from './economy';

describe('chooseShaft (ETA-based)', () => {
  it('prefers the shaft whose car is closer to the rider', () => {
    const near = new ElevatorSystem(1);
    const far = new ElevatorSystem(1);
    near.cars[0].pos = 5;
    far.cars[0].pos = 0;
    expect(chooseShaft([far, near], 5)).toBe(near);
  });

  it('avoids a nearby shaft that already has a long queue', () => {
    const busy = new ElevatorSystem(1);
    const free = new ElevatorSystem(1);
    busy.cars[0].pos = 5; // right there…
    for (let i = 0; i < 8; i++) busy.request(`q${i}`, 5, 0, 0); // …but mobbed
    free.cars[0].pos = 3; // a short ride away, empty queue
    expect(chooseShaft([busy, free], 5)).toBe(free);
  });
});

describe('averageWait pooling', () => {
  it('an idle second shaft cannot dilute a congested first shaft', () => {
    const game = new Game('t0', new Economy());
    // Simulate recorded waits on the primary shaft only.
    const shaft = game.elevator as unknown as { waitSamples: number[] };
    shaft.waitSamples = [20, 20, 20];
    expect(game.averageWait()).toBeCloseTo(20, 5);

    game.secondElevator = new ElevatorSystem(1); // brand new, zero samples
    expect(game.averageWait()).toBeCloseTo(20, 5); // still 20, not halved
  });
});

describe('transit-oriented lift throughput', () => {
  it('a transit tower carries more riders per trip and dwells less at each floor', () => {
    const mixed = new Game('t0', new Economy());
    const transit = new Game('t1', new Economy(), 'transit');
    expect(transit.elevator.capacity).toBeGreaterThan(mixed.elevator.capacity);
    expect(transit.elevator.doorTime).toBeLessThan(mixed.elevator.doorTime);
  });

  it('the throughput bonus carries onto a newly-built second shaft', () => {
    const transit = new Game('t1', new Economy(100000), 'transit');
    transit.townPopulation = 9999;
    expect(transit.unlockSecondShaft()).toBe(true);
    expect(transit.secondElevator!.capacity).toBe(transit.elevator.capacity);
  });
});

describe('zone build gating', () => {
  it('mixed zone (the default) allows every floor type', () => {
    const g = new Game('t0', new Economy(100000), 'mixed');
    g.townPopulation = 100;
    for (const t of ['residential', 'shop', 'restaurant', 'office', 'factory'] as const) {
      expect(g.canBuild(t).ok).toBe(true);
    }
  });

  it('a residential zone rejects non-residential floors with a clear reason', () => {
    const g = new Game('t0', new Economy(100000), 'residential');
    g.townPopulation = 100;
    expect(g.canBuild('residential').ok).toBe(true);
    const shop = g.canBuild('shop');
    expect(shop.ok).toBe(false);
    expect(shop.reason).toContain('Not zoned');
  });

  it('an industrial zone allows factories but not shops; buildFloor honours it', () => {
    const g = new Game('t0', new Economy(100000), 'industrial');
    g.townPopulation = 100;
    expect(g.canBuild('factory').ok).toBe(true);
    expect(g.canBuild('shop').ok).toBe(false);
    expect(g.buildFloor('shop')).toBe(false); // gate blocks the actual build
    expect(g.buildFloor('factory')).toBe(true);
  });

  it('a commercial lot with no homes of its own can still build once the town has people', () => {
    const g = new Game('t1', new Economy(100000), 'commercial');
    g.homePopulation = 0; // a commercial zone can't build apartments…
    g.townPopulation = 20; // …but the workforce/customers exist town-wide
    expect(g.canBuild('shop').ok).toBe(true);
    expect(g.canBuild('restaurant').ok).toBe(true);
    expect(g.buildFloor('shop', 'grocery')).toBe(true);
  });
});

describe('renovate (business quality lever)', () => {
  it('spends coins to raise a business floor’s quality', () => {
    const g = new Game('t0', new Economy(100000));
    g.townPopulation = 100;
    g.buildFloor('shop', 'grocery');
    const shop = g.tower.floors[1];
    shop.quality = 40;
    const before = g.economy.coins;
    expect(g.canRenovate(1).ok).toBe(true);
    expect(g.renovate(1)).toBe(true);
    expect(shop.quality).toBeGreaterThan(40);
    expect(g.economy.coins).toBeLessThan(before);
  });

  it('cannot renovate a non-business floor or an already-perfect one', () => {
    const g = new Game('t0', new Economy(100000));
    g.townPopulation = 100;
    g.buildFloor('residential');
    expect(g.canRenovate(1).ok).toBe(false); // apartments aren't a business
    g.buildFloor('shop');
    g.tower.floors[2].quality = 100;
    expect(g.canRenovate(2).ok).toBe(false); // already maxed
  });
});
