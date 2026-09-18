import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Hinterland, hinterlandHeight } from './hinterland';
import { LandscapeView } from './landscape';
import { Town } from '../core/town';

function fixture() { return new Hinterland(new THREE.MeshStandardMaterial()); }

describe('wooded town backdrop', () => {
  it('keeps low smooth ridges behind the entire playable street, with submerged edges', () => {
    for (let x = -950; x <= 950; x += 25) for (let z = -650; z <= 100; z += 15) {
      const y = hinterlandHeight(x, z);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(60);
      if (z >= -62 || z <= -620 || Math.abs(x) >= 900) expect(y).toBe(0);
    }
    const view = fixture(), mesh = view.getObjectByName('distant-ridges') as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(mesh);
    expect(bounds.max.z).toBe(-62); expect(bounds.min.y).toBeCloseTo(-0.02);
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i)).toBeCloseTo(hinterlandHeight(positions.getX(i), positions.getZ(i)) - 0.02, 4);
    }
  });

  it('uses three deterministic opaque batches, no extra textures, lights, shadows or pick targets', () => {
    const view = fixture(), second = fixture(); let meshes = 0, triangles = 0;
    view.traverse(object => {
      expect(object instanceof THREE.Light).toBe(false); expect(object.userData.pickable).toBeUndefined();
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 *
        (object instanceof THREE.InstancedMesh ? object.count : 1);
      expect(object.castShadow).toBe(false); expect(object.receiveShadow).toBe(false);
      const material = object.material as THREE.MeshStandardMaterial;
      expect(material.transparent).toBe(false); expect(material.fog).toBe(true); expect(material.map).toBeNull();
      const other = second.getObjectByName(object.name) as THREE.Mesh;
      expect(object.geometry.getAttribute('position').array).toEqual(other.geometry.getAttribute('position').array);
      if (object instanceof THREE.InstancedMesh) expect(object.instanceMatrix.array).toEqual((other as THREE.InstancedMesh).instanceMatrix.array);
    });
    expect(meshes).toBe(3); expect(triangles).toBeLessThan(23000);
  });

  it('plants every tree on the real triangulated hillside without floating roots', () => {
    const view = fixture(); view.updateMatrixWorld(true);
    const trees = view.getObjectByName('hinterland-trunks') as THREE.InstancedMesh;
    const hills = view.getObjectByName('distant-ridges')!;
    const matrix = new THREE.Matrix4(), base = new THREE.Vector3();
    for (let i = 0; i < trees.count; i++) {
      trees.getMatrixAt(i, matrix); base.set(0, -0.5, 0).applyMatrix4(matrix);
      const ray = new THREE.Raycaster(new THREE.Vector3(base.x, 80, base.z), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(hills)[0].point.y).toBeCloseTo(base.y, 4);
    }
  });

  it('shares the meadow material and UV phase, including snow, without mutating town state', () => {
    const town = new Town(), view = new LandscapeView(new THREE.Scene());
    const ground = view.group.getObjectByName('landscape-ground') as THREE.Mesh;
    const hills = view.group.getObjectByName('distant-ridges') as THREE.Mesh;
    expect(hills.material).toBe(ground.material);
    const positions = hills.geometry.getAttribute('position'), uv = hills.geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(positions.getX(i) / 6000 + 0.5);
      expect(uv.getY(i)).toBeCloseTo(0.5 - positions.getZ(i) / 6000);
    }
    const leaves = (view.group.getObjectByName('hinterland-crowns') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    view.update(town, 1); const summer = leaves.color.clone();
    town.weather.snow = 0.8; const before = JSON.stringify(town);
    view.update(town, 0.2); expect(JSON.stringify(town)).toBe(before);
    expect(leaves.color.r).toBeGreaterThan(summer.r);
    town.weather.snow = 0; view.update(town, 1); expect(leaves.color.equals(summer)).toBe(true);
    view.dispose();
  });
});
