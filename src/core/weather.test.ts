import { describe, expect, it } from 'vitest';
import { TownWeather, weatherCoffeeMultiplier, weatherTravelMultiplier, type WeatherKind } from './weather';
import { Town } from './town';
import { Game } from './game';
import { Economy } from './economy';
import { createResident } from './residents';
import { toSaveData, townFromSaveData } from './save';
import { commuteMinutesBetween, streetJourneyPosition, TOWER_SLOT_ORIGINS } from './townLayout';

function periodOf(weather: TownWeather, kind: WeatherKind): number {
  for (let time = 1440; time < 1440 * 64; time += 720) if (weather.at(time) === kind) return time;
  throw new Error(`No ${kind} period`);
}

describe('seasonal weather', () => {
  it('starts gently, includes rain and winter snow, and has a repeatable forecast', () => {
    const a = new TownWeather(42), b = new TownWeather(42);
    expect(a.at(480)).toBe('clear');
    const seen = new Set<WeatherKind>();
    for (let time = 0; time < 1440 * 64; time += 720) {
      expect(a.at(time)).toBe(b.at(time)); seen.add(a.at(time));
      if (a.at(time) === 'snow') expect(a.seasonAt(time)).toBe('Winter');
    }
    expect([...seen].sort()).toEqual(['clear', 'rain', 'snow']);
    expect(a.seasonAt(8 * 1440)).toBe('Summer');
  });

  it('accumulates surfaces consistently across small ticks and offline-sized steps', () => {
    const small = new TownWeather(42), large = new TownWeather(42);
    const end = periodOf(large, 'snow') + 500;
    for (let t = 10; t < end; t += 10) small.update(t);
    small.update(end); large.update(end);
    expect(small.snow).toBeCloseTo(large.snow, 10);
    expect(small.wetness).toBeCloseTo(large.wetness, 10);
    expect(large.snow).toBeGreaterThan(0.9);
    const snapshot = large.snapshot();
    large.update(end); large.update(end - 20); large.update(NaN);
    expect(large.snapshot()).toEqual(snapshot);
  });

  it('retains forecasts and surface buildup through a save and supports old saves', () => {
    const town = new Town(); town.weather = new TownWeather(99);
    town.time = periodOf(town.weather, 'snow') + 400;
    town.weather.update(town.time);
    const data = toSaveData(town);
    const copy = townFromSaveData(data)!;
    expect(copy.weather.snapshot()).toEqual(town.weather.snapshot());
    expect(copy.weather.kind).toBe('snow');
    town.weather.update(town.time + 2000); copy.weather.update(town.time + 2000);
    expect(copy.weather.snapshot()).toEqual(town.weather.snapshot());
    delete data.weather;
    expect(townFromSaveData(data)!.weather.snow).toBe(0);
  });

  it('bounds invalid saved surface values without accepting a future observation', () => {
    const weather = new TownWeather();
    weather.restore({ seed: 1, snow: 12, wetness: NaN, observedAt: 999999 }, 480);
    expect(weather.snapshot()).toMatchObject({ snow: 1, wetness: 0, observedAt: 480 });
  });
});

describe('weather connected to residents and businesses', () => {
  it('slows only outdoor trips and mitigates delays at sheltered entrances', () => {
    const game = new Game('t0', new Economy());
    const normal = commuteMinutesBetween('t0', 't1');
    expect(game.streetTravelMinutes('t1')).toBe(normal);
    game.weather = 'rain'; expect(game.streetTravelMinutes('t1')).toBeCloseTo(normal * 1.12);
    game.shelteredTowers = new Set(['t0']);
    expect(game.streetTravelMinutes('t1')).toBeCloseTo(normal * 1.078);
    game.shelteredTowers = new Set(['t0', 't1']);
    expect(game.streetTravelMinutes('t1')).toBeCloseTo(normal * 1.036);
    expect(game.streetTravelMinutes('t0')).toBe(0);
    expect(weatherTravelMultiplier('clear', 2)).toBe(1);
    expect(weatherTravelMultiplier('snow', 0)).toBe(1.22);
  });

  it('schedules a real weather-adjusted commute with a renderable departure time', () => {
    const g = new Game('t0', new Economy()); g.weather = 'snow';
    const r = createResident(1, 't0'); r.jobTowerId = 't1'; r.jobFloor = 2;
    r.workStart = 540; r.workEnd = 1020;
    r.state = { kind: 'idle', floor: 0, activity: { kind: 'lobby', floor: 0 }, until: 0 };
    g.residents.push(r); g.tick(0, 540);
    expect(r.state).toEqual({ kind: 'commuting', toTowerId: 't1', startedAt: 540, until: 540 + g.streetTravelMinutes('t1') });
  });

  it('applies the rainy cafe premium only on an actual completed visit', () => {
    const revenue = (weather: WeatherKind, subtype: 'coffee' | 'fastfood') => {
      const g = new Game('t0', new Economy()); g.weather = weather;
      g.tower.addFloor('restaurant', subtype);
      const r = createResident(1, 't0');
      r.state = { kind: 'stairs', from: 0, to: 1, startedAt: 0, until: 10 };
      r.pendingActivity = { activity: { kind: 'eat', floor: 1 }, duration: 30 };
      g.residents.push(r);
      g.tick(0, 9); expect(g.tower.floors[1].revenueToday).toBe(0);
      g.tick(0, 10); expect(g.tower.floors[1].visitsToday).toBe(1);
      return g.tower.floors[1].revenueToday;
    };
    expect(weatherCoffeeMultiplier('rain')).toBe(1.15);
    expect(revenue('rain', 'coffee')).toBeGreaterThan(revenue('clear', 'coffee'));
    expect(revenue('snow', 'fastfood')).toBe(revenue('clear', 'fastfood'));
  });

  it('propagates weather and permanent canopy rewards into the live tower sim', () => {
    const town = new Town(); town.weather = new TownWeather(42);
    town.time = periodOf(town.weather, 'rain') + 10;
    town.identity.unlocked.add('canopy'); town.tick(0);
    expect(town.towers()[0].weather).toBe('rain');
    expect(town.towers()[0].shelteredTowers.has('t0')).toBe(true);
  });

  it('walks out to the street and into the destination rather than crossing rooms', () => {
    const a = TOWER_SLOT_ORIGINS[0], b = TOWER_SLOT_ORIGINS[1];
    expect(streetJourneyPosition('t0', 't1', 0)).toEqual({ x: a.x + 1, z: 1.6 });
    expect(streetJourneyPosition('t0', 't1', 0.5)).toEqual({ x: (a.x + b.x) / 2 + 1, z: 8.5 });
    const end = streetJourneyPosition('t0', 't1', 1);
    expect(end.x).toBe(b.x + 1); expect(end.z).toBeCloseTo(1.6);
    for (let p = 0; p <= 1; p += 0.01) {
      const f = streetJourneyPosition('t0', 't1', p), r = streetJourneyPosition('t1', 't0', 1 - p);
      expect(f.x).toBeCloseTo(r.x); expect(f.z).toBeCloseTo(r.z);
    }
  });
});
