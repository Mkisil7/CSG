import * as THREE from 'three';
import { Resident } from '../core/types';
import { ElevatorSystem } from '../core/elevator';
import { ROOM_LEFT, ROOM_RIGHT, floorY } from './layout';

const WALK_SPEED = 6; // world units per real second

export interface ShaftRef {
  system: ElevatorSystem;
  shaftX: number;
  waitX: number;
}

interface CharacterView {
  group: THREE.Group;
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Accumulated walk-cycle phase, advanced by distance travelled. */
  phase: number;
  limbs: {
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    body: THREE.Object3D;
  };
}

/** Articulated little people that walk to their spot on each floor. */
export class CharacterViews {
  private readonly group = new THREE.Group();
  private views = new Map<string, CharacterView>();

  constructor(
    parent: THREE.Object3D,
    public readonly towerId: string,
    origin: { x: number; z: number },
  ) {
    this.group.position.set(origin.x, 0, origin.z);
    parent.add(this.group);
  }

  sync(residents: Resident[], shafts: ShaftRef[], dt: number): void {
    const seen = new Set<string>();

    for (const resident of residents) {
      seen.add(resident.id);
      let view = this.views.get(resident.id);
      if (!view) {
        view = buildCharacter(resident.color);
        view.group.userData = { pickable: 'resident', residentId: resident.id, towerId: this.towerId };
        this.views.set(resident.id, view);
        this.group.add(view.group);
      }

      // Street-level commuters are abstracted away until they arrive.
      const commuting = resident.state.kind === 'commuting';
      view.group.visible = !commuting;
      if (commuting) continue;

      this.updateTarget(resident, view, shafts);
      this.move(view, dt, resident.state.kind === 'riding');
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.group.remove(view.group);
        this.views.delete(id);
      }
    }
  }

  pickTargets(): THREE.Object3D[] {
    return [...this.views.values()].map((v) => v.group);
  }

  private updateTarget(resident: Resident, view: CharacterView, shafts: ShaftRef[]): void {
    const state = resident.state;
    if (state.kind === 'idle') {
      view.targetY = floorY(state.floor);
      // Deterministic spot in the room per resident+activity, so they spread out.
      const hash = hashCode(resident.id + state.activity.kind);
      view.targetX = ROOM_LEFT + 1.2 + (hash % 100) / 100 * (ROOM_RIGHT - ROOM_LEFT - 2.4);
      view.targetZ = 0.4 + ((hash >> 3) % 100) / 100 * 1.6;
    } else if (state.kind === 'waiting') {
      view.targetY = floorY(state.floor);
      // Find which shaft's queue they're standing in, and their place in it.
      for (const shaft of shafts) {
        const queue = shaft.system.queues.get(state.floor) ?? [];
        const index = queue.findIndex((r) => r.residentId === resident.id);
        if (index !== -1) {
          const dir = shaft.waitX < 0 ? 1 : -1; // queue extends into the room
          view.targetX = shaft.waitX + dir * Math.min(index, 6) * 0.7;
          view.targetZ = 1.2 + (index % 2) * 0.6;
          return;
        }
      }
    } else if (state.kind === 'riding') {
      for (const shaft of shafts) {
        for (const car of shaft.system.cars) {
          if (car.riders.some((r) => r.residentId === resident.id)) {
            view.targetY = floorY(car.pos);
            view.targetX = shaft.shaftX;
            view.targetZ = 0;
            return;
          }
        }
      }
    }
  }

  private move(view: CharacterView, dt: number, riding: boolean): void {
    const p = view.group.position;
    if (riding) {
      p.set(view.targetX, view.targetY, view.targetZ);
      this.pose(view, 0, dt);
      return;
    }
    p.y = view.targetY;
    const step = WALK_SPEED * dt;
    const dx = clamp(view.targetX - p.x, -step, step);
    const dz = clamp(view.targetZ - p.z, -step, step);
    p.x += dx;
    p.z += dz;

    const moved = Math.hypot(dx, dz);
    if (moved > 0.001) {
      // Face the direction of travel.
      view.group.rotation.y = Math.atan2(dx, dz);
    }
    this.pose(view, moved, dt);
  }

  /** Swing limbs by distance walked; gentle idle bob when standing. */
  private pose(view: CharacterView, moved: number, dt: number): void {
    const { leftArm, rightArm, leftLeg, rightLeg, body } = view.limbs;
    if (moved > 0.001) {
      view.phase += moved * 6;
      const swing = Math.sin(view.phase) * 0.6;
      leftArm.rotation.x = swing;
      rightArm.rotation.x = -swing;
      leftLeg.rotation.x = -swing;
      rightLeg.rotation.x = swing;
      body.position.y = 0.62 + Math.abs(Math.sin(view.phase)) * 0.03;
    } else {
      view.phase += dt * 2;
      const settle = 0.9;
      leftArm.rotation.x *= settle;
      rightArm.rotation.x *= settle;
      leftLeg.rotation.x *= settle;
      rightLeg.rotation.x *= settle;
      body.position.y = 0.62 + Math.sin(view.phase) * 0.012;
    }
  }
}

const SKIN = new THREE.MeshLambertMaterial({ color: 0xf7dcc4 });
const HAIR_COLORS = [0x5b4632, 0x2e2a28, 0xc9973f, 0x8a5a3b, 0x6e6e72];
const PANT_COLORS = [0x4a5568, 0x6b5b4a, 0x3f5566, 0x5a4a6b];

function buildCharacter(color: number): CharacterView {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const hash = color % 97;
  const pants = new THREE.MeshLambertMaterial({ color: PANT_COLORS[hash % PANT_COLORS.length] });
  const hair = new THREE.MeshLambertMaterial({ color: HAIR_COLORS[hash % HAIR_COLORS.length] });

  // Torso pivots at the hips so the whole upper body bobs.
  const body = new THREE.Group();
  body.position.y = 0.62;
  group.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), shirt);
  torso.position.y = 0.25;
  torso.castShadow = true;
  body.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), SKIN);
  head.position.y = 0.68;
  head.castShadow = true;
  body.add(head);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
  );
  cap.position.y = 0.72;
  body.add(cap);

  const armGeom = new THREE.BoxGeometry(0.11, 0.45, 0.11);
  const legGeom = new THREE.BoxGeometry(0.14, 0.6, 0.14);

  const makeLimb = (geom: THREE.BoxGeometry, mat: THREE.Material, x: number, y: number, half: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = -half;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  };

  const leftArm = makeLimb(armGeom, shirt, -0.28, 0.45, 0.22);
  const rightArm = makeLimb(armGeom, shirt, 0.28, 0.45, 0.22);
  body.add(leftArm, rightArm);

  const leftLeg = makeLimb(legGeom, pants, -0.11, 0.62, 0.3);
  const rightLeg = makeLimb(legGeom, pants, 0.11, 0.62, 0.3);
  group.add(leftLeg, rightLeg);

  return {
    group,
    targetX: 0,
    targetY: 0,
    targetZ: 1,
    phase: Math.random() * Math.PI * 2,
    limbs: { leftArm, rightArm, leftLeg, rightLeg, body },
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
