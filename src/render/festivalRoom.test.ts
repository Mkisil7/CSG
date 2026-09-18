import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { roomPoses } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { encodeTown, decodeTown } from '../core/share';
import { FloorViews, variantDecoration } from './floors';
import { restaurantRoom } from './restaurantRoom';
import { shopRoom } from './shopRoom';
import { FLOOR_HEIGHT, ROOM_LEFT, ROOM_RIGHT, floorY } from './layout';

const venues = [
  ['restaurant', 'coffee'], ['restaurant', 'fastfood'], ['restaurant', 'fine-dining'], ['restaurant', 'bar'],
  ['shop', 'grocery'], ['shop', 'boutique'], ['shop', 'electronics'],
] as const;
afterEach(() => { vi.unstubAllGlobals(); });
function fakeCanvas() {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
}

describe('earned festival interiors', () => {
  it('reveals earned dressing with the furnishings, freezes while paused and finishes immediately with reduced motion', () => {
    fakeCanvas(); vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const game = new Town().towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors);
    const floor = game.tower.addFloor('shop', 'boutique'); floor.variant = 'festival-market';
    views.sync(game.tower.floors, undefined, 0.1, false);
    const dressing = views.group.getObjectByName('festival-bunting')!;
    const hidden = () => {
      for (let parent: THREE.Object3D | null = dressing; parent; parent = parent.parent) if (!parent.visible) return true;
      return false;
    };
    expect(hidden()).toBe(true); expect(views.isFloorReady(floor.level)).toBe(false);
    views.sync(game.tower.floors, undefined, 0, false); expect(hidden()).toBe(true);
    views.sync(game.tower.floors, undefined, 0, true); expect(hidden()).toBe(false);
    expect(views.isFloorReady(floor.level)).toBe(true);
    expect(views.group.getObjectByName('festival-bunting')).toBe(dressing);
  });
  it.each(venues)('keeps %s/%s decorations bounded, inexpensive and clear of real people', (type, subtype) => {
    const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
    const floor = game.tower.addFloor(type, subtype); floor.variant = 'festival-market';
    const earned = variantDecoration(floor), base = floorY(floor.level);
    const bounds = new THREE.Box3().setFromObject(earned);
    expect(bounds.min.x).toBeGreaterThan(ROOM_LEFT); expect(bounds.max.x).toBeLessThan(ROOM_RIGHT);
    expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(3);
    expect(bounds.min.y).toBeGreaterThan(base + 1); expect(bounds.max.y).toBeLessThan(base + FLOOR_HEIGHT);
    expect(earned.getObjectByName('festival-bunting')).toBeDefined();
    expect(earned.getObjectByName('festival-rosette')).toBeDefined();
    let draws = 0, triangles = 0;
    earned.traverse(object => {
      expect(object instanceof THREE.Light).toBe(false); expect(object.userData.pickable).toBeUndefined();
      if (!(object instanceof THREE.Mesh)) return;
      draws++; triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      expect(object.castShadow).toBe(false); expect(object.material.transparent).toBe(false);
      expect(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      const normals = object.geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i++) expect(new THREE.Vector3().fromBufferAttribute(normals, i).length()).toBeGreaterThan(0.99);
    });
    expect(draws).toBeLessThanOrEqual(8); expect(triangles).toBeLessThan(1100);
    const room = type === 'restaurant' ? restaurantRoom(floor) : shopRoom(floor);
    const scene = new THREE.Group(); scene.add(room, earned); scene.updateMatrixWorld(true);
    const staffCount = type === 'restaurant' ? 3 : 2;
    const people = Array.from({ length: staffCount + 6 }, (_, i) => {
      const resident = createResident(1, game.id); resident.id = `festival-${i}`;
      resident.jobFloor = i < staffCount ? floor.level : null; resident.jobTowerId = i < staffCount ? game.id : null;
      resident.jobTier = i < staffCount ? staffCount - i - 1 : 0;
      resident.state = { kind: 'idle', floor: floor.level, activity: { kind: i < staffCount ? 'work' : type === 'restaurant' ? 'eat' : 'shop', floor: floor.level }, startedAt: 600, until: 640 };
      return resident;
    });
    const before = JSON.stringify(people);
    for (const now of [600, 610, 636]) for (const pose of roomPoses(game.tower.floors, people, game.id, now).values()) {
      const head = new THREE.Vector3(pose.x, base + (pose.seated ? 1.14 : 1.3), pose.z);
      for (const side of [-6, 0, 6]) {
        const camera = head.clone().add(new THREE.Vector3(side, 8, 36));
        const ray = new THREE.Raycaster(camera, head.clone().sub(camera).normalize(), 0, camera.distanceTo(head) - 0.05);
        expect(ray.intersectObject(earned, true).length, `${subtype} ${pose.action} at ${now}`).toBe(0);
      }
      const waist = new THREE.Vector3(pose.x, base + 0.57, pose.z);
      for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)])
        expect(new THREE.Raycaster(waist, direction, 0, 0.2).intersectObject(earned, true)).toHaveLength(0);
    }
    expect(JSON.stringify(people)).toBe(before);
  });

  it('adds an earned distinction once without replacing the business, then restores it in saves and shared visits', async () => {
    fakeCanvas(); const town = new Town(), game = town.towers()[0];
    const floor = game.tower.addFloor('shop', 'electronics');
    const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); views.sync(game.tower.floors);
    const room = views.group.getObjectByName('shop-interior:electronics');
    expect(views.group.getObjectByName('festival-bunting')).toBeUndefined();
    floor.variant = 'festival-market'; const before = toSaveData(town);
    expect(views.sync(game.tower.floors)).toEqual([]);
    const reward = views.group.getObjectByName('earned-festival-market')!;
    views.sync(game.tower.floors); expect(views.group.getObjectByName('earned-festival-market')).toBe(reward);
    expect(views.group.getObjectByName('shop-interior:electronics')).toBe(room);
    const after = toSaveData(town); after.savedAtWallClock = before.savedAtWallClock; expect(after).toEqual(before);
    for (const restored of [townFromSaveData(before)!, (await decodeTown(await encodeTown(town)))!]) {
      const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); loaded.sync(restored.towers()[0].tower.floors);
      expect(loaded.group.getObjectByName('festival-bunting')).toBeDefined();
      expect(loaded.group.getObjectByName('festival-rosette')).toBeDefined();
      expect(loaded.group.getObjectByName('device-demo-islands')).toBeDefined();
    }
    const geometries = new Set<THREE.BufferGeometry>(), disposed = vi.fn();
    reward.traverse(o => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
    geometries.forEach(g => g.addEventListener('dispose', disposed));
    floor.variant = undefined; views.sync(game.tower.floors); views.sync(game.tower.floors);
    expect(disposed).toHaveBeenCalledTimes(geometries.size); expect(views.group.getObjectByName('festival-bunting')).toBeUndefined();
    expect(views.group.getObjectByName('shop-interior:electronics')).toBe(room);
    floor.variant = 'festival-market'; views.setSecondShaft(true); views.sync(game.tower.floors);
    expect(views.group.getObjectByName('festival-rosette')).toBeDefined();
  });
});
