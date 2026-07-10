import { describe, expect, it } from 'vitest';
import { Tower } from './tower';
import { generateFloorName } from './floorNames';

describe('floor names', () => {
  it('generates a non-empty two-part name per buildable type', () => {
    for (const type of ['residential', 'shop', 'restaurant', 'office'] as const) {
      const name = generateFloorName(type);
      expect(name.length).toBeGreaterThan(3);
      expect(name).toContain(' ');
    }
  });

  it('lobby gets the fixed name', () => {
    expect(generateFloorName('lobby')).toBe('Lobby');
  });
});

describe('Tower naming', () => {
  it('assigns a generated name on build', () => {
    const tower = new Tower();
    const floor = tower.addFloor('residential');
    expect(floor.name.length).toBeGreaterThan(0);
    expect(tower.floors[0].name).toBe('Lobby');
  });

  it('renameFloor trims, validates, and protects the lobby', () => {
    const tower = new Tower();
    tower.addFloor('shop');
    expect(tower.renameFloor(1, '  My Cool Shop  ')).toBe(true);
    expect(tower.floors[1].name).toBe('My Cool Shop');
    expect(tower.renameFloor(1, '   ')).toBe(false);
    expect(tower.renameFloor(1, 'x'.repeat(60))).toBe(false);
    expect(tower.renameFloor(0, 'Not A Lobby')).toBe(false);
    expect(tower.renameFloor(99, 'Ghost Floor')).toBe(false);
  });
});
