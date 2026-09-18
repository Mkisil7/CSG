import * as THREE from 'three';
import type { FactorySubtype, Floor } from '../core/types';
import { ROOM_LIFE } from '../core/roomLife';
import { floorY } from './layout';
import { batchStaticMeshes } from './staticBatch';

export class FactoryRoom extends THREE.Group {
  constructor(readonly lampMaterial: THREE.MeshStandardMaterial) { super(); }
  updateLighting(daylight: number, occupied: boolean): void {
    const night = 1 - (Number.isFinite(daylight) ? Math.max(0, Math.min(1, daylight)) : 1);
    this.lampMaterial.emissiveIntensity = night * (occupied ? 0.6 : 0.04);
  }
}

/** Three working trades, with no extra actors or fabricated production. Tall
 * equipment stays behind the real workstations and the foreman's clear aisle. */
export function factoryRoom(floor: Floor): FactoryRoom {
  const subtype: FactorySubtype = floor.subtype === 'foodproc' || floor.subtype === 'electronics-fab' ? floor.subtype : 'assembly';
  const assembly = subtype === 'assembly', food = subtype === 'foodproc';
  const mat = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const p = {
    floor: mat(assembly ? 0x817e70 : food ? 0xbcc7bd : 0xb6c5cc),
    // Brushed, diffuse-biased steel stays legible in cutaway shadows without
    // an environment-reflection map; highly metallic surfaces read as black.
    cream: mat(0xe0e1d7), dark: mat(0x374243), steel: mat(0xc1cbca, 0.48, 0.22),
    accent: mat(assembly ? 0xa79254 : food ? 0x789c8b : 0x668b9b),
    wood: mat(0x947354), green: mat(0x4d7d68), screen: mat(0x3b6476, 0.4),
    lamp: new THREE.MeshStandardMaterial({ color: 0xeff1df, emissive: 0xe4efcf, emissiveIntensity: 0, roughness: 0.7 }),
  };
  const root = new FactoryRoom(p.lamp); root.name = `factory-interior:${subtype}`; root.position.y = floorY(floor.level);
  const part = (name: string) => { const group = new THREE.Group(); group.name = name; root.add(group); return group; };
  const mesh = (g: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.receiveShadow = true; g.add(object); return object;
  };
  const box = (g: THREE.Group, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const cyl = (g: THREE.Group, radius: number, height: number, material: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.CylinderGeometry(radius, radius, height, 12), material, x, y, z);
  const bench = (g: THREE.Group, x: number, z: number, width = 1.5) => {
    box(g, width, 0.09, 0.85, assembly ? p.wood : p.steel, x, 0.78, z);
    for (const dx of [-width / 2 + 0.1, width / 2 - 0.1]) for (const dz of [-0.32, 0.32])
      box(g, 0.075, 0.73, 0.075, p.dark, x + dx, 0.38, z + dz);
    box(g, width - 0.2, 0.055, 0.64, p.accent, x, 0.25, z);
  };

  const finish = part('factory-work-floor');
  box(finish, 12.4, 0.024, 5.3, p.floor, 0.5, 0.016, 0);
  if (food) {
    for (let i = 0; i < 10; i++) box(finish, 0.014, 0.01, 5.26, p.cream, -5.55 + i * 1.25, 0.033, 0);
    for (const z of [-1.75, -0.5, 0.75, 2]) box(finish, 12.35, 0.01, 0.014, p.cream, 0.5, 0.033, z);
    box(finish, 6.2, 0.015, 0.16, p.dark, 1, 0.036, 0.35);
    for (let i = 0; i < 22; i++) box(finish, 0.055, 0.012, 0.15, p.steel, -1.9 + i * 0.28, 0.049, 0.35);
  } else {
    // Walkway markings are paint, not raised trip hazards.
    for (const x of [-3.1, 4.55]) box(finish, 0.055, 0.008, 5.15, p.accent, x, 0.032, 0);
    for (const x of ROOM_LIFE.factoryX) box(finish, 1.5, 0.012, 0.7, assembly ? p.dark : p.green, x, 0.035, 2.2);
  }

  const work = part(assembly ? 'assembly-workbenches' : food ? 'food-processing-vats' : 'electronics-clean-benches');
  for (const x of ROOM_LIFE.factoryX) {
    if (food) {
      const z = 1.55;
      for (const dx of [-0.36, 0.36]) for (const dz of [-0.32, 0.32]) cyl(work, 0.04, 0.35, p.steel, x + dx, 0.2, z + dz);
      cyl(work, 0.54, 1.16, p.steel, x, 0.91, z);
      mesh(work, new THREE.SphereGeometry(0.54, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), p.steel, x, 1.49, z).scale.y = 0.36;
      for (const y of [0.4, 1.38]) cyl(work, 0.555, 0.045, p.cream, x, y, z);
      cyl(work, 0.055, 0.65, p.steel, x, 1.98, z);
      box(work, 0.1, 0.1, 0.98, p.steel, x, 2.3, z - 0.44);
      box(work, 0.4, 0.27, 0.06, p.dark, x, 1.2, z + 0.55);
      box(work, 0.3, 0.16, 0.012, p.screen, x, 1.22, z + 0.587);
      const valve = mesh(work, new THREE.TorusGeometry(0.14, 0.024, 5, 12), p.accent, x, 0.82, z + 0.59);
      valve.name = 'processing-valve';
      for (const angle of [0, Math.PI / 2]) box(work, 0.25, 0.025, 0.03, p.accent, x, 0.82, z + 0.59).rotation.z = angle;
      box(work, 0.16, 0.06, 0.15, p.steel, x, 0.5, z + 0.58);
    } else {
      const z = 1.9; bench(work, x, z);
      if (assembly) {
        // A small vise, partly assembled housing and sorted component trays.
        box(work, 0.42, 0.14, 0.3, p.steel, x, 0.91, z + 0.19);
        for (const dx of [-0.15, 0.15]) box(work, 0.07, 0.15, 0.23, p.dark, x + dx, 1.04, z + 0.19);
        box(work, 0.1, 0.05, 0.24, p.accent, x, 1.04, z + 0.19);
        box(work, 0.4, 0.075, 0.24, p.dark, x - 0.43, 0.865, z - 0.18);
        for (const dx of [-0.52, -0.36]) cyl(work, 0.04, 0.055, p.steel, x + dx, 0.93, z - 0.18);
        box(work, 0.09, 0.045, 0.36, p.accent, x + 0.45, 0.87, z);
      } else {
        box(work, 1.13, 0.018, 0.55, p.green, x, 0.835, z);
        box(work, 0.5, 0.025, 0.32, p.accent, x, 0.86, z + 0.03);
        for (const dx of [-0.15, 0.08]) box(work, 0.1, 0.055, 0.1, p.dark, x + dx, 0.9, z + 0.03);
        for (let i = 0; i < 4; i++) box(work, 0.035, 0.025, 0.06, p.steel, x - 0.15 + i * 0.1, 0.89, z + 0.16);
        // Open-front extraction hood: side posts stay outside the operator.
        for (const dx of [-0.68, 0.68]) box(work, 0.065, 1.3, 0.07, p.cream, x + dx, 1.45, z - 0.33);
        box(work, 1.5, 0.23, 0.62, p.cream, x, 2.16, z - 0.15);
        box(work, 1.1, 0.025, 0.38, p.lamp, x, 2.033, z - 0.1);
        box(work, 0.28, 0.3, 0.15, p.dark, x + 0.46, 1.0, z - 0.18);
        box(work, 0.21, 0.18, 0.018, p.screen, x + 0.46, 1.02, z - 0.095);
      }
    }
  }

  const rear = part(assembly ? 'assembly-roller-line' : food ? 'food-packaging-line' : 'electronics-test-cabinets');
  if (assembly || food) {
    box(rear, 7, 0.12, 0.84, p.dark, 1, 0.7, -1.35);
    for (const x of [-2.1, 0, 2.2, 4.2]) for (const z of [-1.62, -1.08]) box(rear, 0.075, 0.65, 0.075, p.steel, x, 0.36, z);
    for (let i = 0; i < 22; i++) cyl(rear, 0.045, 0.78, p.steel, -2.22 + i * 0.3, 0.79, -1.35).rotation.x = Math.PI / 2;
    for (const x of [-1.6, 0.6, 2.8]) {
      box(rear, 0.5, 0.32, 0.46, food ? p.cream : p.wood, x, 1, -1.35);
      box(rear, 0.12, 0.18, 0.015, p.accent, x, 1.02, -1.112);
    }
    if (food) box(rear, 4.15, 0.11, 0.11, p.steel, 1, 2.3, 0.6);
    else {
      box(rear, 3.5, 1.05, 0.065, p.wood, 0.4, 1.95, -2.55);
      for (let i = 0; i < 7; i++) {
        box(rear, 0.045, 0.32 + i % 2 * 0.12, 0.055, p.steel, -0.95 + i * 0.43, 1.95, -2.49);
        box(rear, 0.17, 0.045, 0.055, p.dark, -0.95 + i * 0.43, 2.15, -2.49);
      }
    }
  } else {
    for (const x of [-1.5, 1, 3.5]) {
      box(rear, 1.7, 1.98, 0.65, p.cream, x, 1.05, -2.05);
      box(rear, 1.4, 0.73, 0.035, p.dark, x, 1.45, -1.706);
      for (const dx of [-0.36, 0.36]) box(rear, 0.57, 0.52, 0.025, p.screen, x + dx, 1.47, -1.671);
      for (const y of [0.48, 0.8]) {
        box(rear, 1.4, 0.25, 0.035, p.accent, x, y, -1.706);
        box(rear, 0.35, 0.035, 0.04, p.steel, x, y + 0.035, -1.665);
      }
    }
  }

  const service = part('factory-service-corner');
  // Clear foreman position (5.3, 1.3), and both outer lift waiting lanes.
  box(service, 1.0, 1.55, 0.6, assembly ? p.wood : p.cream, -4.55, 0.82, -1.6);
  for (const y of [0.5, 0.95, 1.4]) box(service, 0.84, 0.035, 0.04, p.steel, -4.55, y, -1.27);
  box(service, 0.88, 1.3, 0.48, p.cream, 6.5, 0.7, -1.9);
  box(service, 0.62, 0.5, 0.025, p.screen, 6.5, 1.01, -1.642);
  for (const x of [-0.17, 0.17]) cyl(service, 0.055, 0.04, p.accent, 6.5 + x, 0.57, -1.622).rotation.x = Math.PI / 2;
  const lights = part('factory-task-lighting');
  for (const x of [-2.8, 2.2, 6]) {
    box(lights, 1.7, 0.07, 0.3, p.dark, x, 2.76, -0.8);
    box(lights, 1.5, 0.015, 0.23, p.lamp, x, 2.716, -0.8);
  }
  batchStaticMeshes(root, new Set(Object.values(p)));
  return root;
}
