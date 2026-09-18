import * as THREE from 'three';
import type { Floor, Resident } from '../core/types';
import { residentPet, ROOM_LIFE, stableRoomHash } from '../core/roomLife';
import { floorY } from './layout';

interface CatView { group: THREE.Group; body: THREE.Group; tail: THREE.Object3D; eyes: THREE.Object3D[] }
interface SteamView { group: THREE.Group; wisps: THREE.Mesh[]; subtype: string }

/** Small, bounded details. Cats belong to existing households; steam needs an
 * actual worker at the stove/machine, not merely a staffed business flag. */
export class RoomLifeViews {
  private group = new THREE.Group();
  private cats = new Map<string, CatView>();
  private steam = new Map<number, SteamView>();
  private motionTime = 0;
  private lastTime = -1;
  private readonly motionPreference = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(parent: THREE.Object3D, private towerId: string, origin: { x: number; z: number }) {
    this.group.position.set(origin.x, 0, origin.z); parent.add(this.group);
  }

  sync(floors: Floor[], occupants: Resident[], households: Resident[], now: number, dt: number,
    isFloorReady: (level: number) => boolean = () => true): void {
    const reduced = this.motionPreference?.matches ?? false;
    if (!reduced && this.lastTime !== now) this.motionTime += dt;
    this.lastTime = now;
    const seen = new Set<string>();
    const perFloor = new Map<number, number>();
    for (const resident of households) {
      const pet = residentPet(resident);
      if (!pet || resident.homeTowerId !== this.towerId || floors[resident.homeFloor]?.type !== 'residential') continue;
      seen.add(resident.id);
      let view = this.cats.get(resident.id);
      if (!view) {
        view = buildCat(pet.color); view.group.name = `pet:${resident.id}`; view.group.userData = { pickable: 'resident', residentId: resident.id, towerId: this.towerId };
        this.group.add(view.group); this.cats.set(resident.id, view);
      }
      const index = perFloor.get(resident.homeFloor) ?? 0; perFloor.set(resident.homeFloor, index + 1);
      // Four apartment windows; separate perches if multiple households have cats.
      const x = [-1.1, 3.1, 7.3, -5.3][index % 4];
      view.group.position.set(x, floorY(resident.homeFloor) + 1.16, -2.3);
      view.group.visible = isFloorReady(resident.homeFloor);
      const hour = now % 1440 / 60;
      const sleeping = hour < 7 || hour >= 22 || hour >= 11 && hour < 16;
      const phase = reduced ? 0 : this.motionTime * 1.5 + stableRoomHash(resident.id);
      view.body.scale.y = sleeping ? 0.7 + (reduced ? 0 : Math.sin(phase) * 0.015) : 1;
      view.tail.rotation.y = reduced ? 0 : Math.sin(phase * 0.6) * (sleeping ? 0.035 : 0.25);
      view.eyes.forEach((eye) => { eye.scale.y = sleeping ? 0.15 : 1; });
    }
    for (const [id, view] of this.cats) if (!seen.has(id)) { this.dispose(view.group); this.cats.delete(id); }

    const hotFloors = new Set<number>();
    for (const floor of floors) {
      if (floor.type !== 'restaurant' || floor.subtype === 'bar') continue;
      hotFloors.add(floor.level);
      let view = this.steam.get(floor.level);
      if (view && view.subtype !== (floor.subtype ?? '')) { this.dispose(view.group); this.steam.delete(floor.level); view = undefined; }
      if (!view) {
        const group = new THREE.Group();
        group.name = `room-steam:${floor.level}`;
        const wisps = Array.from({ length: 3 }, () => {
          const material = new THREE.MeshBasicMaterial({ color: 0xf2eee2, transparent: true, opacity: 0.15, depthWrite: false });
          const wisp = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 4, 12, Math.PI * 1.35), material);
          group.add(wisp); return wisp;
        });
        view = { group, wisps, subtype: floor.subtype ?? '' }; this.steam.set(floor.level, view); this.group.add(group);
      }
      const working = occupants.some((r) => r.state.kind === 'idle' && r.state.activity.kind === 'work' &&
        r.state.floor === floor.level && r.state.activity.floor === floor.level && r.jobFloor === floor.level && r.jobTowerId === this.towerId);
      view.group.visible = working && !reduced && isFloorReady(floor.level);
      const coffee = floor.subtype === 'coffee';
      view.group.position.set(coffee ? ROOM_LIFE.coffee.x : 4.9, floorY(floor.level) + (coffee ? 1.35 : 1.08), coffee ? 1.9 : -1.1);
      view.wisps.forEach((wisp, index) => {
        const p = (this.motionTime * 0.45 + index / 3) % 1;
        wisp.position.set(Math.sin(p * 5 + index) * 0.035, p * 0.5, 0);
        wisp.scale.setScalar(0.6 + p * 0.8); wisp.rotation.z = p * 2;
        (wisp.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.17;
      });
    }
    for (const [level, view] of this.steam) if (!hotFloors.has(level)) { this.dispose(view.group); this.steam.delete(level); }
  }

  pickTargets(): THREE.Object3D[] { return [...this.cats.values()].filter((cat) => cat.group.visible).map((cat) => cat.group); }

  private dispose(group: THREE.Group): void {
    this.group.remove(group);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
  }
}

function buildCat(color: number): CatView {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe5daca, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x394942, roughness: 0.8 });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.075, 0.55), cream); sill.position.set(0, -0.035, -0.05); group.add(sill);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), fur); torso.scale.set(1.25, 0.7, 0.7); torso.position.set(-0.08, 0.18, 0); body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), fur); head.position.set(0.2, 0.3, 0.05); body.add(head);
  for (const x of [0.11, 0.28]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 3), fur); ear.position.set(x, 0.45, 0.03); body.add(ear);
  }
  const eyes = [0.14, 0.25].map((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), dark); eye.position.set(x, 0.32, 0.18); body.add(eye); return eye;
  });
  for (const x of [-0.18, 0.15]) {
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), cream); paw.scale.set(1.3, 0.65, 1); paw.position.set(x, 0.045, 0.12); body.add(paw);
  }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, 0.14, 0), new THREE.Vector3(-0.42, 0.17, 0.15), new THREE.Vector3(-0.2, 0.06, 0.26), new THREE.Vector3(0, 0.065, 0.23)]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.04, 6, false), fur); body.add(tail);
  return { group, body, tail, eyes };
}
