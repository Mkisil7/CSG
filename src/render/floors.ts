import * as THREE from 'three';
import { Floor, FloorType } from '../core/types';
import {
  FLOOR_HEIGHT,
  ROOM_DEPTH,
  ROOM_LEFT,
  ROOM_RIGHT,
  SHAFT_WIDTH,
  SHAFT_X,
  floorY,
} from './layout';

const WALL_COLORS: Record<FloorType, number> = {
  lobby: 0xf5e9d4,
  residential: 0xf7c8d0,
  shop: 0xc8e4f7,
  restaurant: 0xf7e3b0,
  office: 0xd6cff7,
};

const PROP_COLORS: Record<FloorType, number[]> = {
  lobby: [0xd9b98c, 0xc4a06a],
  residential: [0xe98fa2, 0xb5d99c, 0x93bfe3],
  shop: [0x74b3e0, 0xf2b366, 0xe98fa2],
  restaurant: [0xe0a274, 0xd96c6c, 0xf2d266],
  office: [0x9a8fe0, 0x8fb8e0, 0xc0c0d8],
};

const ROOM_WIDTH = ROOM_RIGHT - ROOM_LEFT;
const ROOM_CENTER_X = (ROOM_LEFT + ROOM_RIGHT) / 2;

/**
 * Renders the tower as a dollhouse cross-section: each floor is an open-front
 * room with a slab, back wall, side walls, and a few interior props.
 */
export class FloorViews {
  readonly group = new THREE.Group();
  private built = new Map<number, THREE.Group>();
  private shaft: THREE.Group | null = null;
  private roof: THREE.Mesh | null = null;
  private shaftHeight = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  sync(floors: Floor[]): void {
    for (const floor of floors) {
      if (!this.built.has(floor.level)) {
        const view = buildFloorView(floor);
        this.built.set(floor.level, view);
        this.group.add(view);
      }
    }
    if (floors.length !== this.shaftHeight) {
      this.rebuildShaft(floors.length);
      this.rebuildRoof(floors.length);
    }
  }

  private rebuildRoof(floorCount: number): void {
    if (this.roof) this.group.remove(this.roof);
    this.roof = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_WIDTH + 0.6, 0.35, ROOM_DEPTH + 0.4),
      new THREE.MeshLambertMaterial({ color: 0xf0ede5 }),
    );
    this.roof.position.set(ROOM_CENTER_X, floorCount * FLOOR_HEIGHT + 0.17, 0);
    this.roof.castShadow = this.roof.receiveShadow = true;
    this.group.add(this.roof);
  }

  private rebuildShaft(floorCount: number): void {
    if (this.shaft) this.group.remove(this.shaft);
    this.shaftHeight = floorCount;
    const height = floorCount * FLOOR_HEIGHT;

    const shaft = new THREE.Group();
    const railMat = new THREE.MeshLambertMaterial({ color: 0x8d99ae });
    for (const dx of [-SHAFT_WIDTH / 2, SHAFT_WIDTH / 2]) {
      for (const dz of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, height, 0.15), railMat);
        rail.position.set(SHAFT_X + dx, height / 2, dz);
        shaft.add(rail);
      }
    }
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(SHAFT_WIDTH, height, 0.15),
      new THREE.MeshLambertMaterial({ color: 0xb8c0d0 }),
    );
    back.position.set(SHAFT_X, height / 2, -1);
    shaft.add(back);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(SHAFT_WIDTH + 0.4, 0.3, 2.4),
      railMat,
    );
    cap.position.set(SHAFT_X, height + 0.15, 0);
    shaft.add(cap);

    this.shaft = shaft;
    this.group.add(shaft);
  }
}

function buildFloorView(floor: Floor): THREE.Group {
  const view = new THREE.Group();
  const y = floorY(floor.level);
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLORS[floor.type] });

  // The slab spans the whole footprint: shaft on the left through the rooms.
  const slabLeft = SHAFT_X - SHAFT_WIDTH / 2 - 0.3;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_RIGHT - slabLeft, 0.3, ROOM_DEPTH),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  slab.position.set((ROOM_RIGHT + slabLeft) / 2, y - 0.15, 0);
  slab.castShadow = slab.receiveShadow = true;
  view.add(slab);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_WIDTH, FLOOR_HEIGHT, 0.2),
    wallMat,
  );
  back.position.set(ROOM_CENTER_X, y + FLOOR_HEIGHT / 2, -ROOM_DEPTH / 2 + 0.1);
  back.receiveShadow = true;
  view.add(back);

  const sideGeom = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, ROOM_DEPTH);
  const right = new THREE.Mesh(sideGeom, wallMat);
  right.position.set(ROOM_RIGHT, y + FLOOR_HEIGHT / 2, 0);
  right.castShadow = right.receiveShadow = true;
  view.add(right);
  const left = new THREE.Mesh(sideGeom, wallMat);
  left.position.set(ROOM_LEFT, y + FLOOR_HEIGHT / 2, 0);
  left.receiveShadow = true;
  view.add(left);

  addProps(view, floor, y);
  return view;
}

/** A few deterministic pastel boxes per floor type — furniture without an art team. */
function addProps(view: THREE.Group, floor: Floor, y: number): void {
  const colors = PROP_COLORS[floor.type];
  const count = floor.type === 'lobby' ? 2 : 3;
  for (let i = 0; i < count; i++) {
    const seed = floor.level * 17 + i * 7;
    const w = 1 + ((seed * 3) % 10) / 8;
    const h = 0.6 + ((seed * 5) % 10) / 12;
    const prop = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 1.2),
      new THREE.MeshLambertMaterial({ color: colors[i % colors.length] }),
    );
    const x = ROOM_LEFT + 1.5 + ((i + 0.5) / count) * (ROOM_WIDTH - 3) + ((seed % 5) - 2) * 0.3;
    prop.position.set(x, y + h / 2, -ROOM_DEPTH / 2 + 1.2);
    prop.castShadow = true;
    view.add(prop);
  }
}
