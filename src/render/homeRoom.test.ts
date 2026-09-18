import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { homeRoom, HomeRoom } from './homeRoom';
import { FloorViews } from './floors';
import { CharacterViews } from './characters';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { homeResting, ROOM_LIFE, roomPoses } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { createPreviewTown, stageHousehold } from '../dev/roomPreview';

afterEach(() => { vi.unstubAllGlobals(); });
function fixture() {
  const town = new Town(), game = town.towers()[0], floor = game.tower.addFloor('residential');
  const residents = Array.from({ length: 4 }, (_, i) => {
    const r = createResident(floor.level, game.id); r.id = `r900${i}`; r.nocturnal = i === 3;
    r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'home', floor: floor.level }, until: 10000 }; return r;
  });
  game.residents.push(...residents);
  return { town, game, floor, residents };
}
function resources(root: THREE.Object3D) {
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  return { meshes, geometries: new Set(meshes.map(m => m.geometry)), materials: new Set(meshes.map(m => m.material)) };
}
function canvas() { vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) }); }

describe('real household places and bedtime', () => {
  it('keeps each seat and bed reserved while housemates work or commute elsewhere', () => {
    const { town, game, residents } = fixture();
    const original = [600, 180].map(time => roomPoses(game.tower.floors, residents, game.id, time, town.allResidents()));
    residents[0].state = { kind: 'commuting', toTowerId: 't1', startedAt: 500, until: 800 };
    const present = residents.slice(1).reverse(), before = JSON.stringify(residents);
    for (const [index, time] of [600, 180].entries()) {
      const poses = roomPoses(game.tower.floors, present, game.id, time, residents);
      expect(poses.size).toBe(3); expect(poses.has(residents[0].id)).toBe(false);
      for (const r of present) expect(poses.get(r.id)).toEqual(original[index].get(r.id));
    }
    expect(JSON.stringify(residents)).toBe(before);
    const restored = townFromSaveData(toSaveData(town))!;
    expect(roomPoses(restored.towers()[0].tower.floors, restored.allResidents(), game.id, 180)).toEqual(roomPoses(game.tower.floors, residents, game.id, 180));
  });

  it('uses actual personal bedtimes and excludes visiting or malformed home activities', () => {
    const { game, residents } = fixture();
    const poses = roomPoses(game.tower.floors, residents, game.id, 1380);
    expect([...poses.values()].filter(p => p.action === 'resting')).toHaveLength(3);
    expect(poses.get(residents[3].id)).toMatchObject({ action: 'reading', seated: true });
    for (const time of [180, 1620]) expect(residents.every(r => homeResting(r, time))).toBe(true);
    expect(residents.every(r => !homeResting(r, 420))).toBe(true);
    residents[0].homeTowerId = 't1';
    residents[1].state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 2 }, until: 900 };
    expect(roomPoses(game.tower.floors, residents, game.id, 180).size).toBe(2);
  });

  it('has a real seat and mattress for every resident with clear daytime and bedtime faces', () => {
    const { game, floor, residents } = fixture(), room = homeRoom(floor); room.updateMatrixWorld(true);
    const base = floor.level * 3;
    for (const seat of ROOM_LIFE.homeSeats) {
      const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, base + 0.6, seat.z), new THREE.Vector3(0, -1, 0), 0, 0.2);
      expect(ray.intersectObject(room, true)[0]?.point.y).toBeCloseTo(base + 0.48);
    }
    for (const x of ROOM_LIFE.homeBedX) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, base + 0.7, ROOM_LIFE.homeBedZ), new THREE.Vector3(0, -1, 0), 0, 0.2);
      expect(ray.intersectObject(room, true)[0]?.point.y).toBeCloseTo(base + 0.56);
    }
    for (const time of [600, 1380, 180]) for (const pose of roomPoses(game.tower.floors, residents, game.id, time).values()) {
      const resting = pose.action === 'resting';
      const head = new THREE.Vector3(pose.x - (resting ? 1.3 : 0), base + (resting ? ROOM_LIFE.homeRestHeight : 1.14), pose.z);
      for (const side of [-6, 0, 6]) {
        const camera = head.clone().add(new THREE.Vector3(side, 8, 36));
        const ray = new THREE.Raycaster(camera, head.clone().sub(camera).normalize(), 0, camera.distanceTo(head) - 0.05);
        expect(ray.intersectObject(room, true).length, `${pose.action} ${pose.x} side ${side}`).toBe(0);
      }
    }
  });

  it('reclines the same four residents, freezes their pose, then clears roll/height/book on waking and departure', () => {
    const preference = { matches: false }; vi.stubGlobal('window', { matchMedia: () => preference });
    const { game, floor, residents } = fixture(), views = new CharacterViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    const settle = (time: number) => { for (let i = 0; i < 40; i++) views.sync(residents, [], 0.1, time, 'clear', game.tower.floors); };
    settle(600); const actors = views.pickTargets();
    for (const actor of actors) expect(actor.getObjectByName('room-book')!.visible).toBe(true);
    settle(180); expect(views.pickTargets()).toEqual(actors);
    for (const [i, actor] of actors.entries()) {
      expect(actor.rotation.z).toBeCloseTo(Math.PI / 2);
      expect(actor.rotation.x).toBeCloseTo(-Math.PI / 2);
      expect(actor.position.y).toBeCloseTo(floor.level * 3 + ROOM_LIFE.homeRestHeight);
      expect(actor.position.x).toBeCloseTo(ROOM_LIFE.homeBedX[i] + 0.72);
      expect(actor.getObjectByName('room-book')!.visible).toBe(false);
      // Hidden reusable hats/pans aren't part of the sleeping silhouette.
      actor.updateMatrixWorld(true); const bounds = new THREE.Box3();
      actor.traverseVisible(object => { if (object instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromObject(object)); });
      expect(bounds.max.x).toBeLessThan(ROOM_LIFE.homeBedX[i] + 0.97);
      expect(bounds.min.x).toBeGreaterThan(ROOM_LIFE.homeBedX[i] - 0.97);
      expect(bounds.min.y).toBeGreaterThanOrEqual(floor.level * 3 + 0.56);
    }
    const frozen = actors.map(a => a.matrixWorld.clone());
    views.sync(residents, [], 0, 180, 'clear', game.tower.floors);
    actors.forEach((actor, i) => { actor.updateMatrixWorld(true); expect(actor.matrixWorld.elements).toEqual(frozen[i].elements); });
    preference.matches = true; settle(180);
    for (const actor of actors) expect(actor.rotation.z).toBeCloseTo(Math.PI / 2);
    settle(600);
    for (const actor of actors) { expect(actor.rotation.x).toBe(0); expect(actor.rotation.z).toBe(0); expect(actor.position.y).toBe(floor.level * 3); expect(actor.getObjectByName('room-book')!.visible).toBe(true); }
    settle(180); residents[0].state = { kind: 'commuting', toTowerId: 't1', startedAt: 180, until: 240 };
    views.sync(residents, [], 0.1, 181, 'clear', game.tower.floors);
    expect(actors[0].rotation.x).toBe(0); expect(actors[0].rotation.z).toBe(0); expect(actors[0].position.y).toBeLessThan(0.2);
    expect(actors[0].getObjectByName('room-book')!.visible).toBe(false);
    views.sync([], [], 0, 181); expect(views.pickTargets()).toHaveLength(0);
  });

  it('owns bounded opaque furniture, leaves cat windows clear and adds no actors or lights', () => {
    const { floor } = fixture(), room = homeRoom(floor), { meshes } = resources(room);
    const bounds = new THREE.Box3().setFromObject(room);
    expect(bounds.min.x).toBeGreaterThan(-6.5); expect(bounds.max.x).toBeLessThan(8.5);
    expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(3);
    expect(bounds.min.y).toBeGreaterThanOrEqual(floor.level * 3); expect(bounds.max.y).toBeLessThan((floor.level + 1) * 3);
    expect(meshes.length).toBeLessThanOrEqual(42);
    let triangles = 0;
    room.traverse(object => { expect(object instanceof THREE.Light).toBe(false); expect(object.userData.pickable).toBeUndefined(); });
    for (const mesh of meshes) {
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      expect(mesh.material.transparent).toBe(false); expect(mesh.castShadow).toBe(false);
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    }
    expect(triangles).toBeLessThan(7000);
    for (const x of [-1.1, 3.1, 7.3, -5.3]) {
      const point = new THREE.Vector3(x, floor.level * 3 + 1.45, -2.1), camera = point.clone().add(new THREE.Vector3(0, 8, 36));
      expect(new THREE.Raycaster(camera, point.clone().sub(camera).normalize(), 0, camera.distanceTo(point) - 0.05).intersectObject(room, true)).toHaveLength(0);
    }
  });

  it('dims actual sleeping households, preserves night-owl light, and retires owned rooms on shaft rebuild', () => {
    canvas(); const { game, residents } = fixture(), views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const room = views.group.getObjectByName('home-interior') as HomeRoom;
    views.updateLighting(0, residents, 1380); expect(room.lampMaterial.emissiveIntensity).toBe(0.55);
    views.updateLighting(0, residents.slice(0, 3), 1380); expect(room.lampMaterial.emissiveIntensity).toBe(0.06);
    views.updateLighting(0, [], 1380); expect(room.lampMaterial.emissiveIntensity).toBe(0.02);
    views.updateLighting(1, residents, 600); expect(room.lampMaterial.emissiveIntensity).toBe(0);
    views.updateLighting(0, residents, 180); expect(room.lampMaterial.emissiveIntensity).toBe(0.06);
    const { geometries, materials } = resources(room), disposed = vi.fn();
    geometries.forEach(resource => resource.addEventListener('dispose', disposed));
    materials.forEach(resource => resource.addEventListener('dispose', disposed));
    views.setSecondShaft(true); views.sync(game.tower.floors); views.updateLighting(0, residents, 1380);
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    expect((views.group.getObjectByName('home-interior') as HomeRoom).lampMaterial.emissiveIntensity).toBe(0.55);
    expect(room.lampMaterial.emissiveIntensity).toBe(0.06);
  });

  it('reconstructs after saving and stays hidden with its people until the construction reveal', () => {
    canvas(); vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const town = new Town(), game = town.towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const floor = game.tower.addFloor('residential'), before = toSaveData(town);
    views.sync(game.tower.floors, undefined, 0.1); expect(views.isFloorReady(floor.level)).toBe(false);
    const room = views.group.getObjectByName('home-interior')!;
    let hidden = false; for (let p: THREE.Object3D | null = room; p; p = p.parent) hidden ||= !p.visible;
    expect(hidden).toBe(true);
    for (let i = 0; i < 24; i++) views.sync(game.tower.floors, undefined, 0.1);
    expect(views.isFloorReady(floor.level)).toBe(true); expect(views.group.getObjectByName('home-interior')).toBe(room);
    const after = toSaveData(town); after.savedAtWallClock = before.savedAtWallClock; expect(after).toEqual(before);
    const restored = townFromSaveData(after)!; const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    loaded.sync(restored.towers()[0].tower.floors); expect(loaded.group.getObjectByName('home-interior')).toBeDefined();
  });

  it('stages only the existing household in the isolated home study without changing their jobs', () => {
    const town = createPreviewTown(), people = town.allResidents(), jobs = people.map(r => [r.id, r.jobFloor, r.jobTier]), coins = town.economy.coins;
    stageHousehold(town, 6);
    const home = people.filter(r => r.homeFloor === 6); expect(home).toHaveLength(4);
    expect(home.filter(r => r.nocturnal)).toHaveLength(1);
    for (const r of home) expect(r.state).toMatchObject({ kind: 'idle', floor: 6, activity: { kind: 'home', floor: 6 } });
    expect(people.map(r => [r.id, r.jobFloor, r.jobTier])).toEqual(jobs); expect(town.economy.coins).toBe(coins);
  });
});
