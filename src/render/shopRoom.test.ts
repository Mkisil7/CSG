import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { shopRoom, ShopRoom } from './shopRoom';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { ROOM_LIFE, roomPoses } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { FLOOR_HEIGHT, ROOM_LEFT, ROOM_RIGHT } from './layout';
import type { ShopSubtype } from '../core/types';

const styles: ShopSubtype[] = ['grocery', 'boutique', 'electronics'];
afterEach(() => { vi.unstubAllGlobals(); });
function meshes(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); }); return result;
}
function fixture(subtype: ShopSubtype) {
  const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
  const floor = game.tower.addFloor('shop', subtype), view = shopRoom(floor);
  view.updateMatrixWorld(true); return { town, game, floor, view };
}
function fakeCanvas() {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
}

describe('three distinct retail interiors', () => {
  it.each(styles)('keeps %s opaque, bounded and batched without extra actors or lights', subtype => {
    const { floor, view } = fixture(subtype), parts = meshes(view), bounds = new THREE.Box3().setFromObject(view);
    expect(bounds.min.x).toBeGreaterThan(ROOM_LEFT); expect(bounds.max.x).toBeLessThan(ROOM_RIGHT);
    expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(3);
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
    expect(parts.length).toBeLessThanOrEqual(30); expect(triangles).toBeLessThan(7500);
    expect(view.getObjectByName('shop-checkout')).toBeDefined();
    expect(!!view.getObjectByName('market-produce-islands')).toBe(subtype === 'grocery');
    expect(!!view.getObjectByName('boutique-clothing-rail')).toBe(subtype === 'boutique');
    expect(!!view.getObjectByName('device-demo-islands')).toBe(subtype === 'electronics');
  });

  it.each(styles)('keeps %s staff and six actual visitors visible through browsing and checkout', subtype => {
    const { floor, view, game } = fixture(subtype), base = floor.level * FLOOR_HEIGHT;
    const people = Array.from({ length: 8 }, (_, i) => {
      const r = createResident(1, game.id); r.id = `shop-${i}`;
      r.jobFloor = i < 2 ? floor.level : null; r.jobTowerId = i < 2 ? game.id : null;
      r.state = { kind: 'idle', floor: floor.level, activity: { kind: i < 2 ? 'work' : 'shop', floor: floor.level }, startedAt: 600, until: 620 };
      return r;
    });
    const before = JSON.stringify(people);
    for (const now of [600, 616]) {
      const poses = roomPoses(game.tower.floors, people, game.id, now); expect(poses.size).toBe(8);
      for (const pose of poses.values()) {
        const head = new THREE.Vector3(pose.x, base + 1.3, pose.z);
        for (const side of [-6, 0, 6]) {
          const camera = head.clone().add(new THREE.Vector3(side, 8, 36));
          const ray = new THREE.Raycaster(camera, head.clone().sub(camera).normalize(), 0, camera.distanceTo(head) - 0.05);
          expect(ray.intersectObject(view, true).length, `${subtype} ${pose.action} x=${pose.x} camera=${side}`).toBe(0);
        }
        // Short horizontal waist-level probes catch nearby furniture edges
        // even when the face happens to be visible above them.
        const waist = new THREE.Vector3(pose.x, base + 0.57, pose.z);
        for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)]) {
          expect(new THREE.Raycaster(waist, direction, 0, 0.18).intersectObject(view, true).length).toBe(0);
        }
      }
    }
    const counter = new THREE.Box3().setFromObject(view.getObjectByName('shop-checkout')!);
    expect(counter.min.z).toBeGreaterThan(ROOM_LIFE.checkout.staffZ + 0.2);
    expect(counter.max.z).toBeLessThan(ROOM_LIFE.checkout.customerZ - 0.2);
    if (subtype === 'electronics') for (const x of ROOM_LIFE.deviceDisplayX) {
      const support = new THREE.Raycaster(new THREE.Vector3(x, base + 0.9, 1.9), new THREE.Vector3(0, -1, 0), 0, 0.3);
      // The laptop base, directly in front of the corresponding visitor.
      expect(support.intersectObject(view.getObjectByName('device-demo-islands')!, true)[0]?.point.y).toBeCloseTo(base + 0.7755);
    }
    expect(JSON.stringify(people)).toBe(before);
  });

  it('survives construction, subtype changes, second-shaft rebuilds and saved-town reconstruction', () => {
    fakeCanvas(); vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const town = new Town(), game = town.towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const floor = game.tower.addFloor('shop', 'grocery'), before = toSaveData(town);
    views.sync(game.tower.floors, undefined, 0.1); const room = views.group.getObjectByName('shop-interior:grocery')!;
    let hidden = false; for (let parent: THREE.Object3D | null = room; parent; parent = parent.parent) hidden ||= !parent.visible;
    expect(hidden).toBe(true); expect(views.isFloorReady(floor.level)).toBe(false);
    for (let i = 0; i < 24; i++) views.sync(game.tower.floors, undefined, 0.1);
    expect(views.isFloorReady(floor.level)).toBe(true); expect(views.group.getObjectByName('shop-interior:grocery')).toBe(room);
    const after = toSaveData(town); after.savedAtWallClock = before.savedAtWallClock; expect(after).toEqual(before);
    const geometries = new Set(meshes(room).map(m => m.geometry)), materials = new Set(meshes(room).map(m => m.material)), disposed = vi.fn();
    geometries.forEach(resource => resource.addEventListener('dispose', disposed));
    materials.forEach(resource => resource.addEventListener('dispose', disposed));
    floor.subtype = 'boutique'; views.sync(game.tower.floors); views.sync(game.tower.floors);
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    const previous = views.group.getObjectByName('shop-interior:boutique'); views.setSecondShaft(true); views.sync(game.tower.floors);
    expect(views.group.getObjectByName('shop-interior:boutique')).not.toBe(previous);
    for (const style of styles) {
      floor.subtype = style; const restored = townFromSaveData(toSaveData(town))!;
      const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); loaded.sync(restored.towers()[0].tower.floors);
      expect(loaded.group.getObjectByName(`shop-interior:${style}`)).toBeDefined();
    }
  });

  it('lights occupied retail after dark without keeping retired materials in the lighting cache', () => {
    fakeCanvas(); const { game, floor } = fixture('electronics'), views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const room = views.group.getObjectByName('shop-interior:electronics') as ShopRoom;
    const r = createResident(1, game.id); r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'shop', floor: floor.level }, until: 1200 };
    views.updateLighting(0, [r], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.65);
    views.updateLighting(0, [], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.04);
    views.updateLighting(1, [r], 610); expect(room.lampMaterial.emissiveIntensity).toBe(0);
    for (const daylight of [NaN, Infinity, -1, 2]) {
      room.updateLighting(daylight, true); expect(Number.isFinite(room.lampMaterial.emissiveIntensity)).toBe(true);
      expect(room.lampMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0); expect(room.lampMaterial.emissiveIntensity).toBeLessThanOrEqual(0.65);
    }
    floor.subtype = 'boutique'; views.sync(game.tower.floors); views.updateLighting(0, [r], 1100);
    expect(room.lampMaterial.emissiveIntensity).toBe(0);
    expect((views.group.getObjectByName('shop-interior:boutique') as ShopRoom).lampMaterial.emissiveIntensity).toBe(0.65);
  });
});
