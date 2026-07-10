import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { saveGame, loadGame } from './save';
import { createResident } from './residents';

function mockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('save/load round trip (v3)', () => {
  it('restores towers, floors, business/career/happiness state, and missions', () => {
    const town = new Town();
    const t0 = town.slots[0].game!;
    t0.tower.addFloor('residential');
    t0.tower.addFloor('shop', 'boutique');
    t0.tower.renameFloor(2, 'Corner Store');
    t0.tower.floors[2].quality = 72;
    town.economy.coins = 5000;
    t0.upgradeSpeed();
    t0.homePopulation = 99; // bypass the gate for the test
    t0.unlockSecondShaft();
    town.missions.completed.add('first-neighbors');

    town.slots[1].unlocked = true;
    town.slots[1].game = new Game('t1', town.economy);
    town.slots[1].game.tower.addFloor('office', 'law');

    const resident = createResident(1, 't0');
    resident.jobTowerId = 't1';
    resident.jobFloor = 1;
    resident.jobTier = 1;
    resident.jobStartDay = 2;
    resident.happiness = 63;
    resident.needs.food = 40;
    t0.residents.push(resident);

    // A resident caught mid-commute must land safely on load.
    const commuter = createResident(1, 't0');
    commuter.state = { kind: 'commuting', toTowerId: 't1', until: town.time + 30 };
    t0.residents.push(commuter);

    const storage = mockStorage();
    saveGame(town, storage);
    const result = loadGame(storage)!;
    expect(result).not.toBeNull();
    const loaded = result.town;

    // Just saved → away time is effectively zero.
    expect(result.awayRealSeconds).toBeLessThan(5);
    expect(loaded.economy.coins).toBe(town.economy.coins);
    expect(loaded.towers()).toHaveLength(2);
    expect(loaded.missions.completed.has('first-neighbors')).toBe(true);

    const lt0 = loaded.slots[0].game!;
    expect(lt0.tower.floors[2].name).toBe('Corner Store');
    expect(lt0.tower.floors[2].subtype).toBe('boutique');
    expect(lt0.tower.floors[2].quality).toBe(72);
    expect(lt0.elevatorTier).toBe(1);
    expect(lt0.secondElevator).not.toBeNull();
    expect(loaded.slots[1].game!.tower.floors[1].subtype).toBe('law');

    const loadedResident = lt0.residents.find((r) => r.id === resident.id)!;
    expect(loadedResident.jobTowerId).toBe('t1');
    expect(loadedResident.jobTier).toBe(1);
    expect(loadedResident.happiness).toBe(63);
    expect(loadedResident.needs.food).toBe(40);
    expect(loadedResident.traits.length).toBeGreaterThan(0);

    const loadedCommuter = lt0.residents.find((r) => r.id === commuter.id)!;
    expect(loadedCommuter.state.kind).toBe('idle');
  });

  it('returns null when no save exists', () => {
    expect(loadGame(mockStorage())).toBeNull();
  });
});
