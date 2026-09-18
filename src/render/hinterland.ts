import * as THREE from 'three';
import { LANDSCAPE_GROUND_SIZE } from './layout';

const FRONT = -62, BACK = -620, HALF_WIDTH = 900;
const COLUMNS = 128, ROWS = 48;
const LEAVES = new THREE.Color(0x637b66), SNOW = new THREE.Color(0xebf0ed);

/** Low, overlapping ridges behind the buildable street, not a camera-following
 * sky sticker. No randomness from the simulation and no geometry in town lots. */
export function hinterlandHeight(x: number, z: number): number {
  if (Math.abs(x) >= HALF_WIDTH || z >= FRONT || z <= BACK) return 0;
  const edge = THREE.MathUtils.smoothstep(HALF_WIDTH - Math.abs(x), 0, 140) *
    THREE.MathUtils.smoothstep(FRONT - z, 0, 35) * THREE.MathUtils.smoothstep(z - BACK, 0, 80);
  const near = 8 + 4 * Math.sin(x * 0.027) + 2 * Math.cos(x * 0.061);
  const middle = 23 + 9 * Math.sin(x * 0.011 + 1.2) + 4 * Math.cos(x * 0.033);
  const far = 37 + 12 * Math.sin(x * 0.009 - 0.8) + 7 * Math.cos(x * 0.019);
  return edge * (near * Math.exp(-(((z + 115) / 37) ** 2)) +
    middle * Math.exp(-(((z + 235) / 72) ** 2)) + far * Math.exp(-(((z + 420) / 112) ** 2)));
}

function fraction(index: number, salt: number): number {
  let hash = Math.imul(index + salt, 374761393);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
}

/** Interpolate the actual two triangles in the terrain cell, not the ideal
 * smooth ridge. Tree roots must touch the rendered slope, even on coarse LOD. */
function surfaceHeight(x: number, z: number): number {
  const dx = HALF_WIDTH * 2 / COLUMNS, dz = (FRONT - BACK) / ROWS;
  const column = (x + HALF_WIDTH) / dx, row = (z - BACK) / dz;
  const left = Math.floor(column) * dx - HALF_WIDTH, back = Math.floor(row) * dz + BACK;
  const u = column - Math.floor(column), v = row - Math.floor(row);
  const a = hinterlandHeight(left, back), b = hinterlandHeight(left, back + dz);
  const c = hinterlandHeight(left + dx, back + dz), d = hinterlandHeight(left + dx, back);
  return (u + v <= 1 ? a + u * (d - a) + v * (b - a) :
    c + (1 - u) * (b - c) + (1 - v) * (d - c)) - 0.02;
}

/** Three opaque submissions, no shadow maps, textures, lights or animation.
 * The owning landscape disposes these geometries/materials with its other art. */
export class Hinterland extends THREE.Group {
  private readonly leaves = new THREE.MeshStandardMaterial({ color: LEAVES, roughness: 1 });
  private snow = -1;

  constructor(ground: THREE.MeshStandardMaterial) {
    super(); this.name = 'wooded-hinterland';
    const terrain = new THREE.PlaneGeometry(HALF_WIDTH * 2, FRONT - BACK, COLUMNS, ROWS);
    terrain.rotateX(-Math.PI / 2); terrain.translate(0, 0, (FRONT + BACK) / 2);
    const points = terrain.getAttribute('position'), uv = terrain.getAttribute('uv');
    for (let i = 0; i < points.count; i++) {
      points.setY(i, hinterlandHeight(points.getX(i), points.getZ(i)) - 0.02);
      // Match the 6000-unit meadow plane's world-space texture, including its
      // phase. Sharing the ground material avoids a straight color seam.
      uv.setXY(i, points.getX(i) / LANDSCAPE_GROUND_SIZE + 0.5, 0.5 - points.getZ(i) / LANDSCAPE_GROUND_SIZE);
    }
    terrain.computeVertexNormals(); terrain.computeBoundingBox(); terrain.computeBoundingSphere();
    const hills = new THREE.Mesh(terrain, ground); hills.name = 'distant-ridges'; this.add(hills);

    const count = 128;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.25, 1, 5),
      new THREE.MeshStandardMaterial({ color: 0x706c60, roughness: 1 }), count);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), this.leaves, count * 3);
    trunks.name = 'hinterland-trunks'; crowns.name = 'hinterland-crowns';
    const transform = new THREE.Object3D(), shade = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Eight loose groves, rather than the old regularly spaced tree rows.
      const x = -735 + Math.floor(i / 16) * 210 + (fraction(i, 17) - 0.5) * 150;
      const z = -90 - fraction(i, 43) * 130, y = surfaceHeight(x, z);
      const scale = 0.85 + fraction(i, 91) * 0.85;
      transform.position.set(x, y + 1.7 * scale, z); transform.scale.set(scale, 3.4 * scale, scale);
      transform.rotation.set(0, fraction(i, 8) * Math.PI, 0); transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
      for (let branch = 0; branch < 3; branch++) {
        transform.position.set(x + (branch - 1) * scale * 0.8, y + (branch === 1 ? 4.1 : 3.3) * scale, z + (branch % 2) * scale * 0.45);
        transform.scale.set(1.5 * scale, (branch === 1 ? 1.8 : 1.4) * scale, 1.3 * scale);
        transform.rotation.set(0.1 * branch, fraction(i, 8) * Math.PI + branch, 0.15 * branch);
        transform.updateMatrix(); crowns.setMatrixAt(i * 3 + branch, transform.matrix);
        shade.setScalar(0.8 + fraction(i, 35) * 0.2); crowns.setColorAt(i * 3 + branch, shade);
      }
    }
    trunks.computeBoundingSphere(); crowns.computeBoundingSphere(); this.add(trunks, crowns);
  }

  updateSnow(amount: number): void {
    const snow = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
    if (snow === this.snow) return;
    this.snow = snow;
    this.leaves.color.copy(LEAVES).lerp(SNOW, snow * 0.8);
  }
}
