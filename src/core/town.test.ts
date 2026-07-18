import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game, isToastWorthy } from './game';
import { MINUTES_PER_DAY, MOVE_IN_INTERVAL, TOWN, ZONE_CONFIGS, Resident } from './types';
import { createResident } from './residents';

/** Force-open a second tower for tests without paying/gating. */
function openSecondTower(town: Town): Game {
  const slot = town.slots[1];
  slot.unlocked = true;
  slot.game = new Game(slot.id, town.economy);
  return slot.game;
}

function placeResident(town: Town, towerId: string, overrides: Partial<Resident> = {}): Resident {
  const game = town.towerById(towerId)!;
  const resident = createResident(1, towerId);
  Object.assign(resident, overrides);
  game.residents.push(resident);
  return resident;
}

describe('Town', () => {
  it('starts with exactly one unlocked tower', () => {
    const town = new Town();
    expect(town.towers()).toHaveLength(1);
    expect(town.slots[0].game?.id).toBe('t0');
  });

  it('slot unlock enforces cost and population gates', () => {
    const town = new Town();
    town.economy.coins = 1_000_000;
    expect(town.canUnlockSlot(1).ok).toBe(false); // pop gate fails
    // Fake the population gate.
    town.slots[0].game!.tower.addFloor('residential');
    for (let i = 0; i < TOWN.slotUnlockPop[1]; i++) placeResident(town, 't0');
    expect(town.canUnlockSlot(1).ok).toBe(true);
    expect(town.unlockSlot(1)).toBe(true);
    expect(town.towers()).toHaveLength(2);
    expect(town.economy.coins).toBe(1_000_000 - TOWN.slotCosts[1]);
  });

  it('shared wallet: building in any tower spends the same coins', () => {
    const town = new Town();
    openSecondTower(town);
    town.economy.coins = 10_000;
    const before = town.economy.coins;
    town.slots[0].game!.buildFloor('residential');
    const afterFirst = town.economy.coins;
    town.slots[1].game!.buildFloor('residential');
    expect(afterFirst).toBeLessThan(before);
    expect(town.economy.coins).toBeLessThan(afterFirst);
  });

  it('hands a commuting resident off to the destination tower when the timer elapses', () => {
    const town = new Town();
    const t1 = openSecondTower(town);
    town.slots[0].game!.tower.addFloor('residential');

    const commuter = placeResident(town, 't0', {
      state: { kind: 'commuting', toTowerId: 't1', until: town.time + 10 },
    });

    town.tick(5); // not yet
    expect(town.slots[0].game!.residents).toContain(commuter);

    town.tick(10); // timer elapsed
    expect(town.slots[0].game!.residents).not.toContain(commuter);
    expect(t1.residents).toContain(commuter);
    expect(commuter.state.kind).toBe('idle');
    if (commuter.state.kind === 'idle') {
      expect(commuter.state.floor).toBe(0);
    }
  });

  it('counts home population by home tower even while residents are away', () => {
    const town = new Town();
    const t1 = openSecondTower(town);
    // Lives in t0 but is physically standing in t1.
    const away = createResident(1, 't0');
    t1.residents.push(away);
    expect(town.homeResidentsOf('t0')).toContain(away);
    expect(town.homeResidentsOf('t1')).not.toContain(away);
  });

  it('routes tick events into the bounded activity log', () => {
    const town = new Town();
    town.slots[0].game!.tower.addFloor('residential');
    town.moveInTimer = MOVE_IN_INTERVAL; // force a move-in this tick
    town.tick(1);
    expect(town.activityLog.some((e) => e.kind === 'move-in')).toBe(true);

    // The log never exceeds its cap even under a flood of synthetic events.
    for (let i = 0; i < 500; i++) {
      town.activityLog.push({ kind: 'visit', message: `spam ${i}` });
    }
    // A tick trims to the cap.
    town.moveInTimer = MOVE_IN_INTERVAL;
    town.tick(1);
    expect(town.activityLog.length).toBeLessThanOrEqual(200);
  });

  it('classifies routine events as log-only and rare ones as toast-worthy', () => {
    expect(isToastWorthy('visit')).toBe(false);
    expect(isToastWorthy('hire')).toBe(false);
    expect(isToastWorthy('move-in')).toBe(true);
    expect(isToastWorthy('move-out')).toBe(true);
    expect(isToastWorthy('promotion')).toBe(true);
    expect(isToastWorthy('build')).toBe(true);
    expect(isToastWorthy('mission')).toBe(true);
  });

  it('zones a purchased lot and applies the zone cost multiplier', () => {
    const town = new Town();
    town.economy.coins = 1_000_000;
    town.slots[0].game!.tower.addFloor('residential');
    for (let i = 0; i < TOWN.slotUnlockPop[1]; i++) placeResident(town, 't0');

    const before = town.economy.coins;
    expect(town.unlockSlot(1, 'industrial')).toBe(true);
    expect(town.slots[1].zone).toBe('industrial');
    expect(town.slots[1].game).not.toBeNull();
    expect(town.slots[1].game!.zone).toBe('industrial');
    const expectedCost = Math.round(TOWN.slotCosts[1] * ZONE_CONFIGS.industrial.costMultiplier);
    expect(before - town.economy.coins).toBe(expectedCost);
  });

  it('a park lot is unlocked but holds no tower, and registers a park origin', () => {
    const town = new Town();
    town.economy.coins = 1_000_000;
    town.slots[0].game!.tower.addFloor('residential');
    for (let i = 0; i < TOWN.slotUnlockPop[1]; i++) placeResident(town, 't0');

    expect(town.unlockSlot(1, 'park')).toBe(true);
    expect(town.slots[1].unlocked).toBe(true);
    expect(town.slots[1].game).toBeNull();
    expect(town.towers()).toHaveLength(1); // a park is not a tower
    expect(town.parkOrigins()).toHaveLength(1);
  });

  it('fast-tracks a promotion for an eligible worker (tenure met, senior slot free)', () => {
    const town = new Town();
    town.economy.coins = 100000;
    const t0 = town.slots[0].game!;
    t0.tower.addFloor('residential');
    t0.tower.addFloor('office'); // level 2: Intern → Associate → Manager

    // A tenured intern with a free Associate slot above them.
    const worker = placeResident(town, 't0', { jobTowerId: 't0', jobFloor: 2, jobTier: 0, jobStartDay: 1 });
    town.time = 10 * MINUTES_PER_DAY; // ~day 11, tenure well past the 2-day gate

    expect(town.canPromoteAt('t0', 2).ok).toBe(true);
    const before = town.economy.coins;
    expect(town.promoteAt('t0', 2)).toBe(true);
    expect(worker.jobTier).toBe(1); // promoted to Associate
    expect(town.economy.coins).toBeLessThan(before);
    expect(town.events.some((e) => e.kind === 'promotion')).toBe(true);
  });

  it('will not promote when nobody is due', () => {
    const town = new Town();
    town.economy.coins = 100000;
    const t0 = town.slots[0].game!;
    t0.tower.addFloor('office');
    placeResident(town, 't0', { jobTowerId: 't0', jobFloor: 1, jobTier: 0, jobStartDay: town.day }); // no tenure yet
    expect(town.canPromoteAt('t0', 1).ok).toBe(false);
    expect(town.promoteAt('t0', 1)).toBe(false);
  });

  it('runs several game days with a factory, a bar, and a park without crashing', () => {
    const town = new Town();
    town.economy.coins = 1_000_000;
    const t0 = town.slots[0].game!;
    t0.tower.addFloor('residential');
    t0.tower.addFloor('residential');
    t0.tower.addFloor('restaurant', 'bar');
    t0.tower.addFloor('shop', 'electronics');
    for (let i = 0; i < 6; i++) placeResident(town, 't0');

    // A separate industrial tower and a park lot.
    town.slots[1].unlocked = true;
    town.slots[1].zone = 'industrial';
    town.slots[1].game = new Game('t1', town.economy, 'industrial');
    town.slots[1].game.tower.addFloor('factory', 'assembly');
    town.slots[2].unlocked = true;
    town.slots[2].zone = 'park';
    town.slots[2].game = null;

    // ~3 game days at 10-minute steps: exercises rollovers, nightlife, goods,
    // park-proximity happiness, and cross-tower hiring all together.
    expect(() => {
      for (let step = 0; step < 3 * 144; step++) town.tick(10);
    }).not.toThrow();

    expect(Number.isFinite(town.economy.coins)).toBe(true);
    expect(town.day).toBeGreaterThanOrEqual(3);
    expect(town.activityLog.length).toBeGreaterThan(0);
  });
});
