import * as THREE from 'three';
import { Floor, FloorType } from '../core/types';
import { getAsset, AssetKey } from './assets';
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
  factory: 0xd9d2c4,
};

const ROOM_WIDTH = ROOM_RIGHT - ROOM_LEFT;
const ROOM_CENTER_X = (ROOM_LEFT + ROOM_RIGHT) / 2;
const BACK_Z = -ROOM_DEPTH / 2;

// Shared geometry/materials so many floors and towers stay cheap.
const MAT = {
  slab: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  trim: new THREE.MeshLambertMaterial({ color: 0xfdfaf3 }),
  window: new THREE.MeshLambertMaterial({ color: 0x9fc9e8, emissive: 0xffcf8f, emissiveIntensity: 0 }),
  windowFrame: new THREE.MeshLambertMaterial({ color: 0xfdfdfd }),
  rail: new THREE.MeshLambertMaterial({ color: 0x8d99ae }),
  shaftBack: new THREE.MeshLambertMaterial({ color: 0xb8c0d0 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xf0ede5 }),
  wood: new THREE.MeshLambertMaterial({ color: 0xc09a6b }),
  woodDark: new THREE.MeshLambertMaterial({ color: 0xa07948 }),
  fabric: new THREE.MeshLambertMaterial({ color: 0xe98fa2 }),
  fabricAlt: new THREE.MeshLambertMaterial({ color: 0x93bfe3 }),
  white: new THREE.MeshLambertMaterial({ color: 0xfafafa }),
  green: new THREE.MeshLambertMaterial({ color: 0x7cc98f }),
  green2: new THREE.MeshLambertMaterial({ color: 0x5f9e6b }),
  pot: new THREE.MeshLambertMaterial({ color: 0xd96c6c }),
  screen: new THREE.MeshLambertMaterial({ color: 0x3f4a63 }),
  metal: new THREE.MeshLambertMaterial({ color: 0xb9c0cc }),
  // Extra palette for richer room dressing.
  rugWarm: new THREE.MeshLambertMaterial({ color: 0xd98c6a }),
  rugCool: new THREE.MeshLambertMaterial({ color: 0x6aa9b0 }),
  lamp: new THREE.MeshLambertMaterial({ color: 0xffe6a8 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x2b3040 }),
  brick: new THREE.MeshLambertMaterial({ color: 0xb5735a }),
  brass: new THREE.MeshLambertMaterial({ color: 0xd4a94e }),
  paper: new THREE.MeshLambertMaterial({ color: 0xf3ead2 }),
  cushion: new THREE.MeshLambertMaterial({ color: 0xc9a8e0 }),
};

const DAY_WINDOW = new THREE.Color(0x9fc9e8);
const NIGHT_WINDOW = new THREE.Color(0xffcf8f);

/**
 * Tint the shared window material with the day/night scalar (1 = midday,
 * 0 = deep night). Because every floor in every tower reuses one MAT.window,
 * this lights every window town-wide in a single per-frame assignment.
 */
export function setWindowGlow(daylight: number): void {
  const d = Math.max(0, Math.min(1, daylight));
  MAT.window.color.lerpColors(NIGHT_WINDOW, DAY_WINDOW, d);
  // After dark the windows emit a warm glow so they bloom into the night.
  MAT.window.emissiveIntensity = (1 - d) * 1.5;
}

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
  /** Open/closed indicator per business floor: sign material + wall material. */
  private openState = new Map<number, { signMat: THREE.MeshLambertMaterial; wallMat: THREE.MeshLambertMaterial; baseColor: number; open: boolean }>();
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
    this.openState.clear();
    this.builtHeight = 0;
  }

  sync(floors: Floor[], staffedLevels?: Set<number>): void {
    for (const floor of floors) {
      if (!this.built.has(floor.level)) {
        const view = buildFloorView(floor, this.secondShaft, (state) =>
          this.openState.set(floor.level, state),
        );
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
    if (staffedLevels) this.updateOpenStates(staffedLevels);
  }

  /** Businesses without hired staff read as closed: gray sign, dimmed walls. */
  private updateOpenStates(staffedLevels: Set<number>): void {
    for (const [level, state] of this.openState) {
      const open = staffedLevels.has(level);
      if (open === state.open) continue;
      state.open = open;
      state.signMat.color.setHex(open ? 0x6fcf7c : 0x9a9a9a);
      const dim = open ? 1 : 0.6;
      state.wallMat.color.setHex(state.baseColor);
      state.wallMat.color.multiplyScalar(dim);
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

function buildFloorView(
  floor: Floor,
  secondShaft: boolean,
  registerOpenState?: (state: {
    signMat: THREE.MeshLambertMaterial;
    wallMat: THREE.MeshLambertMaterial;
    baseColor: number;
    open: boolean;
  }) => void,
): THREE.Group {
  const view = new THREE.Group();
  const y = floorY(floor.level);
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLORS[floor.type] });

  // Business floors get an open/closed sign by the front edge.
  if (
    floor.type === 'shop' ||
    floor.type === 'restaurant' ||
    floor.type === 'office' ||
    floor.type === 'factory'
  ) {
    const signMat = new THREE.MeshLambertMaterial({ color: 0x6fcf7c });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), signMat);
    sign.position.set(ROOM_LEFT + 0.6, y + FLOOR_HEIGHT - 0.6, ROOM_DEPTH / 2 - 0.2);
    view.add(sign);
    registerOpenState?.({ signMat, wallMat, baseColor: WALL_COLORS[floor.type], open: true });
  }

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

/** Compound-mesh furniture silhouettes per floor type — no textures needed.
 *  A .glb dropped into public/models/ (see assets.ts) replaces the procedural
 *  set for that floor type automatically. */
function addFurniture(view: THREE.Group, floor: Floor, y: number): void {
  const zRow = BACK_Z + 1.5;

  const asset = getAsset(`furniture-${floor.type}` as AssetKey);
  if (asset) {
    asset.position.set(ROOM_CENTER_X, y, zRow);
    view.add(asset);
    return;
  }
  const seed = floor.level * 13;
  const jitter = (i: number) => (((seed + i * 7) % 5) - 2) * 0.18;

  const plant = (x: number, z: number, big = false) => {
    const s = big ? 1.5 : 1;
    view.add(box(0.36 * s, 0.34 * s, 0.36 * s, MAT.pot, x, y + 0.17 * s, z));
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.34 * s, 0.85 * s, 7), MAT.green);
    leaves.position.set(x, y + 0.85 * s, z);
    leaves.castShadow = true;
    view.add(leaves);
    if (big) {
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.26 * s, 0.7 * s, 7), MAT.green2);
      top.position.set(x, y + 1.4 * s, z);
      top.castShadow = true;
      view.add(top);
    }
  };

  // A flat area rug / floor mat.
  const rug = (cx: number, cz: number, w: number, d: number, mat: THREE.Material) =>
    view.add(box(w, 0.04, d, mat, cx, y + 0.03, cz, false));

  // A flush warm ceiling light panel.
  const ceilingLamp = (cx: number, cz: number) =>
    view.add(box(0.7, 0.12, 0.7, MAT.lamp, cx, y + FLOOR_HEIGHT - 0.12, cz, false));

  // A hanging pendant lamp (cord + shade).
  const pendant = (cx: number, cz: number, shade: THREE.Material = MAT.lamp) => {
    view.add(box(0.04, 0.5, 0.04, MAT.rail, cx, y + FLOOR_HEIGHT - 0.55, cz, false));
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.28, 10), shade);
    s.position.set(cx, y + FLOOR_HEIGHT - 0.9, cz);
    view.add(s);
  };

  // A framed picture on the back wall.
  const wallArt = (cx: number, mat: THREE.Material, w = 0.9, h = 0.7) => {
    view.add(box(w, h, 0.05, MAT.woodDark, cx, y + 1.95, BACK_Z + 0.26, false));
    view.add(box(w - 0.14, h - 0.14, 0.06, mat, cx, y + 1.95, BACK_Z + 0.28, false));
  };

  // A standing floor lamp.
  const floorLamp = (cx: number, cz: number) => {
    view.add(box(0.1, 1.4, 0.1, MAT.metal, cx, y + 0.7, cz));
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.36, 10), MAT.lamp);
    s.position.set(cx, y + 1.5, cz);
    s.castShadow = true;
    view.add(s);
  };

  // A short row of colourful books.
  const books = (cx: number, cz: number, yBase: number) => {
    const cols = [MAT.fabric, MAT.fabricAlt, MAT.green, MAT.pot];
    for (let i = 0; i < 4; i++) {
      view.add(box(0.12, 0.34 + (i % 2) * 0.08, 0.28, cols[i % 4], cx + i * 0.14, yBase + 0.17 + (i % 2) * 0.04, cz));
    }
  };

  const furnitureStart = view.children.length;

  switch (floor.type) {
    case 'lobby': {
      // Reception desk with counter top, monitor, and a brass logo panel.
      view.add(box(2.6, 0.75, 0.8, MAT.wood, ROOM_CENTER_X, y + 0.375, zRow));
      view.add(box(2.9, 0.1, 1.0, MAT.woodDark, ROOM_CENTER_X, y + 0.8, zRow));
      view.add(box(0.5, 0.4, 0.16, MAT.dark, ROOM_CENTER_X + 0.7, y + 1.0, zRow - 0.1));
      view.add(box(2.0, 0.9, 0.08, MAT.brass, ROOM_CENTER_X, y + 2.0, BACK_Z + 0.28, false));
      // A waiting area: rug, two facing benches, coffee table + magazine.
      rug(ROOM_RIGHT - 3.0, zRow + 1.7, 3.6, 2.4, MAT.rugCool);
      view.add(box(1.6, 0.35, 0.5, MAT.fabricAlt, ROOM_RIGHT - 3.2, y + 0.3, zRow + 2.5));
      view.add(box(1.6, 0.35, 0.5, MAT.fabric, ROOM_RIGHT - 3.2, y + 0.3, zRow + 0.9));
      view.add(box(0.9, 0.35, 0.6, MAT.wood, ROOM_RIGHT - 3.2, y + 0.28, zRow + 1.7));
      view.add(box(0.5, 0.05, 0.35, MAT.paper, ROOM_RIGHT - 3.2, y + 0.48, zRow + 1.7));
      // A wall of mail slots by the entrance.
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 2; c++)
          view.add(box(0.42, 0.3, 0.1, MAT.metal, ROOM_LEFT + 1.0 + c * 0.5, y + 0.95 + r * 0.36, zRow - 0.7));
      plant(ROOM_LEFT + 2.2, zRow + 1.2, true);
      plant(ROOM_RIGHT - 1.2, zRow);
      wallArt(ROOM_CENTER_X - 3.6, MAT.rugWarm);
      ceilingLamp(ROOM_CENTER_X, zRow + 1.4);
      break;
    }
    case 'residential': {
      rug(ROOM_CENTER_X, zRow + 1.4, ROOM_WIDTH - 3, 2.4, MAT.rugWarm);
      // Two beds: frame, mattress, pillow, folded blanket, nightstand + lamp.
      for (const [i, bx] of [ROOM_LEFT + 2.0, ROOM_CENTER_X + 2.4].entries()) {
        const x = bx + jitter(i);
        view.add(box(1.5, 0.3, 0.9, MAT.woodDark, x, y + 0.15, zRow));
        view.add(box(1.42, 0.22, 0.82, i === 0 ? MAT.fabric : MAT.fabricAlt, x, y + 0.4, zRow));
        view.add(box(0.4, 0.14, 0.6, MAT.white, x - 0.45, y + 0.56, zRow));
        view.add(box(0.9, 0.16, 0.8, i === 0 ? MAT.cushion : MAT.rugCool, x + 0.25, y + 0.45, zRow + 0.05));
        view.add(box(0.5, 0.5, 0.5, MAT.wood, x + 1.15, y + 0.25, zRow));
        view.add(box(0.14, 0.28, 0.14, MAT.brass, x + 1.15, y + 0.62, zRow));
        view.add(box(0.28, 0.22, 0.28, MAT.lamp, x + 1.15, y + 0.86, zRow));
      }
      // A living nook toward the front: sofa, coffee table, wall TV.
      view.add(box(2.0, 0.5, 0.8, MAT.fabricAlt, ROOM_LEFT + 2.4, y + 0.35, zRow + 2.0));
      view.add(box(2.0, 0.45, 0.22, MAT.fabricAlt, ROOM_LEFT + 2.4, y + 0.72, zRow + 2.35));
      view.add(box(1.0, 0.35, 0.5, MAT.wood, ROOM_LEFT + 2.4, y + 0.28, zRow + 1.2));
      view.add(box(1.5, 0.85, 0.08, MAT.dark, ROOM_LEFT + 2.4, y + 1.3, BACK_Z + 0.28, false));
      // Wardrobe, bookshelf with books, floor lamp, framed art, curtains.
      view.add(box(1.0, 1.9, 0.55, MAT.wood, ROOM_RIGHT - 0.9, y + 0.95, zRow));
      view.add(box(1.2, 1.5, 0.4, MAT.woodDark, ROOM_CENTER_X + 0.6, y + 0.75, zRow));
      for (let s = 0; s < 2; s++) books(ROOM_CENTER_X + 0.1, zRow, y + 0.35 + s * 0.6);
      floorLamp(ROOM_RIGHT - 1.9, zRow + 1.9);
      wallArt(ROOM_CENTER_X + 3.0, MAT.green, 0.7, 0.9);
      for (const dx of [ROOM_LEFT + 0.7, ROOM_RIGHT - 0.7])
        view.add(box(0.3, 2.0, 0.12, MAT.cushion, dx, y + 1.7, BACK_Z + 0.34, false));
      ceilingLamp(ROOM_CENTER_X, zRow + 1.3);
      break;
    }
    case 'shop': {
      rug(ROOM_CENTER_X, zRow + 1.7, ROOM_WIDTH - 2, 2.6, MAT.rugCool);
      // Checkout counter with register + a stack of shopping baskets.
      view.add(box(2.0, 0.8, 0.7, MAT.wood, ROOM_LEFT + 2.4, y + 0.4, zRow + 1.4));
      view.add(box(0.5, 0.3, 0.4, MAT.dark, ROOM_LEFT + 2.0, y + 0.95, zRow + 1.4));
      for (let b = 0; b < 3; b++)
        view.add(box(0.5, 0.14, 0.4, b % 2 ? MAT.pot : MAT.green, ROOM_LEFT + 3.2, y + 0.9 + b * 0.14, zRow + 1.4));
      // Two tall shelf units, four tiers of colourful stock each.
      for (const [i, sx] of [ROOM_CENTER_X + 0.4, ROOM_CENTER_X + 3.2].entries()) {
        const x = sx + jitter(i);
        view.add(box(1.9, 2.0, 0.42, MAT.woodDark, x, y + 1.0, zRow));
        for (let s = 0; s < 4; s++) {
          const sy = y + 0.5 + s * 0.45;
          view.add(box(1.7, 0.08, 0.44, MAT.white, x, sy, zRow + 0.02));
          view.add(box(0.34, 0.28, 0.28, s % 2 ? MAT.fabric : MAT.fabricAlt, x - 0.55, sy + 0.2, zRow + 0.05));
          view.add(box(0.32, 0.24, 0.28, s % 2 ? MAT.pot : MAT.green, x, sy + 0.18, zRow + 0.05));
          view.add(box(0.3, 0.24, 0.28, s % 2 ? MAT.brass : MAT.cushion, x + 0.55, sy + 0.18, zRow + 0.05));
        }
      }
      // A central display table with folded goods + two mannequins.
      view.add(box(1.6, 0.55, 1.0, MAT.wood, ROOM_CENTER_X + 1.6, y + 0.28, zRow + 2.0));
      for (const dx of [-0.4, 0.4])
        view.add(box(0.5, 0.2, 0.4, dx < 0 ? MAT.fabric : MAT.cushion, ROOM_CENTER_X + 1.6 + dx, y + 0.65, zRow + 2.0));
      for (const mx of [ROOM_RIGHT - 1.2, ROOM_RIGHT - 2.4]) {
        view.add(box(0.1, 0.9, 0.1, MAT.metal, mx, y + 0.45, zRow + 1.5));
        view.add(box(0.5, 0.7, 0.3, MAT.fabricAlt, mx, y + 1.15, zRow + 1.5));
      }
      pendant(ROOM_CENTER_X - 1.5, zRow + 1.0);
      pendant(ROOM_CENTER_X + 2.0, zRow + 1.0);
      break;
    }
    case 'restaurant': {
      rug(ROOM_LEFT + 3.4, zRow + 1.7, 6.4, 2.6, MAT.rugWarm);
      // Kitchen line: counter, range hood, oven, and a pass shelf of plates.
      view.add(box(3.2, 0.85, 0.7, MAT.metal, ROOM_RIGHT - 2.4, y + 0.42, zRow));
      view.add(box(0.9, 0.5, 0.5, MAT.screen, ROOM_RIGHT - 3.3, y + 1.1, zRow));
      view.add(box(0.6, 0.4, 0.45, MAT.dark, ROOM_RIGHT - 1.2, y + 0.9, zRow));
      view.add(box(3.2, 0.1, 0.35, MAT.woodDark, ROOM_RIGHT - 2.4, y + 1.4, zRow + 0.15));
      for (let p = 0; p < 4; p++) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 10), MAT.white);
        plate.position.set(ROOM_RIGHT - 3.6 + p * 0.4, y + 1.48, zRow + 0.15);
        view.add(plate);
      }
      // Three dining tables: chairs, a plate and a glass on each; lamp above.
      for (const [i, tx] of [ROOM_LEFT + 1.8, ROOM_LEFT + 4.0, ROOM_LEFT + 6.2].entries()) {
        const x = tx + jitter(i);
        const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.1, 0.08, 12), MAT.wood);
        table.position.set(x, y + 0.72, zRow + 1.6);
        table.castShadow = true;
        view.add(table);
        view.add(box(0.1, 0.7, 0.1, MAT.woodDark, x, y + 0.35, zRow + 1.6));
        for (const dx of [-0.78, 0.78]) {
          view.add(box(0.42, 0.42, 0.42, MAT.fabricAlt, x + dx, y + 0.2, zRow + 1.6));
          view.add(box(0.42, 0.5, 0.08, MAT.fabricAlt, x + dx, y + 0.55, zRow + 1.6 + (dx < 0 ? -0.2 : 0.2)));
        }
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12), MAT.white);
        plate.position.set(x, y + 0.78, zRow + 1.6);
        view.add(plate);
        view.add(box(0.12, 0.2, 0.12, MAT.window, x + 0.28, y + 0.86, zRow + 1.6));
        pendant(x, zRow + 1.6);
      }
      // A dark menu board on the wall + a leafy plant.
      view.add(box(1.4, 1.0, 0.06, MAT.dark, ROOM_RIGHT - 2.0, y + 2.0, BACK_Z + 0.3, false));
      plant(ROOM_CENTER_X - 2.4, zRow, true);
      break;
    }
    case 'office': {
      rug(ROOM_LEFT + 3.6, zRow + 1.3, 6.4, 2.2, MAT.rugCool);
      // A row of desks: monitor, keyboard, wheeled chair.
      for (let i = 0; i < 3; i++) {
        const x = ROOM_LEFT + 1.9 + i * 2.2 + jitter(i);
        view.add(box(1.7, 0.08, 0.8, MAT.white, x, y + 0.72, zRow));
        view.add(box(0.08, 0.72, 0.7, MAT.metal, x - 0.75, y + 0.36, zRow));
        view.add(box(0.08, 0.72, 0.7, MAT.metal, x + 0.75, y + 0.36, zRow));
        view.add(box(0.7, 0.45, 0.06, MAT.screen, x, y + 1.05, zRow - 0.15));
        view.add(box(0.5, 0.03, 0.18, MAT.dark, x, y + 0.78, zRow + 0.08));
        view.add(box(0.45, 0.1, 0.45, MAT.fabricAlt, x, y + 0.45, zRow + 0.9));
        view.add(box(0.45, 0.45, 0.08, MAT.fabricAlt, x, y + 0.68, zRow + 1.1));
      }
      // A meeting corner: round table, two chairs, wall whiteboard.
      const mt = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.12, 0.08, 12), MAT.woodDark);
      mt.position.set(ROOM_RIGHT - 1.7, y + 0.72, zRow + 2.0);
      mt.castShadow = true;
      view.add(mt);
      view.add(box(0.1, 0.7, 0.1, MAT.metal, ROOM_RIGHT - 1.7, y + 0.35, zRow + 2.0));
      for (const dx of [-0.85, 0.85])
        view.add(box(0.4, 0.5, 0.4, MAT.cushion, ROOM_RIGHT - 1.7 + dx, y + 0.25, zRow + 2.0));
      view.add(box(1.6, 1.0, 0.06, MAT.white, ROOM_RIGHT - 1.7, y + 2.0, BACK_Z + 0.3, false));
      // Filing cabinet + a water cooler.
      view.add(box(0.7, 1.1, 0.55, MAT.metal, ROOM_LEFT + 0.9, y + 0.55, zRow));
      view.add(box(0.4, 0.5, 0.4, MAT.window, ROOM_LEFT + 0.9, y + 1.4, zRow));
      plant(ROOM_RIGHT - 3.4, zRow);
      pendant(ROOM_CENTER_X - 1.4, zRow + 0.8);
      pendant(ROOM_CENTER_X + 1.6, zRow + 0.8);
      break;
    }
    case 'factory': {
      // A conveyor line down the middle with legs, plus crates riding it.
      view.add(box(ROOM_WIDTH - 2, 0.16, 0.7, MAT.metal, ROOM_CENTER_X, y + 0.7, zRow));
      for (const lx of [ROOM_LEFT + 1.6, ROOM_CENTER_X, ROOM_RIGHT - 1.6]) {
        view.add(box(0.14, 0.7, 0.14, MAT.rail, lx, y + 0.35, zRow + 0.25));
        view.add(box(0.14, 0.7, 0.14, MAT.rail, lx, y + 0.35, zRow - 0.25));
      }
      for (const [i, cx] of [ROOM_LEFT + 2.2, ROOM_CENTER_X + 0.4, ROOM_RIGHT - 2.4].entries()) {
        view.add(box(0.5, 0.45, 0.5, i % 2 ? MAT.wood : MAT.woodDark, cx + jitter(i), y + 1.0, zRow));
      }
      // A stack of crates in the corner.
      view.add(box(0.7, 0.7, 0.7, MAT.wood, ROOM_LEFT + 1.4, y + 0.35, zRow + 1.6));
      view.add(box(0.7, 0.7, 0.7, MAT.woodDark, ROOM_LEFT + 1.4, y + 1.05, zRow + 1.6));
      // Machine housing with a control panel + indicator lights.
      view.add(box(1.0, 1.2, 1.0, MAT.screen, ROOM_RIGHT - 1.6, y + 0.6, zRow + 1.2));
      view.add(box(0.8, 0.6, 0.1, MAT.dark, ROOM_RIGHT - 1.6, y + 1.0, zRow + 1.72));
      for (const [j, cc] of [MAT.pot, MAT.green, MAT.brass].entries())
        view.add(box(0.12, 0.12, 0.06, cc, ROOM_RIGHT - 1.9 + j * 0.3, y + 1.12, zRow + 1.78));
      // Overhead pipes running the length of the ceiling.
      for (const pz of [zRow - 0.4, zRow + 0.15])
        view.add(box(ROOM_WIDTH - 1, 0.16, 0.16, MAT.rail, ROOM_CENTER_X, y + FLOOR_HEIGHT - 0.4, pz, false));
      // A simple robotic arm over the line.
      view.add(box(0.2, 0.9, 0.2, MAT.metal, ROOM_CENTER_X + 1.2, y + 1.3, zRow));
      view.add(box(0.9, 0.16, 0.16, MAT.brass, ROOM_CENTER_X + 1.65, y + 1.7, zRow));
      // A hazard-striped work mat + two drums.
      rug(ROOM_LEFT + 2.6, zRow + 2.0, 3, 1.3, MAT.brass);
      for (const bx of [ROOM_LEFT + 2.1, ROOM_LEFT + 2.9]) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 12), MAT.brick);
        drum.position.set(bx, y + 0.45, zRow + 2.0);
        drum.castShadow = true;
        view.add(drum);
      }
      // A tool board on the back wall.
      view.add(box(1.4, 0.9, 0.05, MAT.woodDark, ROOM_LEFT + 3.2, y + 2.0, BACK_Z + 0.3, false));
      break;
    }
  }

  // Interior props keep their soft self-shadowing (receiveShadow) but don't
  // cast into the shadow map — the room shell already does, and skipping the
  // hundreds of little furniture meshes keeps the shadow pass cheap as towers
  // stack up. Big, real perf win for a shadow nobody would notice indoors.
  for (let i = furnitureStart; i < view.children.length; i++) {
    view.children[i].castShadow = false;
  }
}
