import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { indoorPlant } from './indoorPlants';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { FLOOR_HEIGHT } from './layout';

afterEach(() => { vi.unstubAllGlobals(); });

function meshes(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  root.traverse((object) => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

describe('natural indoor greenery', () => {
  it.each([false, true])('keeps the %s-sized plant bounded and inexpensive with no lights or pick targets', (big) => {
    const plant = indoorPlant(big, 4), parts = meshes(plant);
    expect(parts).toHaveLength(5);
    let triangles = 0;
    plant.traverse((object) => {
      expect(object instanceof THREE.Light).toBe(false);
      expect(object.userData.pickable).toBeUndefined();
    });
    for (const mesh of parts) {
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      expect(mesh.castShadow).toBe(false); expect(mesh.receiveShadow).toBe(true);
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    }
    expect(triangles).toBeLessThan(1000);
    const bounds = new THREE.Box3().setFromObject(plant);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThan(big ? 2.05 : 1.3);
    expect(bounds.max.y).toBeGreaterThan(big ? 1.7 : 1);
    expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThan(big ? 0.85 : 0.55);
    const leaves = parts.filter((mesh) => mesh.material.side === THREE.DoubleSide);
    expect(leaves).toHaveLength(2);
    expect(leaves.every((mesh) => mesh.geometry.getAttribute('position').count > 40)).toBe(true);
  });

  it('repeats the same shape while varying leaf orientation between locations', () => {
    const a = indoorPlant(true, 2), b = indoorPlant(true, 2), c = indoorPlant(true, 3);
    const shape = (root: THREE.Group) => meshes(root).map((mesh) => Array.from(mesh.geometry.getAttribute('position').array));
    expect(shape(a)).toEqual(shape(b)); expect(shape(a)).not.toEqual(shape(c));
  });

  it('follows real floor furnishings through construction and releases owned resources on rebuild', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    const game = new Town().towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); game.tower.addFloor('restaurant', 'coffee');
    const before = JSON.stringify(game.tower.floors), coins = game.economy.coins;
    views.sync(game.tower.floors, undefined, 0.1);
    const room = views.pickTargets()[1], plant = room.getObjectByName('indoor-plant')!;
    expect(plant).toBeDefined(); expect(views.isFloorReady(1)).toBe(false);
    const hiddenAncestor = () => { let object: THREE.Object3D | null = plant; while (object) { if (!object.visible) return true; object = object.parent; } return false; };
    expect(hiddenAncestor()).toBe(true);
    for (let i = 0; i < 24; i++) views.sync(game.tower.floors, undefined, 0.1);
    expect(hiddenAncestor()).toBe(false);
    views.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(plant);
    expect(bounds.min.y).toBeGreaterThanOrEqual(FLOOR_HEIGHT);
    expect(bounds.max.y).toBeLessThan(2 * FLOOR_HEIGHT);
    expect(JSON.stringify(game.tower.floors)).toBe(before); expect(game.economy.coins).toBe(coins);
    const geometries = new Set(meshes(plant).map((mesh) => mesh.geometry));
    const materials = new Set(meshes(plant).map((mesh) => mesh.material));
    const disposed = vi.fn();
    for (const geometry of geometries) geometry.addEventListener('dispose', disposed);
    for (const material of materials) material.addEventListener('dispose', disposed);
    game.tower.floors[1].subtype = 'bar'; views.sync(game.tower.floors);
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    views.sync(game.tower.floors); expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    expect(views.pickTargets()[1].getObjectByName('indoor-plant')).not.toBe(plant);
  });
});
