import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CharacterViews } from './characters';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { roomPoses, ROOM_LIFE } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { ElevatorSystem } from '../core/elevator';
import { floorY } from './layout';

afterEach(() => { vi.unstubAllGlobals(); });

function transforms(actor: THREE.Object3D) {
  const result: unknown[] = [];
  actor.traverse(o => result.push([o.visible, o.position.toArray(), o.rotation.toArray()]));
  return result;
}

describe('resident placement on first visible frame', () => {
  it.each(['conservatory', 'gallery', 'observatory'] as const)('restores %s visitors in distinct places while paused, with no invented visits', kind => {
    const town = new Town(), game = town.towers()[0];
    game.tower.addFloor('residential');
    const floor = game.tower.addFloor('landmark'); floor.landmark = kind;
    floor.landmarkVisits = 5; floor.visitsToday = 5; town.time = 1100;
    for (let i = 0; i < 5; i++) {
      const r = createResident(1, game.id);
      r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'leisure', floor: floor.level }, until: 1140 };
      game.residents.push(r);
    }
    const loaded = townFromSaveData(toSaveData(town))!;
    const restored = loaded.towers()[0], before = toSaveData(loaded);
    const view = new CharacterViews(new THREE.Group(), game.id, { x: 30, z: 5 });
    const sync = () => view.sync(restored.residents, [], 0, loaded.time, 'clear', restored.tower.floors);
    sync(); const actors = view.pickTargets(); expect(actors).toHaveLength(5);
    const poses = roomPoses(restored.tower.floors, restored.residents, game.id, loaded.time);
    actors.forEach(actor => {
      const pose = poses.get(actor.userData.residentId)!;
      expect(actor.position.toArray()).toEqual([pose.x, floorY(floor.level), pose.z]);
      expect(actor.rotation.y).toBe(pose.facing);
      if (pose.action === 'reading') expect(actor.getObjectByName('room-book')?.visible).toBe(true);
    });
    expect(new Set(actors.map(a => a.position.toArray().join(','))).size).toBe(5);
    const frozen = actors.map(transforms);
    for (let i = 0; i < 10; i++) sync();
    expect(actors.map(transforms)).toEqual(frozen);
    expect({ ...toSaveData(loaded), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
    view.sync([], [], 0); expect(view.pickTargets()).toEqual([]);
  });

  it.each([false, true])('opens a sleeping household on its own beds, reduced motion = %s', reduced => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
    const game = new Town().towers()[0], floor = game.tower.addFloor('residential');
    const residents = Array.from({ length: 4 }, () => {
      const r = createResident(1, game.id); r.nocturnal = false;
      r.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 480 };
      return r;
    });
    const view = new CharacterViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    const sync = (dt: number) => view.sync(residents, [], dt, 180, 'clear', game.tower.floors);
    sync(0); const actors = view.pickTargets(), poses = roomPoses(game.tower.floors, residents, game.id, 180);
    for (const actor of actors) {
      const pose = poses.get(actor.userData.residentId)!;
      expect(pose.action).toBe('resting');
      expect(actor.position.toArray()).toEqual([pose.x, floorY(floor.level) + ROOM_LIFE.homeRestHeight, pose.z]);
      expect(actor.rotation.x).toBe(-Math.PI / 2);
      expect(actor.rotation.z).toBe(Math.PI / 2);
    }
    const frozen = actors.map(transforms);
    sync(0); sync(0); expect(actors.map(transforms)).toEqual(frozen);
    sync(0.016); actors.forEach(a => expect(a.position.y).toBe(floorY(1) + ROOM_LIFE.homeRestHeight));
  });

  it('places workers at their real stations immediately but keeps new rooms hidden until ready', () => {
    const game = new Town().towers()[0]; game.tower.addFloor('restaurant', 'coffee');
    const worker = createResident(0, game.id); worker.jobTowerId = game.id; worker.jobFloor = 1;
    worker.state = { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 1000 };
    const view = new CharacterViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    view.sync([worker], [], 0, 600, 'clear', game.tower.floors, () => false);
    expect(view.pickTargets()).toEqual([]);
    view.sync([worker], [], 0, 600, 'clear', game.tower.floors, () => true);
    const actor = view.pickTargets()[0], pose = roomPoses(game.tower.floors, [worker], game.id, 600).get(worker.id)!;
    expect(actor.position.toArray()).toEqual([pose.x, floorY(1), pose.z]);
    expect(actor.getObjectByName('room-cup')?.visible).toBe(true);
  });

  it('initializes queues and riders at their actual shaft, without snapping later walks to changed targets', () => {
    const system = new ElevatorSystem(), shafts = [{ system, shaftX: -8, waitX: -6 }];
    const residents = Array.from({ length: 3 }, () => createResident(1, 't0'));
    residents.forEach(r => { r.state = { kind: 'waiting', floor: 1, to: 0 }; system.request(r.id, 1, 0, 600); });
    const view = new CharacterViews(new THREE.Group(), 't0', { x: 0, z: 0 });
    view.sync(residents, shafts, 0, 600);
    const actors = view.pickTargets();
    actors.forEach((a, i) => expect(a.position.toArray()).toEqual([-6 + i * 0.7, floorY(1), 0.5]));
    system.queues.get(1)!.shift();
    residents[0].state = { kind: 'riding', to: 0 };
    system.cars[0].pos = 0.75;
    system.cars[0].riders.push({ residentId: residents[0].id, from: 1, to: 0, enqueuedAt: 600 });
    const fresh = new CharacterViews(new THREE.Group(), 't0', { x: 0, z: 0 });
    fresh.sync([residents[0]], shafts, 0, 600);
    expect(fresh.pickTargets()[0].position.toArray()).toEqual([-8, floorY(0.75), 0]);
    const before = actors[1].position.clone();
    view.sync(residents, shafts, 0, 600);
    expect(actors[0].position.toArray()).toEqual([-8, floorY(0.75), 0]);
    expect(actors[1].position.toArray()).toEqual(before.toArray());
    view.sync(residents, shafts, 0.016, 601);
    expect(actors[1].position.x).toBeLessThan(before.x);
    expect(actors[1].position.x).toBeGreaterThan(-6);
    const walking = transforms(actors[1]);
    view.sync(residents, shafts, 0, 601);
    expect(transforms(actors[1])).toEqual(walking);
  });
});
