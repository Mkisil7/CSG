import { describe, expect, it, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Town } from '../core/town';
import { toSaveData, townFromSaveData } from '../core/save';
import { FloorViews, variantDecoration } from './floors';
import { floorY, FLOOR_HEIGHT, ROOM_LEFT, ROOM_RIGHT } from './layout';
import { createPreviewTown } from '../dev/neighborhoodPreview';
import { encodeTown, decodeTown } from '../core/share';

afterEach(() => { vi.unstubAllGlobals(); });

describe('earned startup interiors', () => {
  it('lights the real expansion as an open business immediately, including a shared town without ticking', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    const town = createPreviewTown(), game = town.towerById('t1')!;
    const event = town.neighborhood.events.find(e => e.kind === 'startup')!;
    const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    const wall = (view: FloorViews, level: number) =>
      (view.pickTargets().find(floor => floor.userData.floorLevel === level)!.getObjectByName('room-lit-wall') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>).material;
    views.sync(game.tower.floors, game.staffedLevels);
    expect(game.staffedLevels.has(4)).toBe(false);
    const time = town.time, coins = town.economy.coins;
    expect(town.neighborhood.respond(town, event.id, { towerId: game.id, level: 4 })).toBe(true);
    views.sync(game.tower.floors, game.staffedLevels, 0);
    expect(wall(views, 4).color.equals(wall(views, 3).color)).toBe(true);
    expect(views.group.getObjectByName('prototype-lab')).toBeDefined();
    expect(views.group.getObjectByName('founders-archive')).toBeDefined();
    const shared = (await decodeTown(await encodeTown(town)))!, sharedGame = shared.towerById(game.id)!;
    const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    loaded.sync(sharedGame.tower.floors, sharedGame.staffedLevels, 0);
    expect(wall(loaded, 4).color.equals(wall(views, 4).color)).toBe(true);
    expect(shared.time).toBe(time); expect(shared.economy.coins).toBe(coins - 350);
  });

  it('distinguishes the founders archive from the working prototype lab inside the room envelope', () => {
    const game = new Town().towers()[0]; const floor = game.tower.addFloor('office', 'tech');
    for (const [variant, detail, other] of [
      ['founders-studio', 'founders-archive', 'prototype-lab'],
      ['innovation-hub', 'prototype-lab', 'founders-archive'],
    ] as const) {
      floor.variant = variant; const view = variantDecoration(floor);
      expect(view.getObjectByName(detail)).toBeDefined(); expect(view.getObjectByName(other)).toBeUndefined();
      const bounds = new THREE.Box3().setFromObject(view);
      expect(bounds.min.x).toBeGreaterThan(ROOM_LEFT); expect(bounds.max.x).toBeLessThan(ROOM_RIGHT);
      expect(bounds.min.y).toBeGreaterThanOrEqual(floorY(floor.level) - 1e-6);
      expect(bounds.max.y).toBeLessThan(floorY(floor.level) + FLOOR_HEIGHT);
      // Earned displays live behind the working/meeting planes, not in front
      // of the people whose startup story earned them.
      expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(0);
    }
  });

  it('rebuilds a converted law office once and reconstructs both earned interiors from a saved town', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    const town = new Town(), game = town.towers()[0];
    game.tower.addFloor('office', 'tech'); game.tower.addFloor('office', 'law');
    const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors);
    game.tower.floors[1].variant = 'founders-studio';
    Object.assign(game.tower.floors[2], { variant: 'innovation-hub', subtype: 'tech' });
    views.sync(game.tower.floors);
    const lab = views.group.getObjectByName('prototype-lab'); expect(lab).toBeDefined();
    views.sync(game.tower.floors); expect(views.group.getObjectByName('prototype-lab')).toBe(lab);
    const restored = townFromSaveData(toSaveData(town))!;
    const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    loaded.sync(restored.towers()[0].tower.floors);
    expect(loaded.group.getObjectByName('founders-archive')).toBeDefined();
    expect(loaded.group.getObjectByName('prototype-lab')).toBeDefined();
  });
});
