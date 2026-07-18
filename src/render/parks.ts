import * as THREE from 'three';
import { ROOM_DEPTH } from './layout';

const GRASS = new THREE.MeshLambertMaterial({ color: 0x86c96f });
const PATH = new THREE.MeshLambertMaterial({ color: 0xd8cbb0 });
const TRUNK = new THREE.MeshLambertMaterial({ color: 0xb08968 });
const LEAF = new THREE.MeshLambertMaterial({ color: 0x5faf6b });
const BENCH = new THREE.MeshLambertMaterial({ color: 0xa07948 });
const POST = new THREE.MeshLambertMaterial({ color: 0x555a66 });

/**
 * A park lot: a grassy pad with trees, benches, a path, and lamp posts whose
 * glow rises after dark (tied to the same day/night scalar as the towers).
 */
export class ParkView {
  readonly group = new THREE.Group();
  private lampBulbs: THREE.MeshLambertMaterial[] = [];
  private lampLights: THREE.PointLight[] = [];

  constructor(parent: THREE.Object3D, origin: { x: number; z: number }) {
    this.group.position.set(origin.x, 0, origin.z);

    const grass = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, ROOM_DEPTH + 7), GRASS);
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

    // Trees dotted around, kept off the paths.
    const treeSpots: [number, number][] = [
      [-8, -2], [-8, 3], [6, -2.5], [8, 2.5], [2, 3.5], [-1, -3],
    ];
    treeSpots.forEach(([x, z], i) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 6), TRUNK);
      trunk.position.y = 0.95;
      const scale = 0.9 + ((i * 5.3) % 8) / 12;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.3 * scale, 2.4 * scale, 7), LEAF);
      leaves.position.y = 1.5 + 1.2 * scale;
      trunk.castShadow = leaves.castShadow = true;
      tree.add(trunk, leaves);
      tree.position.set(x, 0.4, z);
      this.group.add(tree);
    });

    // A couple of benches by the path.
    for (const bx of [-1, 4]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.5), BENCH);
      bench.position.set(bx, 0.75, 2.7);
      bench.castShadow = true;
      this.group.add(bench);
      for (const dx of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.5), BENCH);
        leg.position.set(bx + dx, 0.55, 2.7);
        this.group.add(leg);
      }
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

    parent.add(this.group);
  }

  /** daylight is 1 at midday, 0 at deep night — invert it for the lamp glow. */
  updateNight(daylight: number): void {
    const night = 1 - daylight;
    for (const mat of this.lampBulbs) {
      mat.color.setRGB(0.23 + 0.77 * night, 0.25 + 0.6 * night, 0.29 + 0.34 * night);
    }
    for (const light of this.lampLights) light.intensity = night * 1.4;
  }

  dispose(parent: THREE.Object3D): void {
    parent.remove(this.group);
  }
}
