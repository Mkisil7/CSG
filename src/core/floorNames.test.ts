import { describe, expect, it, vi } from 'vitest';
import { generateFloorName, MAX_FLOOR_NAME_LENGTH } from './floorNames';
import { BUSINESS_SUBTYPES, type BusinessSubtype, type JobFloorType } from './types';
import { Tower } from './tower';
import { Town } from './town';
import { toSaveData, townFromSaveData } from './save';
import { encodeTown, decodeTown } from './share';

const suffixes: Record<BusinessSubtype, RegExp> = {
  grocery: / (Market|Grocers|Pantry)$/, boutique: / (Boutique|Clothiers|Wardrobe)$/,
  electronics: / (Electronics|Gadgets|Tech Shop)$/, coffee: / (Coffee|Café|Coffee House|Roasters)$/,
  fastfood: / (Diner|Quick Bites|Takeaway)$/, 'fine-dining': / (Bistro|Dining Room|Table)$/,
  bar: / (Bar|Lounge|Social Club)$/, creative: / (Studios|Design House|Creative)$/,
  tech: / (Labs|Systems|Technologies)$/, law: / (Legal|Law Partners|Law Offices)$/,
  assembly: / (Works|Assembly|Manufacturing)$/, foodproc: / (Foodworks|Provisions|Food Co\.)$/,
  'electronics-fab': / (Circuits|Microdevices|Electronics Fab)$/,
};
const businesses = Object.entries(BUSINESS_SUBTYPES).flatMap(([type, profiles]) =>
  profiles.map(({ subtype }) => ({ type: type as JobFloorType, subtype })));

describe('business names belong to the chosen room', () => {
  it.each(businesses)('$subtype gets varied, readable names fitting its trade', ({ type, subtype }) => {
    const names = new Set<string>();
    // Sampling every 1/100 reaches every component in all current name pools.
    for (let first = 0; first < 100; first++) for (let second = 0; second < 100; second++) {
      let draw = 0;
      const name = generateFloorName(type, () => draw++ === 0 ? first / 100 : second / 100, subtype);
      expect(draw).toBe(2);
      expect(name).toMatch(suffixes[subtype]);
      expect(name.length).toBeLessThanOrEqual(MAX_FLOOR_NAME_LENGTH);
      expect(name).not.toMatch(/undefined|\s{2}/);
      names.add(name);
    }
    expect(names.size).toBeGreaterThanOrEqual(18);
  });
  it('uses the resolved default subtype with exactly two random draws per business', () => {
    for (const type of Object.keys(BUSINESS_SUBTYPES) as JobFloorType[]) {
      const tower = new Tower(), rand = vi.fn(() => 0);
      const floor = tower.addFloor(type, undefined, rand);
      expect(floor.subtype).toBe(BUSINESS_SUBTYPES[type][0].subtype);
      expect(floor.name).toMatch(suffixes[floor.subtype!]);
      expect(rand).toHaveBeenCalledTimes(2);
    }
  });
  it('keeps generic callers and unrelated floor types compatible', () => {
    expect(generateFloorName('restaurant', () => 0)).toBe('The Daily Grind Café');
    expect(generateFloorName('shop', () => 0, 'law')).toBe('The Corner Boutique');
    expect(generateFloorName('residential', () => 0, 'coffee')).toBe('Maple Apartments');
    const rand = vi.fn(() => 0);
    expect(generateFloorName('lobby', rand)).toBe('Lobby');
    expect(rand).not.toHaveBeenCalled();
  });
  it('preserves generated, legacy and player names through saving and shared towns', async () => {
    const town = new Town(), tower = town.towers()[0].tower;
    for (const { type, subtype } of businesses) tower.addFloor(type, subtype, () => 0.5);
    tower.floors[1].name = 'Noodle Cloud Kitchen'; // Legacy mismatched names stay owned by the player.
    tower.renameFloor(2, 'Maya’s Little Wardrobe');
    const before = tower.floors.map((floor) => ({ name: floor.name, subtype: floor.subtype }));
    for (const restored of [townFromSaveData(toSaveData(town))!, (await decodeTown(await encodeTown(town)))!]) {
      expect(restored.towers()[0].tower.floors.map((floor) => ({ name: floor.name, subtype: floor.subtype }))).toEqual(before);
      expect(restored.towers()[0].tower.addFloor('restaurant', 'coffee', () => 0).name).toBe('Copper Kettle Coffee');
    }
  });
});
