import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Keep a development-only A/B switch separate from room batching, so the
 * same town and camera can compare exterior submissions without removing art. */
export function batchExteriorMeshes(root: THREE.Group, palette: ReadonlySet<THREE.Material>): void {
  if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('unbatched-exteriors')) return;
  batchStaticMeshes(root, palette);
}

/** Batch owned, opaque, unnamed procedural details before their first render.
 * Stay within each parent: construction visibility/transforms remain intact.
 * Named controls, independently lit panes and imported assets stay separate. */
export function batchStaticMeshes(root: THREE.Group, palette: ReadonlySet<THREE.Material>): void {
  const retired = new Set<THREE.BufferGeometry>();
  const visit = (parent: THREE.Object3D) => {
    if (parent.userData.sharedAsset) return;
    const buckets = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
    for (const child of [...parent.children]) {
      if (child instanceof THREE.Group) visit(child);
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || child instanceof THREE.SkinnedMesh ||
        child.name || Object.keys(child.userData).length || child.children.length || !child.visible ||
        Array.isArray(child.material) || !palette.has(child.material) || child.material.transparent || child.geometry.morphAttributes.position) continue;
      if (child.matrixAutoUpdate) child.updateMatrix();
      if (child.matrix.determinant() <= 0) continue;
      const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${child.renderOrder}:${child.layers.mask}:${child.frustumCulled}:` +
        `${!!child.geometry.index}:${Object.keys(child.geometry.attributes).sort().join(',')}`;
      const bucket = buckets.get(key) ?? []; bucket.push(child); buckets.set(key, bucket);
    }
    for (const meshes of buckets.values()) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrix));
      const geometry = mergeGeometries(pieces, false);
      pieces.forEach((piece) => piece.dispose());
      if (!geometry) continue;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const source = meshes[0], batch = new THREE.Mesh(geometry, source.material);
      batch.name = 'static-room-batch'; batch.castShadow = source.castShadow; batch.receiveShadow = source.receiveShadow;
      batch.renderOrder = source.renderOrder; batch.layers.mask = source.layers.mask; batch.frustumCulled = source.frustumCulled;
      for (const mesh of meshes) { parent.remove(mesh); retired.add(mesh.geometry); }
      parent.add(batch);
    }
  };
  visit(root);
  // Shared geometry still used by a protected mesh or imported subtree stays alive.
  root.traverse((object) => { if (object instanceof THREE.Mesh) retired.delete(object.geometry); });
  retired.forEach((geometry) => geometry.dispose());
}
