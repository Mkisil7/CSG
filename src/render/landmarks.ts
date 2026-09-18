import * as THREE from 'three';
import type { Floor } from '../core/types';
import { floorY, ROOM_LEFT, ROOM_RIGHT } from './layout';
import { smoothBand } from './lighting';

/** Local emissive finishes suggest practical lighting without adding shadow passes. */
export class LandmarkRoom extends THREE.Group {
  private accents: { material: THREE.MeshStandardMaterial; peak: number }[] = [];

  accent(material: THREE.MeshStandardMaterial, peak: number, color = 0xffd3a0): void {
    material.emissive.setHex(color); material.emissiveIntensity = 0;
    this.accents.push({ material, peak });
  }

  updateLighting(daylight: number, occupied: boolean): void {
    const day = Number.isFinite(daylight) ? Math.max(0, Math.min(1, daylight)) : 1;
    const amount = (1 - smoothBand(0.15, 0.7, day)) * (occupied ? 1 : 0.22);
    for (const { material, peak } of this.accents) material.emissiveIntensity = amount * peak;
  }
}

/** Owned, static geometry: the real resident actors supply all movement. */
export function landmarkRoom(floor: Floor): LandmarkRoom {
  const group = new LandmarkRoom(); group.name = `landmark:${floor.landmark}`; group.position.y = floorY(floor.level);
  const stone = new THREE.MeshStandardMaterial({ color: 0xd1c9b7, roughness: 0.88 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xbda16c, metalness: 0.3, roughness: 0.38 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x8e7055, roughness: 0.82 });
  const green = new THREE.MeshStandardMaterial({ color: 0x527856, roughness: 0.95 });
  const paleGreen = new THREE.MeshStandardMaterial({ color: 0x819774, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xa4c9cb, transparent: true, opacity: 0.20, roughness: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const lamp = new THREE.MeshStandardMaterial({ color: floor.landmark === 'observatory' ? 0xeeb67a : 0xffecd0, roughness: 0.45 });
  group.accent(lamp, floor.landmark === 'observatory' ? 0.7 : 1.15);
  group.accent(stone, floor.landmark === 'observatory' ? 0.045 : 0.12);
  group.accent(timber, 0.08); group.accent(brass, 0.06);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = mat !== glass; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  // Open arcade: no opaque room wall hiding the special silhouette.
  box(15, 0.09, 5.8, stone, 1, 0.04, 0);
  box(15, 0.12, 0.16, brass, 1, 0.16, 2.96);
  box(14.7, 0.9, 0.035, glass, 1, 0.55, -2.85);
  for (const x of [ROOM_LEFT + 0.15, -2.8, 1, 4.8, ROOM_RIGHT - 0.15]) {
    box(0.09, 2.65, 0.09, brass, x, 1.38, -2.85);
  }
  box(15, 0.10, 0.10, brass, 1, 2.68, -2.85);
  const bench = (x: number, z: number) => {
    box(1.8, 0.12, 0.58, timber, x, 0.44, z);
    box(1.8, 0.5, 0.10, timber, x, 0.75, z - 0.28);
    for (const dx of [-0.65, 0.65]) box(0.1, 0.4, 0.4, brass, x + dx, 0.2, z);
  };
  if (floor.landmark === 'conservatory') {
    // Broad-leaf specimens, a reflecting pool and glass clerestory.
    box(14.8, 0.045, 2, glass, 1, 2.7, -1.8);
    for (const x of [-4, 1, 6]) {
      const arch = add(new THREE.TorusGeometry(1.12, 0.055, 6, 24, Math.PI), brass, x, 1.5, -2.72);
      arch.name = 'conservatory-arch';
      for (const side of [-1, 1]) box(0.08, 1.5, 0.08, brass, x + side * 1.12, 0.75, -2.72);
    }
    for (const x of [-4.8, 6.6]) {
      box(1.55, 0.46, 1.5, stone, x, 0.25, -1.6);
      add(new THREE.CylinderGeometry(0.10, 0.17, 1.5, 8), timber, x, 1.12, -1.6);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        const leaf = add(new THREE.SphereGeometry(0.65, 10, 7), i % 2 ? green : paleGreen, x + Math.cos(a) * 0.42, 1.9 + i % 2 * 0.2, -1.6 + Math.sin(a) * 0.42);
        leaf.scale.set(1, 0.45, 0.75);
      }
    }
    box(4.1, 0.40, 1.5, stone, 1, 0.25, -1.65);
    const water = new THREE.MeshStandardMaterial({ color: 0x508b94, roughness: 0.15, metalness: 0.3 });
    box(3.75, 0.025, 1.18, water, 1, 0.46, -1.65);
    for (const x of [-3.2, -0.4, 2.4, 5.2]) {
      bench(x, 0.8);
      // Recessed reading strips leave the walking paths and seats clear.
      box(1.5, 0.045, 0.05, lamp, x, 0.37, 1.1);
    }
    group.accent(green, 0.12, 0x91b66e); group.accent(paleGreen, 0.12, 0xadc98c);
    for (const x of [-5.5, 7.5]) for (const z of [0.7, 2]) {
      box(0.6, 0.5, 0.65, timber, x, 0.25, z);
      add(new THREE.SphereGeometry(0.4, 8, 6), green, x, 0.8, z);
    }
  } else if (floor.landmark === 'observatory') {
    // Low amber guides preserve the dark-sky character of the viewing deck.
    for (const x of [-5.5, -1, 2.6, 7.2]) box(0.5, 0.035, 0.1, lamp, x, 0.225, 2.96);
    // Two usable telescopes at the open front, and a brass orrery behind them.
    for (const x of [-3.2, 4.2]) {
      const instrument = new THREE.Group(); instrument.name = 'landmark-telescope'; instrument.position.set(x, 0, 1.1);
      const metal = new THREE.MeshStandardMaterial({ color: 0x4a6072, metalness: 0.6, roughness: 0.4 });
      for (let i = 0; i < 3; i++) {
        const foot = new THREE.Vector3(Math.cos(i * 2.094) * 0.44, 0.08, Math.sin(i * 2.094) * 0.44);
        const top = new THREE.Vector3(0, 1.08, 0), direction = top.clone().sub(foot);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, direction.length(), 6), brass);
        leg.position.copy(foot).add(top).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); instrument.add(leg);
      }
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 1.05, 14), metal);
      tube.rotation.x = Math.PI / 2 - 0.3; tube.position.set(0, 1.25, 0.05); instrument.add(tube);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 16), brass);
      rim.position.set(0, 1.405, 0.55); rim.rotation.x = -0.3; instrument.add(rim);
      group.add(instrument);
    }
    box(1.4, 0.7, 1.3, stone, 1, 0.4, -1.8);
    add(new THREE.SphereGeometry(0.18, 12, 8), brass, 1, 1.35, -1.8);
    for (let i = 0; i < 3; i++) {
      const orbit = add(new THREE.TorusGeometry(0.45 + i * 0.19, 0.025, 5, 30), brass, 1, 1.35, -1.8);
      orbit.rotation.x = 0.5 + i * 0.6; orbit.rotation.y = i * 0.5;
    }
    const chart = new THREE.MeshStandardMaterial({ color: 0x243653, roughness: 0.85 });
    box(2.8, 1.7, 0.12, chart, -4.2, 1.4, -2.5);
    for (let i = 0; i < 12; i++) add(new THREE.SphereGeometry(0.04, 6, 4), brass, -5.35 + (i * 0.63) % 2.3, 0.78 + (i * 0.43) % 1.2, -2.4);
    bench(5.5, -1.4);
  } else {
    // Freestanding art panels leave sightlines to people and the sculpture court.
    const inks = [0xb66d5b, 0x4f818b, 0xc1a364];
    for (const [i, x] of [-4.7, -0.2, 4.3].entries()) {
      box(2.25, 2.3, 0.18, stone, x, 1.2, -2.1);
      box(1.8, 1.4, 0.07, brass, x, 1.45, -1.96);
      const ink = new THREE.MeshStandardMaterial({ color: inks[i], roughness: 0.97 });
      group.accent(ink, 0.32, inks[i]);
      box(1.9, 0.07, 0.24, brass, x, 2.4, -1.94);
      box(1.65, 0.035, 0.15, lamp, x, 2.36, -1.88);
      box(1.62, 1.22, 0.08, ink, x, 1.45, -1.9);
      const shape = add(new THREE.CircleGeometry(0.4, 24), stone, x - 0.23, 1.55, -1.85); shape.scale.x = 0.7;
      box(0.7, 0.17, 0.05, timber, x + 0.24, 1.12, -1.83);
    }
    box(1.2, 0.55, 1.2, stone, 6.9, 0.32, 0.65);
    const sculpture = add(new THREE.TorusKnotGeometry(0.42, 0.13, 48, 8), brass, 6.9, 1.1, 0.65); sculpture.name = 'landmark-sculpture';
    bench(-3.2, 1.7); bench(1.1, 1.7);
  }
  return group;
}
