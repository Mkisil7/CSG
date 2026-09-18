import * as THREE from 'three';
import type { Floor, OfficeSubtype } from '../core/types';
import { ROOM_LIFE, officeDeskX } from '../core/roomLife';
import { floorY } from './layout';
import { batchStaticMeshes } from './staticBatch';
import { indoorPlant } from './indoorPlants';

export class OfficeRoom extends THREE.Group {
  constructor(readonly lampMaterial: THREE.MeshStandardMaterial) { super(); }
  updateLighting(daylight: number, occupied: boolean): void {
    const night = 1 - (Number.isFinite(daylight) ? Math.max(0, Math.min(1, daylight)) : 1);
    this.lampMaterial.emissiveIntensity = night * (occupied ? 0.65 : 0.04);
  }
}

/** Four working places plus a real two-person meeting corner. Rear trade
 * details leave people visible; earned startup displays occupy the rear center. */
export function officeRoom(floor: Floor): OfficeRoom {
  const subtype: OfficeSubtype = floor.subtype === 'law' || floor.subtype === 'creative' ? floor.subtype : 'tech';
  const law = subtype === 'law', creative = subtype === 'creative';
  const material = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const p = {
    wood: material(law ? 0x725645 : 0xa48b6a), dark: material(0x343e3c), cream: material(0xe4e1d4),
    metal: material(law ? 0xb09a68 : 0xa8b8b8, 0.5, 0.25), green: material(0x66856b),
    accent: material(law ? 0x667060 : creative ? 0xab7867 : 0x738d9b),
    screen: material(0x476875, 0.5), paper: material(0xf0eada),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf0e6cb, emissive: 0xffd3a0, emissiveIntensity: 0, roughness: 0.7 }),
  };
  const root = new OfficeRoom(p.lamp); root.name = `office-interior:${subtype}`; root.position.y = floorY(floor.level);
  const part = (name: string) => { const group = new THREE.Group(); group.name = name; root.add(group); return group; };
  const mesh = (g: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z); object.receiveShadow = true; g.add(object); return object;
  };
  const box = (g: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cyl = (g: THREE.Group, radius: number, height: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(g, new THREE.CylinderGeometry(radius, radius, height, 12), mat, x, y, z);
  const finish = part('office-floor-finish');
  box(finish, 13.7, 0.024, 4.95, creative ? p.wood : p.accent, 0.65, 0.016, -0.1);
  if (creative || law) for (let i = 0; i < 20; i++) box(finish, 0.63, 0.01, 4.91, i % 4 ? p.wood : p.accent, -5.72 + i * 0.67, 0.034, -0.1);
  box(finish, 6.3, 0.012, 1.7, law ? p.accent : p.cream, -2.5, 0.047, -0.35);
  const desks = part('office-workstations');
  for (let index = 0; index < 4; index++) {
    const standing = index === 3, x = standing ? ROOM_LIFE.standingDesk.x : officeDeskX(floor.level, index);
    const z = standing ? ROOM_LIFE.standingDesk.z - 0.75 : -1.5, h = standing ? 0.98 : 0.72;
    box(desks, 1.65, 0.075, 0.8, law || creative ? p.wood : p.cream, x, h, z);
    for (const dx of [-0.73, 0.73]) box(desks, 0.065, h - 0.04, 0.68, p.metal, x + dx, h / 2, z);
    box(desks, 0.32, 0.025, 0.23, p.dark, x, h + 0.055, z - 0.13);
    box(desks, 0.045, 0.12, 0.045, p.metal, x, h + 0.13, z - 0.2);
    box(desks, 0.62, 0.37, 0.045, p.dark, x, h + 0.35, z - 0.2);
    box(desks, 0.54, 0.29, 0.012, p.screen, x, h + 0.35, z - 0.169);
    box(desks, 0.47, 0.026, 0.17, p.dark, x, h + 0.051, z + 0.16);
    box(desks, 0.08, 0.035, 0.12, p.metal, x + 0.39, h + 0.06, z + 0.17);
    if (law) for (let i = 0; i < 3; i++) box(desks, 0.23, 0.025, 0.32, i % 2 ? p.cream : p.accent, x - 0.59, h + 0.06 + i * 0.03, z + 0.12);
    else if (creative) {
      box(desks, 0.3, 0.012, 0.38, p.paper, x - 0.56, h + 0.045, z + 0.08);
      for (let i = 0; i < 3; i++) box(desks, 0.06, 0.009, 0.1, [p.accent, p.green, p.screen][i], x - 0.65 + i * 0.08, h + 0.057, z + 0.1);
    } else {
      cyl(desks, 0.08, 0.15, p.cream, x - 0.57, h + 0.115, z + 0.1);
      cyl(desks, 0.06, 0.008, p.dark, x - 0.57, h + 0.193, z + 0.1);
    }
    if (!standing) {
      const cz = -0.6;
      box(desks, 0.48, 0.1, 0.47, p.accent, x, 0.43, cz);
      box(desks, 0.48, 0.45, 0.07, p.accent, x, 0.7, cz + 0.23);
      cyl(desks, 0.045, 0.32, p.metal, x, 0.24, cz);
      for (const angle of [0, Math.PI / 2]) box(desks, 0.49, 0.045, 0.045, p.dark, x, 0.07, cz).rotation.y = angle;
      for (const dx of [-0.22, 0.22]) for (const dz of [-0.19, 0.19]) cyl(desks, 0.045, 0.05, p.dark, x + dx, 0.04, cz + dz);
    }
  }
  const meeting = part('office-meeting-corner'), mx = ROOM_LIFE.meeting.x, mz = ROOM_LIFE.meeting.z;
  cyl(meeting, 0.6, 0.08, law ? p.wood : p.cream, mx, 0.72, mz);
  cyl(meeting, 0.07, 0.64, p.metal, mx, 0.36, mz); cyl(meeting, 0.32, 0.06, p.dark, mx, 0.07, mz);
  for (const side of [-1, 1]) {
    const x = mx + side * ROOM_LIFE.meeting.radius;
    box(meeting, 0.45, 0.1, 0.5, p.accent, x, 0.43, mz);
    box(meeting, 0.07, 0.45, 0.5, p.accent, x + side * 0.24, 0.7, mz);
    for (const dz of [-0.18, 0.18]) box(meeting, 0.045, 0.38, 0.045, p.wood, x, 0.24, mz + dz);
    box(meeting, 0.19, 0.018, 0.27, p.paper, mx + side * 0.3, 0.772, mz);
  }
  box(meeting, 1.75, 0.9, 0.06, p.metal, mx, 1.8, -2.57);
  box(meeting, 1.61, 0.76, 0.02, p.paper, mx, 1.8, -2.526);
  for (let i = 0; i < 3; i++) box(meeting, 0.28, 0.1 + i * 0.1, 0.018, p.accent, mx - 0.5 + i * 0.5, 1.65 + i * 0.05, -2.5);
  if (!law && !creative) {
    // Preserve the verified rear equipment envelope and three-material budget.
    const alcove = part('technology-server-alcove');
    for (const x of [1.8, 3.2]) {
      box(alcove, 1.05, 1.94, 0.64, p.dark, x, 0.97, -2.3);
      box(alcove, 1.12, 0.08, 0.71, p.metal, x, 0.04, -2.3);
      for (const dx of [-0.49, 0.49]) box(alcove, 0.045, 1.8, 0.06, p.metal, x + dx, 1, -1.96);
      for (let i = 0; i < 6; i++) {
        const y = 0.25 + i * 0.27;
        box(alcove, 0.88, 0.19, 0.045, p.metal, x, y, -1.955);
        for (const dy of [-0.045, 0, 0.045]) box(alcove, 0.53, 0.018, 0.02, p.dark, x - 0.1, y + dy, -1.924);
        box(alcove, 0.04, 0.04, 0.022, p.green, x + 0.34, y, -1.923);
      }
    }
  } else if (law) {
    const library = part('law-reference-library');
    for (const x of [1.75, 3.75]) {
      box(library, 1.75, 2.08, 0.08, p.wood, x, 1.08, -2.57);
      for (const dx of [-0.86, 0.86]) box(library, 0.075, 2.08, 0.44, p.wood, x + dx, 1.08, -2.37);
      for (let row = 0; row < 4; row++) {
        const y = 0.15 + row * 0.48;
        box(library, 1.7, 0.055, 0.44, p.wood, x, y, -2.37);
        for (let i = 0; i < 7; i++) {
          box(library, 0.16, 0.32 + i % 2 * 0.07, 0.29, i % 2 ? p.accent : p.dark, x - 0.65 + i * 0.21, y + 0.2, -2.29);
          box(library, 0.09, 0.018, 0.008, p.metal, x - 0.65 + i * 0.21, y + 0.22, -2.14);
        }
      }
    }
  } else {
    const studio = part('creative-material-wall');
    for (const x of [1.5, 3.55]) {
      box(studio, 1.65, 1.26, 0.07, p.wood, x, 1.64, -2.57);
      box(studio, 1.5, 1.1, 0.025, p.paper, x, 1.64, -2.518);
      for (let i = 0; i < 6; i++) box(studio, 0.33, 0.32, 0.018, [p.accent, p.green, p.screen][i % 3], x - 0.48 + i % 3 * 0.48, 1.39 + Math.floor(i / 3) * 0.49, -2.49);
      box(studio, 1.7, 0.7, 0.58, p.wood, x, 0.39, -2.18);
      for (const dx of [-0.5, 0, 0.5]) box(studio, 0.36, 0.22, 0.015, p.accent, x + dx, 0.45, -1.881);
    }
  }
  const lights = part('office-task-lighting');
  for (const x of [-3.5, 0, 6.8]) {
    cyl(lights, 0.015, 0.3, p.dark, x, 2.73, -0.6);
    mesh(lights, new THREE.ConeGeometry(0.25, 0.2, 12), p.accent, x, 2.48, -0.6);
    cyl(lights, 0.2, 0.015, p.lamp, x, 2.374, -0.6);
  }
  batchStaticMeshes(root, new Set(Object.values(p)));
  const plant = indoorPlant(false, floor.level + 5.15); plant.position.set(5.15, 0, -1.9); root.add(plant);
  return root;
}
