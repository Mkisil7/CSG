import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { Game } from './game';
import { attractiveness, districts } from './identity';
import { createResident } from './residents';
import { toSaveData, townFromSaveData } from './save';

describe('a town of your own', () => {
  it('derives neighborhood character from the businesses actually built', () => {
    const town = new Town();
    town.towers()[0].tower.addFloor('office', 'creative');
    expect(districts(town)[0].theme).toBe('The Arts Quarter');
    town.identity.renameDistrict(0, 'Maple Quarter');
    town.towers()[0].tower.addFloor('office', 'tech');
    town.towers()[0].tower.addFloor('office', 'tech');
    expect(districts(town)[0]).toMatchObject({ name: 'Maple Quarter', theme: 'Midtown Tech' });
  });

  it('earns architecture through growth and retains it when population later falls', () => {
    const town = new Town();
    const game = town.towers()[0];
    game.residents = Array.from({ length: 20 }, () => createResident(1, game.id));
    const events = town.identity.update(town);
    expect(town.identity.unlocked.has('modern')).toBe(true);
    expect(events.some((e) => e.message.includes('Modern'))).toBe(true);
    game.residents = []; town.time += 2;
    expect(town.identity.update(town)).toHaveLength(0);
    expect(town.identity.unlocked.has('modern')).toBe(true);
  });

  it('earns park-dependent rooftop rewards only when both prerequisites hold', () => {
    const town = new Town();
    town.slots[1].unlocked = true; town.slots[1].zone = 'park';
    town.identity.update(town);
    expect(town.identity.unlocked.has('garden')).toBe(true);
    expect(town.identity.unlocked.has('roof-garden')).toBe(false);
    town.towers()[0].residents = Array.from({ length: 12 }, () => createResident(1, 't0'));
    town.time += 2; town.identity.update(town);
    expect(town.identity.unlocked.has('roof-garden')).toBe(true);
  });

  it('requires quality, staffing and activity before awarding a Signature business once', () => {
    const town = new Town(), game = town.towers()[0];
    const shop = game.tower.addFloor('shop', 'grocery'); shop.quality = 90;
    const worker = createResident(1, game.id); worker.jobTowerId = game.id; worker.jobFloor = shop.level;
    game.residents.push(worker);
    town.stories.update(town); town.identity.update(town);
    expect(shop.signature).toBeUndefined();
    shop.visitsToday = 8; town.time += 2;
    const events = town.identity.update(town);
    expect(shop.signature).toBe(true);
    expect(events.some((e) => e.message.includes('Signature'))).toBe(true);
    expect(town.stories.journal.slice(-1)[0].kind).toBe('place');
    expect(town.stories.journal.slice(-1)[0].place).toEqual({ kind: 'floor', towerId: game.id, level: shop.level });
    town.time += 2;
    expect(town.identity.update(town).filter((e) => e.message.includes('Signature'))).toHaveLength(0);
  });

  it('round-trips names, style, permanent rewards and Signature floors with visit data', () => {
    const town = new Town(), game = town.towers()[0];
    town.identity.rename('Juniper'); town.identity.renameDistrict(0, 'The Old Town');
    game.rename('Willow House'); game.architecture = 'modern';
    town.identity.unlocked.add('modern');
    game.tower.addFloor('shop', 'boutique').signature = true;
    const loaded = townFromSaveData(JSON.parse(JSON.stringify(toSaveData(town))))!;
    expect(loaded.identity.name).toBe('Juniper');
    expect(districts(loaded)[0].name).toBe('The Old Town');
    expect(loaded.towers()[0]).toMatchObject({ name: 'Willow House', architecture: 'modern' });
    expect(loaded.towers()[0].tower.floors[1].signature).toBe(true);
  });

  it('rejects unusable names and excludes locked empty lots from neighborhood identity', () => {
    const town = new Town();
    expect(town.identity.rename('   ')).toBe(false);
    expect(town.identity.rename('x'.repeat(33))).toBe(false);
    expect(town.identity.renameDistrict(99, 'No district')).toBe(false);
    expect(districts(town)).toHaveLength(1);
    expect(town.towers()[0].rename('  Willow   House  ')).toBe(true);
    expect(town.towers()[0].name).toBe('Willow House');
  });

  it('bases attractiveness on amenities and wellbeing rather than wallet size', () => {
    const town = new Town();
    expect(attractiveness(town).score).toBe(0);
    town.towers()[0].residents.push(createResident(1, 't0'));
    const before = attractiveness(town).score;
    town.economy.coins = 100000;
    expect(attractiveness(town).score).toBe(before);
    town.slots[1].unlocked = true; town.slots[1].zone = 'park';
    town.slots[2].unlocked = true; town.slots[2].game = new Game('t2', town.economy);
    town.slots[2].game.tower.addFloor('restaurant', 'coffee');
    expect(attractiveness(town).score).toBeGreaterThan(before);
  });
});
