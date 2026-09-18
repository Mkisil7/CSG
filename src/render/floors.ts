import * as THREE from 'three';
import { Floor, FloorType, BusinessSubtype, BUSINESS_SUBTYPES, type Resident } from '../core/types';
import { getAsset, AssetKey } from './assets';
import type { Architecture } from '../core/identity';
import { homeResting } from '../core/roomLife';
import { windowLight } from './lighting';
import { roomWallLightMap } from './roomLight';
import { landmarkRoom, LandmarkRoom } from './landmarks';
import { architectureFacade, architectureRoof } from './architecture';
import { OPENING_DURATION, openingDelta, openingFrame } from './construction';
import { LANDMARKS } from '../core/landmarks';
import { batchStaticMeshes, batchExteriorMeshes } from './staticBatch';
import { indoorPlant } from './indoorPlants';
import { restaurantRoom, RestaurantRoom } from './restaurantRoom';
import { shopRoom, ShopRoom } from './shopRoom';
import { factoryRoom, FactoryRoom } from './factoryRoom';
import { officeRoom, OfficeRoom } from './officeRoom';
import { homeRoom, HomeRoom } from './homeRoom';
import { MilestoneWall } from './milestoneWall';
import { SnowCover, boxSnowSurfaces } from './snowCover';
import { STAIR_RUN, STAIR_STEPS, STAIR_Z, stairLandingX } from './stairs';
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
  residential: 0xe2d5c5,
  shop: 0xc7d3c9,
  restaurant: 0xdfc5a4,
  office: 0xc9ced1,
  factory: 0xd9d2c4,
  landmark: 0xd1c9b7,
};

const ROOM_WIDTH = ROOM_RIGHT - ROOM_LEFT;
const ROOM_CENTER_X = (ROOM_LEFT + ROOM_RIGHT) / 2;
const BACK_Z = -ROOM_DEPTH / 2;
// Read-only A/B switch for the development rendering study; compiled out of production.
const BATCH_ROOMS = !(import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('unbatched'));

const SUBTYPE_WALLS: Partial<Record<BusinessSubtype, number>> = {
  coffee: 0xc7b299, fastfood: 0xe4cdb1, 'fine-dining': 0x8b9690, bar: 0x655f70,
  grocery: 0xb5c4a8, boutique: 0xdacac3, electronics: 0xaabac5,
  creative: 0xc4c8b8, tech: 0xaebdc3, law: 0xb5a99b,
  assembly: 0xb5ada0, foodproc: 0xc4cdb9, 'electronics-fab': 0xb5c7ce,
};

// Shared geometry/materials so many floors and towers stay cheap.
const MAT = {
  slab: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  trim: new THREE.MeshLambertMaterial({ color: 0xfdfaf3 }),
  window: new THREE.MeshLambertMaterial({ color: 0x9fc9e8, emissive: 0xffcf8f, emissiveIntensity: 0 }),
  windowFrame: new THREE.MeshLambertMaterial({ color: 0xfdfdfd }),
  rail: new THREE.MeshLambertMaterial({ color: 0x8d99ae }),
  shaftBack: new THREE.MeshLambertMaterial({ color: 0xb8c0d0 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xf0ede5 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xb39775, roughness: 0.8 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x80634a, roughness: 0.72 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0xb68887, roughness: 0.98 }),
  fabricAlt: new THREE.MeshStandardMaterial({ color: 0x799caa, roughness: 0.98 }),
  white: new THREE.MeshLambertMaterial({ color: 0xfafafa }),
  green: new THREE.MeshLambertMaterial({ color: 0x7cc98f }),
  green2: new THREE.MeshLambertMaterial({ color: 0x5f9e6b }),
  pot: new THREE.MeshLambertMaterial({ color: 0xd96c6c }),
  screen: new THREE.MeshLambertMaterial({ color: 0x3f4a63 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xa6afb5, roughness: 0.4, metalness: 0.55 }),
  // Extra palette for richer room dressing.
  rugWarm: new THREE.MeshLambertMaterial({ color: 0xd98c6a }),
  rugCool: new THREE.MeshLambertMaterial({ color: 0x6aa9b0 }),
  lamp: new THREE.MeshLambertMaterial({ color: 0xffe6a8 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x2b3040 }),
  brick: new THREE.MeshLambertMaterial({ color: 0xb5735a }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb49a64, roughness: 0.4, metalness: 0.65 }),
  paper: new THREE.MeshLambertMaterial({ color: 0xf3ead2 }),
  cushion: new THREE.MeshLambertMaterial({ color: 0xc9a8e0 }),
};

const DAY_WINDOW = new THREE.Color(0x9fc9e8);
const NIGHT_WINDOW = new THREE.Color(0xffcf8f);

/** Shared decorative lamps; actual window panes have occupancy-aware materials. */
export function setWindowGlow(daylight: number): void {
  const d = Math.max(0, Math.min(1, daylight));
  MAT.window.color.lerpColors(NIGHT_WINDOW, DAY_WINDOW, d);
  // After dark the windows emit a warm glow so they bloom into the night.
  MAT.window.emissiveIntensity = (1 - d) * 0.55;
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

/** Release rebuilt room geometry without disposing shared palette or GLB assets. */
function disposeGeneratedGroup(root: THREE.Object3D): void {
  const sharedMaterials = new Set<THREE.Material>(Object.values(MAT));
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const visit = (object: THREE.Object3D) => {
    if (object.userData.sharedAsset) return;
    if (object instanceof THREE.Mesh) {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) if (!sharedMaterials.has(material)) materials.add(material);
    }
    object.children.forEach(visit);
  };
  visit(root);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
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
  private roofSnow: SnowCover | null = null;
  private canopySnow: SnowCover | null = null;
  private snowAmount = 0;
  private builtHeight = 0;
  private secondShaft = false;
  private initialized = false;
  private roomDetail = false;
  private architecture: Architecture = 'heritage';
  private features = new Set<string>();
  private appearanceKey = '';
  private towerName = '';
  private facade: THREE.Group | null = null;
  private reveals = new Map<number, { elapsed: number; announced: boolean }>();
  private signs = new Map<number, { mesh: THREE.Mesh; text: string; redraw: (text: string) => void }>();
  private variantViews = new Map<number, { key: string; view: THREE.Group }>();
  private subtypes = new Map<number, string>();
  private windows = new Map<number, { type: FloorType; panes: THREE.MeshLambertMaterial[] }>();
  private roomWalls = new Map<number, THREE.MeshLambertMaterial>();
  private landmarks = new Map<number, LandmarkRoom>();
  private restaurants = new Map<number, RestaurantRoom>();
  private shops = new Map<number, ShopRoom>();
  private factories = new Map<number, FactoryRoom>();
  private offices = new Map<number, OfficeRoom>();
  private homes = new Map<number, HomeRoom>();
  private milestoneWall?: MilestoneWall;
  private readonly motionPreference = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    parent: THREE.Object3D,
    public readonly towerId: string,
    origin: { x: number; z: number },
  ) {
    this.group.position.set(origin.x, 0, origin.z);
    parent.add(this.group);
  }

  get renderedFloorCount(): number { return this.builtHeight; }
  /** Presentation only: real arrivals continue while the room is being revealed. */
  readonly isFloorReady = (level: number): boolean => !this.reveals.has(level);

  /** Smaller ceiling-trim labels leave the dollhouse interior open in close-up.
   * This is presentation state only, independent of opening opacity and saves. */
  setRoomDetail(active: boolean): void {
    if (active === this.roomDetail) return;
    this.roomDetail = active;
    for (const [level, sign] of this.signs) this.positionSign(sign.mesh, level);
  }

  private positionSign(mesh: THREE.Mesh, level: number): void {
    // A canopy carries the entrance name on its front fascia, clear of snow.
    const canopy = level === 0 && this.features.has('canopy');
    const top = level === this.builtHeight - 1;
    const topHeritage = top && this.architecture === 'heritage';
    mesh.scale.setScalar(this.roomDetail ? 0.6 : canopy ? 0.75 : 1);
    // Keep the compact face below the next floor's belt. At the heritage roof,
    // hang it below the corbels instead of printing through solid masonry.
    mesh.position.y = canopy ? 2.5 : floorY(level) + FLOOR_HEIGHT -
      (this.roomDetail ? topHeritage ? 0.5 : top ? 0.3 : 0.24 : topHeritage ? 0.66 : 0.58);
    mesh.position.z = canopy ? 5.22 : ROOM_DEPTH / 2 + 0.04;
  }

  updateSnow(amount: number): void {
    this.snowAmount = amount;
    this.roofSnow?.setAmount(amount); this.canopySnow?.setAmount(amount);
  }

  setSecondShaft(unlocked: boolean): void {
    if (unlocked === this.secondShaft) return;
    this.secondShaft = unlocked;
    // Retroactive: every floor's slab must span to the new shaft — rebuild all.
    for (const view of this.built.values()) {
      this.group.remove(view);
      disposeGeneratedGroup(view);
    }
    this.built.clear();
    this.openState.clear();
    this.signs.clear();
    this.variantViews.clear(); this.subtypes.clear();
    this.windows.clear();
    this.roomWalls.clear();
    this.landmarks.clear();
    this.restaurants.clear();
    this.shops.clear();
    this.factories.clear();
    this.offices.clear();
    this.homes.clear();
    this.milestoneWall = undefined;
    this.reveals.clear();
    this.initialized = false;
    this.builtHeight = 0;
  }

  setAppearance(architecture: Architecture, features: Set<string>, name: string): void {
    this.towerName = name;
    const key = `${architecture}:${[...features].sort().join(',')}`;
    if (this.appearanceKey === key) return;
    this.appearanceKey = key;
    this.architecture = architecture;
    this.features = new Set(features);
    if (this.builtHeight) { this.rebuildRoof(this.builtHeight); this.rebuildFacade(this.builtHeight); }
    for (const [level, sign] of this.signs) this.positionSign(sign.mesh, level);
  }

  /** Called only for the founding tower; completed missions already persist. */
  syncMilestones(completed: ReadonlySet<string>): void {
    const lobby = this.built.get(0)?.getObjectByName('room-furnishings');
    if (!lobby) return;
    if (!this.milestoneWall || this.milestoneWall.parent !== lobby) {
      this.milestoneWall = new MilestoneWall(); lobby.add(this.milestoneWall);
    }
    this.milestoneWall.sync(completed);
  }

  /** Returns newly lit opening signs once, for the matching sound motif. */
  sync(floors: Floor[], staffedLevels?: Set<number>, realDt = 0, previewReducedMotion?: boolean): Floor[] {
    const openings: Floor[] = [];
    // Only disposable development studies may override the system preference.
    // Production always respects it, even if a caller supplies this argument.
    const reducedMotion = import.meta.env.DEV && previewReducedMotion !== undefined
      ? previewReducedMotion : this.motionPreference?.matches ?? false;
    for (const floor of floors) {
      const subtype = `${floor.landmark ?? floor.subtype ?? floor.type}${floor.type === 'restaurant' && floor.variant === 'critics-choice' ? ':critics-choice' : ''}`;
      if (this.built.has(floor.level) && this.subtypes.get(floor.level) !== subtype) {
        const old = this.built.get(floor.level)!; this.group.remove(old); disposeGeneratedGroup(old);
        this.built.delete(floor.level); this.signs.delete(floor.level); this.variantViews.delete(floor.level);
        this.windows.delete(floor.level);
        this.roomWalls.delete(floor.level);
        this.landmarks.delete(floor.level);
        this.restaurants.delete(floor.level);
        this.shops.delete(floor.level);
        this.factories.delete(floor.level);
        this.offices.delete(floor.level);
        this.homes.delete(floor.level);
      }
      if (!this.built.has(floor.level)) {
        const panes: THREE.MeshLambertMaterial[] = [];
        const view = buildFloorView(floor, this.secondShaft, panes, (state) =>
          this.openState.set(floor.level, state),
        );
        this.windows.set(floor.level, { type: floor.type, panes });
        const wall = view.getObjectByName('room-lit-wall') as THREE.Mesh | undefined;
        if (wall) this.roomWalls.set(floor.level, wall.material as THREE.MeshLambertMaterial);
        const landmark = view.getObjectByName(`landmark:${floor.landmark}`);
        if (landmark instanceof LandmarkRoom) this.landmarks.set(floor.level, landmark);
        const restaurant = view.getObjectByName(`restaurant-interior:${floor.subtype ?? 'coffee'}`);
        if (restaurant instanceof RestaurantRoom) this.restaurants.set(floor.level, restaurant);
        const shop = view.getObjectByName(`shop-interior:${floor.subtype ?? 'grocery'}`);
        if (shop instanceof ShopRoom) this.shops.set(floor.level, shop);
        const factory = view.getObjectByName(`factory-interior:${floor.subtype ?? 'assembly'}`);
        if (factory instanceof FactoryRoom) this.factories.set(floor.level, factory);
        const office = view.getObjectByName(`office-interior:${floor.subtype ?? 'tech'}`);
        if (office instanceof OfficeRoom) this.offices.set(floor.level, office);
        const home = view.getObjectByName('home-interior');
        if (home instanceof HomeRoom) this.homes.set(floor.level, home);
        view.userData = { pickable: 'floor', floorLevel: floor.level, towerId: this.towerId };
        this.built.set(floor.level, view);
        this.subtypes.set(floor.level, subtype);
        this.group.add(view);
        {
          const sign = floorSign(floor.level === 0 ? { ...floor, name: this.towerName || floor.name } : floor);
          this.positionSign(sign.mesh, floor.level);
          view.add(sign.mesh);
          this.signs.set(floor.level, sign);
          if (floor.level >= this.builtHeight && floor.level > 0 && this.initialized) {
            if (reducedMotion) openings.push(floor);
            else this.reveals.set(floor.level, { elapsed: 0, announced: false });
          }
        }
      }
      const sign = this.signs.get(floor.level);
      const name = floor.level === 0 ? this.towerName || floor.name : floor.name;
      const signKey = `${name}:${!!floor.signature}:${floor.variant ?? ''}`;
      if (sign && sign.text !== signKey) {
        sign.text = signKey;
        sign.redraw(name);
      }
      const oldVariant = this.variantViews.get(floor.level);
      if ((floor.variant ?? '') !== (oldVariant?.key ?? '')) {
        if (oldVariant) { oldVariant.view.removeFromParent(); disposeGeneratedGroup(oldVariant.view); this.variantViews.delete(floor.level); }
        if (floor.variant) {
          const decoration = variantDecoration(floor);
          const parent = this.built.get(floor.level)!;
          (parent.getObjectByName('room-furnishings') ?? parent).add(decoration);
          this.variantViews.set(floor.level, { key: floor.variant, view: decoration });
        }
      }
    }
    if (floors.length !== this.builtHeight) {
      this.builtHeight = floors.length;
      this.rebuildShafts(floors.length);
      this.rebuildRoof(floors.length);
      this.rebuildFacade(floors.length);
      for (const [level, sign] of this.signs) this.positionSign(sign.mesh, level);
    }
    if (staffedLevels) this.updateOpenStates(staffedLevels);
    this.initialized = true;
    if (!this.reveals.size) return openings;
    let missingHeight = 0;
    for (const floor of floors) {
      const level = floor.level, reveal = this.reveals.get(level);
      if (reveal) reveal.elapsed = reducedMotion ? OPENING_DURATION : reveal.elapsed + openingDelta(realDt);
      const frame = openingFrame(reveal?.elapsed ?? OPENING_DURATION);
      const view = this.built.get(level)!;
      view.scale.y = frame.scale;
      // World-height geometry stays anchored to the partly completed stack below.
      view.position.y = floorY(level) * (1 - frame.scale) - missingHeight;
      const facade = this.facade?.getObjectByName(`facade-level:${level}`);
      if (facade) { facade.scale.y = frame.scale; facade.position.y = view.position.y; }
      const furnishings = view.getObjectByName('room-furnishings');
      if (furnishings) furnishings.visible = frame.furnishings;
      const sign = this.signs.get(level);
      if (sign) {
        const material = sign.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = frame.sign; material.color.setScalar(0.45 + 0.55 * frame.sign);
      }
      if (reveal && frame.sign > 0 && !reveal.announced) {
        // A live preference change finishes silently while paused, without backlog.
        if (!reducedMotion || realDt > 0) openings.push(floor);
        reveal.announced = true;
      }
      missingHeight += (1 - frame.scale) * FLOOR_HEIGHT;
      if (frame.complete) this.reveals.delete(level);
    }
    if (this.roof) this.roof.position.y = -missingHeight;
    const cornice = this.facade?.getObjectByName('facade-cornice');
    if (cornice) cornice.position.y = -missingHeight;
    for (const shaft of this.shafts) shaft.scale.y = floors.length ? 1 - missingHeight / (floors.length * FLOOR_HEIGHT) : 1;
    return openings;
  }

  /** Real room occupancy drives light, not a cosmetic population or extra lights. */
  updateLighting(daylight: number, occupants: Resident[], timeOfDay: number): void {
    this.milestoneWall?.updateLighting(daylight);
    const occupied = new Set<number>();
    const awakeFloors = new Set<number>();
    for (const resident of occupants) {
      if (resident.state.kind === 'idle') {
        occupied.add(resident.state.floor);
        if (!homeResting(resident, timeOfDay)) awakeFloors.add(resident.state.floor);
      }
    }
    for (const [level, { type, panes }] of this.windows) {
      const active = type === 'lobby' || occupied.has(level);
      for (const [index, material] of panes.entries()) {
        const glow = windowLight(daylight, level * 3 + index, active, type === 'residential', timeOfDay);
        material.color.copy(DAY_WINDOW).lerp(NIGHT_WINDOW, Math.min(1, glow * 1.6));
        material.emissiveIntensity = glow;
      }
      const wall = this.roomWalls.get(level);
      if (wall) {
        const awake = type !== 'residential' || awakeFloors.has(level);
        wall.lightMapIntensity = windowLight(daylight, level * 3, active, false, timeOfDay) * (awake ? 1 : 0.12);
      }
    }
    for (const [level, room] of this.landmarks) room.updateLighting(daylight, occupied.has(level));
    for (const [level, room] of this.restaurants) room.updateLighting(daylight, occupied.has(level));
    for (const [level, room] of this.shops) room.updateLighting(daylight, occupied.has(level));
    for (const [level, room] of this.factories) room.updateLighting(daylight, occupied.has(level));
    for (const [level, room] of this.offices) room.updateLighting(daylight, occupied.has(level));
    for (const [level, room] of this.homes) {
      const atHome = occupants.filter(r => r.homeTowerId === this.towerId && r.homeFloor === level &&
        r.state.kind === 'idle' && r.state.floor === level && r.state.activity.floor === level && r.state.activity.kind === 'home');
      room.updateLighting(daylight, atHome.length > 0, atHome.some(r => !homeResting(r, timeOfDay)));
    }
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
    for (const s of this.shafts) {
      this.group.remove(s);
      disposeGeneratedGroup(s);
    }
    this.shafts = [buildShaftGroup(SHAFT_X, floorCount)];
    if (this.secondShaft) this.shafts.push(buildShaftGroup(SHAFT_X_RIGHT, floorCount));
    for (const s of this.shafts) this.group.add(s);
  }

  private rebuildRoof(floorCount: number): void {
    if (this.roof) {
      this.group.remove(this.roof);
      disposeGeneratedGroup(this.roof);
    }
    const roof = new THREE.Group(); roof.name = 'tower-roof';
    const y = floorCount * FLOOR_HEIGHT;
    const slabW = ROOM_WIDTH + 1;
    roof.add(box(slabW, 0.35, ROOM_DEPTH + 0.6, MAT.roof, ROOM_CENTER_X, y + 0.17, 0));
    // Parapet lip around the roof edge.
    const lipH = 0.5;
    roof.add(box(slabW, lipH, 0.25, MAT.roof, ROOM_CENTER_X, y + lipH / 2 + 0.3, BACK_Z - 0.1));
    roof.add(box(slabW, lipH, 0.25, MAT.roof, ROOM_CENTER_X, y + lipH / 2 + 0.3, -BACK_Z + 0.1));
    roof.add(box(0.25, lipH, ROOM_DEPTH + 0.6, MAT.roof, ROOM_LEFT - 0.4, y + lipH / 2 + 0.3, 0));
    roof.add(box(0.25, lipH, ROOM_DEPTH + 0.6, MAT.roof, ROOM_RIGHT + 0.4, y + lipH / 2 + 0.3, 0));
    roof.add(architectureRoof(this.architecture, y));
    if (this.features.has('roof-garden')) {
      for (const x of [ROOM_LEFT + 2, ROOM_CENTER_X, ROOM_RIGHT - 3.5]) {
        roof.add(box(1.5, 0.45, 1.6, MAT.woodDark, x, y + 0.65, 0.5));
        const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), MAT.green2);
        shrub.scale.y = 0.65; shrub.position.set(x, y + 1.15, 0.5); roof.add(shrub);
      }
      roof.add(box(3, 0.4, 0.75, MAT.wood, ROOM_CENTER_X + 0.5, y + 0.6, -1.5));
    }
    if (this.features.has('landmark')) {
      roof.add(box(2.2, 1.1, 2, MAT.brick, ROOM_CENTER_X, y + 0.9, -0.8));
      roof.add(box(2.5, 0.2, 2.3, MAT.brass, ROOM_CENTER_X, y + 1.5, -0.8));
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.3, 12), MAT.brass);
      spire.position.set(ROOM_CENTER_X, y + 3.2, -0.8); roof.add(spire);
    }
    this.roofSnow = new SnowCover(boxSnowSurfaces(roof), 'roof-snow');
    this.roofSnow.setAmount(this.snowAmount); roof.add(this.roofSnow);
    // Extract individual snow surfaces before merging the static shell. Keep
    // shrubs, earned sculptures and style-specific silhouettes independent.
    batchExteriorMeshes(roof, new Set([MAT.roof, MAT.woodDark, MAT.wood]));
    this.roof = roof;
    this.group.add(roof);
  }

  private rebuildFacade(floorCount: number): void {
    if (this.facade) { this.group.remove(this.facade); disposeGeneratedGroup(this.facade); }
    const facade = architectureFacade(this.architecture, floorCount);
    const material = this.architecture === 'modern' ? MAT.dark : this.architecture === 'garden' ? MAT.woodDark : MAT.brick;
    this.canopySnow = null;
    if (this.features.has('canopy')) {
      facade.add(box(4.4, 0.18, 2.2, material, ROOM_CENTER_X, 2.5, 4.1));
      this.canopySnow = new SnowCover([{ x: ROOM_CENTER_X, y: 2.59, z: 4.1, width: 4.4, depth: 2.2 }], 'canopy-snow');
      this.canopySnow.setAmount(this.snowAmount); facade.add(this.canopySnow);
      for (const x of [ROOM_CENTER_X - 2, ROOM_CENTER_X + 2]) facade.add(box(0.12, 2.5, 0.12, MAT.brass, x, 1.25, 5));
    }
    if (this.features.has('public-art')) {
      const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(0.65, 0.14, 48, 8), MAT.brass);
      sculpture.position.set(ROOM_RIGHT + 3, 1.7, 4.5); sculpture.castShadow = true;
      facade.add(sculpture, box(1.7, 0.5, 1.7, MAT.trim, ROOM_RIGHT + 3, 0.25, 4.5));
    }
    this.facade = facade; this.group.add(facade);
  }
}

export function buildShaftGroup(x: number, floorCount: number): THREE.Group {
  const height = floorCount * FLOOR_HEIGHT;
  const shaft = new THREE.Group(); shaft.name = 'tower-shaft';
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
  batchExteriorMeshes(shaft, new Set([MAT.rail, MAT.shaftBack]));
  return shaft;
}

function buildFloorView(
  floor: Floor,
  secondShaft: boolean,
  panes: THREE.MeshLambertMaterial[],
  registerOpenState?: (state: {
    signMat: THREE.MeshLambertMaterial;
    wallMat: THREE.MeshLambertMaterial;
    baseColor: number;
    open: boolean;
  }) => void,
): THREE.Group {
  const view = new THREE.Group();
  const y = floorY(floor.level);
  const wallColor = (floor.subtype && SUBTYPE_WALLS[floor.subtype]) || WALL_COLORS[floor.type];
  const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
  if (floor.type !== 'landmark') {
    wallMat.lightMap = roomWallLightMap(floor.type === 'residential');
    wallMat.lightMapIntensity = 0;
  }

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
    registerOpenState?.({ signMat, wallMat, baseColor: wallColor, open: true });
  }

  // Slab spans from the left shaft to the right shaft (when built) or room edge.
  const slabLeft = SHAFT_X - SHAFT_WIDTH / 2 - 0.3;
  const slabRight = secondShaft ? SHAFT_X_RIGHT + SHAFT_WIDTH / 2 + 0.3 : ROOM_RIGHT;
  const slab = box(slabRight - slabLeft, 0.3, ROOM_DEPTH, MAT.slab, (slabRight + slabLeft) / 2, y - 0.15, 0);
  view.add(slab);

  // Back wall with a real window grid (or lobby glass doors).
  const back = box(ROOM_WIDTH, FLOOR_HEIGHT, 0.2, wallMat, ROOM_CENTER_X, y + FLOOR_HEIGHT / 2, BACK_Z + 0.1, false);
  back.name = 'room-lit-wall';
  if (floor.type !== 'landmark') {
    view.add(back);
    addBackWallDetail(view, floor.type, y, panes);
  } else back.geometry.dispose();

  // Side walls + a slim white ceiling trim along the open front edge.
  const sideGeom = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, ROOM_DEPTH);
  const right = new THREE.Mesh(sideGeom, wallMat);
  right.position.set(ROOM_RIGHT, y + FLOOR_HEIGHT / 2, 0);
  right.castShadow = right.receiveShadow = true;
  const left = new THREE.Mesh(sideGeom, wallMat);
  left.position.set(ROOM_LEFT, y + FLOOR_HEIGHT / 2, 0);
  left.receiveShadow = true;
  if (floor.type !== 'landmark') view.add(left, right);
  else { sideGeom.dispose(); wallMat.dispose(); }
  view.add(box(ROOM_WIDTH, 0.18, 0.18, MAT.trim, ROOM_CENTER_X, y + FLOOR_HEIGHT - 0.09, ROOM_DEPTH / 2 - 0.09, false));
  view.add(box(ROOM_WIDTH, 0.14, 0.14, MAT.trim, ROOM_CENTER_X, y + 0.07, ROOM_DEPTH / 2 - 0.07, false));

  const furnishings = new THREE.Group(); furnishings.name = 'room-furnishings'; view.add(furnishings);
  if (floor.type === 'landmark') furnishings.add(landmarkRoom(floor));
  else addFurniture(furnishings, floor, y);
  if (floor.level > 0) {
    view.add(buildStairFlight(floor.level));
  }
  if (BATCH_ROOMS) batchStaticMeshes(view, new Set(Object.values(MAT)));
  return view;
}

/** Separate parent keeps each flight attached to its floor during construction. */
export function buildStairFlight(level: number): THREE.Group {
  const flight = new THREE.Group(); flight.name = `stair-flight:${level}`;
  const start = stairLandingX(level - 1), end = stairLandingX(level);
  const base = floorY(level - 1), rise = FLOOR_HEIGHT / STAIR_STEPS;
  for (let i = 0; i < STAIR_STEPS; i++) {
    const step = box(STAIR_RUN / STAIR_STEPS + 0.02, rise, 0.8, MAT.rail,
      start + (end - start) * (i + 0.5) / STAIR_STEPS,
      base + (i + 0.5) * rise, STAIR_Z, false);
    flight.add(step);
  }
  // Connect the open-front flight to the actual room slab at each upper landing.
  flight.add(box(0.7, 0.12, 1.1, MAT.rail, end, floorY(level) - 0.06, STAIR_Z - 0.2, false));
  const rail = box(Math.hypot(STAIR_RUN, FLOOR_HEIGHT), 0.065, 0.065, MAT.rail,
    (start + end) / 2, base + FLOOR_HEIGHT / 2 + 0.75, STAIR_Z + 0.42, false);
  rail.rotation.z = Math.atan2(FLOOR_HEIGHT, end - start); flight.add(rail);
  for (const [x, y] of [[start, base], [end, floorY(level)]]) {
    flight.add(box(0.06, 0.75, 0.06, MAT.rail, x, y + 0.375, STAIR_Z + 0.42, false));
  }
  return flight;
}

function floorSign(floor: Floor): { mesh: THREE.Mesh; text: string; redraw: (text: string) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 96;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.52), material);
  mesh.name = 'floor-name-sign';
  // FloorViews supplies the mounting height/depth for the current roof,
  // architecture, entrance canopy and exploration mode.
  mesh.position.x = ROOM_CENTER_X;
  const profile = floor.type === 'landmark' ? LANDMARKS[floor.landmark ?? 'gallery'].label : floor.type !== 'residential' && floor.type !== 'lobby'
    ? BUSINESS_SUBTYPES[floor.type].find((p) => p.subtype === floor.subtype)?.label : floor.type === 'lobby' ? 'WELCOME HOME' : 'RESIDENCES';
  const redraw = (name: string) => {
    context.clearRect(0, 0, 768, 96);
    context.fillStyle = '#253d37'; context.fillRect(0, 0, 768, 96);
    context.strokeStyle = '#b99f6b'; context.lineWidth = 3; context.strokeRect(5, 5, 758, 86);
    context.fillStyle = floor.signature || floor.variant || floor.landmark ? '#f6d995' : '#f1e8d3'; context.textAlign = 'center'; context.font = 'bold 42px Georgia';
    context.fillText(`${floor.signature ? '★ ' : ''}${name}`, 384, 43, 720);
    context.fillStyle = '#bfcbbb'; context.font = '15px sans-serif';
    const special = { 'critics-choice': 'CRITIC’S CHOICE', 'founders-studio': 'FOUNDERS’ STUDIO', 'innovation-hub': 'INNOVATION HUB', 'festival-market': 'FESTIVAL FAVORITE' };
    context.fillText(`${String(floor.level).padStart(2, '0')}  /  ${floor.variant ? special[floor.variant] : (profile ?? floor.type).toUpperCase()}`, 384, 72, 720);
    texture.needsUpdate = true;
  };
  redraw(floor.name);
  return { mesh, text: `${floor.name}:${!!floor.signature}:${floor.variant ?? ''}`, redraw };
}

export function variantDecoration(floor: Floor): THREE.Group {
  const group = new THREE.Group(); const y = floorY(floor.level);
  group.name = `earned-${floor.variant}`;
  // Critic recognition belongs to the restaurant's existing furnishings and
  // occupancy-aware lights, rather than a second table blocking the open front.
  if (floor.variant === 'festival-market') {
    const bunting = new THREE.Group(); bunting.name = 'festival-bunting'; group.add(bunting);
    const point = (t: number) => new THREE.Vector3(-6.3 + t * 14.6, y + 2.82 - 0.18 * (1 - (2 * t - 1) ** 2), 1.5);
    // Supported, gently sagging cord. Keep the celebration above the people
    // and within the room, not over the open-front walking/inspection plane.
    for (let i = 0; i < 16; i++) {
      const a = point(i / 16), b = point((i + 1) / 16), delta = b.clone().sub(a);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, delta.length(), 6), MAT.dark);
      cord.position.copy(a).add(b).multiplyScalar(0.5);
      cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      cord.receiveShadow = true;
      bunting.add(cord);
    }
    for (const x of [-6.3, 8.3]) bunting.add(box(0.07, 0.12, 0.14, MAT.dark, x, y + 2.82, 1.5, false));
    // Two folded cloth triangles, duplicated on the reverse for proper normals
    // without transparent or double-sided materials or a polygon triangulator.
    const points = [[-0.21, 0, 0], [0, 0, 0.04], [0, -0.38, 0.025], [0.21, 0, 0]];
    const flagGeometry = new THREE.BufferGeometry();
    flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
      [0, 2, 1, 1, 2, 3, 1, 2, 0, 3, 2, 1].flatMap(index => points[index]), 3));
    flagGeometry.computeVertexNormals();
    for (let i = 0; i < 12; i++) {
      const flag = new THREE.Mesh(flagGeometry, [MAT.fabric, MAT.fabricAlt, MAT.paper][i % 3]);
      flag.position.copy(point((i + 0.5) / 12)); flag.receiveShadow = true; bunting.add(flag);
    }
    const award = new THREE.Group(); award.name = 'festival-rosette'; group.add(award);
    award.add(box(0.9, 1.4, 0.065, MAT.brass, 7.4, y + 1.9, -2.66, false));
    award.add(box(0.77, 1.27, 0.025, MAT.paper, 7.4, y + 1.9, -2.61, false));
    for (const side of [-1, 1]) {
      const ribbon = box(0.14, 0.58, 0.025, MAT.fabric, 7.4 + side * 0.11, y + 1.79, -2.575, false);
      ribbon.rotation.z = side * 0.2; award.add(ribbon);
    }
    for (const [radius, depth, material] of [[0.28, -2.54, MAT.brass], [0.19, -2.52, MAT.paper]] as const) {
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.025, 12), material);
      seal.rotation.x = Math.PI / 2; seal.position.set(7.4, y + 2.08, depth); seal.receiveShadow = true; award.add(seal);
    }
    for (const row of [0, 1]) award.add(box(row ? 0.3 : 0.53, 0.025, 0.015, MAT.dark, 7.4, y + 1.43 - row * 0.09, -2.583, false));
    batchStaticMeshes(group, new Set(Object.values(MAT)));
  } else if (floor.variant === 'founders-studio') {
    // Keep the first machine and early sketches as a small, warm archive.
    const archive = new THREE.Group(); archive.name = 'founders-archive'; group.add(archive);
    archive.position.set(-1.9, 0, -3.7);
    archive.add(box(3.1, 0.16, 0.85, MAT.woodDark, 5.4, y + 0.86, 2.4));
    for (const x of [4.2, 6.6]) archive.add(box(0.14, 0.8, 0.65, MAT.brass, x, y + 0.4, 2.4));
    archive.add(box(0.9, 0.65, 0.45, MAT.paper, 4.7, y + 1.27, 2.3));
    archive.add(box(0.65, 0.43, 0.03, MAT.screen, 4.7, y + 1.28, 2.54));
    archive.add(box(0.9, 0.05, 0.25, MAT.paper, 4.7, y + 0.98, 2.7));
    for (const x of [5.7, 6.35]) {
      archive.add(box(0.52, 0.67, 0.09, MAT.brass, x, y + 1.25, 2.3));
      archive.add(box(0.42, 0.55, 0.03, MAT.paper, x, y + 1.25, 2.36));
      archive.add(box(0.27, 0.04, 0.04, MAT.woodDark, x, y + 1.3, 2.39));
    }
  } else if (floor.variant === 'innovation-hub') {
    const lab = new THREE.Group(); lab.name = 'prototype-lab'; group.add(lab);
    lab.position.set(7.2, 0, -3.5);
    lab.add(box(3.4, 0.16, 1, MAT.white, -4.4, y + 0.95, 2.4));
    for (const x of [-5.8, -3]) lab.add(box(0.13, 0.9, 0.7, MAT.metal, x, y + 0.45, 2.4));
    // Three clearly different prototypes, held in an open metal display frame.
    lab.add(box(0.75, 0.1, 0.65, MAT.dark, -5.5, y + 1.08, 2.4));
    lab.add(box(0.22, 0.65, 0.22, MAT.brass, -5.5, y + 1.45, 2.4));
    lab.add(box(0.7, 0.16, 0.2, MAT.metal, -5.25, y + 1.75, 2.4));
    lab.add(box(0.6, 0.45, 0.5, MAT.green2, -4.3, y + 1.28, 2.4));
    lab.add(box(0.55, 0.07, 0.55, MAT.brass, -3.3, y + 1.12, 2.4));
    for (const x of [-3.45, -3.15]) lab.add(box(0.1, 0.4, 0.1, MAT.lamp, x, y + 1.35, 2.4));
    for (const x of [-6, -2.8]) lab.add(box(0.08, 1.35, 0.08, MAT.metal, x, y + 1.6, 2.05));
    lab.add(box(3.3, 0.1, 0.16, MAT.lamp, -4.4, y + 2.3, 2.05));
    group.add(box(2.05, 1.2, 0.08, MAT.paper, 6.8, y + 1.8, -2.44));
    for (let i = 0; i < 5; i++) group.add(box(0.25, 0.15 + i * 0.13, 0.025, MAT.green2, 6.05 + i * 0.35, y + 1.5 + i * 0.065, -2.38));
  }
  return group;
}

/** Window panes across the back wall; lobby gets glass entry doors instead. */
function addBackWallDetail(view: THREE.Group, type: FloorType, y: number, panes: THREE.MeshLambertMaterial[]): void {
  const z = BACK_Z + 0.22;
  const pane = (w: number, h: number, x: number, paneY: number) => {
    const material = MAT.window.clone();
    material.emissive.setHex([0xffd2a0, 0xffe1b5, 0xffc98f][panes.length % 3]);
    panes.push(material);
    const mesh = box(w, h, 0.06, material, x, paneY, z, false);
    mesh.name = `window-pane:${panes.length - 1}`;
    view.add(mesh);
  };
  if (type === 'lobby') {
    for (const dx of [-1.1, 1.1]) {
      pane(1.0, 2.2, ROOM_CENTER_X + dx, y + 1.15);
      view.add(box(1.12, 2.3, 0.04, MAT.windowFrame, ROOM_CENTER_X + dx, y + 1.15, z - 0.02, false));
    }
    return;
  }
  const count = 4;
  const spacing = (ROOM_WIDTH - 2.4) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = ROOM_LEFT + 1.2 + i * spacing;
    view.add(box(1.15, 1.25, 0.04, MAT.windowFrame, x, y + 1.7, z - 0.02, false));
    pane(1.0, 1.1, x, y + 1.7);
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
    asset.userData.sharedAsset = true;
    asset.position.set(ROOM_CENTER_X, y, zRow);
    view.add(asset);
    return;
  }

  const plant = (x: number, z: number, big = false) => {
    const greenery = indoorPlant(big, floor.level + x);
    greenery.position.set(x, y, z); view.add(greenery);
  };

  // A flat area rug / floor mat.
  const rug = (cx: number, cz: number, w: number, d: number, mat: THREE.Material) =>
    view.add(box(w, 0.04, d, mat, cx, y + 0.03, cz, false));

  // A flush warm ceiling light panel.
  const ceilingLamp = (cx: number, cz: number) =>
    view.add(box(0.7, 0.12, 0.7, MAT.lamp, cx, y + FLOOR_HEIGHT - 0.12, cz, false));

  // A framed picture on the back wall.
  const wallArt = (cx: number, mat: THREE.Material, w = 0.9, h = 0.7) => {
    view.add(box(w, h, 0.05, MAT.woodDark, cx, y + 1.95, BACK_Z + 0.26, false));
    view.add(box(w - 0.14, h - 0.14, 0.06, mat, cx, y + 1.95, BACK_Z + 0.28, false));
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
      view.add(homeRoom(floor));
      break;
    }
    case 'shop': {
      view.add(shopRoom(floor));
      break;
    }
    case 'restaurant': {
      view.add(restaurantRoom(floor));
      break;
    }
    case 'office': {
      view.add(officeRoom(floor));
      break;
    }
    case 'factory': {
      view.add(factoryRoom(floor));
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
