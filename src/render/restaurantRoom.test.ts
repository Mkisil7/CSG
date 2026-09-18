import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { restaurantRoom, RestaurantRoom } from './restaurantRoom';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { diningTableX, roomPoses } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { FLOOR_HEIGHT, ROOM_LEFT, ROOM_RIGHT } from './layout';
import { createPreviewTown } from '../dev/roomPreview';
import { FLOOR_CONFIG, JOB_TIERS, type RestaurantSubtype } from '../core/types';
import { encodeTown, decodeTown } from '../core/share';

const styles: RestaurantSubtype[] = ['coffee', 'fastfood', 'fine-dining', 'bar'];
const appearances = styles.flatMap(subtype => [false, true].map(earned => ({ subtype, earned })));
afterEach(() => { vi.unstubAllGlobals(); });
function meshes(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  root.traverse((object) => { if (object instanceof THREE.Mesh) result.push(object); }); return result;
}
function fixture(subtype: RestaurantSubtype, earned = false) {
  const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
  const floor = game.tower.addFloor('restaurant', subtype);
  if (earned) floor.variant = 'critics-choice';
  const view = restaurantRoom(floor);
  view.updateMatrixWorld(true); return { town, game, floor, view };
}

describe('coherent restaurant interiors', () => {
  it('keeps neighboring chair backs separate on every repeating floor layout', () => {
    for (let level = 1; level <= 100; level++) {
      // Seat center offset + back offset + half back thickness.
      const halfWidth = 0.78 + 0.25 + 0.04;
      const centers = [0, 1, 2].map((index) => diningTableX(level, index));
      expect(centers[0] - halfWidth).toBeGreaterThan(ROOM_LEFT);
      expect(centers[2] + halfWidth).toBeLessThan(ROOM_RIGHT);
      for (let i = 1; i < centers.length; i++) expect(centers[i] - centers[i - 1] - halfWidth * 2).toBeGreaterThan(0.05);
    }
  });
  it.each(appearances)('bounds $subtype furniture (critic recognition: $earned) without extra lights or actors', ({ subtype, earned }) => {
    const { floor, view } = fixture(subtype, earned), parts = meshes(view);
    const bounds = new THREE.Box3().setFromObject(view), base = floor.level * FLOOR_HEIGHT;
    expect(bounds.min.x).toBeGreaterThan(ROOM_LEFT); expect(bounds.max.x).toBeLessThan(ROOM_RIGHT);
    expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(3);
    expect(bounds.min.y).toBeGreaterThanOrEqual(base - 0.001); expect(bounds.max.y).toBeLessThan(base + FLOOR_HEIGHT);
    let triangles = 0;
    view.traverse((object) => { expect(object instanceof THREE.Light).toBe(false); expect(object.userData.pickable).toBeUndefined(); });
    for (const mesh of parts) {
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      expect(mesh.material.transparent).toBe(false); expect(mesh.castShadow).toBe(false);
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    }
    expect(parts.length).toBeLessThanOrEqual(earned ? 39 : 32); expect(triangles).toBeLessThan(6500);
    expect(!!view.getObjectByName('critics-review')).toBe(earned);
    expect(!!view.getObjectByName('critics-table-settings')).toBe(earned);
    expect(view.getObjectByName('restaurant-service')).toBeDefined();
    expect(!!view.getObjectByName('espresso-counter')).toBe(subtype === 'coffee');
    expect(!!view.getObjectByName('lounge-bar')).toBe(subtype === 'bar');
  });

  it.each(appearances)('keeps $subtype workers and six guests visible (critic recognition: $earned)', ({ subtype, earned }) => {
    const { floor, game, view } = fixture(subtype, earned), base = floor.level * FLOOR_HEIGHT;
    const people = Array.from({ length: 9 }, (_, i) => {
      const resident = createResident(1, game.id); resident.id = `dining-${i}`;
      resident.jobFloor = i < 3 ? floor.level : null; resident.jobTowerId = i < 3 ? game.id : null;
      resident.state = { kind: 'idle', floor: floor.level, activity: { kind: i < 3 ? 'work' : 'eat', floor: floor.level }, startedAt: 580, until: 900 };
      return resident;
    });
    const before = JSON.stringify(people), poses = roomPoses(game.tower.floors, people, game.id, 610);
    expect(poses.size).toBe(9);
    for (const pose of poses.values()) {
      const head = new THREE.Vector3(pose.x, base + (pose.seated ? 1.14 : 1.3), pose.z);
      // Frontal and modest angled close-ups: fixtures must not hide faces.
      for (const side of [-6, 0, 6]) {
        const camera = head.clone().add(new THREE.Vector3(side, 8, 36));
        const ray = new THREE.Raycaster(camera, head.clone().sub(camera).normalize(), 0, camera.distanceTo(head) - 0.05);
        expect(ray.intersectObject(view, true).length, `${subtype} ${pose.action} x=${pose.x} camera=${side}`).toBe(0);
      }
      if (pose.seated) {
        const down = new THREE.Raycaster(new THREE.Vector3(pose.x, base + 0.6, pose.z), new THREE.Vector3(0, -1, 0), 0, 0.2);
        const seat = down.intersectObject(view.getObjectByName('restaurant-dining')!, true)[0];
        expect(seat?.point.y).toBeCloseTo(base + 0.48);
      }
    }
    expect(JSON.stringify(people)).toBe(before);
  });

  it('rebuilds once when recognition is earned, persists in saves and shared towns, and removes cleanly', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    const { town, game, floor } = fixture('coffee');
    const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); views.sync(game.tower.floors);
    const original = views.group.getObjectByName('restaurant-interior:coffee')!;
    const geometries = new Set(meshes(original).map(m => m.geometry));
    const materials = new Set(meshes(original).map(m => m.material));
    const disposed = vi.fn();
    geometries.forEach(resource => resource.addEventListener('dispose', disposed));
    materials.forEach(resource => resource.addEventListener('dispose', disposed));
    floor.variant = 'critics-choice'; const before = toSaveData(town);
    expect(views.sync(game.tower.floors)).toEqual([]);
    const earned = views.group.getObjectByName('critics-review')!; expect(earned).toBeDefined();
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    views.sync(game.tower.floors); expect(views.group.getObjectByName('critics-review')).toBe(earned);
    const after = toSaveData(town); after.savedAtWallClock = before.savedAtWallClock; expect(after).toEqual(before);
    for (const restored of [townFromSaveData(before)!, (await decodeTown(await encodeTown(town)))!]) {
      const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); loaded.sync(restored.towers()[0].tower.floors);
      expect(loaded.group.getObjectByName('critics-review')).toBeDefined();
      expect(loaded.group.getObjectByName('critics-table-settings')).toBeDefined();
      expect(restored.economy.coins).toBe(town.economy.coins);
    }
    views.setSecondShaft(true); views.sync(game.tower.floors);
    expect(views.group.getObjectByName('critics-review')).toBeDefined();
    floor.variant = undefined; views.sync(game.tower.floors);
    expect(views.group.getObjectByName('critics-review')).toBeUndefined();
    expect(views.group.getObjectByName('critics-table-settings')).toBeUndefined();
  });

  it('reconstructs styles from saves, follows construction and releases owned resources exactly once', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    const town = new Town(), game = town.towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const floor = game.tower.addFloor('restaurant', 'coffee');
    const before = toSaveData(town); views.sync(game.tower.floors, undefined, 0.1);
    const room = views.group.getObjectByName('restaurant-interior:coffee')!;
    expect(views.isFloorReady(floor.level)).toBe(false);
    let hidden = false; for (let parent: THREE.Object3D | null = room; parent; parent = parent.parent) hidden ||= !parent.visible;
    expect(hidden).toBe(true);
    for (let i = 0; i < 24; i++) views.sync(game.tower.floors, undefined, 0.1);
    expect(views.isFloorReady(floor.level)).toBe(true);
    expect(views.group.getObjectByName('restaurant-interior:coffee')).toBe(room);
    const after = toSaveData(town); after.savedAtWallClock = before.savedAtWallClock; expect(after).toEqual(before);
    const geometries = new Set(meshes(room).map((mesh) => mesh.geometry));
    const materials = new Set(meshes(room).map((mesh) => mesh.material));
    const disposed = vi.fn();
    geometries.forEach((geometry) => geometry.addEventListener('dispose', disposed));
    materials.forEach((material) => material.addEventListener('dispose', disposed));
    floor.subtype = 'bar'; views.sync(game.tower.floors); views.sync(game.tower.floors);
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    expect(views.group.getObjectByName('restaurant-interior:coffee')).toBeUndefined();
    expect(views.group.getObjectByName('restaurant-interior:bar')).toBeDefined();
    for (const subtype of styles) {
      floor.subtype = subtype;
      const restored = townFromSaveData(toSaveData(town))!;
      const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); loaded.sync(restored.towers()[0].tower.floors);
      expect(loaded.group.getObjectByName(`restaurant-interior:${subtype}`)).toBeDefined();
    }
  });

  it('warms occupied dining fixtures after dark, dims empty rooms and resets caches on rebuild', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    const { game, floor } = fixture('bar'), views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors);
    const room = views.group.getObjectByName('restaurant-interior:bar') as RestaurantRoom;
    const resident = createResident(1, game.id);
    resident.state = { kind: 'idle', floor: floor.level, activity: { kind: 'eat', floor: floor.level }, until: 1200 };
    views.updateLighting(1, [resident], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0);
    views.updateLighting(0, [resident], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.75);
    views.updateLighting(0, [], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.08);
    for (const daylight of [NaN, Infinity, -1, 2]) {
      room.updateLighting(daylight, true); expect(Number.isFinite(room.lampMaterial.emissiveIntensity)).toBe(true);
      expect(room.lampMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0); expect(room.lampMaterial.emissiveIntensity).toBeLessThanOrEqual(0.75);
    }
    views.setSecondShaft(true); views.sync(game.tower.floors);
    const rebuilt = views.group.getObjectByName('restaurant-interior:bar') as RestaurantRoom;
    expect(rebuilt).not.toBe(room); views.updateLighting(0, [resident], 1100);
    expect(rebuilt.lampMaterial.emissiveIntensity).toBe(0.75);
    floor.subtype = 'coffee'; views.sync(game.tower.floors); views.updateLighting(1, [resident], 610);
    expect(rebuilt.lampMaterial.emissiveIntensity).toBe(0.75);
    const coffee = views.group.getObjectByName('restaurant-interior:coffee') as RestaurantRoom;
    expect(coffee.lampMaterial.emissiveIntensity).toBe(0);
    floor.variant = 'critics-choice'; views.sync(game.tower.floors);
    const awarded = views.group.getObjectByName('restaurant-interior:coffee') as RestaurantRoom;
    expect(meshes(awarded.getObjectByName('critics-review')!).some(m => m.material === awarded.lampMaterial)).toBe(true);
    views.updateLighting(0, [resident], 1100); expect(awarded.lampMaterial.emissiveIntensity).toBe(0.75);
    views.updateLighting(0, [], 1100); expect(awarded.lampMaterial.emissiveIntensity).toBe(0.08);
  });

  it('keeps the disposable room study inside real staffing and career-slot capacities', () => {
    const town = createPreviewTown(), game = town.towers()[0];
    for (const floor of game.tower.floors) {
      const staff = game.residents.filter((r) => r.jobFloor === floor.level && r.jobTowerId === game.id);
      if (floor.type !== 'restaurant' && floor.type !== 'office') continue;
      expect(staff.length).toBeLessThanOrEqual(FLOOR_CONFIG[floor.type].jobs);
      JOB_TIERS[floor.type].forEach((tier, index) => expect(staff.filter((r) => r.jobTier === index).length).toBeLessThanOrEqual(tier.slots));
    }
  });
});
