import * as THREE from 'three';
import { Resident } from '../core/types';
import { ElevatorSystem } from '../core/elevator';
import { ROOM_LEFT, ROOM_RIGHT, SHAFT_X, WAIT_X, floorY } from './layout';

const WALK_SPEED = 6; // world units per real second

interface CharacterView {
  group: THREE.Group;
  targetX: number;
  targetY: number;
  targetZ: number;
}

/** Little capsule-people that walk to their spot on each floor. */
export class CharacterViews {
  private readonly group = new THREE.Group();
  private views = new Map<string, CharacterView>();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  sync(residents: Resident[], elevator: ElevatorSystem, dt: number): void {
    const seen = new Set<string>();

    for (const resident of residents) {
      seen.add(resident.id);
      let view = this.views.get(resident.id);
      if (!view) {
        view = { group: buildCharacter(resident.color), targetX: 0, targetY: 0, targetZ: 1 };
        this.views.set(resident.id, view);
        this.group.add(view.group);
      }
      this.updateTarget(resident, view, elevator);
      this.move(view, dt, resident.state.kind === 'riding');
    }

    // Remove views for residents that no longer exist.
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.group.remove(view.group);
        this.views.delete(id);
      }
    }
  }

  private updateTarget(resident: Resident, view: CharacterView, elevator: ElevatorSystem): void {
    const state = resident.state;
    if (state.kind === 'idle') {
      view.targetY = floorY(state.floor);
      // Deterministic spot in the room per resident+activity, so they spread out.
      const hash = hashCode(resident.id + state.activity.kind);
      view.targetX = ROOM_LEFT + 1.2 + (hash % 100) / 100 * (ROOM_RIGHT - ROOM_LEFT - 2.4);
      view.targetZ = 0.4 + ((hash >> 3) % 100) / 100 * 1.6;
    } else if (state.kind === 'waiting') {
      view.targetY = floorY(state.floor);
      // Queue position: count how many are ahead at this floor.
      const queue = elevator.queues.get(state.floor) ?? [];
      const index = Math.max(0, queue.findIndex((r) => r.residentId === resident.id));
      view.targetX = WAIT_X + Math.min(index, 6) * 0.7;
      view.targetZ = 1.2 + (index % 2) * 0.6;
    } else {
      // Riding: snap to whichever car carries them.
      for (const car of elevator.cars) {
        if (car.riders.some((r) => r.residentId === resident.id)) {
          view.targetY = floorY(car.pos);
          view.targetX = SHAFT_X;
          view.targetZ = 0;
          break;
        }
      }
    }
  }

  private move(view: CharacterView, dt: number, riding: boolean): void {
    const p = view.group.position;
    if (riding) {
      // Inside the car: follow it exactly, don't walk.
      p.set(view.targetX, view.targetY, view.targetZ);
      return;
    }
    p.y = view.targetY;
    const step = WALK_SPEED * dt;
    p.x += clamp(view.targetX - p.x, -step, step);
    p.z += clamp(view.targetZ - p.z, -step, step);
  }
}

function buildCharacter(color: number): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 8), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xf7dcc4 }),
  );
  head.position.y = 1.05;
  head.castShadow = true;
  group.add(body, head);
  return group;
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
