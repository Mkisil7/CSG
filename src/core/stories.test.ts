import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { toSaveData, townFromSaveData } from './save';
import { residentThought, residentConcern } from './stories';
import { visibleGoals } from './goals';
import { Game } from './game';
import { residentPet } from './roomLife';

function neighborhood() {
  const town = new Town();
  const game = town.towers()[0];
  game.tower.addFloor('residential');
  game.tower.addFloor('restaurant', 'coffee');
  const a = createResident(1, game.id, () => 0.1);
  const b = createResident(1, game.id, () => 0.8);
  a.name = 'Maya'; b.name = 'Noah';
  game.residents.push(a, b);
  return { town, game, a, b };
}

describe('resident lives', () => {
  it('routes meal help only to staffed restaurants in the resident’s home or work towers', () => {
    const { town, game, a, b } = neighborhood(); a.needs.food = 10;
    const other = new Game('t1', town.economy), outside = other.tower.addFloor('restaurant');
    town.slots[1] = { id: other.id, unlocked: true, zone: 'mixed', game: other };
    b.jobFloor = outside.level; b.jobTowerId = other.id;
    expect(residentConcern(town, a)?.target).toEqual({ kind: 'happiness' });
    expect(residentConcern(town, a)?.detail).toContain('No staffed restaurant');
    a.jobFloor = other.tower.addFloor('office').level; a.jobTowerId = other.id;
    expect(residentConcern(town, a)?.target).toEqual({ kind: 'floor', towerId: other.id, level: outside.level });
    b.jobFloor = 2; b.jobTowerId = game.id;
    expect(residentConcern(town, a)?.target).toEqual({ kind: 'floor', towerId: game.id, level: 2 });
    const before = JSON.stringify(town); residentThought(town, a); expect(JSON.stringify(town)).toBe(before);
  });

  it('prefers a meal stop in the current home/work tower, not an unrelated empty restaurant', () => {
    const { town, game, a, b } = neighborhood(); a.needs.food = 10;
    b.jobFloor = 2; b.jobTowerId = game.id;
    const work = new Game('t1', town.economy), cafe = work.tower.addFloor('restaurant');
    town.slots[1] = { id: work.id, unlocked: true, zone: 'mixed', game: work };
    a.jobFloor = cafe.level; a.jobTowerId = work.id;
    game.residents = [b]; work.residents = [a];
    expect(residentConcern(town, a)?.target).toEqual({ kind: 'floor', towerId: work.id, level: cafe.level });
  });

  it('offers accessible staffed leisure or free landmarks without inventing a visit', () => {
    const { town, game, a, b } = neighborhood(); a.needs.entertainment = 0;
    a.jobFloor = 2; a.jobTowerId = game.id;
    const shop = game.tower.addFloor('shop');
    expect(residentConcern(town, a)?.target).toEqual({ kind: 'happiness' });
    b.jobFloor = shop.level; b.jobTowerId = game.id;
    expect(residentConcern(town, a)?.target).toEqual({ kind: 'floor', towerId: game.id, level: shop.level });
    b.jobFloor = null; b.jobTowerId = null;
    const landmark = game.tower.addFloor('landmark'); landmark.landmark = 'gallery';
    const before = JSON.stringify(town);
    expect(residentConcern(town, a)?.target).toEqual({ kind: 'floor', towerId: game.id, level: landmark.level });
    expect(residentConcern(town, a)?.detail).toContain('does not start a visit');
    expect(JSON.stringify(town)).toBe(before);
  });

  it('lets a happy working neighbor describe their day instead of complaining about an ordinary full home', () => {
    const { town, game, a } = neighborhood();
    a.jobFloor = 2; a.jobTowerId = game.id; a.needs.housing = 60; a.needs.employment = 60; a.happiness = 77;
    a.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 1000 };
    const snapshot = () => ({ ...toSaveData(town), savedAtWallClock: 0 });
    const before = JSON.stringify(snapshot());
    expect(residentConcern(town, a)).toBeNull();
    expect(residentThought(town, a)).toContain(`on shift at ${game.tower.floors[2].name}`);
    expect(JSON.stringify(snapshot())).toBe(before);
  });
  it('prioritizes severe missed meals over mild queues, then follows actual lift relief', () => {
    const { town, game, a } = neighborhood();
    a.jobFloor = 2; a.jobTowerId = game.id; a.needs.food = 10;
    game.averageWait = () => 21;
    expect(residentConcern(town, a)?.kind).toBe('food');
    a.needs.food = 100; game.averageWait = () => 50;
    expect(residentConcern(town, a)).toMatchObject({ kind: 'lift', pressure: 20, target: { kind: 'transit', towerId: game.id } });
    expect(residentThought(town, a)).toContain("home tower's average");
    game.averageWait = () => 5;
    expect(residentThought(town, a)).not.toContain('lift wait');
  });
  it('does not claim every senior role is occupied from an old blocked-day count', () => {
    const { town, game, a } = neighborhood();
    a.jobFloor = 2; a.jobTowerId = game.id; a.blockedDays = 2;
    expect(residentConcern(town, a)).toMatchObject({ kind: 'promotion', target: { kind: 'floor', towerId: game.id, level: 2 } });
    expect(residentThought(town, a)).toContain('waited 2 days');
    expect(residentThought(town, a)).not.toContain('every senior role is filled');
  });
  it('respects transit commute relief and describes a base route rather than a live ETA', () => {
    const { town, a } = neighborhood();
    const job = new Game('t2', town.economy, 'mixed'); job.tower.addFloor('office');
    town.slots[2] = { id: job.id, unlocked: true, zone: 'mixed', game: job };
    a.jobTowerId = job.id; a.jobFloor = 1;
    const ordinary = residentConcern(town, a)!;
    expect(ordinary.kind).toBe('commute'); expect(ordinary.text).toContain('before weather and lift waits');
    const transit = new Game('t2', town.economy, 'transit'); transit.tower.addFloor('office');
    town.slots[2] = { id: transit.id, unlocked: true, zone: 'transit', game: transit };
    expect(residentConcern(town, a)?.pressure ?? 0).toBeLessThan(ordinary.pressure);
  });
  it('mentions established friends only when actually sharing the activity and room', () => {
    const { town, game, a, b } = neighborhood();
    for (const r of [a, b]) {
      r.jobFloor = 2; r.jobTowerId = game.id;
      r.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 10000 };
    }
    for (let i = 0; i < 3; i++) { town.time += 1440; town.stories.update(town); }
    expect(residentThought(town, a)).toContain('good to see Noah here');
    b.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 10000 };
    expect(residentThought(town, a)).not.toContain('Noah');
    b.state = { kind: 'idle', floor: 2, activity: { kind: 'eat', floor: 2 }, until: 10000 };
    expect(residentThought(town, a)).not.toContain('Noah');
    b.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 10000 };
    a.unhappyDays = 2; a.needs.food = 0;
    expect(residentThought(town, a)).toContain('3 more unhappy days');
    expect(residentThought(town, a)).not.toContain('good to see');
    const other = new Game('t1', town.economy); town.slots[1].game = other; town.slots[1].unlocked = true;
    game.residents = [a]; other.residents.push(b); a.unhappyDays = 0; a.needs.food = 100;
    expect(residentThought(town, a)).not.toContain('Noah');
  });
  it('mentions the actual household pet only while at home', () => {
    const { town, game } = neighborhood();
    let r = createResident(1, game.id);
    for (let i = 0; i < 20 && !residentPet(r); i++) r = createResident(1, game.id);
    expect(residentPet(r)).not.toBeNull();
    r.jobFloor = 2; r.jobTowerId = game.id; game.residents.push(r);
    r.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 1000 };
    expect(residentThought(town, r)).toContain(`Home with ${residentPet(r)!.name}`);
    r.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 1000 };
    expect(residentThought(town, r)).not.toContain('Home with');
  });
  it('records arrivals and career changes once, including a job on the arrival tick', () => {
    const { town, game, a } = neighborhood();
    a.jobFloor = 2; a.jobTowerId = game.id;
    town.stories.update(town);
    expect(town.stories.people[a.id].memories.map((s) => s.kind)).toEqual(['arrival', 'career']);
    town.time += 2;
    a.jobTier = 1;
    town.stories.update(town);
    expect(town.stories.people[a.id].memories.slice(-1)[0]?.text).toContain('Chef');
    const count = town.stories.journal.length;
    town.time += 2;
    town.stories.update(town);
    expect(town.stories.journal).toHaveLength(count);
  });

  it('forms mutual friendships only after meeting on three distinct days', () => {
    const { town, a, b } = neighborhood();
    for (const r of [a, b]) r.state = { kind: 'idle', floor: 2, activity: { kind: 'eat', floor: 2 }, until: 10000 };
    town.stories.update(town);
    for (let i = 0; i < 10; i++) { town.time += 2; town.stories.update(town); }
    expect(town.stories.people[a.id].friends[0].daysTogether).toBe(1);
    town.time += 1440; town.stories.update(town);
    expect(town.stories.journal.filter((s) => s.kind === 'friendship')).toHaveLength(0);
    town.time += 1440; town.stories.update(town);
    expect(town.stories.people[a.id].friends[0].daysTogether).toBe(3);
    expect(town.stories.people[b.id].friends[0].residentId).toBe(a.id);
    expect(town.stories.journal.filter((s) => s.kind === 'friendship')).toHaveLength(1);
  });

  it('does not invent relationships between residents on different floors', () => {
    const { town, a, b } = neighborhood();
    a.state = { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 10000 };
    b.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 10000 };
    for (let i = 0; i < 4; i++) { town.time += 1440; town.stories.update(town); }
    expect(town.stories.people[a.id].friends).toHaveLength(0);
  });

  it('remembers concerns, recovery and departures without repeated daily warnings', () => {
    const { town, game, a } = neighborhood();
    town.stories.update(town);
    a.unhappyDays = 2; a.happiness = 20;
    town.time += 2; town.stories.update(town);
    expect(residentThought(town, a)).toContain('3 more unhappy days');
    town.time += 2; town.stories.update(town);
    expect(town.stories.journal.filter((s) => s.kind === 'concern')).toHaveLength(1);
    a.unhappyDays = 0; a.happiness = 75;
    town.time += 2; town.stories.update(town);
    expect(town.stories.journal.slice(-1)[0]?.kind).toBe('recovery');
    game.residents = game.residents.filter((r) => r.id !== a.id);
    town.time += 2; town.stories.update(town);
    expect(town.stories.journal.slice(-1)[0]?.kind).toBe('departure');
    expect(town.stories.people[a.id]).toBeUndefined();
  });

  it('preserves stories, friendships and mission streaks through saves without replaying events', () => {
    const { town, a, b } = neighborhood();
    for (const r of [a, b]) r.state = { kind: 'idle', floor: 2, activity: { kind: 'eat', floor: 2 }, until: 10000 };
    town.stories.update(town);
    town.missions.streaks['happy-town'] = 2;
    const save = JSON.parse(JSON.stringify(toSaveData(town)));
    const loaded = townFromSaveData(save)!;
    expect(loaded.stories.people[a.id].friends).toEqual(town.stories.people[a.id].friends);
    expect(loaded.missions.streaks['happy-town']).toBe(2);
    const count = loaded.stories.journal.length;
    loaded.stories.update(loaded);
    expect(loaded.stories.journal).toHaveLength(count);
    loaded.stories.people[a.id].friends[0].daysTogether++;
    expect(save.stories.people[a.id].friends[0].daysTogether).toBe(1);
  });

  it('loads old saves quietly without giving existing residents a fictitious arrival day', () => {
    const { town, a } = neighborhood();
    const data = toSaveData(town);
    delete data.stories; delete data.missionStreaks;
    const loaded = townFromSaveData(data)!;
    loaded.stories.update(loaded);
    expect(loaded.stories.people[a.id].arrivalDay).toBeNull();
    expect(loaded.stories.journal).toHaveLength(0);
    expect(loaded.missions.streaks).toEqual({});
  });

  it('bounds memory and journal growth', () => {
    const { town, a } = neighborhood();
    town.stories.update(town);
    for (let i = 0; i < 200; i++) town.stories.record(1, 'career', [a.id], 'Milestone', 'A chapter');
    expect(town.stories.journal).toHaveLength(80);
    expect(town.stories.people[a.id].memories).toHaveLength(8);
  });
});

describe('visible ambitions', () => {
  it('offers all three horizons from the first minute and uses real mission rewards', () => {
    const goals = visibleGoals(new Town());
    expect(goals.map((g) => g.horizon)).toEqual(['Right now', 'This session', 'Your growing town']);
    expect(goals[0].title).toContain('first neighbors');
    expect(goals[1]).toMatchObject({ id: 'first-neighbors', current: 0, total: 10, reward: 200 });
  });

  it('prioritizes people at risk and advances past already rewarded milestones', () => {
    const { town, a } = neighborhood();
    a.unhappyDays = 3;
    town.missions.completed.add('first-neighbors');
    const goals = visibleGoals(town);
    expect(goals[0].target).toEqual({ kind: 'resident', residentId: a.id });
    expect(goals[1].id).toBe('first-meal');
    town.missions.completed.add('first-meal');
    expect(visibleGoals(town)[1].id).toBe('fully-staffed');
  });
});
