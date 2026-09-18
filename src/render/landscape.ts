import * as THREE from 'three';
import type { Town } from '../core/town';
import { TOWER_SLOT_ORIGINS, TOWER_SPACING, LANDSCAPE_GROUND_SIZE } from './layout';
import { SnowCover } from './snowCover';
import { Hinterland } from './hinterland';

interface TreeSpot { x: number; z: number; scale: number; turn: number }
const SNOW_GROUND = new THREE.Color(0xf0f2eb);

/** Deterministic grove placement keeps both the cutaways and pedestrian routes open. */
export function landscapeTrees(): TreeSpot[] {
  const halfWidth = Math.max(...TOWER_SLOT_ORIGINS.map((o) => Math.abs(o.x)));
  const radius = halfWidth + 75;
  const trees: TreeSpot[] = [];
  for (let i = 0; i < 82; i++) {
    const x = ((i * 53.13) % (halfWidth * 2 + 60)) - halfWidth - 30;
    // Farther foreground groves never fill the street-level camera with giant trees.
    const z = (i % 3 === 0 ? 1 : -1) * (34 + (i * 17.7) % 110);
    if (Math.hypot(x, z) > radius - 8) continue;
    trees.push({ x, z, scale: 0.85 + (i * 7.1 % 10) / 16, turn: i * 2.4 });
  }
  return trees;
}

function grainAt(x: number, y: number): number {
  let hash = (Math.imul(x + 17, 374761393) + Math.imul(y + 31, 668265263)) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
}

/** Seamless value noise avoids both regular mower stripes and a tiled checkerboard. */
function meadowNoise(x: number, y: number, cells: number): number {
  const px = x / 128 * cells, py = y / 128 * cells;
  const ix = Math.floor(px), iy = Math.floor(py);
  const sx = px - ix, sy = py - iy;
  const tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
  const a = grainAt(ix % cells, iy % cells), b = grainAt((ix + 1) % cells, iy % cells);
  const c = grainAt(ix % cells, (iy + 1) % cells), d = grainAt((ix + 1) % cells, (iy + 1) % cells);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function surfaceTexture(paving: boolean): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hash = grainAt(x, y);
    const stagger = Math.floor(y / 32) % 2 * 16;
    const joint = (x + stagger) % 32 < 1 || y % 32 < 1;
    const tile = (Math.floor((x + stagger) / 32) * 13 + Math.floor(y / 32) * 7) % 5;
    const grain = paving ? (joint ? 162 : 215 + tile * 4) + hash * 8 :
      212 + hash * 7 + meadowNoise(x, y, 4) * 7 + meadowNoise(x, y, 16) * 5;
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = Math.round(grain); data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

function lampTexture(): THREE.DataTexture {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    data[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 2) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true;
  return texture;
}

/** A pedestrian promenade, earned streetscape and instanced background groves.
 * Does not change walk routes, plot ownership, lights or simulation statistics. */
export class LandscapeView {
  readonly group = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly crown = new THREE.IcosahedronGeometry(1, 1);
  private readonly trunk = new THREE.CylinderGeometry(0.14, 0.23, 1, 8);
  private readonly cap = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  private readonly pavingMap = surfaceTexture(true);
  private readonly groundMap = surfaceTexture(false);
  private readonly lightMap = lampTexture();
  private readonly grass = new THREE.MeshStandardMaterial({ color: 0x939b77, map: this.groundMap, roughness: 1 });
  private readonly paving = new THREE.MeshStandardMaterial({ color: 0xc7c0af, map: this.pavingMap, roughness: 0.96 });
  private readonly stone = new THREE.MeshStandardMaterial({ color: 0xa5a99c, roughness: 0.93 });
  private readonly soil = new THREE.MeshStandardMaterial({ color: 0x665b46, roughness: 1 });
  private readonly bark = new THREE.MeshStandardMaterial({ color: 0x6c5946, roughness: 1 });
  private readonly timber = new THREE.MeshStandardMaterial({ color: 0x977456, roughness: 0.83 });
  private readonly iron = new THREE.MeshStandardMaterial({ color: 0x394941, roughness: 0.55, metalness: 0.35 });
  private readonly leaves = [0x58724b, 0x647d51, 0x738857].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  private readonly snow = new THREE.MeshStandardMaterial({ color: 0xf0f3ec, roughness: 0.96, transparent: true, opacity: 0 });
  private readonly bulb = new THREE.MeshStandardMaterial({ color: 0xe8cf9f, emissive: 0xffd29b, emissiveIntensity: 0, roughness: 0.5 });
  private readonly pool = new THREE.MeshBasicMaterial({ color: 0xffdca4, map: this.lightMap, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly slots: THREE.Group[] = [];
  private readonly snowSurfaces: THREE.Object3D[] = [];
  private readonly furnitureSnow: SnowCover[] = [];
  private readonly hinterland = new Hinterland(this.grass);
  private disposed = false;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'town-landscape';
    const radius = Math.max(...TOWER_SLOT_ORIGINS.map((o) => Math.abs(o.x))) + 75;
    // Portrait town framing can reveal the old disk's hard rim. A two-triangle
    // ground plane extends beyond the survey far plane, retaining texture scale.
    const groundSize = LANDSCAPE_GROUND_SIZE;
    this.groundMap.repeat.set(64 * groundSize / (radius * 2), 64 * groundSize / (radius * 2));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), this.grass);
    ground.name = 'landscape-ground'; ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.group.add(ground);
    this.group.add(this.hinterland);
    const streetLength = TOWER_SPACING * TOWER_SLOT_ORIGINS.length + 10;
    this.paved(this.group, streetLength, 4, 0, 8.5, 'pedestrian-promenade');
    // Clear curb breaks at every lobby; no crossbar through a walking resident.
    for (const origin of TOWER_SLOT_ORIGINS) {
      this.block(this.group, this.stone, 16.3, 0.18, 0.25, origin.x - 8.85, 0.09, 6.35);
      this.block(this.group, this.stone, 14.3, 0.18, 0.25, origin.x + 9.85, 0.09, 6.35);
      this.block(this.group, this.stone, TOWER_SPACING, 0.18, 0.25, origin.x, 0.09, 10.65);
    }
    this.grove();
    TOWER_SLOT_ORIGINS.forEach((origin, index) => {
      const slot = new THREE.Group(); slot.name = `streetscape:${index}`; slot.position.x = origin.x; slot.visible = false;
      // The existing plot pad ends at z=7; this apron meets it without lifting feet.
      this.paved(slot, 23.6, 1.6, 0, 7.3, 'entrance-apron');
      this.block(slot, this.stone, 6.8, 0.22, 2.3, 11, 0.11, 12.45);
      this.block(slot, this.soil, 6.4, 0.23, 1.9, 11, 0.15, 12.45);
      for (let i = 0; i < 5; i++) {
        const shrub = new THREE.Mesh(this.crown, this.leaves[i % 3]);
        shrub.position.set(8.6 + i * 1.15, 0.55, 12.45 + Math.sin(i) * 0.22); shrub.scale.set(0.9, 0.55, 0.75);
        shrub.castShadow = true; slot.add(shrub);
      }
      const bedSnow = this.block(slot, this.snow, 6.3, 0.1, 1.8, 11, 0.31, 12.45);
      bedSnow.name = 'planting-snow'; this.snowSurfaces.push(bedSnow);
      this.bench(slot, -5, 12.3);
      this.lamp(slot, -12, 11.9);
      const caps = new SnowCover([
        { x: -5, y: 0.765, z: 12.3, width: 2.65, depth: 0.72 },
        { x: -5, y: 1.35, z: 12.68, width: 2.65, depth: 0.12 },
        { x: -12, y: 3.62, z: 11.9, width: 0.65, depth: 0.65 },
      ], 'street-furniture-snow');
      slot.add(caps); this.furnitureSnow.push(caps);
      this.group.add(slot); this.slots.push(slot);
    });
    parent.add(this.group);
  }

  private block(parent: THREE.Object3D, material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.box, material); mesh.scale.set(w, h, d); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  private paved(parent: THREE.Object3D, width: number, depth: number, x: number, z: number, name: string): void {
    const geometry = new THREE.BoxGeometry(width, 0.12, depth);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 4, uv.getY(i) * depth / 4);
    const mesh = new THREE.Mesh(geometry, this.paving); mesh.name = name;
    mesh.position.set(x, 0.06, z); mesh.receiveShadow = true; parent.add(mesh);
  }

  private bench(parent: THREE.Object3D, x: number, z: number): void {
    for (const dx of [-1.05, 1.05]) this.block(parent, this.iron, 0.12, 0.65, 0.75, x + dx, 0.325, z);
    for (let slat = 0; slat < 4; slat++) {
      this.block(parent, this.timber, 2.65, 0.09, 0.16, x, 0.72, z - 0.27 + slat * 0.18);
    }
    for (let slat = 0; slat < 3; slat++) this.block(parent, this.timber, 2.65, 0.14, 0.1, x, 0.94 + slat * 0.17, z + 0.38);
  }

  private lamp(parent: THREE.Object3D, x: number, z: number): void {
    this.block(parent, this.iron, 0.35, 0.2, 0.35, x, 0.1, z);
    this.block(parent, this.iron, 0.13, 3.4, 0.13, x, 1.75, z);
    this.block(parent, this.iron, 0.65, 0.12, 0.65, x, 3.56, z);
    this.block(parent, this.bulb, 0.38, 0.43, 0.38, x, 3.28, z);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.5), this.pool);
    pool.name = 'lamp-pool'; pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.132, z - 1.6);
    parent.add(pool);
  }

  private grove(): void {
    const spots = landscapeTrees();
    const trunks = new THREE.InstancedMesh(this.trunk, this.bark, spots.length * 3);
    trunks.name = 'grove-trunks'; trunks.castShadow = true;
    const crowns = this.leaves.map((material, i) => {
      const mesh = new THREE.InstancedMesh(this.crown, material, spots.length);
      mesh.name = `grove-crowns:${i}`; mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
    });
    const caps = new THREE.InstancedMesh(this.cap, this.snow, spots.length * 3); caps.name = 'grove-snow';
    const object = new THREE.Object3D();
    spots.forEach((spot, i) => {
      for (let branch = 0; branch < 3; branch++) {
        const dx = Math.cos(spot.turn + branch * 2.1) * 0.7 * spot.scale;
        const dz = Math.sin(spot.turn + branch * 2.1) * 0.55 * spot.scale;
        object.position.set(spot.x + dx * 0.3, (branch === 0 ? 1.25 : 2) * spot.scale, spot.z + dz * 0.3);
        object.rotation.set(branch === 0 ? 0 : 0.35, spot.turn + branch * 2.1, branch === 0 ? 0 : 0.4);
        object.scale.set(spot.scale * (branch === 0 ? 1 : 0.55), spot.scale * (branch === 0 ? 2.5 : 1.5), spot.scale * 0.75);
        object.updateMatrix(); trunks.setMatrixAt(i * 3 + branch, object.matrix);
        object.position.set(spot.x + dx, (3 + (branch === 1 ? 0.5 : 0)) * spot.scale, spot.z + dz);
        object.rotation.set(0.15 * branch, spot.turn, 0.08 * branch);
        object.scale.set(1.25 * spot.scale, (branch === 1 ? 1.4 : 1.05) * spot.scale, 1.12 * spot.scale);
        object.updateMatrix(); crowns[branch].setMatrixAt(i, object.matrix);
        object.position.y += object.scale.y * 0.6;
        object.scale.multiply(new THREE.Vector3(0.87, 0.43, 0.87)); object.rotation.set(0, spot.turn, 0);
        object.updateMatrix(); caps.setMatrixAt(i * 3 + branch, object.matrix);
      }
    });
    this.group.add(trunks, ...crowns, caps); this.snowSurfaces.push(caps);
  }

  update(town: Town, daylight: number): void {
    if (this.disposed) return;
    for (let i = 0; i < this.slots.length; i++) this.slots[i].visible = !!town.slots[i]?.unlocked;
    const snow = Math.max(0, Math.min(1, town.weather.snow));
    this.hinterland.updateSnow(snow);
    this.grass.color.setHex(0x939b77).lerp(SNOW_GROUND, Math.pow(snow, 0.65));
    for (const surface of this.snowSurfaces) surface.visible = snow > 0.025;
    this.snow.opacity = snow * 0.96;
    this.furnitureSnow.forEach((caps) => caps.setAmount(snow));
    const night = 1 - Math.max(0, Math.min(1, daylight));
    this.bulb.emissiveIntensity = night * 1.15; this.pool.opacity = night * 0.38;
    this.paving.roughness = 0.96 - town.weather.wetness * 0.4;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.pavingMap.dispose(); this.groundMap.dispose(); this.lightMap.dispose();
  }
}
