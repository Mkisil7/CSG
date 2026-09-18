import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { factoryRoom, FactoryRoom } from './factoryRoom';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { ROOM_LIFE, roomPoses } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { FLOOR_HEIGHT, ROOM_LEFT, ROOM_RIGHT, WAIT_X, WAIT_X_RIGHT } from './layout';
import type { FactorySubtype } from '../core/types';

const styles: FactorySubtype[] = ['assembly', 'foodproc', 'electronics-fab'];
afterEach(() => { vi.unstubAllGlobals(); });
function meshes(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); }); return result;
}
function fixture(subtype: FactorySubtype) {
  const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
  const floor = game.tower.addFloor('factory', subtype), view = factoryRoom(floor); view.updateMatrixWorld(true);
  return { town, game, floor, view };
}
function canvas() {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
}

describe('distinct workshop interiors', () => {
  it.each(styles)('bounds the %s equipment and opaque geometry budget', subtype => {
    const { floor, view } = fixture(subtype), bounds = new THREE.Box3().setFromObject(view), parts = meshes(view);
    expect(bounds.min.x).toBeGreaterThan(ROOM_LEFT); expect(bounds.max.x).toBeLessThan(ROOM_RIGHT);
    expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(2.7);
    expect(bounds.min.y).toBeGreaterThanOrEqual(floor.level * FLOOR_HEIGHT);
    expect(bounds.max.y).toBeLessThan((floor.level + 1) * FLOOR_HEIGHT);
    let triangles = 0;
    view.traverse(object => { expect(object instanceof THREE.Light).toBe(false); expect(object.userData.pickable).toBeUndefined(); });
    for (const mesh of parts) {
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      expect(mesh.material.transparent).toBe(false); expect(mesh.castShadow).toBe(false);
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
    }
    expect(parts.length).toBeLessThanOrEqual(30); expect(triangles).toBeLessThan(6500);
    expect(!!view.getObjectByName('assembly-workbenches')).toBe(subtype === 'assembly');
    expect(!!view.getObjectByName('food-processing-vats')).toBe(subtype === 'foodproc');
    expect(!!view.getObjectByName('electronics-clean-benches')).toBe(subtype === 'electronics-fab');
  });

  it.each(styles)('leaves the %s operators, foreman and lift lanes clear', subtype => {
    const { floor, game, view } = fixture(subtype), base = floor.level * FLOOR_HEIGHT;
    const people = Array.from({ length: 4 }, (_, i) => {
      const r = createResident(1, game.id); r.id = `worker-${i}`; r.jobFloor = floor.level; r.jobTowerId = game.id; r.jobTier = i === 3 ? 1 : 0;
      r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, startedAt: 600, until: 900 }; return r;
    });
    const before = JSON.stringify(people), poses = roomPoses(game.tower.floors, people, game.id, 610);
    expect(poses.size).toBe(4);
    for (const pose of poses.values()) {
      const head = new THREE.Vector3(pose.x, base + 1.3, pose.z);
      for (const side of [-6, 0, 6]) {
        const camera = head.clone().add(new THREE.Vector3(side, 8, 36));
        const ray = new THREE.Raycaster(camera, head.clone().sub(camera).normalize(), 0, camera.distanceTo(head) - 0.05);
        expect(ray.intersectObject(view, true).length, `${subtype} ${pose.action} camera=${side}`).toBe(0);
      }
      for (const dx of [-0.2, 0, 0.2]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(pose.x + dx, base + 2, pose.z), new THREE.Vector3(0, -1, 0), 0, 1.85);
        expect(ray.intersectObject(view, true).length).toBe(0);
      }
    }
    for (const x of [WAIT_X, WAIT_X_RIGHT]) for (const z of [-1.8, 0, 1.8]) {
      expect(new THREE.Raycaster(new THREE.Vector3(x, base + 2.5, z), new THREE.Vector3(0, -1, 0), 0, 2.3).intersectObject(view, true)).toHaveLength(0);
    }
    // Every operator's station has physical equipment directly in front of it.
    for (const x of ROOM_LIFE.factoryX) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, base + 2.6, foodZ(subtype)), new THREE.Vector3(0, -1, 0), 0, 2);
      expect(ray.intersectObject(view, true).length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(people)).toBe(before);
  });

  it('reconstructs all three trades from saves and follows reveal/rebuild resource ownership', () => {
    canvas(); vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const town = new Town(), game = town.towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const floor = game.tower.addFloor('factory', 'assembly'), before = toSaveData(town);
    views.sync(game.tower.floors, undefined, 0.1); const room = views.group.getObjectByName('factory-interior:assembly')!;
    let hidden = false; for (let parent: THREE.Object3D | null = room; parent; parent = parent.parent) hidden ||= !parent.visible;
    expect(hidden).toBe(true); expect(views.isFloorReady(floor.level)).toBe(false);
    for (let i = 0; i < 24; i++) views.sync(game.tower.floors, undefined, 0.1);
    expect(views.isFloorReady(floor.level)).toBe(true); expect(views.group.getObjectByName('factory-interior:assembly')).toBe(room);
    const after = toSaveData(town); after.savedAtWallClock = before.savedAtWallClock; expect(after).toEqual(before);
    const geometries = new Set(meshes(room).map(m => m.geometry)), materials = new Set(meshes(room).map(m => m.material)), disposed = vi.fn();
    geometries.forEach(resource => resource.addEventListener('dispose', disposed)); materials.forEach(resource => resource.addEventListener('dispose', disposed));
    floor.subtype = 'foodproc'; views.sync(game.tower.floors); views.sync(game.tower.floors);
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    const old = views.group.getObjectByName('factory-interior:foodproc'); views.setSecondShaft(true); views.sync(game.tower.floors);
    expect(views.group.getObjectByName('factory-interior:foodproc')).not.toBe(old);
    for (const style of styles) {
      floor.subtype = style; const restored = townFromSaveData(toSaveData(town))!;
      const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); loaded.sync(restored.towers()[0].tower.floors);
      expect(loaded.group.getObjectByName(`factory-interior:${style}`)).toBeDefined();
    }
  });

  it('dims empty workshops at night and removes retired fixtures from the lighting cache', () => {
    canvas(); const { game, floor } = fixture('electronics-fab'), views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const room = views.group.getObjectByName('factory-interior:electronics-fab') as FactoryRoom;
    const r = createResident(1, game.id); r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, until: 1200 };
    views.updateLighting(0, [r], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.6);
    views.updateLighting(0, [], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.04);
    views.updateLighting(1, [r], 610); expect(room.lampMaterial.emissiveIntensity).toBe(0);
    for (const daylight of [NaN, Infinity, -1, 2]) {
      room.updateLighting(daylight, true); expect(Number.isFinite(room.lampMaterial.emissiveIntensity)).toBe(true);
      expect(room.lampMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0); expect(room.lampMaterial.emissiveIntensity).toBeLessThanOrEqual(0.6);
    }
    floor.subtype = 'assembly'; views.sync(game.tower.floors); views.updateLighting(0, [r], 1100);
    expect(room.lampMaterial.emissiveIntensity).toBe(0);
    expect((views.group.getObjectByName('factory-interior:assembly') as FactoryRoom).lampMaterial.emissiveIntensity).toBe(0.6);
  });
});
function foodZ(subtype: FactorySubtype): number { return subtype === 'foodproc' ? 1.55 : 1.9; }
