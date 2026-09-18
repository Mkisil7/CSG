import { describe, expect, it } from 'vitest';
import { CityEventSystem, type CityEventsSave } from './events';
import { Town } from './town';
import { toSaveData, townFromSaveData } from './save';

const savedBonus = (): CityEventsSave => ({ active: [
  { id: 'evt1', kind: 'festival', startDay: 2, endsDay: 5 },
  { id: 'evt2', kind: 'tourism', startDay: 2, endsDay: 6 },
], nextAtDay: 4, seq: 3 });

describe('retired random director and saved positive bonuses', () => {
  it('never fabricates happenings in a new town, even across a large time jump', () => {
    const system = new CityEventSystem();
    for (const day of [1, 2, 20, 100, 10000]) {
      expect(system.update(day)).toEqual({ ended: [] }); expect(system.active).toHaveLength(0);
      expect(system.incomeMultiplier()).toBe(1); expect(system.moodBonus()).toBe(0);
    }
  });
  it('honors saved positive effects and expires each once without replacements', () => {
    const system = new CityEventSystem(); system.restore(savedBonus(), 3);
    expect(system.active).toHaveLength(2);
    expect(system.incomeMultiplier()).toBeCloseTo(1.7 * 1.5); expect(system.moodBonus()).toBe(11);
    expect(system.update(3).ended).toHaveLength(0);
    expect(system.update(5).ended.map((event) => event.kind)).toEqual(['festival']);
    expect(system.update(5).ended).toHaveLength(0);
    expect(system.update(6).ended.map((event) => event.kind)).toEqual(['tourism']);
    expect(system.update(100).ended).toHaveLength(0); expect(system.active).toHaveLength(0);
  });
  it('does not restore recession, heatwave or rain penalties from an older save', () => {
    const system = new CityEventSystem();
    system.restore({ active: ['recession', 'heatwave', 'rain'].map((kind, index) =>
      ({ id: `evt${index}`, kind, startDay: 2, endsDay: 4 })) } as CityEventsSave, 3);
    expect(system.active).toHaveLength(0); expect(system.incomeMultiplier()).toBe(1); expect(system.moodBonus()).toBe(0);
  });
  it('restores old saves without restarting their retired schedule', () => {
    const system = new CityEventSystem(); system.restore(undefined, 200);
    expect(system.update(201)).toEqual({ ended: [] });
    system.restore({ active: [], nextAtDay: 1, seq: 500 }, 200);
    expect(system.update(99999)).toEqual({ ended: [] });
  });
  it('bounds valid legacy bonuses and rejects duplicate, expired and impossible entries', () => {
    const system = new CityEventSystem(); const saved = savedBonus();
    saved.active.unshift({ id: 'evt0', kind: 'boom', startDay: 1, endsDay: 500 });
    saved.active.push({ id: 'evt8', kind: 'tourism', startDay: 2, endsDay: 6 });
    system.restore(saved, 3); expect(system.active).toHaveLength(2);
    system.restore(saved, 7); expect(system.active).toHaveLength(0);
  });
  it('describes compatibility bonuses without inventing crowds or a celebrity resident', () => {
    const system = new CityEventSystem();
    system.restore({ active: [{ id: 'evt1', kind: 'celebrity', startDay: 2, endsDay: 6 }] }, 3);
    expect(system.active[0].title).toBe('Saved community buzz');
    expect(system.active[0].blurb).toContain('No fictional resident');
    expect(system.active[0].moodBonus).toBe(10);
  });
  it('round-trips remaining bonuses independently of their source objects', () => {
    const town = new Town(); town.time = 2 * 1440;
    town.cityEvents.restore(savedBonus(), town.day);
    const save = toSaveData(town), loaded = townFromSaveData(save)!;
    expect(loaded.cityEvents.snapshot()).toEqual(town.cityEvents.snapshot());
    expect(loaded.economy.eventMultiplier).toBeCloseTo(2.55);
    loaded.cityEvents.active[0].endsDay = 4;
    expect(save.cityEvents!.active[0].endsDay).toBe(5);
  });
  it('does not apply surprise economic or mood penalties during a fresh-town simulation', () => {
    const town = new Town();
    for (let i = 0; i < 24 * 30; i++) town.tick(60);
    expect(town.cityEvents.active).toHaveLength(0); expect(town.economy.eventMultiplier).toBe(1);
    expect(town.cityEvents.moodBonus()).toBe(0); expect(town.neighborhood.events).toHaveLength(0);
    expect(town.activityLog.some((event) => /Recession|Celebrity|Street Festival/.test(event.message))).toBe(false);
  });
});
