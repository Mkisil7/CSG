import * as THREE from 'three';
import type { Architecture } from '../core/identity';
import { FLOOR_HEIGHT, ROOM_DEPTH, ROOM_LEFT, ROOM_RIGHT } from './layout';
import { batchExteriorMeshes } from './staticBatch';

/** Local, repeatable masonry. UVs below retain brick scale as a tower grows. */
function brickTexture(): THREE.DataTexture {
  const width = 64, height = 256, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / 32), shifted = (x + row % 2 * 16) % width;
    const mortar = y % 32 < 2 || shifted % 32 < 2;
    const brick = Math.floor(shifted / 32);
    const variation = (row * 17 + brick * 13) % 19;
    const grain = ((Math.imul(x + y * width, 1103515245) >>> 17) % 7);
    const offset = (y * width + x) * 4;
    data[offset] = mortar ? 173 : 166 + variation + grain;
    data[offset + 1] = mortar ? 164 : 110 + variation + grain;
    data[offset + 2] = mortar ? 146 : 83 + variation + grain;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

function palette(style: Architecture) {
  return {
    structure: new THREE.MeshStandardMaterial({ color: style === 'heritage' ? 0xffffff : style === 'modern' ? 0x414f55 : 0x927452,
      map: style === 'heritage' ? brickTexture() : null, roughness: style === 'modern' ? 0.45 : 0.9, metalness: style === 'modern' ? 0.4 : 0 }),
    stone: new THREE.MeshStandardMaterial({ color: style === 'modern' ? 0xc9cfca : 0xc7bba4, roughness: 0.91 }),
    metal: new THREE.MeshStandardMaterial({ color: style === 'heritage' ? 0x9d8860 : 0x73817d, roughness: 0.45, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xa5c7cb, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.18, metalness: 0.1 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x55764e, roughness: 0.95 }),
  };
}
type Palette = ReturnType<typeof palette>;

function block(parent: THREE.Group, material: THREE.MeshStandardMaterial, size: [number, number, number], position: [number, number, number], name?: string): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(...size);
  if (material.map) {
    const uv = geometry.getAttribute('uv'), points = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      const horizontal = Math.abs(normals.getX(i)) > 0.5 ? points.getZ(i) : points.getX(i);
      const vertical = Math.abs(normals.getY(i)) > 0.5 ? points.getZ(i) : points.getY(i);
      uv.setXY(i, horizontal / 1.2 + 0.5, vertical / 2 + 0.5);
    }
  }
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
  mesh.castShadow = true; mesh.receiveShadow = true; if (name) mesh.name = name;
  parent.add(mesh); return mesh;
}

/** Dispose unused palette members now; the floor renderer owns the returned group. */
function finish(group: THREE.Group, materials: Palette): THREE.Group {
  const used = new Set<THREE.Material>();
  group.traverse((object) => { if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) used.add(material); });
  for (const material of Object.values(materials)) if (!used.has(material)) { material.map?.dispose(); material.dispose(); }
  return group;
}

/** External finishes only: the central room opening and lift waiting areas stay clear. */
export function architectureFacade(style: Architecture, floors: number): THREE.Group {
  const root = new THREE.Group(), m = palette(style); root.name = `architecture:${style}`;
  for (let level = 0; level < floors; level++) {
    const levelGroup = new THREE.Group(); levelGroup.name = `facade-level:${level}`; root.add(levelGroup);
    const y = level * FLOOR_HEIGHT;
    for (const x of [ROOM_LEFT - 0.23, ROOM_RIGHT + 0.23]) {
      // Keep side batches separate: their bounds must not span the empty room.
      const group = new THREE.Group(); group.name = x < 0 ? 'facade-left' : 'facade-right'; levelGroup.add(group);
      block(group, m.structure, [0.23, FLOOR_HEIGHT, ROOM_DEPTH], [x, y + 1.5, 0], 'exterior-cladding');
      if (style === 'heritage') {
        block(group, m.structure, [0.75, FLOOR_HEIGHT, 0.65], [x, y + 1.5, 3.1], 'brick-pier');
        block(group, m.stone, [0.92, 0.25, 0.8], [x, y + 0.16, 3.12], 'stone-course');
        block(group, m.stone, [0.85, 0.16, 0.74], [x, y + 2.85, 3.12]);
        // Recessed side-panel surround and sill, visible when surveying the skyline.
        for (const z of [-1.7, 1.1]) {
          block(group, m.metal, [0.035, 1.65, 1.05], [x + (x < 0 ? -0.13 : 0.13), y + 1.6, z]);
          block(group, m.stone, [0.4, 0.13, 1.3], [x, y + 0.72, z]);
        }
      } else if (style === 'modern') {
        block(group, m.metal, [0.2, FLOOR_HEIGHT, 0.45], [x, y + 1.5, 3.12], 'steel-mullion');
        block(group, m.glass, [0.05, 2.5, 2.2], [x + (x < 0 ? -0.2 : 0.2), y + 1.5, 2.2], 'glass-fin');
        for (const z of [-2.3, -0.8, 0.7, 2.2]) block(group, m.stone, [0.14, 2.45, 0.12], [x + (x < 0 ? -0.15 : 0.15), y + 1.5, z]);
      } else {
        block(group, m.structure, [0.28, FLOOR_HEIGHT, 0.45], [x, y + 1.5, 3.12], 'timber-post');
        for (const z of [-2.2, -1.2, -0.2, 0.8, 1.8, 2.8]) block(group, m.structure, [0.15, 2.6, 0.12], [x + (x < 0 ? -0.17 : 0.17), y + 1.5, z]);
        block(group, m.stone, [0.85, 0.4, 0.82], [x, y + 0.65, 3.2], 'terrace-planter');
        for (let leaf = 0; leaf < 3; leaf++) {
          const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), m.plant);
          plant.name = 'trailing-greenery'; plant.position.set(x + (leaf - 1) * 0.18, y + 0.93 - leaf * 0.13, 3.35 + leaf * 0.13);
          plant.scale.set(0.8, 0.8 + leaf * 0.18, 0.8); plant.castShadow = true; group.add(plant);
        }
      }
    }
    block(levelGroup, style === 'modern' ? m.metal : m.stone, [15.5, style === 'modern' ? 0.1 : 0.18, 0.35], [1, y + 0.07, 3.14], 'floor-belt');
  }
  const group = new THREE.Group(); group.name = 'facade-cornice'; root.add(group);
  const top = floors * FLOOR_HEIGHT;
  if (style === 'heritage') {
    block(group, m.stone, [16.3, 0.22, 0.9], [1, top + 0.08, 3.2], 'heritage-cornice');
    for (let x = ROOM_LEFT; x <= ROOM_RIGHT; x += 1.2) block(group, m.stone, [0.32, 0.28, 0.55], [x, top - 0.14, 3.13]);
  } else if (style === 'modern') {
    block(group, m.metal, [16.2, 0.12, 0.7], [1, top + 0.08, 3.15], 'modern-roof-edge');
  } else {
    block(group, m.structure, [16.2, 0.22, 0.7], [1, top + 0.08, 3.15], 'garden-roof-edge');
  }
  batchExteriorMeshes(root, new Set(Object.values(m)));
  return finish(root, m);
}

/** Style-specific roof silhouette; earned gardens and landmark crowns are added separately. */
export function architectureRoof(style: Architecture, height: number): THREE.Group {
  const group = new THREE.Group(), m = palette(style); group.name = `roof-style:${style}`;
  if (style === 'heritage') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.2, 16), m.metal);
    tank.name = 'water-tank'; tank.position.set(6.5, height + 1.1, -1.4); tank.castShadow = true; group.add(tank);
    const lid = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.38, 16), m.metal);
    lid.position.set(6.5, height + 1.88, -1.4); group.add(lid);
    for (const y of [height + 0.72, height + 1.42]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.035, 6, 20), m.stone); hoop.rotation.x = Math.PI / 2; hoop.position.set(6.5, y, -1.4); group.add(hoop);
    }
    block(group, m.structure, [0.8, 1.35, 0.8], [-5.1, height + 1, -1.7], 'brick-chimney');
    block(group, m.stone, [1.05, 0.15, 1.05], [-5.1, height + 1.7, -1.7]);
  } else if (style === 'modern') {
    block(group, m.stone, [2.4, 1.05, 1.6], [6, height + 0.95, -1.5], 'rooftop-plant');
    for (let slat = 0; slat < 6; slat++) block(group, m.metal, [2.15, 0.08, 0.12], [6, height + 0.58 + slat * 0.15, -0.63]);
    block(group, m.metal, [2.7, 0.12, 1.85], [6, height + 1.52, -1.5]);
  } else {
    for (const x of [-5, -1.6]) for (const z of [-2.4, -0.5]) block(group, m.structure, [0.12, 1.8, 0.12], [x, height + 1.25, z]);
    for (let x = -5.2; x < -1.3; x += 0.48) block(group, m.structure, [0.12, 0.12, 2.35], [x, height + 2.2, -1.45], 'pergola-slat');
    block(group, m.structure, [3.8, 0.16, 0.14], [-3.3, height + 2.1, -2.4]);
    block(group, m.structure, [3.8, 0.16, 0.14], [-3.3, height + 2.1, -0.5]);
  }
  return finish(group, m);
}
