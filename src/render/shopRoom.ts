import * as THREE from 'three';
import type { Floor, ShopSubtype } from '../core/types';
import { ROOM_LIFE } from '../core/roomLife';
import { floorY } from './layout';
import { batchStaticMeshes } from './staticBatch';

export class ShopRoom extends THREE.Group {
  constructor(readonly lampMaterial: THREE.MeshStandardMaterial) { super(); }
  updateLighting(daylight: number, occupied: boolean): void {
    const night = 1 - (Number.isFinite(daylight) ? Math.max(0, Math.min(1, daylight)) : 1);
    this.lampMaterial.emissiveIntensity = night * (occupied ? 0.65 : 0.04);
  }
}

/** Owned, bounded retail sets. Tall stock stays at the rear, low browsing
 * islands follow the actual visitor positions, and the lift lanes stay clear. */
export function shopRoom(floor: Floor): ShopRoom {
  const subtype: ShopSubtype = floor.subtype === 'boutique' || floor.subtype === 'electronics' ? floor.subtype : 'grocery';
  const grocery = subtype === 'grocery', boutique = subtype === 'boutique';
  const material = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const p = {
    wood: material(boutique ? 0x9c7c66 : 0x8b7856), dark: material(0x343b39),
    cream: material(0xe6dfcf), accent: material(grocery ? 0x59715b : boutique ? 0xab7f79 : 0x728b99),
    red: material(grocery ? 0xab5544 : 0x956d62), green: material(0x758452),
    yellow: material(0xc5a05b), metal: material(boutique ? 0xb29b6b : 0x959e9e, 0.4, 0.55),
    screen: material(0x365c70, 0.42),
    lamp: new THREE.MeshStandardMaterial({ color: 0xeee5cd, emissive: 0xffd499, emissiveIntensity: 0, roughness: 0.7 }),
  };
  const root = new ShopRoom(p.lamp); root.name = `shop-interior:${subtype}`; root.position.y = floorY(floor.level);
  const part = (name: string) => { const group = new THREE.Group(); group.name = name; root.add(group); return group; };
  const mesh = (parent: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z); object.receiveShadow = true; parent.add(object); return object;
  };
  const box = (g: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cylinder = (g: THREE.Group, r: number, h: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.CylinderGeometry(r, r, h, 8), mat, x, y, z);
  const table = (g: THREE.Group, x: number, z: number, w = 1.5, d = 0.8) => {
    box(g, w, 0.075, d, boutique ? p.wood : p.cream, x, 0.7, z);
    for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) for (const dz of [-d / 2 + 0.1, d / 2 - 0.1])
      box(g, 0.065, 0.66, 0.065, p.metal, x + dx, 0.34, z + dz);
  };
  const folded = (g: THREE.Group, x: number, y: number, z: number, mat: THREE.Material) => {
    for (let i = 0; i < 3; i++) box(g, 0.47, 0.045, 0.34, i === 1 ? p.cream : mat, x, y + 0.024 + i * 0.05, z);
    box(g, 0.12, 0.006, 0.09, p.cream, x, y + 0.15, z + 0.03);
  };
  const device = (g: THREE.Group, x: number, y: number, z: number) => {
    box(g, 0.58, 0.035, 0.38, p.metal, x, y + 0.018, z);
    box(g, 0.58, 0.36, 0.045, p.dark, x, y + 0.2, z - 0.17);
    box(g, 0.5, 0.28, 0.008, p.screen, x, y + 0.21, z - 0.143);
    for (let row = 0; row < 3; row++) box(g, 0.39, 0.008, 0.015, p.dark, x, y + 0.04, z - 0.07 + row * 0.055);
  };

  const finish = part('shop-floor-finish');
  box(finish, 12.8, 0.024, 5.1, p.cream, 0.45, 0.016, 0.1);
  if (boutique) {
    for (let i = 0; i < 20; i++) box(finish, 0.61, 0.01, 5.04, i % 4 ? p.wood : p.accent, -5.67 + i * 0.64, 0.034, 0.1);
    box(finish, 5.6, 0.012, 1.75, p.cream, 1, 0.047, 1.95);
  } else {
    for (let x = -5.95; x < 6.8; x += grocery ? 1.28 : 2.56) box(finish, 0.02, 0.008, 5.08, p.accent, x, 0.034, 0.1);
    for (const z of [-1.6, 0.1, 1.8]) box(finish, 12.76, 0.008, 0.02, p.accent, 0.45, 0.034, z);
  }

  const checkout = part('shop-checkout'), cx = ROOM_LIFE.checkout.x, cz = ROOM_LIFE.checkout.z;
  box(checkout, 1.95, 0.72, 0.72, boutique ? p.accent : p.wood, cx, 0.4, cz);
  box(checkout, 2.06, 0.07, 0.8, p.cream, cx, 0.795, cz);
  box(checkout, 0.46, 0.035, 0.32, p.dark, cx - 0.55, 0.847, cz);
  box(checkout, 0.045, 0.14, 0.045, p.metal, cx - 0.55, 0.91, cz - 0.07);
  box(checkout, 0.43, 0.23, 0.045, p.dark, cx - 0.55, 1.04, cz - 0.07);
  box(checkout, 0.35, 0.16, 0.008, p.screen, cx - 0.55, 1.04, cz - 0.041);
  box(checkout, 0.17, 0.06, 0.25, p.dark, cx + 0.55, 0.86, cz + 0.19);
  for (const dx of [-0.7, 0, 0.7]) box(checkout, 0.02, 0.57, 0.018, p.metal, cx + dx, 0.43, cz + 0.37);

  const back = part(grocery ? 'market-stock-wall' : boutique ? 'boutique-clothing-rail' : 'device-showcase');
  if (boutique) {
    // Garments hang behind people, never across the front sightline.
    for (const x of [-1.8, 3.5]) { cylinder(back, 0.035, 2.12, p.metal, x, 1.1, -1.85); box(back, 0.5, 0.05, 0.6, p.metal, x, 0.075, -1.85); }
    box(back, 5.36, 0.06, 0.06, p.metal, 0.85, 2.14, -1.85);
    for (let i = 0; i < 8; i++) {
      const x = -1.38 + i * 0.62, cloth = [p.accent, p.cream, p.screen][i % 3];
      box(back, 0.025, 0.15, 0.025, p.metal, x, 2.05, -1.85);
      box(back, 0.43, 0.04, 0.06, p.wood, x, 1.97, -1.85);
      box(back, 0.36, 0.7, 0.21, cloth, x, 1.57, -1.85);
      for (const side of [-1, 1]) box(back, 0.12, 0.36, 0.18, cloth, x + side * 0.22, 1.7, -1.85).rotation.z = side * 0.25;
    }
    box(back, 1.2, 2.12, 0.08, p.metal, 5.5, 1.2, -2.55);
    box(back, 1.04, 1.96, 0.025, p.screen, 5.5, 1.2, -2.493);
  } else {
    for (const x of [-0.8, 2.0, 4.8]) {
      box(back, 2.38, 1.95, 0.1, grocery ? p.wood : p.dark, x, 1.03, -2.38);
      for (const dx of [-1.13, 1.13]) box(back, 0.08, 1.95, 0.75, p.metal, x + dx, 1.03, -2.01);
      for (let row = 0; row < 3; row++) {
        const y = 0.27 + row * 0.57;
        box(back, 2.25, 0.06, 0.75, p.cream, x, y, -2.01);
        for (let i = 0; i < 4; i++) {
          const sx = x - 0.8 + i * 0.53;
          if (grocery) {
            cylinder(back, 0.12, 0.27 + (i % 2) * 0.09, [p.red, p.green, p.yellow][(row + i) % 3], sx, y + 0.22, -1.8);
            box(back, 0.17, 0.12, 0.014, p.cream, sx, y + 0.22, -1.675);
          } else {
            box(back, 0.35, 0.33, 0.2, i % 2 ? p.accent : p.cream, sx, y + 0.2, -1.8);
            box(back, 0.18, 0.22, 0.016, p.screen, sx, y + 0.2, -1.69);
          }
          box(back, 0.2, 0.06, 0.015, p.cream, sx, y - 0.01, -1.625);
        }
      }
    }
  }

  const display = part(grocery ? 'market-produce-islands' : boutique ? 'boutique-folded-displays' : 'device-demo-islands');
  const displayX = subtype === 'electronics' ? ROOM_LIFE.deviceDisplayX : ROOM_LIFE.displayX;
  for (const [index, x] of displayX.entries()) {
    const z = 1.9;
    if (grocery) {
      box(display, 1.55, 0.58, 0.82, p.wood, x, 0.34, z);
      for (const dz of [-0.41, 0.41]) box(display, 1.6, 0.16, 0.045, p.wood, x, 0.65, z + dz);
      for (const dx of [-0.78, 0.78]) box(display, 0.045, 0.16, 0.84, p.wood, x + dx, 0.65, z);
      for (let col = 0; col < 5; col++) for (let row = 0; row < 2; row++) {
        const fruit = mesh(display, new THREE.SphereGeometry(0.12, 8, 5), [p.red, p.green, p.yellow][index], x - 0.56 + col * 0.28, 0.73, z - 0.18 + row * 0.34);
        if (index === 2) fruit.scale.set(1.15, 0.6, 0.65);
      }
      box(display, 0.35, 0.16, 0.035, p.dark, x, 0.8, z + 0.43);
      box(display, 0.2, 0.025, 0.009, p.cream, x, 0.8, z + 0.453);
    } else {
      table(display, x, z);
      if (boutique) { folded(display, x - 0.38, 0.74, z, p.accent); folded(display, x + 0.38, 0.74, z, p.screen); }
      else device(display, x, 0.74, z);
    }
  }
  if (boutique) { table(display, 2.6, 0.3, 1.4, 0.65); folded(display, 2.6, 0.74, 0.3, p.accent); }
  else if (!grocery) { table(display, 4.2, 0.1, 1.2, 0.65); device(display, 4.2, 0.74, 0.1); }

  const lighting = part('shop-track-lighting');
  box(lighting, 10.6, 0.045, 0.06, p.metal, 0.5, 2.79, -0.3);
  for (const x of [-4, -1, 2, 5]) {
    cylinder(lighting, 0.12, 0.16, p.dark, x, 2.66, -0.3);
    cylinder(lighting, 0.1, 0.015, p.lamp, x, 2.575, -0.3);
  }
  batchStaticMeshes(root, new Set(Object.values(p)));
  return root;
}
