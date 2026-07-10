import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { TOWN, Resident } from './types';
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
});
