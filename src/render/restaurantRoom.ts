import * as THREE from 'three';
import type { Floor, RestaurantSubtype } from '../core/types';
import { ROOM_LIFE, diningTableX } from '../core/roomLife';
import { floorY } from './layout';
import { batchStaticMeshes } from './staticBatch';
import { indoorPlant } from './indoorPlants';

export class RestaurantRoom extends THREE.Group {
  constructor(readonly lampMaterial: THREE.MeshStandardMaterial) { super(); }

  updateLighting(daylight: number, occupied: boolean): void {
    const night = 1 - (Number.isFinite(daylight) ? Math.max(0, Math.min(1, daylight)) : 1);
    this.lampMaterial.emissiveIntensity = night * (occupied ? 0.75 : 0.08);
  }
}

/** Four working dining rooms, not a generic room with a second set of props.
 * Coordinates deliberately retain the real worker/customer staging in roomLife.
 * All materials/geometry are owned by the floor; no lights, actors or income. */
export function restaurantRoom(floor: Floor): RestaurantRoom {
  const subtype: RestaurantSubtype = ['coffee', 'fastfood', 'fine-dining', 'bar'].includes(floor.subtype ?? '')
    ? floor.subtype as RestaurantSubtype : 'coffee';
  const coffee = subtype === 'coffee', diner = subtype === 'fastfood', fine = subtype === 'fine-dining', bar = subtype === 'bar';
  const material = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const palette = {
    wood: material(bar ? 0x534135 : 0x987654),
    dark: material(0x303835),
    cream: material(0xe6dfcc),
    accent: material(diner ? 0x9b5146 : bar ? 0x667567 : fine ? 0x75857a : 0xab8460),
    seat: material(diner ? 0x9c4941 : bar ? 0x765b5f : fine ? 0x637c70 : 0x547369, 0.98),
    steel: material(0x9da6a7, 0.44, 0.55),
    brass: material(0xac8d57, 0.4, 0.6),
    porcelain: material(0xf6f0e1, 0.55),
    glass: material(0x546d56, 0.35),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf0d9ac, roughness: 0.7, emissive: 0xffc377, emissiveIntensity: 0 }),
  };
  const root = new RestaurantRoom(palette.lamp); root.name = `restaurant-interior:${subtype}`; root.position.y = floorY(floor.level);
  const part = (name: string) => { const group = new THREE.Group(); group.name = name; root.add(group); return group; };
  const mesh = (parent: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z);
    object.receiveShadow = true; parent.add(object); return object;
  };
  const box = (parent: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cylinder = (parent: THREE.Group, top: number, bottom: number, h: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(parent, new THREE.CylinderGeometry(top, bottom, h, 12), mat, x, y, z);
  const cup = (parent: THREE.Group, x: number, y: number, z: number) => {
    cylinder(parent, 0.1, 0.075, 0.15, palette.porcelain, x, y + 0.075, z);
    cylinder(parent, 0.075, 0.075, 0.006, palette.dark, x, y + 0.152, z);
    const handle = mesh(parent, new THREE.TorusGeometry(0.045, 0.014, 4, 8), palette.porcelain, x + 0.1, y + 0.08, z);
    handle.rotation.y = Math.PI / 2;
  };
  const bottle = (parent: THREE.Group, x: number, y: number, z: number, index: number) => {
    cylinder(parent, 0.07, 0.08, 0.27, index % 2 ? palette.glass : palette.accent, x, y + 0.135, z);
    cylinder(parent, 0.03, 0.05, 0.12, palette.glass, x, y + 0.33, z);
    box(parent, 0.1, 0.1, 0.008, palette.cream, x, y + 0.15, z + 0.075);
  };

  const dining = part('restaurant-dining');
  // The floor finish sits above the slab, never over the lift waiting lanes.
  box(dining, 6.6, 0.025, 2.5, bar ? palette.seat : palette.cream, -3, 0.016, 0.05);
  if (coffee) {
    for (let i = 0; i < 10; i++) box(dining, 0.63, 0.012, 2.46, i % 3 ? palette.wood : palette.accent, -5.94 + i * 0.65, 0.035, 0.05);
  } else if (diner) {
    for (let col = 0; col < 10; col++) for (let row = 0; row < 4; row++) {
      if ((col + row) % 2 === 0) box(dining, 0.64, 0.012, 0.6, palette.accent, -5.94 + col * 0.65, 0.035, -0.85 + row * 0.6);
    }
  } else {
    for (const z of [-1.1, 1.2]) box(dining, 6.4, 0.012, 0.04, palette.brass, -3, 0.035, z);
  }
  for (let index = 0; index < ROOM_LIFE.diningX.length; index++) {
    const x = diningTableX(floor.level, index), z = 0.1;
    if (diner || fine) box(dining, 1.1, 0.08, 0.82, fine ? palette.porcelain : palette.cream, x, 0.72, z);
    else cylinder(dining, 0.54, 0.54, 0.075, palette.wood, x, 0.72, z);
    cylinder(dining, 0.07, 0.09, 0.64, diner ? palette.steel : palette.brass, x, 0.36, z);
    cylinder(dining, 0.3, 0.34, 0.065, palette.dark, x, 0.07, z);
    for (const side of [-1, 1]) {
      const sx = x + side * 0.78;
      // Backs face away from the table, matching the seated actor's facing.
      box(dining, 0.44, 0.1, diner ? 0.72 : 0.5, palette.seat, sx, 0.43, z);
      box(dining, 0.08, diner ? 0.66 : 0.48, diner ? 0.72 : 0.5, palette.seat, sx + side * 0.25, 0.68, z);
      for (const dz of [-0.18, 0.18]) box(dining, 0.035, 0.37, 0.035, palette.dark, sx, 0.22, z + dz);
      if (fine) {
        // Linen drops hang from the supported tabletop, not a floating front prop.
        box(dining, 0.035, 0.21, 0.81, palette.porcelain, x + side * 0.55, 0.64, z);
        cylinder(dining, 0.16, 0.16, 0.025, palette.cream, x + side * 0.31, 0.778, z);
        for (const dz of [-0.24, 0.24]) box(dining, 0.04, 0.015, 0.18, palette.steel, x + side * 0.32, 0.782, z + dz);
      }
    }
    if (coffee) cup(dining, x, 0.76, z);
    else if (diner) {
      box(dining, 0.5, 0.035, 0.37, palette.steel, x, 0.777, z);
      cylinder(dining, 0.085, 0.07, 0.22, palette.porcelain, x + 0.18, 0.9, z);
      box(dining, 0.014, 0.16, 0.014, palette.accent, x + 0.18, 1.06, z);
      box(dining, 0.2, 0.1, 0.21, palette.accent, x - 0.14, 0.84, z);
    } else {
      cylinder(dining, 0.045, 0.09, 0.045, palette.brass, x, 0.79, z);
      cylinder(dining, 0.04, 0.04, 0.2, palette.porcelain, x, 0.91, z);
      cylinder(dining, 0.012, 0.025, 0.06, palette.lamp, x, 1.04, z);
      for (const side of [-1, 1]) {
        cylinder(dining, 0.025, 0.05, 0.12, palette.steel, x + side * 0.28, 0.825, z + 0.25);
        cylinder(dining, 0.075, 0.03, 0.12, palette.glass, x + side * 0.28, 0.94, z + 0.25);
      }
    }
    box(dining, 0.025, 0.4, 0.025, palette.dark, x, 2.7, z);
    cylinder(dining, 0.1, 0.26, 0.2, fine || bar ? palette.brass : palette.accent, x, 2.42, z);
    cylinder(dining, 0.23, 0.23, 0.02, palette.lamp, x, 2.315, z);
  }

  const kitchen = part('restaurant-service');
  // Low cabinets and recognizable working appliances replace the black blocks.
  box(kitchen, 3.35, 0.72, 0.72, coffee || bar ? palette.wood : palette.steel, 6.05, 0.42, -1.5);
  box(kitchen, 3.5, 0.075, 0.85, palette.cream, 6.05, 0.82, -1.5);
  for (const x of [4.95, 6.05, 7.15]) {
    box(kitchen, 0.98, 0.6, 0.04, coffee || bar ? palette.accent : palette.steel, x, 0.43, -1.12);
    box(kitchen, 0.28, 0.035, 0.055, palette.dark, x, 0.66, -1.08);
  }
  // Splashback sits behind the work surface; the high hood leaves heads visible.
  box(kitchen, 3.45, 0.85, 0.055, palette.cream, 6.05, 1.3, -1.91);
  for (let row = 0; row < 4; row++) box(kitchen, 3.4, 0.018, 0.008, palette.accent, 6.05, 0.93 + row * 0.2, -1.877);
  for (let col = 0; col < 7; col++) box(kitchen, 0.014, 0.8, 0.008, palette.accent, 4.58 + col * 0.48, 1.3, -1.877);
  if (coffee || bar) {
    box(kitchen, 0.72, 0.025, 0.5, palette.dark, 6.55, 0.867, -1.5);
    box(kitchen, 0.57, 0.02, 0.36, palette.steel, 6.55, 0.885, -1.5);
    box(kitchen, 0.04, 0.3, 0.04, palette.steel, 6.55, 1.02, -1.78);
    box(kitchen, 0.04, 0.04, 0.2, palette.steel, 6.55, 1.15, -1.7);
    for (let i = 0; i < 3; i++) cylinder(kitchen, 0.15, 0.15, 0.12, palette.porcelain, 4.9, 0.91 + i * 0.12, -1.5);
    if (bar) for (let i = 0; i < 4; i++) bottle(kitchen, 5.5 + i * 0.5, 1.9, -2.3, i);
    else for (let i = 0; i < 4; i++) box(kitchen, 0.22, 0.36, 0.2, i % 2 ? palette.cream : palette.accent, 5.5 + i * 0.5, 2.08, -2.3);
    box(kitchen, 2.4, 0.06, 0.4, palette.wood, 6.25, 1.87, -2.3);
  } else {
    box(kitchen, 1.35, 0.04, 0.66, palette.dark, 4.98, 0.879, -1.5);
    for (const x of [4.68, 5.26]) for (const z of [-1.7, -1.3]) cylinder(kitchen, 0.13, 0.13, 0.025, palette.steel, x, 0.91, z);
    cylinder(kitchen, 0.19, 0.15, 0.16, palette.steel, 4.9, 1.0, -1.3);
    box(kitchen, 0.32, 0.04, 0.06, palette.dark, 5.13, 1.04, -1.3);
    box(kitchen, 0.77, 0.36, 0.04, palette.dark, 4.95, 0.39, -1.09);
    box(kitchen, 0.66, 0.19, 0.02, palette.steel, 4.95, 0.37, -1.063);
    box(kitchen, 1.75, 0.2, 0.8, palette.steel, 5, 2.22, -1.52);
    box(kitchen, 1.25, 0.035, 0.06, palette.lamp, 5, 2.105, -1.16);
    box(kitchen, 0.65, 0.52, 0.47, palette.steel, 5, 2.56, -1.68);
    for (let i = 0; i < 7; i++) box(kitchen, 0.11, 0.025, 0.58, palette.dark, 4.43 + i * 0.19, 2.105, -1.52);
    box(kitchen, 0.7, 0.04, 0.45, palette.wood, 6.2, 0.88, -1.5);
    for (let i = 0; i < 4; i++) cylinder(kitchen, 0.17, 0.17, 0.04, palette.porcelain, 7.1, 0.89 + i * 0.04, -1.5);
    if (diner) {
      box(kitchen, 0.4, 0.27, 0.42, palette.steel, 6.8, 1.0, -1.5);
      box(kitchen, 0.28, 0.025, 0.3, palette.dark, 6.8, 1.145, -1.5);
    }
  }

  if (coffee || bar) {
    const counter = part(coffee ? 'espresso-counter' : 'lounge-bar');
    const width = coffee ? 2.4 : 4.6, cx = ROOM_LIFE.coffee.x, cz = ROOM_LIFE.coffee.z;
    box(counter, width, 0.78, 0.62, palette.wood, cx, 0.42, cz);
    box(counter, width + 0.12, 0.085, 0.77, bar ? palette.dark : palette.cream, cx, 0.85, cz);
    for (let i = 0; i < Math.floor(width / 0.18); i++) box(counter, 0.05, 0.67, 0.035, palette.accent, cx - width / 2 + 0.1 + i * 0.18, 0.44, cz + 0.33);
    if (coffee) {
      box(counter, 0.95, 0.42, 0.36, palette.steel, cx, 1.1, cz);
      box(counter, 0.76, 0.24, 0.04, palette.dark, cx, 1.08, cz + 0.2);
      box(counter, 0.87, 0.04, 0.26, palette.steel, cx, 0.93, cz + 0.23);
      for (const dx of [-0.23, 0.23]) {
        cylinder(counter, 0.065, 0.065, 0.08, palette.brass, cx + dx, 1.08, cz + 0.22);
        box(counter, 0.04, 0.04, 0.16, palette.dark, cx + dx, 1.05, cz + 0.31);
      }
      cylinder(counter, 0.14, 0.12, 0.28, palette.dark, cx - 0.88, 1.03, cz);
      cylinder(counter, 0.14, 0.1, 0.18, palette.accent, cx - 0.88, 1.26, cz);
      cup(counter, cx + 0.86, 0.897, cz + 0.07);
    } else {
      for (let i = 0; i < 4; i++) bottle(counter, cx + 0.75 + i * 0.35, 0.897, cz - 0.13, i);
      box(counter, 4.3, 0.045, 0.045, palette.brass, cx, 0.23, cz + 0.55);
      for (const dx of [-1.7, -0.65, 0.4, 1.45]) {
        cylinder(counter, 0.24, 0.24, 0.1, palette.seat, cx + dx, 0.66, 2.7);
        cylinder(counter, 0.055, 0.055, 0.55, palette.brass, cx + dx, 0.34, 2.7);
        cylinder(counter, 0.19, 0.22, 0.05, palette.dark, cx + dx, 0.06, 2.7);
      }
    }
  }

  const back = part('restaurant-back-wall');
  // High, shallow details leave the seated guests and real working staff visible.
  if (fine || bar) {
    for (const x of [-3.65, -2.45, -0.05]) {
      box(back, 0.7, 0.95, 0.07, palette.brass, x, 1.8, -2.64);
      box(back, 0.57, 0.82, 0.025, palette.accent, x, 1.8, -2.59);
      cylinder(back, 0.18, 0.18, 0.02, palette.cream, x, 1.8, -2.57).rotation.x = Math.PI / 2;
    }
  } else {
    box(back, 2.55, 0.92, 0.07, palette.wood, -3.1, 1.9, -2.65);
    box(back, 2.39, 0.77, 0.025, palette.dark, -3.1, 1.9, -2.6);
    for (let row = 0; row < 3; row++) for (const x of [-3.75, -2.65]) {
      box(back, row === 0 ? 0.65 : 0.45, 0.025, 0.008, palette.cream, x, 2.12 - row * 0.2, -2.58);
      box(back, 0.12, 0.025, 0.008, palette.accent, x + 0.45, 2.12 - row * 0.2, -2.58);
    }
  }
  if (floor.variant === 'critics-choice') {
    const award = part('critics-review');
    // An earned, permanently framed review at the rear, not a front-window
    // placard hiding the kitchen staff. It keeps each trade's original menu/art.
    box(award, 1.25, 1.45, 0.085, palette.brass, -5.4, 1.76, -2.64);
    box(award, 1.1, 1.3, 0.035, palette.cream, -5.4, 1.76, -2.575);
    const seal = cylinder(award, 0.22, 0.22, 0.025, palette.brass, -5.4, 2.06, -2.54);
    seal.rotation.x = Math.PI / 2;
    // Ten small triangles avoid pulling a general polygon triangulator into
    // the game bundle for this one convex-centered decorative emblem.
    const vertices: number[] = [];
    for (let i = 0; i < 10; i++) {
      vertices.push(0, 0, 0);
      for (const corner of [i, i + 1]) {
        const angle = Math.PI / 2 + corner * Math.PI / 5, radius = corner % 2 ? 0.07 : 0.16;
        vertices.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      }
    }
    const star = new THREE.BufferGeometry();
    star.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); star.computeVertexNormals();
    mesh(award, star, palette.dark, -5.4, 2.06, -2.519);
    for (let row = 0; row < 4; row++) box(award, row === 0 ? 0.75 : row === 3 ? 0.45 : 0.65,
      row === 0 ? 0.045 : 0.02, 0.012, palette.dark, -5.4, 1.72 - row * 0.135, -2.548);
    for (const x of [-5.77, -5.03]) box(award, 0.045, 0.08, 0.25, palette.brass, x, 2.57, -2.56);
    box(award, 1.05, 0.07, 0.16, palette.brass, -5.4, 2.57, -2.4);
    box(award, 0.92, 0.025, 0.1, palette.lamp, -5.4, 2.52, -2.4);

    const settings = part('critics-table-settings');
    for (let index = 0; index < ROOM_LIFE.diningX.length; index++) {
      const x = diningTableX(floor.level, index);
      // Folded linen and a little brass menu holder on the existing tables;
      // no extra seats, invented diners or changes to the simulation.
      box(settings, 0.21, 0.018, 0.17, palette.cream, x - 0.23, 0.775, 0.38);
      box(settings, 0.15, 0.014, 0.045, palette.brass, x - 0.23, 0.792, 0.38);
      box(settings, 0.2, 0.025, 0.085, palette.brass, x + 0.23, 0.778, -0.19);
      box(settings, 0.15, 0.17, 0.025, palette.cream, x + 0.23, 0.874, -0.19);
      box(settings, 0.09, 0.018, 0.008, palette.brass, x + 0.23, 0.9, -0.173);
    }
  }
  batchStaticMeshes(root, new Set(Object.values(palette)));
  // A separate owned foliage palette, already batched by its builder.
  const plant = indoorPlant(true, floor.level - 1.4); plant.position.set(-1.4, 0, -1.7); root.add(plant);
  return root;
}
