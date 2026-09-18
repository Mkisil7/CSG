import { afterEach, describe, expect, it, vi } from 'vitest';
import { distinctResidentName } from './residents';
import { Town } from './town';
import { Game } from './game';
import { toSaveData, townFromSaveData } from './save';
import { encodeTown, decodeTown } from './share';

afterEach(() => { vi.restoreAllMocks(); });

describe('recognizable new neighbors', () => {
  it('keeps an available first name and resolves collisions without random draws', () => {
    const random = vi.spyOn(Math, 'random');
    expect(distinctResidentName('Bo', [])).toBe('Bo');
    expect(distinctResidentName('Bo', ['  BO '])).not.toBe('Bo');
    expect(distinctResidentName('Bo', ['Bo'])).toBe(distinctResidentName('Bo', ['Bo']));
    expect(random).not.toHaveBeenCalled();
  });
  it('provides distinctive readable first/family names for a large town', () => {
    const names: string[] = [];
    for (let i = 0; i < 256; i++) names.push(distinctResidentName('Ava', names));
    expect(new Set(names).size).toBe(256);
    expect(names.some((name) => name.includes(' '))).toBe(true);
    expect(names.every((name) => !/\d/.test(name))).toBe(true);
    expect(names.every((name) => name.length <= 25)).toBe(true);
  });
  it('assigns names town-wide, including commuters, while preserving old identities through saves/sharing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const town = new Town(), home = town.towers()[0];
    home.tower.addFloor('residential'); home.tower.addFloor('residential');
    town.slots[1].unlocked = true; town.slots[1].game = new Game('t1', town.economy);
    const other = town.slots[1].game!;
    town.tick(90);
    const original = home.residents[0], originalName = original.name;
    original.state = { kind: 'idle', floor: 0, activity: { kind: 'lobby', floor: 0 }, until: 100000 };
    home.residents = []; other.residents.push(original);
    for (let i = 0; i < 5; i++) town.tick(90);
    expect(town.population).toBe(6);
    expect(new Set(town.allResidents().map((r) => r.name)).size).toBe(6);
    expect(original.name).toBe(originalName);
    const saved = toSaveData(town);
    for (const restored of [townFromSaveData(saved)!, (await decodeTown(await encodeTown(town)))!]) {
      for (const r of town.allResidents()) expect(restored.allResidents().find((person) => person.id === r.id)?.name).toBe(r.name);
      const before = new Map(restored.allResidents().map((r) => [r.id, r.name]));
      restored.tick(90);
      for (const r of restored.allResidents()) if (before.has(r.id)) expect(r.name).toBe(before.get(r.id));
      expect(new Set(restored.allResidents().map((r) => r.name)).size).toBe(restored.population);
    }
  });
  it('does not silently rename duplicates in an existing save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const town = new Town(), home = town.towers()[0]; home.tower.addFloor('residential');
    town.tick(90); town.tick(90); home.residents.forEach((r) => { r.name = 'Bo'; });
    const loaded = townFromSaveData(toSaveData(town))!;
    expect(loaded.allResidents().map((r) => r.name)).toEqual(['Bo', 'Bo']);
    loaded.tick(90);
    expect(loaded.allResidents().slice(0, 2).map((r) => r.name)).toEqual(['Bo', 'Bo']);
    expect(loaded.allResidents()[2].name).not.toBe('Bo');
  });
});
