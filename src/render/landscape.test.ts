import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LandscapeView, landscapeTrees } from './landscape';
import { Town } from '../core/town';
import { streetJourneyPosition } from '../core/townLayout';
import { TOWER_SLOT_ORIGINS } from './layout';
import { ParkView } from './parks';

describe('inhabited streetscape', () => {
  it('keeps park lawns and tree crowns consistent with town snow and releases park geometry', () => {
    const scene = new THREE.Scene(), park = new ParkView(scene, { x: 0, z: 0 });
    const lawn = park.group.getObjectByName('park-lawn') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const caps = park.group.getObjectByName('park-snow') as THREE.InstancedMesh;
    park.updateNight(1, 0); const green = lawn.material.color.clone(); expect(caps.visible).toBe(false);
    park.updateNight(0, 0.8); expect(lawn.material.color.r).toBeGreaterThan(green.r); expect(caps.visible).toBe(true); expect(caps.count).toBe(18);
    park.updateNight(1, 0); expect(lawn.material.color.equals(green)).toBe(true); expect(caps.visible).toBe(false);
    const disposed = vi.fn(), geometries = new Set<THREE.BufferGeometry>();
    park.group.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.addEventListener('dispose', disposed);
    park.dispose(scene); park.dispose(scene); expect(disposed).toHaveBeenCalledTimes(geometries.size); expect(scene.children).toHaveLength(0);
  });
  it('replaces scattered cone trees with a deterministic, bounded instanced grove', () => {
    const scene = new THREE.Scene(), view = new LandscapeView(scene);
    const spots = landscapeTrees(); expect(spots).toEqual(landscapeTrees());
    expect(spots.length).toBeGreaterThan(50); expect(spots.length).toBeLessThanOrEqual(82);
    for (const spot of spots) { expect(Math.abs(spot.z)).toBeGreaterThanOrEqual(34); expect(Math.hypot(spot.x, spot.z)).toBeLessThan(220); }
    const batches: THREE.InstancedMesh[] = []; let totalTriangles = 0;
    view.group.traverse((o) => {
      expect(o instanceof THREE.Light).toBe(false); expect(o.userData.pickable).toBeUndefined();
      if (o instanceof THREE.InstancedMesh) {
        batches.push(o); const triangleCount = (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
        totalTriangles += triangleCount * o.count;
      }
    });
    expect(batches.filter((batch) => batch.name.startsWith('grove-'))).toHaveLength(5);
    expect(batches.filter((batch) => batch.name === 'street-furniture-snow')).toHaveLength(TOWER_SLOT_ORIGINS.length);
    expect(totalTriangles).toBeLessThan(70000);
    expect((view.group.getObjectByName('grove-crowns:0') as THREE.InstancedMesh).count).toBe(spots.length);
    view.dispose();
  });

  it('adds furniture only to unlocked neighborhoods without changing ownership or population', () => {
    const town = new Town(), before = JSON.stringify(town.slots.map((s) => [s.id, s.zone, s.unlocked]));
    const view = new LandscapeView(new THREE.Scene()); view.update(town, 1);
    for (let i = 0; i < town.slots.length; i++) expect(view.group.getObjectByName(`streetscape:${i}`)!.visible).toBe(town.slots[i].unlocked);
    expect(JSON.stringify(town.slots.map((s) => [s.id, s.zone, s.unlocked]))).toBe(before); expect(town.population).toBe(0);
    town.slots[1].unlocked = true; view.update(town, 0);
    expect(view.group.getObjectByName('streetscape:1')!.visible).toBe(true);
    town.slots[1].unlocked = false; view.update(town, 1);
    expect(view.group.getObjectByName('streetscape:1')!.visible).toBe(false);
    view.dispose();
  });

  it('preserves the real walking surface and keeps curbs/furniture out of every commute path', () => {
    const town = new Town(), view = new LandscapeView(new THREE.Scene());
    for (const slot of town.slots) slot.unlocked = true;
    view.update(town, 1); view.group.updateMatrixWorld(true);
    const promenade = view.group.getObjectByName('pedestrian-promenade')!;
    const paving = new THREE.Box3().setFromObject(promenade);
    expect(paving.max.y).toBeCloseTo(0.12); expect(paving.min.z).toBeCloseTo(6.5); expect(paving.max.z).toBeCloseTo(10.5);
    const obstacles: THREE.Box3[] = [];
    view.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      const bounds = new THREE.Box3().setFromObject(o);
      if (bounds.max.y > 0.15 && bounds.min.z < 10.5 && bounds.max.z > 3.5) obstacles.push(bounds);
    });
    for (let a = 0; a < TOWER_SLOT_ORIGINS.length; a++) {
      for (let b = 0; b < TOWER_SLOT_ORIGINS.length; b++) {
        if (a === b) continue;
        for (let step = 0; step <= 100; step++) {
          const position = streetJourneyPosition(`t${a}`, `t${b}`, step / 100);
          if (position.z < 3.5) continue;
          const actor = new THREE.Box3(new THREE.Vector3(position.x - 0.28, 0.12, position.z - 0.28), new THREE.Vector3(position.x + 0.28, 1.9, position.z + 0.28));
          for (const obstacle of obstacles) expect(actor.intersectsBox(obstacle)).toBe(false);
        }
      }
    }
    view.dispose();
  });

  it('uses repeatable surface textures and responds to actual snow, wetness and daylight', () => {
    const town = new Town(), view = new LandscapeView(new THREE.Scene());
    const promenade = view.group.getObjectByName('pedestrian-promenade') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const groveSnow = view.group.getObjectByName('grove-snow') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const pool = view.group.getObjectByName('lamp-pool') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const ground = view.group.getObjectByName('landscape-ground') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(ground.geometry.index?.count).toBe(6);
    const groundBounds = new THREE.Box3().setFromObject(ground);
    expect(groundBounds.getSize(new THREE.Vector3()).x).toBe(6000);
    expect(groundBounds.getSize(new THREE.Vector3()).z).toBe(6000);
    const texture = promenade.material.map as THREE.DataTexture;
    expect(texture.image.width).toBe(128); expect(texture.generateMipmaps).toBe(true);
    expect(new Set(texture.image.data).size).toBeGreaterThan(10);
    view.update(town, 1); expect(groveSnow.visible).toBe(false); expect(pool.material.opacity).toBe(0);
    const dry = promenade.material.roughness;
    const grass = ground.material.color.clone();
    town.weather.wetness = 1; town.weather.snow = 0.8; view.update(town, 0);
    expect(promenade.material.roughness).toBeLessThan(dry);
    expect(groveSnow.visible).toBe(true); expect(groveSnow.material.opacity).toBeCloseTo(0.768);
    expect(view.group.getObjectByName('planting-snow')!.visible).toBe(true); expect(pool.material.opacity).toBeGreaterThan(0);
    expect(ground.material.color.r).toBeGreaterThan(grass.r);
    town.weather.snow = 0; view.update(town, 1); expect(groveSnow.visible).toBe(false);
    expect(ground.material.color.equals(grass)).toBe(true);
    view.dispose();
  });

  it('does not allocate new scene resources during weather or ownership changes and disposes them once', () => {
    const scene = new THREE.Scene(), town = new Town(), view = new LandscapeView(scene);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    let count = 0;
    view.group.traverse((o) => {
      count++;
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m); const map = (m as THREE.MeshStandardMaterial).map; if (map) textures.add(map);
      }
    });
    const disposed = vi.fn();
    for (const resource of geometries) resource.addEventListener('dispose', disposed);
    for (const resource of materials) resource.addEventListener('dispose', disposed);
    for (const resource of textures) resource.addEventListener('dispose', disposed);
    for (let i = 0; i < 1000; i++) { town.weather.snow = i % 10 / 10; town.weather.wetness = i % 7 / 7; view.update(town, i % 6 / 6); }
    let after = 0; view.group.traverse(() => after++); expect(after).toBe(count);
    expect(disposed).not.toHaveBeenCalled();
    view.dispose(); view.dispose(); view.update(town, 0);
    expect(scene.children).toHaveLength(0); expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size + textures.size);
  });
});
