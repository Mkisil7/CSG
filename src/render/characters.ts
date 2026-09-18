import * as THREE from 'three';
import { Floor, Resident } from '../core/types';
import { ElevatorSystem } from '../core/elevator';
import { FLOOR_HEIGHT, ROOM_LEFT, ROOM_RIGHT, floorY } from './layout';
import { getAsset } from './assets';
import { commuteMinutesBetween, streetJourneyPosition } from '../core/townLayout';
import type { WeatherKind } from '../core/weather';
import { visualDelta } from './motion';
import { stairPosition } from './stairs';
import { residentAppearance, roomPoses, stableRoomHash, ROOM_LIFE, type RoomPose } from '../core/roomLife';

const WALK_SPEED = 6; // world units per real second

export interface ShaftRef {
  system: ElevatorSystem;
  shaftX: number;
  waitX: number;
}

interface CharacterView {
  umbrella?: THREE.Group;
  props?: Record<'cup' | 'book' | 'hat' | 'apron' | 'pan' | 'tray', THREE.Object3D>;
  workProps?: Record<'basket' | 'bag' | 'garment' | 'tablet' | 'tool' | 'clipboard' | 'helmet', THREE.Object3D>;
  journey?: string;
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
  /** Per-character GPU resources to free on removal (empty for .glb clones,
   *  whose geometry/materials are shared with the asset cache). */
  disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] };
}

/** Articulated little people that walk to their spot on each floor. */
export class CharacterViews {
  private readonly group = new THREE.Group();
  private views = new Map<string, CharacterView>();
  private motionTime = 0;
  private lastTime = -1;
  private readonly motionPreference = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    parent: THREE.Object3D,
    public readonly towerId: string,
    origin: { x: number; z: number },
  ) {
    this.group.position.set(origin.x, 0, origin.z);
    parent.add(this.group);
  }

  sync(residents: Resident[], shafts: ShaftRef[], dt: number, now = 0, weather: WeatherKind = 'clear', floors: Floor[] = [],
    isFloorReady: (level: number) => boolean = () => true, households: Resident[] = residents): void {
    dt = visualDelta(dt);
    const seen = new Set<string>();
    const poses = roomPoses(floors, residents, this.towerId, now, households);
    if (now !== this.lastTime && !this.motionPreference?.matches) this.motionTime += dt;
    this.lastTime = now;

    for (const resident of residents) {
      seen.add(resident.id);
      let view = this.views.get(resident.id);
      const newlyCreated = !view;
      if (!view) {
        view = buildCharacter(resident);
        view.group.userData = { pickable: 'resident', residentId: resident.id, towerId: this.towerId };
        this.views.set(resident.id, view);
        this.group.add(view.group);
      }

      view.group.visible = true;
      view.group.rotation.x = 0;
      view.group.rotation.z = 0;
      view.limbs.body.rotation.x = 0;
      if (view.props) for (const prop of Object.values(view.props)) prop.visible = false;
      if (view.workProps) for (const prop of Object.values(view.workProps)) prop.visible = false;
      view.limbs.leftLeg.position.y = view.limbs.rightLeg.position.y = 0.62;
      view.limbs.leftArm.rotation.z = view.limbs.rightArm.rotation.z = 0;
      const commuting = resident.state.kind === 'commuting';
      if (view.umbrella) view.umbrella.visible = commuting && weather === 'rain';
      if (resident.state.kind === 'commuting') {
        if (weather === 'rain' && !view.umbrella) attachUmbrella(view, resident.color);
        const state = resident.state;
        const start = state.startedAt ?? state.until - commuteMinutesBetween(this.towerId, state.toTowerId);
        const progress = (now - start) / Math.max(1, state.until - start);
        const point = streetJourneyPosition(this.towerId, state.toTowerId, progress);
        if (view.umbrella) view.umbrella.visible = weather === 'rain' && point.z > 3.8;
        const journey = `${state.toTowerId}:${start}`;
        const x = point.x - this.group.position.x;
        const z = point.z - this.group.position.z;
        const dx = x - view.group.position.x, dz = z - view.group.position.z;
        const moved = view.journey === journey ? Math.hypot(dx, dz) : 0;
        view.journey = journey;
        view.group.position.set(x, point.z > 6.4 ? 0.12 : 0, z);
        if (moved > 0.001) view.group.rotation.y = Math.atan2(dx, dz);
        this.pose(view, moved, dt);
        continue;
      }
      if (resident.state.kind === 'stairs') {
        const state = resident.state;
        const duration = state.until - state.startedAt;
        const progress = duration > 0 ? (now - state.startedAt) / duration : 1;
        const pace = (stableRoomHash(resident.id) % 101 / 100 - 0.5) * 1.6;
        const point = stairPosition(state.from, state.to, progress, pace);
        const journey = `stairs:${state.from}:${state.to}:${state.startedAt}`;
        const dx = point.x - view.group.position.x, dy = point.y - view.group.position.y;
        const moved = view.journey === journey ? Math.hypot(dx, dy) : 0;
        view.journey = journey;
        // Like street journeys, simulation progress owns the full position.
        // Easing only x while snapping y lets people drift off the stair flight.
        view.group.position.set(point.x, point.y, point.z);
        view.group.visible = isFloorReady(Math.ceil(point.y / FLOOR_HEIGHT - 1e-6));
        if (Math.abs(dx) > 0.001 && moved > 0) view.group.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.pose(view, moved, dt);
        continue;
      }
      view.journey = undefined;

      const pose = poses.get(resident.id);
      this.updateTarget(resident, view, shafts, pose);
      // A reconstructed actor already inhabits its saved room or queue. Do not
      // animate it out of the model origin (or leave it stacked there at dt=0).
      // Subsequent target changes still walk normally, and pause freezes them.
      if (newlyCreated) view.group.position.set(view.targetX, view.targetY, view.targetZ);
      this.move(view, dt, resident.state.kind === 'riding');
      view.group.visible = isFloorReady(Math.ceil(view.targetY / FLOOR_HEIGHT - 1e-6));
      if (pose && Math.hypot(view.targetX - view.group.position.x, view.targetZ - view.group.position.z) < 0.08) {
        this.roomPose(view, pose);
      }
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.group.remove(view.group);
        disposeCharacter(view);
        this.views.delete(id);
      }
    }
  }

  pickTargets(): THREE.Object3D[] {
    return [...this.views.values()].filter((v) => v.group.visible).map((v) => v.group);
  }

  private updateTarget(resident: Resident, view: CharacterView, shafts: ShaftRef[], pose?: RoomPose): void {
    const state = resident.state;
    if (state.kind === 'idle') {
      view.targetY = floorY(state.floor);
      if (pose) { view.targetX = pose.x; view.targetZ = pose.z; return; }
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
          view.targetX = shaft.waitX + dir * (index % 7) * 0.7;
          view.targetZ = 0.5 + Math.min(3, Math.floor(index / 7)) * 0.65;
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
    if (this.motionPreference?.matches) {
      leftArm.rotation.x = rightArm.rotation.x = leftLeg.rotation.x = rightLeg.rotation.x = 0;
      body.position.y = 0.62; return;
    }
    if (dt === 0) return;
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
      const settle = Math.exp(-6 * dt);
      leftArm.rotation.x *= settle;
      rightArm.rotation.x *= settle;
      leftLeg.rotation.x *= settle;
      rightLeg.rotation.x *= settle;
      body.position.y = 0.62 + Math.sin(view.phase) * 0.012;
    }
  }

  private roomPose(view: CharacterView, pose: RoomPose): void {
    const working = ['cashier', 'stocking', 'folding', 'demonstrating', 'browse-grocery', 'browse-clothes', 'try-device', 'checkout', 'assembling', 'food-control', 'fabricating', 'supervising'].includes(pose.action);
    if (!working && !view.props) attachRoomProps(view);
    const props = view.props!, { leftArm, rightArm, leftLeg, rightLeg, body } = view.limbs;
    const phase = this.motionPreference?.matches ? 0 : this.motionTime * 2.4 + stableRoomHash(String(view.group.userData.residentId ?? '')) % 97 / 97 * Math.PI * 2;
    const gesture = this.motionPreference?.matches ? 0 : Math.sin(phase);
    view.group.rotation.y = pose.facing;
    body.position.y = pose.seated ? 0.46 : 0.62;
    leftLeg.position.y = rightLeg.position.y = pose.seated ? 0.43 : 0.62;
    leftLeg.rotation.x = rightLeg.rotation.x = pose.seated ? -Math.PI / 2 : 0;
    leftArm.rotation.x = rightArm.rotation.x = 0;
    if (pose.action === 'resting') {
      // Lie face-up along the mattress, with a small pillow-supported shoulder
      // tilt. Reset height/pitch/roll before every subsequent movement action.
      view.group.rotation.x = -Math.PI / 2;
      view.group.rotation.z = Math.PI / 2;
      view.group.position.y += ROOM_LIFE.homeRestHeight;
      body.rotation.x = 0.18;
      leftArm.rotation.x = rightArm.rotation.x = -0.15;
      return;
    }
    if (working) {
      if (!view.workProps) attachWorkProps(view);
      const work = view.workProps!;
      if (pose.action === 'browse-grocery') {
        work.basket.visible = true; leftArm.rotation.x = -0.3; rightArm.rotation.x = -0.8 + gesture * 0.18;
      } else if (pose.action === 'browse-clothes' || pose.action === 'folding') {
        work.garment.visible = true; leftArm.rotation.x = -0.9; rightArm.rotation.x = -0.9 + gesture * 0.1;
        work.garment.rotation.y = gesture * 0.08;
      } else if (pose.action === 'try-device' || pose.action === 'demonstrating') {
        work.tablet.visible = true; leftArm.rotation.x = -0.9; rightArm.rotation.x = -1.1 + gesture * 0.08;
      } else if (pose.action === 'checkout') {
        work.bag.visible = true; leftArm.rotation.x = -0.25; rightArm.rotation.x = -0.75;
      } else if (pose.action === 'stocking') {
        work.bag.visible = true; leftArm.rotation.x = -0.55; rightArm.rotation.x = -1.3 + gesture * 0.3;
      } else if (pose.action === 'cashier') {
        rightArm.rotation.x = -1 + gesture * 0.2; rightArm.rotation.z = gesture * 0.15; leftArm.rotation.x = -0.65;
      } else if (pose.action === 'supervising') {
        work.clipboard.visible = work.helmet.visible = true;
        leftArm.rotation.x = -0.9; rightArm.rotation.x = -1 + gesture * 0.12;
      } else {
        work.helmet.visible = true;
        work.tool.visible = pose.action === 'assembling';
        leftArm.rotation.x = -0.85;
        rightArm.rotation.x = pose.action === 'assembling' ? -1.1 + gesture * 0.28 : -1 + gesture * 0.08;
        if (pose.action === 'food-control') rightArm.rotation.z = gesture * 0.18;
      }
      return;
    }
    if (pose.action === 'barista' || pose.action === 'chef' || pose.action === 'cook' || pose.action === 'server') {
      props.apron.visible = true;
      props.hat.visible = pose.chef === true;
      props.pan.visible = pose.action === 'chef' || pose.action === 'cook';
      props.tray.visible = pose.action === 'server';
      rightArm.rotation.x = -1.05 + gesture * 0.16;
      leftArm.rotation.x = -0.8;
      props.pan.rotation.z = gesture * 0.08;
      props.pan.position.y = 1.03 + Math.max(0, gesture) * 0.07;
      if (pose.action === 'barista') { props.cup.visible = true; rightArm.rotation.z = gesture * 0.18; }
    } else if (pose.action === 'drink-coffee' || pose.action === 'dine') {
      props.cup.visible = true;
      rightArm.rotation.x = -0.9 - Math.max(0, gesture) * 0.6;
      leftArm.rotation.x = -0.6;
    } else if (pose.action === 'reading') {
      props.book.visible = true; leftArm.rotation.x = rightArm.rotation.x = -0.85;
    } else if (pose.action === 'typing') {
      leftArm.rotation.x = -0.9 + gesture * 0.07; rightArm.rotation.x = -0.9 - gesture * 0.07;
    } else if (pose.action === 'meeting') {
      rightArm.rotation.x = -0.75 + gesture * 0.3; rightArm.rotation.z = -0.2;
      leftArm.rotation.x = -0.6;
    } else if (pose.action === 'stargazing') {
      rightArm.rotation.x = leftArm.rotation.x = -1.15;
      body.rotation.x = 0.12;
    }
  }
}

/** Lazy, owned work accessories; one set per real actor, never duplicate staff. */
function attachWorkProps(view: CharacterView): void {
  const paper = new THREE.MeshStandardMaterial({ color: 0xc5a579, roughness: 0.95 });
  const green = new THREE.MeshStandardMaterial({ color: 0x527866, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xd499a8, roughness: 0.98 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x889a9f, roughness: 0.4, metalness: 0.6 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x233d4a, roughness: 0.35 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe6e0cc, roughness: 0.8 });
  view.disposables.materials.push(paper, green, cloth, metal, screen, cream);
  const part = (group: THREE.Object3D, material: THREE.Material, size: [number, number, number], position: [number, number, number]) => {
    const geometry = new THREE.BoxGeometry(...size); view.disposables.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); group.add(mesh); return mesh;
  };
  const basket = new THREE.Group();
  part(basket, green, [0.42, 0.04, 0.28], [0, 0, 0]);
  for (const x of [-0.2, 0.2]) part(basket, green, [0.035, 0.21, 0.28], [x, 0.1, 0]);
  for (const z of [-0.13, 0.13]) part(basket, green, [0.42, 0.21, 0.035], [0, 0.1, z]);
  for (const x of [-0.18, 0.18]) part(basket, metal, [0.02, 0.2, 0.02], [x, 0.28, 0]);
  part(basket, metal, [0.38, 0.025, 0.025], [0, 0.37, 0]);
  basket.position.set(-0.3, 0, 0.26); view.limbs.body.add(basket);
  const bag = new THREE.Group(); part(bag, paper, [0.27, 0.33, 0.2], [0, 0, 0]);
  for (const x of [-0.075, 0.075]) part(bag, cream, [0.025, 0.15, 0.025], [x, 0.23, 0]);
  part(bag, cream, [0.17, 0.025, 0.025], [0, 0.3, 0]);
  bag.position.set(-0.3, -0.07, 0.2); view.limbs.body.add(bag);
  const garment = new THREE.Group(); part(garment, cloth, [0.35, 0.38, 0.035], [0, 0, 0]);
  for (const x of [-0.21, 0.21]) part(garment, cloth, [0.13, 0.14, 0.04], [x, 0.12, 0]);
  garment.position.set(0, 0.21, 0.43); view.limbs.body.add(garment);
  const tablet = new THREE.Group(); part(tablet, metal, [0.28, 0.37, 0.035], [0, 0, 0]);
  part(tablet, screen, [0.235, 0.31, 0.01], [0, 0, 0.023]);
  tablet.rotation.x = -0.35; tablet.position.set(0, 0.25, 0.4); view.limbs.body.add(tablet);
  const tool = new THREE.Group(); part(tool, metal, [0.055, 0.3, 0.045], [0, 0, 0]);
  for (const x of [-0.065, 0.065]) part(tool, metal, [0.05, 0.1, 0.05], [x, -0.17, 0]);
  part(tool, metal, [0.18, 0.055, 0.05], [0, -0.12, 0]);
  tool.position.set(0, -0.4, 0.08); view.limbs.rightArm.add(tool);
  const clipboard = new THREE.Group(); part(clipboard, paper, [0.3, 0.4, 0.035], [0, 0, 0]);
  part(clipboard, cream, [0.25, 0.32, 0.012], [0, -0.01, 0.025]);
  part(clipboard, metal, [0.12, 0.045, 0.02], [0, 0.17, 0.03]);
  clipboard.position.set(0, 0.22, 0.4); clipboard.rotation.x = -0.3; view.limbs.body.add(clipboard);
  const helmet = new THREE.Group(), cap = new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  view.disposables.geometries.push(cap); helmet.add(new THREE.Mesh(cap, cream));
  part(helmet, cream, [0.46, 0.035, 0.39], [0, 0, 0.025]);
  helmet.position.y = 0.77; view.limbs.body.add(helmet);
  view.workProps = { basket, bag, garment, tablet, tool, clipboard, helmet };
  for (const [name, prop] of Object.entries(view.workProps)) { prop.name = `work-${name}`; prop.visible = false; }
}

/** Accessories use the same articulated resident, never decorative duplicate staff. */
function attachRoomProps(view: CharacterView): void {
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2ebda, roughness: 0.85 });
  const green = new THREE.MeshStandardMaterial({ color: 0x46685b, roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x50565b, metalness: 0.6, roughness: 0.42 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xe4be82, roughness: 0.9 });
  view.disposables.materials.push(cream, green, metal, paper);
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    view.disposables.geometries.push(geometry); return new THREE.Mesh(geometry, material);
  };
  const cup = new THREE.Group();
  cup.add(mesh(new THREE.CylinderGeometry(0.095, 0.075, 0.17, 10), cream));
  const handle = mesh(new THREE.TorusGeometry(0.055, 0.018, 5, 10), cream); handle.position.x = 0.09; cup.add(handle);
  cup.position.set(0, -0.4, 0.04); view.limbs.rightArm.add(cup);
  const hat = mesh(new THREE.CylinderGeometry(0.21, 0.18, 0.24, 10), cream);
  hat.position.set(0, 0.97, 0); view.limbs.body.add(hat);
  const apron = mesh(new THREE.BoxGeometry(0.35, 0.46, 0.035), green);
  apron.position.set(0, 0.23, 0.145); view.limbs.body.add(apron);
  const pan = new THREE.Group(); pan.add(mesh(new THREE.CylinderGeometry(0.23, 0.19, 0.055, 12), metal));
  const grip = mesh(new THREE.BoxGeometry(0.07, 0.055, 0.35), metal); grip.position.z = -0.3; pan.add(grip);
  const pancake = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), paper); pancake.position.y = 0.045; pan.add(pancake);
  pan.position.set(0.25, 1.03, 0.48); view.group.add(pan);
  const tray = new THREE.Group();
  tray.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.025, 12), metal));
  for (const x of [-0.13, 0.13]) {
    const plate = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.025, 10), cream);
    plate.position.set(x, 0.025, 0); tray.add(plate);
  }
  tray.position.set(0.04, 0.3, 0.4); view.limbs.body.add(tray);
  const book = new THREE.Group();
  for (const side of [-1, 1]) {
    const page = mesh(new THREE.BoxGeometry(0.23, 0.035, 0.3), side < 0 ? cream : paper);
    page.position.x = side * 0.12; page.rotation.z = side * 0.12; book.add(page);
  }
  book.position.set(0, 0.2, 0.36); book.rotation.x = -0.25; view.limbs.body.add(book);
  view.props = { cup, book, hat, apron, pan, tray };
  for (const [name, prop] of Object.entries(view.props)) { prop.name = `room-${name}`; prop.visible = false; }
}

function attachUmbrella(view: CharacterView, color: number): void {
  const umbrella = new THREE.Group();
  const canopyGeometry = new THREE.SphereGeometry(0.68, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const canopyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide });
  const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
  canopy.scale.y = 0.52; canopy.position.y = 1.85; canopy.castShadow = true;
  const poleGeometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 5);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x515660, metalness: 0.7, roughness: 0.35 });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial); pole.position.y = 1.4;
  umbrella.add(canopy, pole); umbrella.position.z = 0.12;
  view.group.add(umbrella); view.umbrella = umbrella;
  view.disposables.geometries.push(canopyGeometry, poleGeometry);
  view.disposables.materials.push(canopyMaterial, poleMaterial);
}

/** Free a removed character's per-instance GPU resources (leak fix). */
function disposeCharacter(view: CharacterView): void {
  for (const g of view.disposables.geometries) g.dispose();
  for (const m of view.disposables.materials) m.dispose();
}

function buildCharacter(resident: Resident): CharacterView {
  // Optional real model: expects children named ArmL/ArmR/LegL/LegR/Body for
  // the walk cycle; any missing name simply doesn't animate. Clones share the
  // cached asset's geometry/materials, so nothing here needs disposal.
  const asset = getAsset('character');
  if (asset) {
    const dummy = () => new THREE.Group();
    return {
      group: asset,
      targetX: 0,
      targetY: 0,
      targetZ: 1,
      phase: Math.random() * Math.PI * 2,
      limbs: {
        leftArm: asset.getObjectByName('ArmL') ?? dummy(),
        rightArm: asset.getObjectByName('ArmR') ?? dummy(),
        leftLeg: asset.getObjectByName('LegL') ?? dummy(),
        rightLeg: asset.getObjectByName('LegR') ?? dummy(),
        body: asset.getObjectByName('Body') ?? asset,
      },
      disposables: { geometries: [], materials: [] },
    };
  }

  const group = new THREE.Group();
  const colors = residentAppearance(resident);
  const shirt = new THREE.MeshStandardMaterial({ color: colors.shirt, roughness: 0.98 });
  const pants = new THREE.MeshStandardMaterial({ color: colors.pants, roughness: 0.95 });
  const hair = new THREE.MeshStandardMaterial({ color: colors.hair, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.85 });

  // Torso pivots at the hips so the whole upper body bobs.
  const body = new THREE.Group();
  body.position.y = 0.62;
  group.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), shirt);
  torso.position.y = 0.25;
  torso.castShadow = true;
  body.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
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
    disposables: {
      geometries: [torso.geometry, head.geometry, cap.geometry, armGeom, legGeom],
      materials: [shirt, pants, hair, skin],
    },
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
