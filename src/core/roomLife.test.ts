import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { residentPet, roomPoses, ROOM_LIFE, roomJitter } from './roomLife';
import { toSaveData, townFromSaveData } from './save';
import type { ActivityKind } from './types';

function fixture() {
  const town = new Town(), game = town.towers()[0]; town.time = 605;
  game.tower.addFloor('restaurant', 'coffee'); game.tower.addFloor('restaurant', 'fine-dining');
  game.tower.addFloor('office', 'tech'); game.tower.addFloor('residential');
  const person = (floor: number, activity: ActivityKind) => {
    const r = createResident(4, game.id); r.jobFloor = floor; r.jobTowerId = game.id;
    r.state = { kind: 'idle', floor, activity: { kind: activity, floor }, startedAt: 605, until: 900 };
    game.residents.push(r); return r;
  };
  return { town, game, person, poses: () => roomPoses(game.tower.floors, game.residents, game.id, town.time) };
}

describe('inhabited room staging', () => {
  it('stages workers only at their actual assigned workplace, never waiting or absent staff', () => {
    const { person, poses } = fixture();
    const barista = person(1, 'work'), chef = person(2, 'work'), absent = person(1, 'work');
    chef.jobTier = 1;
    absent.state = { kind: 'waiting', floor: 0, to: 1 };
    const staleJob = person(1, 'work'); staleJob.jobFloor = 3;
    const elsewhere = person(2, 'work'); elsewhere.jobTowerId = 't1';
    const result = poses();
    expect(result.get(barista.id)).toMatchObject({ action: 'barista', x: ROOM_LIFE.coffee.staffX });
    expect(result.get(chef.id)?.action).toBe('chef');
    for (const r of [absent, staleJob, elsewhere]) expect(result.has(r.id)).toBe(false);
  });

  it('shows real café customers collecting their drink, then seated at an actual table', () => {
    const { town, person, poses } = fixture();
    const a = person(1, 'eat'), b = person(1, 'eat');
    const coins = town.economy.coins;
    expect(poses().get(a.id)?.action).toBe('collect-coffee');
    expect(poses().get(a.id)?.x).not.toBe(poses().get(b.id)?.x);
    town.time += 8;
    expect(poses().get(a.id)).toMatchObject({ action: 'drink-coffee', seated: true });
    const x = poses().get(a.id)!.x;
    expect(Math.abs(x - ROOM_LIFE.diningX[0] - roomJitter(1, 0))).toBeCloseTo(0.78);
    expect(town.economy.coins).toBe(coins);
  });

  it('does not replay a drink collection for an old save without an activity start time', () => {
    const { person, poses } = fixture(); const r = person(1, 'eat');
    if (r.state.kind === 'idle') delete r.state.startedAt;
    expect(poses().get(r.id)?.action).toBe('drink-coffee');
  });

  it('requires two physically present coworkers for meetings and returns them to desks afterward', () => {
    const { town, person, poses } = fixture(); const a = person(3, 'work');
    expect(poses().get(a.id)?.action).toBe('typing');
    const b = person(3, 'work'), c = person(3, 'work');
    expect([...poses().values()].filter((p) => p.action === 'meeting')).toHaveLength(2);
    expect([...poses().values()].filter((p) => p.action === 'typing')).toHaveLength(1);
    town.time = 625;
    for (const r of [a, b, c]) expect(poses().get(r.id)?.action).toBe('typing');
  });

  it('keeps actor assignment deterministic and crowded café visitors inside the room', () => {
    const { game, town, person, poses } = fixture();
    for (let i = 0; i < 90; i++) person(1, 'eat');
    const before = poses(); game.residents.reverse(); expect(poses()).toEqual(before);
    for (const offset of [0, 10]) {
      town.time = 605 + offset;
      for (const pose of poses().values()) {
        expect(pose.x).toBeGreaterThan(-6.5); expect(pose.x).toBeLessThan(8.5);
        expect(pose.z).toBeGreaterThan(-3); expect(pose.z).toBeLessThan(3);
      }
    }
  });

  it('keeps pet names stable through save/reload and excludes visitor IDs and lobby residents', () => {
    const { town, game, person } = fixture();
    for (let i = 0; i < 8; i++) person(4, 'home');
    const owner = game.residents.find((r) => residentPet(r))!;
    expect(owner).toBeDefined();
    const restored = townFromSaveData(toSaveData(town))!;
    expect(residentPet(restored.allResidents().find((r) => r.id === owner.id)!)).toEqual(residentPet(owner));
    expect(residentPet({ id: 'guest2', homeFloor: 4 })).toBeNull();
    expect(residentPet({ id: owner.id, homeFloor: 0 })).toBeNull();
  });

  it('spreads a full household across actual seats and settles them after their own bedtimes', () => {
    const { town, person, poses } = fixture();
    const people = Array.from({ length: 4 }, () => person(4, 'home'));
    people.forEach((r) => { r.nocturnal = false; }); people[0].nocturnal = true;
    expect(new Set([...poses().values()].map((p) => `${p.x}:${p.z}`)).size).toBe(4);
    expect([...poses().values()].every((p) => p.seated && p.action === 'reading')).toBe(true);
    town.time = 23 * 60;
    expect(poses().get(people[0].id)?.action).toBe('reading');
    people.slice(1).forEach((r) => expect(poses().get(r.id)?.action).toBe('resting'));
    town.time = 3 * 60;
    expect([...poses().values()].every((p) => p.action === 'resting')).toBe(true);
  });
});
