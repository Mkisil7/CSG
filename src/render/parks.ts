import * as THREE from 'three';
import { ROOM_DEPTH } from './layout';
import { batchExteriorMeshes } from './staticBatch';

const GRASS = new THREE.MeshStandardMaterial({ color: 0x789260, roughness: 1 });
const PATH = new THREE.MeshStandardMaterial({ color: 0xc6bba4, roughness: 0.95 });
const TRUNK = new THREE.MeshStandardMaterial({ color: 0x79614c, roughness: 1 });
const LEAF = [0x527650, 0x658658, 0x74945f].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
const BENCH = new THREE.MeshStandardMaterial({ color: 0x977458, roughness: 0.8 });
const POST = new THREE.MeshStandardMaterial({ color: 0x43554e, roughness: 0.5, metalness: 0.35 });
const SNOW = new THREE.MeshStandardMaterial({ color: 0xf0f3ec, roughness: 0.96, transparent: true, opacity: 0 });
const SNOW_TINT = new THREE.Color(0xf0f2eb);

/**
 * A park lot: a grassy pad with trees, benches, a path, and lamp posts whose
 * glow rises after dark (tied to the same day/night scalar as the towers).
 */
export class ParkView {
  readonly group = new THREE.Group();
  private lampBulbs: THREE.MeshLambertMaterial[] = [];
  private lampLights: THREE.PointLight[] = [];
  private snowCaps: THREE.InstancedMesh;
  private disposed = false;

  constructor(parent: THREE.Object3D, origin: { x: number; z: number }) {
    this.group.position.set(origin.x, 0, origin.z);

    const grass = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, ROOM_DEPTH + 7), GRASS);
    grass.name = 'park-lawn';
    grass.position.y = 0.26;
    grass.receiveShadow = true;
    this.group.add(grass);

    // A winding-ish path (two crossing strips).
    const pathH = new THREE.Mesh(new THREE.BoxGeometry(22, 0.06, 1.6), PATH);
    pathH.position.set(0, 0.42, 1.5);
    pathH.receiveShadow = true;
    this.group.add(pathH);
    const pathV = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, ROOM_DEPTH + 7), PATH);
    pathV.position.set(-3, 0.42, 0);
    pathV.receiveShadow = true;
    this.group.add(pathV);

    // Keep the east lawn open for its earned bandstand and audience sightline.
    const treeSpots: [number, number][] = [
      [-8, -2], [-8, 3], [8.5, -4.5], [9, 2.5], [-5.5, -4.5], [-1, -4.5],
    ];
    this.snowCaps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), SNOW, treeSpots.length * 3);
    this.snowCaps.name = 'park-snow'; this.snowCaps.visible = false;
    const capPose = new THREE.Object3D();
    treeSpots.forEach(([x, z], i) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.23, 2.4, 9), TRUNK);
      trunk.position.y = 1.2; trunk.castShadow = true; tree.add(trunk);
      const scale = 0.85 + (i % 3) * 0.12;
      for (let crown = 0; crown < 3; crown++) {
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15 * scale, 1), LEAF[(i + crown) % LEAF.length]);
        leaves.position.set((crown - 1) * 0.65, 2.8 + (crown === 1 ? 0.4 : 0), (crown % 2) * 0.3);
        leaves.scale.set(1, 1.1, 0.95); leaves.castShadow = true; leaves.receiveShadow = true; tree.add(leaves);
        capPose.position.set(x + leaves.position.x, 0.4 + leaves.position.y + 0.8 * scale, z + leaves.position.z);
        capPose.scale.set(0.96 * scale, 0.45 * scale, 0.9 * scale); capPose.updateMatrix();
        this.snowCaps.setMatrixAt(i * 3 + crown, capPose.matrix);
      }
      tree.position.set(x, 0.4, z);
      // Trees are static; bake only their translation into the park-local
      // meshes so trunks and like-colored crowns share submissions.
      for (const mesh of [...tree.children]) {
        mesh.position.add(tree.position); this.group.add(mesh);
      }
    });
    this.group.add(this.snowCaps);

    // A couple of benches by the path.
    for (const bx of [-7, 8]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.5), BENCH);
      bench.position.set(bx, 0.75, 4.8);
      bench.castShadow = true;
      this.group.add(bench);
      for (const dx of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.5), BENCH);
        leg.position.set(bx + dx, 0.55, 4.8);
        this.group.add(leg);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.12), BENCH);
      back.position.set(bx, 1.05, 5.05); back.castShadow = true; this.group.add(back);
    }

    // Lamp posts with real point lights that brighten at night.
    for (const lx of [-7, 7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3, 6), POST);
      post.position.set(lx, 1.9, 0.5);
      post.castShadow = true;
      this.group.add(post);
      const bulbMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), bulbMat);
      bulb.position.set(lx, 3.5, 0.5);
      this.group.add(bulb);
      const light = new THREE.PointLight(0xffd9a0, 0, 14, 2);
      light.position.set(lx, 3.5, 0.5);
      this.group.add(light);
      this.lampBulbs.push(bulbMat);
      this.lampLights.push(light);
    }

    batchExteriorMeshes(this.group, new Set([PATH, TRUNK, ...LEAF, BENCH, POST]));
    parent.add(this.group);
  }

  /** daylight is 1 at midday, 0 at deep night — invert it for the lamp glow. */
  updateNight(daylight: number, snow = 0): void {
    if (this.disposed) return;
    snow = Math.max(0, Math.min(1, snow));
    GRASS.color.setHex(0x789260).lerp(SNOW_TINT, Math.pow(snow, 0.65));
    PATH.color.setHex(0xc6bba4).lerp(SNOW_TINT, snow * 0.65);
    SNOW.opacity = snow * 0.96; this.snowCaps.visible = snow > 0.025;
    const night = 1 - daylight;
    for (const mat of this.lampBulbs) {
      mat.color.setRGB(0.23 + 0.77 * night, 0.25 + 0.6 * night, 0.29 + 0.34 * night);
    }
    for (const light of this.lampLights) light.intensity = night * 1.4;
  }

  dispose(parent: THREE.Object3D): void {
    if (this.disposed) return;
    this.disposed = true;
    parent.remove(this.group);
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of this.lampBulbs) material.dispose();
    this.snowCaps.dispose();
  }
}
