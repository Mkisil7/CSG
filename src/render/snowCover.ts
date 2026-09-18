import * as THREE from 'three';

export interface SnowSurface { x: number; y: number; z: number; width: number; depth: number }

/** Exposed flat box tops in a procedural group, in that group's coordinates.
 * Use only on axis-aligned roof/furniture geometry, never on room interiors. */
export function boxSnowSurfaces(root: THREE.Group): SnowSurface[] {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), surfaces: SnowSurface[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.geometry.type !== 'BoxGeometry') return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox!.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    if (size.x < 0.1 || size.z < 0.1) return;
    surfaces.push({ x: center.x, y: bounds.max.y, z: center.z, width: size.x, depth: size.z });
  });
  return surfaces;
}

/** One opaque batch of softly bevelled caps. Amount comes from saved simulation
 * accumulation, so pause/reduced motion retain snow and clear weather can thaw it. */
export class SnowCover extends THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  private amount = -1;
  private readonly transform = new THREE.Object3D();

  constructor(private readonly surfaces: SnowSurface[], name: string) {
    // Two rings give a small sloping shoulder rather than square white slabs.
    const geometry = new THREE.CylinderGeometry(0.46, 0.5, 1, 4, 1, false);
    geometry.rotateY(Math.PI / 4); geometry.scale(Math.SQRT2, 1, Math.SQRT2);
    super(geometry, new THREE.MeshStandardMaterial({ color: 0xf1f6fc, roughness: 0.98 }), surfaces.length);
    this.name = name; this.receiveShadow = true; this.castShadow = true;
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.setAmount(0);
  }

  setAmount(value: number): void {
    const snow = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
    if (snow === this.amount) return;
    this.amount = snow; this.visible = snow > 0.025;
    if (!this.visible) return;
    const height = 0.015 + snow * 0.18, coverage = 0.86 + snow * 0.14;
    this.surfaces.forEach((surface, i) => {
      this.transform.position.set(surface.x, surface.y + height / 2 + 0.003, surface.z);
      this.transform.scale.set(surface.width * coverage, height, surface.depth * coverage);
      this.transform.updateMatrix(); this.setMatrixAt(i, this.transform.matrix);
    });
    this.instanceMatrix.needsUpdate = true;
    this.computeBoundingBox(); this.computeBoundingSphere();
  }
}
