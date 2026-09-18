import * as THREE from 'three';
import type { Floor } from '../core/types';
import { ROOM_LIFE } from '../core/roomLife';
import { floorY } from './layout';
import { batchStaticMeshes } from './staticBatch';
import { indoorPlant } from './indoorPlants';

export class HomeRoom extends THREE.Group {
  constructor(readonly lampMaterial: THREE.MeshStandardMaterial) { super(); }
  updateLighting(daylight: number, occupied: boolean, awake: boolean): void {
    const night = 1 - (Number.isFinite(daylight) ? Math.max(0, Math.min(1, daylight)) : 1);
    this.lampMaterial.emissiveIntensity = night * (awake ? 0.55 : occupied ? 0.06 : 0.02);
  }
}

/** A shared home for the actual four-person household. Beds and reading places
 * match core staging; small domestic details leave the people and cats visible. */
export function homeRoom(floor: Floor): HomeRoom {
  const color = (hex: number) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9 });
  const fabrics = [0x77958b, 0xac8581, 0x7c92a3];
  const p = {
    wood: color(0xb49a79), darkWood: color(0x79644e), cream: color(0xe6dfcc),
    fabric: color(fabrics[floor.level % fabrics.length]), accent: color(0xb78b68),
    green: color(0x687e60), paper: color(0xf2ead6), dark: color(0x3f4a48),
    metal: new THREE.MeshStandardMaterial({ color: 0xadb6ae, roughness: 0.6, metalness: 0.2 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf2e5c8, emissive: 0xffd2a0, emissiveIntensity: 0, roughness: 0.8 }),
  };
  const root = new HomeRoom(p.lamp); root.name = 'home-interior'; root.position.y = floorY(floor.level);
  const part = (name: string) => { const group = new THREE.Group(); group.name = name; root.add(group); return group; };
  const mesh = (group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.receiveShadow = true; group.add(object); return object;
  };
  const box = (g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const cyl = (g: THREE.Group, radius: number, h: number, m: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.CylinderGeometry(radius, radius, h, 10), m, x, y, z);

  const finish = part('home-floor-finish');
  box(finish, 13.7, 0.024, 4.95, p.darkWood, 0.65, 0.016, -0.1);
  for (let i = 0; i < 20; i++) box(finish, 0.63, 0.012, 4.91, i % 5 ? p.wood : p.darkWood, -5.72 + i * 0.67, 0.035, -0.1);
  box(finish, 11.6, 0.012, 1.65, p.cream, 0.1, 0.049, 1.25);
  for (const z of [0.5, 2]) box(finish, 11.4, 0.008, 0.06, p.fabric, 0.1, 0.059, z);

  const beds = part('home-sleeping-nooks');
  for (const x of ROOM_LIFE.homeBedX) {
    const z = ROOM_LIFE.homeBedZ;
    box(beds, 1.93, 0.19, 1.05, p.darkWood, x, 0.255, z);
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.39, 0.39]) box(beds, 0.1, 0.23, 0.1, p.darkWood, x + dx, 0.15, z + dz);
    box(beds, 1.82, 0.21, 0.98, p.cream, x, 0.455, z);
    box(beds, 0.1, 0.76, 1.06, p.wood, x - 0.96, 0.43, z);
    box(beds, 0.47, 0.08, 0.76, p.paper, x - 0.62, 0.59, z);
    // A folded quilt at the foot leaves the real sleeping neighbor readable.
    box(beds, 0.42, 0.065, 0.99, p.fabric, x + 0.56, 0.5925, z);
    for (const dz of [-0.32, 0.32]) box(beds, 0.42, 0.01, 0.035, p.cream, x + 0.56, 0.63, z + dz);
  }
  const seating = part('home-reading-nook');
  // A two-seat sofa plus two armchairs, each with a real seat at y=.48.
  for (const [index, seat] of ROOM_LIFE.homeSeats.entries()) {
    const w = index < 2 ? 0.8 : 0.78;
    box(seating, w, 0.12, 0.68, p.fabric, seat.x, 0.42, seat.z);
    box(seating, w, 0.56, 0.12, p.fabric, seat.x, 0.7, seat.z - 0.34);
    for (const dx of [-0.29, 0.29]) for (const dz of [-0.24, 0.24]) box(seating, 0.075, 0.29, 0.075, p.darkWood, seat.x + dx, 0.205, seat.z + dz);
    if (index !== 1) box(seating, 0.09, 0.25, 0.68, p.fabric, seat.x - w / 2 - 0.035, 0.565, seat.z);
    if (index !== 0) box(seating, 0.09, 0.25, 0.68, p.fabric, seat.x + w / 2 + 0.035, 0.565, seat.z);
  }
  // A low family table with a board game and mugs, between the sitting places.
  box(seating, 1.65, 0.065, 0.86, p.wood, -0.6, 0.49, 1.45);
  for (const dx of [-0.67, 0.67]) box(seating, 0.09, 0.43, 0.65, p.darkWood, -0.6 + dx, 0.245, 1.45);
  box(seating, 0.65, 0.018, 0.56, p.cream, -0.6, 0.535, 1.45);
  for (let i = 0; i < 9; i++) box(seating, 0.11, 0.012, 0.11, i % 2 ? p.green : p.accent, -0.8 + i % 3 * 0.19, 0.55, 1.27 + Math.floor(i / 3) * 0.17);
  for (const x of [-1.23, 0.03]) cyl(seating, 0.07, 0.13, p.paper, x, 0.58, 1.45);

  const kitchen = part('home-kitchenette');
  box(kitchen, 1.62, 0.78, 0.75, p.cream, 6.75, 0.45, -1.7);
  box(kitchen, 1.72, 0.065, 0.85, p.wood, 6.75, 0.87, -1.7);
  for (const x of [6.22, 6.75, 7.28]) {
    box(kitchen, 0.45, 0.63, 0.025, p.fabric, x, 0.47, -1.311);
    box(kitchen, 0.19, 0.028, 0.045, p.metal, x, 0.68, -1.283);
  }
  box(kitchen, 0.52, 0.018, 0.47, p.metal, 6.35, 0.914, -1.7);
  box(kitchen, 0.4, 0.016, 0.34, p.dark, 6.35, 0.925, -1.7);
  box(kitchen, 0.035, 0.21, 0.035, p.metal, 6.35, 1.02, -1.96);
  box(kitchen, 0.035, 0.035, 0.16, p.metal, 6.35, 1.12, -1.9);
  cyl(kitchen, 0.14, 0.25, p.cream, 7.18, 1.025, -1.67);
  box(kitchen, 0.1, 0.045, 0.1, p.dark, 7.18, 1.17, -1.67);

  const storage = part('home-keepsakes');
  box(storage, 1.25, 0.9, 0.42, p.wood, -0.15, 0.49, -2.33);
  for (const y of [0.13, 0.52]) {
    box(storage, 1.14, 0.025, 0.45, p.darkWood, -0.15, y, -2.3);
    for (let i = 0; i < 6; i++) box(storage, 0.12, 0.24 + i % 2 * 0.04, 0.28, [p.fabric, p.paper, p.green][i % 3], -0.6 + i * 0.18, y + 0.17, -2.28);
  }
  // Small pictures between the existing windows, clear of the cat perches.
  for (const x of [-3.05, 1.05, 5.2]) {
    box(storage, 0.53, 0.62, 0.055, p.darkWood, x, 1.96, -2.62);
    box(storage, 0.43, 0.52, 0.018, p.paper, x, 1.96, -2.58);
    box(storage, 0.3, 0.21, 0.012, p.fabric, x, 1.89, -2.562);
  }
  const lights = part('home-reading-lamps');
  for (const x of [-3.2, -0.55, 2.85, 5.45]) {
    box(lights, 0.4, 0.45, 0.45, p.wood, x, 0.28, -1.55);
    cyl(lights, 0.09, 0.025, p.metal, x, 0.52, -1.55);
    cyl(lights, 0.025, 0.2, p.metal, x, 0.625, -1.55);
    mesh(lights, new THREE.CylinderGeometry(0.12, 0.18, 0.23, 10), p.lamp, x, 0.805, -1.55);
  }
  batchStaticMeshes(root, new Set(Object.values(p)));
  const plant = indoorPlant(false, floor.level + 6); plant.position.set(6.45, 0, 1.2); root.add(plant);
  return root;
}
