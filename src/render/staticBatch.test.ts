import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { batchStaticMeshes } from './staticBatch';
import { FloorViews } from './floors';
import { Town } from '../core/town';

afterEach(() => { vi.unstubAllGlobals(); });
function cube(material: THREE.Material, x: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), material);
  mesh.position.set(x, 1, 0); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
function triangles(root: THREE.Object3D) {
  let count = 0; root.traverse((node) => { if (node instanceof THREE.Mesh) count += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; }); return count;
}

describe('static room batching', () => {
  it('retains transformed shapes, triangle count, shadows and floor hit positions with fewer meshes', () => {
    const group = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const a = cube(material, -2), b = cube(material, 2); b.rotation.y = .25; b.scale.set(1.3, .7, .8); group.add(a, b);
    group.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(group), count = triangles(group);
    const ray = new THREE.Raycaster(new THREE.Vector3(-2, 1, 10), new THREE.Vector3(0, 0, -1));
    const distance = ray.intersectObject(group, true)[0].distance;
    batchStaticMeshes(group, new Set([material])); group.updateMatrixWorld(true);
    expect(group.children).toHaveLength(1); expect(triangles(group)).toBe(count);
    const batch = group.children[0] as THREE.Mesh;
    expect(batch.material).toBe(material); expect(batch.castShadow && batch.receiveShadow).toBe(true);
    const after = new THREE.Box3().setFromObject(group);
    expect(after.min.distanceTo(bounds.min)).toBeLessThan(1e-6); expect(after.max.distanceTo(bounds.max)).toBeLessThan(1e-6);
    expect(ray.intersectObject(group, true)[0].distance).toBeCloseTo(distance);
  });

  it('preserves construction parents, dynamic names, imported assets and distinct rendering flags', () => {
    const root = new THREE.Group(), furniture = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    furniture.name = 'room-furnishings'; root.add(furniture);
    furniture.add(cube(material, 0), cube(material, 2)); root.add(cube(material, 4), cube(material, 6));
    const window = cube(material, 8); window.name = 'window-pane:0'; root.add(window);
    const imported = new THREE.Group(); imported.userData.sharedAsset = true; imported.add(cube(material, 10), cube(material, 12)); root.add(imported);
    const noShadow = cube(material, 14); noShadow.castShadow = false; root.add(noShadow);
    batchStaticMeshes(root, new Set([material]));
    expect(furniture.children).toHaveLength(1); expect(furniture.parent).toBe(root);
    furniture.visible = false; expect(root.children.some((child) => child.name === 'static-room-batch')).toBe(true);
    expect(window.parent).toBe(root); expect(imported.children).toHaveLength(2); expect(noShadow.parent).toBe(root);
  });

  it('disposes retired owned geometry once without disposing live shared geometry or palette materials', () => {
    const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const a = cube(material, 0), b = cube(material, 2), protectedMesh = cube(material, 4);
    protectedMesh.geometry = a.geometry; protectedMesh.name = 'protected'; root.add(a, b, protectedMesh);
    const aDispose = vi.spyOn(a.geometry, 'dispose'), bDispose = vi.spyOn(b.geometry, 'dispose'), matDispose = vi.spyOn(material, 'dispose');
    batchStaticMeshes(root, new Set([material]));
    expect(aDispose).not.toHaveBeenCalled(); expect(bDispose).toHaveBeenCalledTimes(1); expect(matDispose).not.toHaveBeenCalled();
    const count = root.children.length; batchStaticMeshes(root, new Set([material])); expect(root.children).toHaveLength(count);
  });

  it('batches real rooms while retaining named windows, construction furniture and floor picking ownership', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    const game = new Town().towers()[0]; game.tower.addFloor('residential');
    const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); views.sync(game.tower.floors);
    const room = views.pickTargets()[1];
    expect(room.userData).toMatchObject({ pickable: 'floor', towerId: game.id, floorLevel: 1 });
    expect(room.getObjectByName('window-pane:0')).toBeDefined();
    const furniture = room.getObjectByName('room-furnishings')!;
    // Coherent room interiors own nested material batches. Count actual meshes,
    // not just direct children, and keep every batch under the reveal parent.
    expect(furniture.getObjectByName('static-room-batch')).toBeDefined();
    let meshes = 0;
    furniture.traverse(node => {
      if (node instanceof THREE.Mesh) meshes++;
      if (node.name === 'static-room-batch') {
        let withinReveal = false;
        for (let parent = node.parent; parent; parent = parent.parent) withinReveal ||= parent === furniture;
        expect(withinReveal).toBe(true);
      }
    });
    expect(meshes).toBeLessThanOrEqual(42);
  });
});
