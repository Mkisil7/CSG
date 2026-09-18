import * as THREE from 'three';
import { batchStaticMeshes } from './staticBatch';

/** A folded, tapered leaf with a raised midrib and gently drooping tip.
 * Actual geometry, not transparent cards: readable from either room-camera side. */
function leafBlade(): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 6; row++) {
    const t = row / 6, width = Math.sin(Math.PI * t) * 0.24;
    const curve = Math.sin(Math.PI * t) * 0.16 - t * t * 0.13;
    positions.push(-width, curve, t, 0, curve + width * 0.3, t, width, curve, t);
    if (row < 6) {
      const a = row * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4,
        a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Static, deterministic room dressing. Owns its resources; FloorViews releases
 * them on rebuild. Five opaque batches, no lights, animation or actors. */
export function indoorPlant(big = false, variation = 0): THREE.Group {
  const root = new THREE.Group(); root.name = 'indoor-plant';
  const materials = {
    ceramic: new THREE.MeshStandardMaterial({ color: 0xb58368, roughness: 0.84 }),
    soil: new THREE.MeshLambertMaterial({ color: 0x44362a }),
    stem: new THREE.MeshLambertMaterial({ color: 0x6e7950 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x406d49, side: THREE.DoubleSide }),
    young: new THREE.MeshLambertMaterial({ color: 0x66894e, side: THREE.DoubleSide }),
  };
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const segment = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const direction = to.clone().sub(from), middle = from.clone().add(to).multiplyScalar(0.5);
    const mesh = add(new THREE.CylinderGeometry(radius * 0.75, radius, direction.length(), 5), materials.stem, middle.x, middle.y, middle.z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  };
  add(new THREE.CylinderGeometry(0.22, 0.16, 0.35, 12), materials.ceramic, 0, 0.175, 0);
  const rim = add(new THREE.TorusGeometry(0.215, 0.025, 4, 12), materials.ceramic, 0, 0.35, 0);
  rim.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.192, 0.192, 0.014, 12), materials.soil, 0, 0.35, 0);
  const count = big ? 10 : 7, height = big ? 1.16 : 1.04;
  const blade = leafBlade();
  let previous = new THREE.Vector3(0, 0.35, 0);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1), angle = i * 2.4 + variation * 0.71;
    const joint = new THREE.Vector3(Math.sin(t * 2) * 0.055, 0.48 + t * (height - 0.48), t * 0.025);
    segment(previous, joint, 0.018 * (1 - t * 0.4)); previous = joint;
    const reach = 0.09;
    const petiole = joint.clone().add(new THREE.Vector3(Math.sin(angle) * reach, 0.045, Math.cos(angle) * reach));
    segment(joint, petiole, 0.009);
    const leaf = add(blade, i % 3 === 2 ? materials.young : materials.leaf, petiole.x, petiole.y, petiole.z);
    leaf.rotation.set(-0.2 - t * 0.45, angle, 0, 'YXZ');
    const size = (big ? 0.48 : 0.38) * (1 - t * 0.35);
    leaf.scale.set(size, size, size);
  }
  // Batch before entering the floor tree; parent transforms still follow its reveal.
  batchStaticMeshes(root, new Set(Object.values(materials)));
  root.scale.setScalar(big ? 1.45 : 1);
  return root;
}
