import * as THREE from 'three';
import { Floor, FloorType } from '../core/types';
import {
  FLOOR_HEIGHT,
  ROOM_DEPTH,
  ROOM_LEFT,
  ROOM_RIGHT,
  SHAFT_WIDTH,
  SHAFT_X,
  SHAFT_X_RIGHT,
  floorY,
} from './layout';

const WALL_COLORS: Record<FloorType, number> = {
  lobby: 0xf5e9d4,
  residential: 0xf7c8d0,
  shop: 0xc8e4f7,
  restaurant: 0xf7e3b0,
  office: 0xd6cff7,
};

const ROOM_WIDTH = ROOM_RIGHT - ROOM_LEFT;
const ROOM_CENTER_X = (ROOM_LEFT + ROOM_RIGHT) / 2;
const BACK_Z = -ROOM_DEPTH / 2;

// Shared geometry/materials so many floors and towers stay cheap.
const MAT = {
  slab: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  trim: new THREE.MeshLambertMaterial({ color: 0xfdfaf3 }),
  window: new THREE.MeshLambertMaterial({ color: 0x9fc9e8 }),
  windowFrame: new THREE.MeshLambertMaterial({ color: 0xfdfdfd }),
  rail: new THREE.MeshLambertMaterial({ color: 0x8d99ae }),
  shaftBack: new THREE.MeshLambertMaterial({ color: 0xb8c0d0 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xf0ede5 }),
  wood: new THREE.MeshLambertMaterial({ color: 0xc09a6b }),
  woodDark: new THREE.MeshLambertMaterial({ color: 0xa07948 }),
  fabric: new THREE.MeshLambertMaterial({ color: 0xe98fa2 }),
  fabricAlt: new THREE.MeshLambertMaterial({ color: 0x93bfe3 }),
  white: new THREE.MeshLambertMaterial({ color: 0xfafafa }),
  green: new THREE.MeshLambertMaterial({ color: 0x7cc98f
  }),
  pot: new THREE.MeshLambertMaterial({ color: 0xd96c6c }),
  screen: new THREE.MeshLambertMaterial({ color: 0x3f4a63 }),
  metal: new THREE.MeshLambertMaterial({ color: 0xb9c0cc }),
};

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  castShadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

/**
 * Renders one tower as a dollhouse cross-section: open-front rooms with real
 * window walls, trim, and per-type furniture, plus one or two lift shafts.
 */
export class FloorViews {
  readonly group = new THREE.Group();
  private built = new Map<number, THREE.Group>();
  private shafts: THREE.Group[] = [];
  private roof: THREE.Group | null = null;
  private builtHeight = 0;
  private secondShaft = false;

  constructor(
    parent: THREE.Object3D,
    public readonly towerId: string,
    origin: { x: number; z: number },
  ) {
    this.group.position.set(origin.x, 0, origin.z);
    parent.add(this.group);
  }

  setSecondShaft(unlocked: boolean): void {
    if (unlocked === this.secondShaft) return;
    this.secondShaft = unlocked;
    // Retroactive: every floor's slab must span to the new shaft — rebuild all.
    for (const view of this.built.values()) this.group.remove(view);
    this.built.clear();
    this.builtHeight = 0;
  }

  sync(floors: Floor[]): void {
    for (const floor of floors) {
      if (!this.built.has(floor.level)) {
        const view = buildFloorView(floor, this.secondShaft);
        view.userData = { pickable: 'floor', floorLevel: floor.level, towerId: this.towerId };
        this.built.set(floor.level, view);
        this.group.add(view);
      }
    }
    if (floors.length !== this.builtHeight) {
      this.builtHeight = floors.length;
      this.rebuildShafts(floors.length);
      this.rebuildRoof(floors.length);
    }
  }

  /** Objects the raycaster should test for floor selection. */
  pickTargets(): THREE.Object3D[] {
    return [...this.built.values()];
  }

  private rebuildShafts(floorCount: number): void {
    for (const s of this.shafts) this.group.remove(s);
    this.shafts = [buildShaftGroup(SHAFT_X, floorCount)];
    if (this.secondShaft) this.shafts.push(buildShaftGroup(SHAFT_X_RIGHT, floorCount));
    for (const s of this.shafts) this.group.add(s);
  }

  private rebuildRoof(floorCount: number): void {
    if (this.roof) this.group.remove(this.roof);
    const roof = new THREE.Group();
    const y = floorCount * FLOOR_HEIGHT;
    const slabW = ROOM_WIDTH + 1;
    roof.add(box(slabW, 0.35, ROOM_DEPTH + 0.6, MAT.roof, ROOM_CENTER_X, y + 0.17, 0));
    // Parapet lip around the roof edge.
    const lipH = 0.5;
    roof.add(box(slabW, lipH, 0.25, MAT.roof, ROOM_CENTER_X, y + lipH / 2 + 0.3, BACK_Z - 0.1));
    roof.add(box(slabW, lipH, 0.25, MAT.roof, ROOM_CENTER_X, y + lipH / 2 + 0.3, -BACK_Z + 0.1));
    roof.add(box(0.25, lipH, ROOM_DEPTH + 0.6, MAT.roof, ROOM_LEFT - 0.4, y + lipH / 2 + 0.3, 0));
    roof.add(box(0.25, lipH, ROOM_DEPTH + 0.6, MAT.roof, ROOM_RIGHT + 0.4, y + lipH / 2 + 0.3, 0));
    // A little rooftop water tank for skyline charm.
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10), MAT.wood);
    tank.position.set(ROOM_RIGHT - 2, y + 1.1, BACK_Z + 1.6);
    tank.castShadow = true;
    const tankTop = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.5, 10), MAT.woodDark);
    tankTop.position.set(ROOM_RIGHT - 2, y + 1.95, BACK_Z + 1.6);
    tankTop.castShadow = true;
    roof.add(tank, tankTop);
    this.roof = roof;
    this.group.add(roof);
  }
}

export function buildShaftGroup(x: number, floorCount: number): THREE.Group {
  const height = floorCount * FLOOR_HEIGHT;
  const shaft = new THREE.Group();
  for (const dx of [-SHAFT_WIDTH / 2, SHAFT_WIDTH / 2]) {
    for (const dz of [-1, 1]) {
      const rail = box(0.15, height, 0.15, MAT.rail, x + dx, height / 2, dz);
      shaft.add(rail);
    }
  }
  const back = box(SHAFT_WIDTH, height, 0.15, MAT.shaftBack, x, height / 2, -1, false);
  shaft.add(back);
  const cap = box(SHAFT_WIDTH + 0.4, 0.3, 2.4, MAT.rail, x, height + 0.15, 0);
  shaft.add(cap);
  return shaft;
}

function buildFloorView(floor: Floor, secondShaft: boolean): THREE.Group {
  const view = new THREE.Group();
  const y = floorY(floor.level);
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLORS[floor.type] });

  // Slab spans from the left shaft to the right shaft (when built) or room edge.
  const slabLeft = SHAFT_X - SHAFT_WIDTH / 2 - 0.3;
  const slabRight = secondShaft ? SHAFT_X_RIGHT + SHAFT_WIDTH / 2 + 0.3 : ROOM_RIGHT;
  const slab = box(slabRight - slabLeft, 0.3, ROOM_DEPTH, MAT.slab, (slabRight + slabLeft) / 2, y - 0.15, 0);
  view.add(slab);

  // Back wall with a real window grid (or lobby glass doors).
  const back = box(ROOM_WIDTH, FLOOR_HEIGHT, 0.2, wallMat, ROOM_CENTER_X, y + FLOOR_HEIGHT / 2, BACK_Z + 0.1, false);
  view.add(back);
  addBackWallDetail(view, floor.type, y);

  // Side walls + a slim white ceiling trim along the open front edge.
  const sideGeom = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, ROOM_DEPTH);
  const right = new THREE.Mesh(sideGeom, wallMat);
  right.position.set(ROOM_RIGHT, y + FLOOR_HEIGHT / 2, 0);
  right.castShadow = right.receiveShadow = true;
  const left = new THREE.Mesh(sideGeom, wallMat);
  left.position.set(ROOM_LEFT, y + FLOOR_HEIGHT / 2, 0);
  left.receiveShadow = true;
  view.add(left, right);
  view.add(box(ROOM_WIDTH, 0.18, 0.18, MAT.trim, ROOM_CENTER_X, y + FLOOR_HEIGHT - 0.09, ROOM_DEPTH / 2 - 0.09, false));
  view.add(box(ROOM_WIDTH, 0.14, 0.14, MAT.trim, ROOM_CENTER_X, y + 0.07, ROOM_DEPTH / 2 - 0.07, false));

  addFurniture(view, floor, y);
  return view;
}

/** Window panes across the back wall; lobby gets glass entry doors instead. */
function addBackWallDetail(view: THREE.Group, type: FloorType, y: number): void {
  const z = BACK_Z + 0.22;
  if (type === 'lobby') {
    for (const dx of [-1.1, 1.1]) {
      view.add(box(1.0, 2.2, 0.06, MAT.window, ROOM_CENTER_X + dx, y + 1.15, z, false));
      view.add(box(1.12, 2.3, 0.04, MAT.windowFrame, ROOM_CENTER_X + dx, y + 1.15, z - 0.02, false));
    }
    return;
  }
  const count = 4;
  const spacing = (ROOM_WIDTH - 2.4) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = ROOM_LEFT + 1.2 + i * spacing;
    view.add(box(1.15, 1.25, 0.04, MAT.windowFrame, x, y + 1.7, z - 0.02, false));
    view.add(box(1.0, 1.1, 0.06, MAT.window, x, y + 1.7, z, false));
    // Mullions.
    view.add(box(0.06, 1.1, 0.08, MAT.windowFrame, x, y + 1.7, z + 0.01, false));
    view.add(box(1.0, 0.06, 0.08, MAT.windowFrame, x, y + 1.7, z + 0.01, false));
  }
}

/** Compound-mesh furniture silhouettes per floor type — no textures needed. */
function addFurniture(view: THREE.Group, floor: Floor, y: number): void {
  const zRow = BACK_Z + 1.5;
  const seed = floor.level * 13;
  const jitter = (i: number) => (((seed + i * 7) % 5) - 2) * 0.18;

  const plant = (x: number, z: number) => {
    view.add(box(0.36, 0.34, 0.36, MAT.pot, x, y + 0.17, z));
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 7), MAT.green);
    leaves.position.set(x, y + 0.85, z);
    leaves.castShadow = true;
    view.add(leaves);
  };

  switch (floor.type) {
    case 'lobby': {
      // Reception desk with counter top.
      view.add(box(2.6, 0.75, 0.8, MAT.wood, ROOM_CENTER_X, y + 0.375, zRow));
      view.add(box(2.9, 0.1, 1.0, MAT.woodDark, ROOM_CENTER_X, y + 0.8, zRow));
      plant(ROOM_LEFT + 1.4, zRow);
      plant(ROOM_RIGHT - 1.4, zRow);
      // Bench.
      view.add(box(1.6, 0.35, 0.5, MAT.fabricAlt, ROOM_RIGHT - 3.2, y + 0.3, zRow + 1.4));
      break;
    }
    case 'residential': {
      // Two little bedrooms: bed (frame + mattress + pillow), nightstand, rug.
      for (const [i, bx] of [ROOM_LEFT + 2.2, ROOM_CENTER_X + 2.2].entries()) {
        const x = bx + jitter(i);
        view.add(box(1.5, 0.3, 0.9, MAT.woodDark, x, y + 0.15, zRow));
        view.add(box(1.42, 0.22, 0.82, i === 0 ? MAT.fabric : MAT.fabricAlt, x, y + 0.4, zRow));
        view.add(box(0.4, 0.14, 0.6, MAT.white, x - 0.45, y + 0.56, zRow));
        view.add(box(0.5, 0.5, 0.5, MAT.wood, x + 1.15, y + 0.25, zRow));
      }
      plant(ROOM_RIGHT - 1.2, zRow + 0.4);
      break;
    }
    case 'shop': {
      // Checkout counter + two shelf units with stacked goods.
      view.add(box(2.0, 0.8, 0.7, MAT.wood, ROOM_LEFT + 2.4, y + 0.4, zRow + 1.2));
      for (const [i, sx] of [ROOM_CENTER_X + 0.6, ROOM_CENTER_X + 3.4].entries()) {
        const x = sx + jitter(i);
        view.add(box(1.8, 1.9, 0.4, MAT.woodDark, x, y + 0.95, zRow));
        for (let s = 0; s < 3; s++) {
          view.add(box(1.6, 0.08, 0.42, MAT.white, x, y + 0.5 + s * 0.55, zRow + 0.02));
          view.add(box(0.4, 0.3, 0.3, s % 2 ? MAT.fabric : MAT.fabricAlt, x - 0.4, y + 0.72 + s * 0.55, zRow + 0.05));
          view.add(box(0.35, 0.25, 0.3, s % 2 ? MAT.pot : MAT.green, x + 0.4, y + 0.7 + s * 0.55, zRow + 0.05));
        }
      }
      break;
    }
    case 'restaurant': {
      // Kitchen counter along the back + two dining tables with chairs.
      view.add(box(3.2, 0.85, 0.7, MAT.metal, ROOM_RIGHT - 2.4, y + 0.42, zRow));
      view.add(box(0.9, 0.5, 0.5, MAT.screen, ROOM_RIGHT - 3.3, y + 1.1, zRow)); // range hood
      for (const [i, tx] of [ROOM_LEFT + 2.0, ROOM_LEFT + 4.6].entries()) {
        const x = tx + jitter(i);
        const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.1, 0.08, 10), MAT.wood);
        table.position.set(x, y + 0.72, zRow + 1.3);
        table.castShadow = true;
        view.add(table);
        view.add(box(0.1, 0.7, 0.1, MAT.woodDark, x, y + 0.35, zRow + 1.3));
        for (const dx of [-0.75, 0.75]) {
          view.add(box(0.4, 0.4, 0.4, MAT.fabricAlt, x + dx, y + 0.2, zRow + 1.3));
        }
      }
      plant(ROOM_CENTER_X + 1.4, zRow);
      break;
    }
    case 'office': {
      // Row of desks with monitors and chairs.
      for (let i = 0; i < 3; i++) {
        const x = ROOM_LEFT + 2.0 + i * 2.5 + jitter(i);
        view.add(box(1.7, 0.08, 0.8, MAT.white, x, y + 0.72, zRow));
        view.add(box(0.08, 0.72, 0.7, MAT.metal, x - 0.75, y + 0.36, zRow));
        view.add(box(0.08, 0.72, 0.7, MAT.metal, x + 0.75, y + 0.36, zRow));
        view.add(box(0.7, 0.45, 0.06, MAT.screen, x, y + 1.05, zRow - 0.15));
        view.add(box(0.45, 0.45, 0.45, MAT.fabricAlt, x, y + 0.25, zRow + 0.85));
      }
      plant(ROOM_RIGHT - 1.2, zRow);
      break;
    }
  }
}
