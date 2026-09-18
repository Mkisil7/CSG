import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { saveGame, loadGame, readGame, clearSave, SaveSession } from './save';
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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('save/load round trip (v4)', () => {
  it('reports a failed write without replacing the previous snapshot, then recovers', () => {
    const town = new Town(), storage = mockStorage();
    expect(saveGame(town, storage)).toBe(true); const old = storage.getItem('tower-town-save-v4');
    town.economy.coins += 500;
    const write = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(saveGame(town, storage)).toBe(false); expect(storage.getItem('tower-town-save-v4')).toBe(old);
    write.mockRestore(); expect(saveGame(town, storage)).toBe(true);
    expect(loadGame(storage)!.town.economy.coins).toBe(town.economy.coins);
  });
  it('catches unavailable storage including access to the global getter itself', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('Denied', 'SecurityError'); } });
    expect(readGame()).toEqual({ status: 'unavailable' }); expect(loadGame()).toBeNull();
    expect(saveGame(new Town())).toBe(false); expect(clearSave()).toBe(false);
  });
  it.each(['', '{bad json', '{"version":3}', '{"version":4,"time":480,"coins":300,"towers":[]}',
    '{"version":4,"time":null,"coins":300,"towers":[]}'])('preserves invalid stored data instead of calling it an empty slot (%s)', (raw) => {
    const storage = mockStorage(); storage.setItem('tower-town-save-v4', raw);
    expect(readGame(storage)).toEqual({ status: 'invalid' }); expect(storage.getItem('tower-town-save-v4')).toBe(raw);
  });
  it('keeps protected sessions from writing or clearing even after storage recovers', () => {
    const storage = mockStorage(), write = vi.spyOn(storage, 'setItem'), remove = vi.spyOn(storage, 'removeItem');
    const session = new SaveSession(new Town(), false, storage);
    expect(session.save()).toBeNull(); expect(session.reset()).toBe(false);
    expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
  it('prevents the unload save from resurrecting a successfully reset town', () => {
    const storage = mockStorage(), session = new SaveSession(new Town(), true, storage);
    expect(session.save()).toBe(true); expect(session.reset()).toBe(true);
    expect(session.save()).toBeNull(); expect(readGame(storage)).toEqual({ status: 'empty' });
  });
  it('keeps a session saveable after a failed reset', () => {
    const storage = mockStorage(), session = new SaveSession(new Town(), true, storage); session.save();
    vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new Error('Denied'); });
    expect(session.reset()).toBe(false); expect(session.enabled).toBe(true); expect(session.save()).toBe(true);
  });
  it('restores towers, floors, business/career/happiness state, and missions', () => {
    const town = new Town();
    const t0 = town.slots[0].game!;
    t0.tower.addFloor('residential');
    t0.tower.addFloor('shop', 'boutique');
    t0.tower.renameFloor(2, 'Corner Store');
    t0.tower.floors[2].quality = 72;
    town.economy.coins = 5000;
    t0.upgradeSpeed();
    t0.townPopulation = 99; // bypass the gate for the test
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

  it('round-trips zones, a factory floor, and a park lot (v4)', () => {
    const town = new Town();
    town.economy.coins = 1_000_000;

    town.slots[1].unlocked = true;
    town.slots[1].zone = 'industrial';
    town.slots[1].game = new Game('t1', town.economy, 'industrial');
    town.slots[1].game.tower.addFloor('factory', 'electronics-fab');

    town.slots[2].unlocked = true;
    town.slots[2].zone = 'park';
    town.slots[2].game = null;

    const storage = mockStorage();
    saveGame(town, storage);
    const loaded = loadGame(storage)!.town;

    expect(loaded.slots[1].zone).toBe('industrial');
    expect(loaded.slots[1].game!.zone).toBe('industrial');
    expect(loaded.slots[1].game!.tower.floors[1].type).toBe('factory');
    expect(loaded.slots[1].game!.tower.floors[1].subtype).toBe('electronics-fab');
    expect(loaded.slots[2].zone).toBe('park');
    expect(loaded.slots[2].game).toBeNull();
    expect(loaded.towers()).toHaveLength(2); // t0 + t1; the park is not a tower
  });

  it('drops a legacy (pre-v4) save', () => {
    const storage = mockStorage();
    storage.setItem('tower-town-save-v4', JSON.stringify({ version: 3, towers: [] }));
    expect(loadGame(storage)).toBeNull();
  });
});
