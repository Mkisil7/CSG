import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { architectureFacade } from './architecture';
import { FloorViews, buildShaftGroup } from './floors';
import { ParkView } from './parks';
import { SnowCover } from './snowCover';
import { Town } from '../core/town';

afterEach(() => { vi.unstubAllGlobals(); });
function mode(batched: boolean) { vi.stubGlobal('location', { search: batched ? '' : '?unbatched-exteriors=1' }); }
function canvas() { vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) }); }
function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) result.push(o); }); return result;
}
/** Compare every world-space vertex, normal and UV with its actual material and
 * render flags. This detects lost art/texture/shadows, not just matching AABBs. */
function art(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const vertices: { signature: string; values: number[] }[] = [];
  for (const mesh of meshes(root)) {
    if (mesh instanceof THREE.InstancedMesh) continue;
    const material = mesh.material as THREE.Material;
    const signature = JSON.stringify({ ...JSON.parse(JSON.stringify(material.toJSON())), uuid: undefined, metadata: undefined,
      // Procedural texture UUIDs differ but their actual pixels are checked below.
      map: undefined, textures: undefined, images: undefined });
    const p = mesh.geometry.getAttribute('position'), normal = mesh.geometry.getAttribute('normal'), uv = mesh.geometry.getAttribute('uv');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < (mesh.geometry.index?.count ?? p.count); i++) {
      const index = mesh.geometry.index?.getX(i) ?? i;
      const point = new THREE.Vector3().fromBufferAttribute(p, index).applyMatrix4(mesh.matrixWorld);
      const n = new THREE.Vector3().fromBufferAttribute(normal, index).applyNormalMatrix(normalMatrix);
      vertices.push({ signature: `${signature}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}:${mesh.layers.mask}`,
        values: [...point.toArray(), ...n.toArray(), ...(uv ? [uv.getX(index), uv.getY(index)] : [])] });
    }
  }
  return vertices;
}

function sameArt(before: THREE.Object3D, after: THREE.Object3D) {
  const a = art(before), b = art(after);
  expect(b.length).toBe(a.length);
  const buckets = new Map<string, number[][]>();
  const cell = (values: number[]) => values.slice(0, 3).map(v => Math.floor(v * 100));
  for (const { signature, values } of a) {
    const key = `${signature}:${cell(values)}`, bucket = buckets.get(key) ?? [];
    bucket.push(values); buckets.set(key, bucket);
  }
  for (const { signature, values } of b) {
    const [x, y, z] = cell(values); let found = false;
    // Adjacent cells handle Float32 rounding exactly on a bin boundary.
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      if (found) continue;
      const bucket = buckets.get(`${signature}:${[x + dx, y + dy, z + dz]}`);
      const index = bucket?.findIndex(v => v.length === values.length && v.every((n, i) => Math.abs(n - values[i]) < 0.0001)) ?? -1;
      if (index >= 0) { bucket!.splice(index, 1); found = true; }
    }
    expect(found, `Unmatched vertex/normal/UV: ${values.join(',')} ${signature}`).toBe(true);
  }
}

describe('exterior batching without visual simplification', () => {
  it.each(['heritage', 'modern', 'garden'] as const)('keeps every %s facade vertex, material, UV and construction owner with fewer meshes', style => {
    mode(false); const before = architectureFacade(style, 8);
    mode(true); const after = architectureFacade(style, 8);
    sameArt(before, after);
    expect(meshes(after).length).toBeLessThan(meshes(before).length * 0.8);
    for (let i = 0; i < 8; i++) {
      const level = after.getObjectByName(`facade-level:${i}`)!;
      expect(level.parent).toBe(after);
      for (const name of ['facade-left', 'facade-right']) {
        const side = level.getObjectByName(name)!; expect(side.parent).toBe(level);
        const bounds = new THREE.Box3().setFromObject(side);
        expect(name === 'facade-left' ? bounds.max.x < -6 : bounds.min.x > 8).toBe(true);
      }
    }
    if (style === 'heritage') {
      const texture = (group: THREE.Group) => ((group.getObjectByName('brick-pier') as THREE.Mesh).material as THREE.MeshStandardMaterial).map as THREE.DataTexture;
      expect(texture(after).image.data).toEqual(texture(before).image.data);
    }
  });

  it('batches both shaft layouts at different heights without changing rail shape or shadow flags', () => {
    for (const height of [1, 20, 60]) for (const x of [-8.2, 10.2]) {
      mode(false); const before = buildShaftGroup(x, height);
      mode(true); const after = buildShaftGroup(x, height);
      expect(meshes(before)).toHaveLength(6); expect(meshes(after)).toHaveLength(2);
      sameArt(before, after);
    }
  });

  it('preserves rooftop art and every snow-cap transform after batching the shell', () => {
    canvas(); const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
    for (const style of ['heritage', 'modern', 'garden'] as const) {
      const build = (batched: boolean) => {
        mode(batched); const view = new FloorViews(new THREE.Group(), game.id, { x: 68, z: 0 });
        view.setAppearance(style, new Set(['roof-garden', 'landmark']), 'Sky House');
        view.sync(game.tower.floors); view.updateSnow(0.8); return view.group.getObjectByName('tower-roof')!;
      };
      const before = build(false), after = build(true);
      // Roof placement is identical; don't serialize generated canvas labels.
      sameArt(before, after);
      expect(meshes(after).length).toBeLessThan(meshes(before).length);
      const a = before.getObjectByName('roof-snow') as SnowCover, b = after.getObjectByName('roof-snow') as SnowCover;
      expect(b.count).toBe(a.count); expect(b.instanceMatrix.array).toEqual(a.instanceMatrix.array);
      expect(b.parent).toBe(after); expect(b.visible).toBe(true);
    }
  });

  it('preserves park shapes, snow, independent lamp lighting and exactly-once disposal', () => {
    const scene = new THREE.Group();
    mode(false); const before = new ParkView(scene, { x: 68, z: 0 });
    mode(true); const after = new ParkView(scene, { x: 68, z: 0 });
    sameArt(before.group, after.group);
    expect(meshes(after.group).length).toBeLessThan(meshes(before.group).length / 2);
    const a = before.group.getObjectByName('park-snow') as THREE.InstancedMesh, b = after.group.getObjectByName('park-snow') as THREE.InstancedMesh;
    expect(b.instanceMatrix.array).toEqual(a.instanceMatrix.array);
    after.updateNight(0, 0.8); expect(b.visible).toBe(true);
    const lamps: THREE.PointLight[] = []; after.group.traverse(o => { if (o instanceof THREE.PointLight) lamps.push(o); });
    expect(lamps).toHaveLength(2); expect(lamps.every(l => l.intensity === 1.4)).toBe(true);
    const disposed = vi.fn(), geometries = new Set(meshes(after.group).map(m => m.geometry));
    for (const geometry of geometries) geometry.addEventListener('dispose', disposed);
    const instance = vi.spyOn(b, 'dispose');
    after.dispose(scene); after.dispose(scene);
    expect(disposed).toHaveBeenCalledTimes(geometries.size); expect(instance).toHaveBeenCalledTimes(1);
    expect(after.group.parent).toBe(null); before.dispose(scene);
  });
});
