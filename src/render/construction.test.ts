import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { OPENING_DURATION, openingDelta, openingFrame } from './construction';
import { CharacterViews } from './characters';
import { RoomLifeViews } from './roomLife';
import { QueueViews } from './queueViews';
import { createResident } from '../core/residents';
import { residentPet } from '../core/roomLife';
import { ElevatorViews } from './elevatorView';

const preference = { matches: false };
beforeEach(() => {
  preference.matches = false;
  vi.stubGlobal('window', { matchMedia: () => preference });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function setup() {
  const game = new Town().towers()[0]; game.tower.addFloor('residential');
  const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
  views.setAppearance('heritage', new Set(['roof-garden']), 'Opening House');
  expect(views.sync(game.tower.floors)).toEqual([]);
  return { game, views };
}

describe('coordinated new-floor openings', () => {
  it('allows a development-only full reveal while leaving the actual system preference untouched', () => {
    vi.stubEnv('DEV', true); preference.matches = true;
    const { game, views } = setup(); game.tower.addFloor('restaurant', 'coffee');
    views.sync(game.tower.floors, undefined, 0.1, false);
    expect(preference.matches).toBe(true); expect(views.isFloorReady(2)).toBe(false);
    const scale = views.pickTargets()[2].scale.y;
    expect(scale).toBeGreaterThan(0.04); expect(scale).toBeLessThan(1);
    views.sync(game.tower.floors, undefined, 0, false);
    expect(views.pickTargets()[2].scale.y).toBe(scale);
    // Returning to the real reduced preference completes silently, without replay.
    expect(views.sync(game.tower.floors, undefined, 0)).toEqual([]);
    expect(views.isFloorReady(2)).toBe(true);
    expect(views.sync(game.tower.floors, undefined, 0.1, false)).toEqual([]);
  });
  it.each([false, true])('ignores development overrides in production (system reduced=%s)', (reduced) => {
    vi.stubEnv('DEV', false); preference.matches = reduced;
    const { game, views } = setup(); game.tower.addFloor('residential');
    views.sync(game.tower.floors, undefined, 0.1, !reduced);
    expect(views.isFloorReady(2)).toBe(reduced);
    expect(views.pickTargets()[2].scale.y === 1).toBe(reduced);
  });
  it.each([false, true])('hands real actors and room details over only when their room is ready (reduced=%s)', (reduced) => {
    preference.matches = reduced;
    const { game, views } = setup(), scene = new THREE.Group();
    game.tower.addFloor('restaurant', 'coffee'); game.tower.addFloor('residential');
    const worker = createResident(1, game.id), waiter = createResident(1, game.id);
    worker.jobFloor = 2; worker.jobTowerId = game.id;
    worker.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: 1000 };
    waiter.state = { kind: 'waiting', floor: 2, to: 0 };
    let owner = createResident(3, game.id);
    for (let i = 0; i < 10 && !residentPet(owner); i++) owner = createResident(3, game.id);
    expect(residentPet(owner)).not.toBeNull();
    owner.state = { kind: 'idle', floor: 3, activity: { kind: 'home', floor: 3 }, until: 1000 };
    const downstairs = createResident(1, game.id);
    downstairs.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 1000 };
    const residents = [worker, waiter, owner, downstairs];
    game.residents.push(...residents); game.elevator.request(waiter.id, 2, 0, 590);
    const before = JSON.stringify(residents), coins = game.economy.coins;
    const characters = new CharacterViews(scene, game.id, { x: 0, z: 0 });
    const details = new RoomLifeViews(scene, game.id, { x: 0, z: 0 });
    const queues = new QueueViews(scene, { x: 0, z: 0 });
    const sync = () => {
      characters.sync(residents, [], 0.1, 600, 'clear', game.tower.floors, views.isFloorReady);
      details.sync(game.tower.floors, residents, [owner], 600, 0.1, views.isFloorReady);
      queues.sync(game, 600, views.isFloorReady);
    };
    views.sync(game.tower.floors, undefined, 0.1); sync();
    expect(views.isFloorReady(1)).toBe(true); expect(views.isFloorReady(2)).toBe(reduced);
    expect(characters.pickTargets().map((target) => target.userData.residentId)).toEqual(reduced ? residents.map((r) => r.id) : [downstairs.id]);
    expect(details.pickTargets()).toHaveLength(reduced ? 1 : 0);
    expect(scene.getObjectByName('room-steam:2')!.visible).toBe(false);
    const sprites: THREE.Sprite[] = []; scene.traverse((object) => { if (object instanceof THREE.Sprite) sprites.push(object); });
    expect(sprites[0].visible).toBe(reduced);
    // Paused construction cannot leak upper-floor actors or clickable pets.
    for (let i = 0; i < 5; i++) { views.sync(game.tower.floors, undefined, 0); sync(); }
    expect(views.isFloorReady(2)).toBe(reduced);
    for (let i = 0; i < 25; i++) views.sync(game.tower.floors, undefined, 0.1);
    sync();
    expect(characters.pickTargets()).toHaveLength(4); expect(details.pickTargets()).toHaveLength(1);
    expect(scene.getObjectByName('room-steam:2')!.visible).toBe(!reduced);
    expect(sprites[0].visible).toBe(true);
    expect(JSON.stringify(residents)).toBe(before); expect(game.economy.coins).toBe(coins);
  });
  it('keeps in-flight cabs and stair users inside finished floors without changing their journeys', () => {
    const { game, views } = setup(); game.tower.addFloor('shop');
    views.sync(game.tower.floors, undefined, 0.1);
    const rider = createResident(1, game.id), stairs = createResident(1, game.id);
    rider.state = { kind: 'riding', to: 2 };
    stairs.state = { kind: 'stairs', from: 1, to: 2, startedAt: 590, until: 610 };
    const car = game.elevator.cars[0]; car.pos = 1.5; car.state = 'moving'; car.target = 2;
    car.riders.push({ residentId: rider.id, from: 1, to: 2, enqueuedAt: 580 });
    const before = JSON.stringify([rider, stairs, car]);
    const scene = new THREE.Group(), cabScene = new THREE.Group();
    const characters = new CharacterViews(scene, game.id, { x: 0, z: 0 });
    const cabs = new ElevatorViews(cabScene, -8.2, { x: 0, z: 0 });
    const sync = () => {
      characters.sync([rider, stairs], [{ system: game.elevator, shaftX: -8.2, waitX: -5.6 }], 0.1, 600, 'clear', game.tower.floors, views.isFloorReady);
      cabs.sync(game.elevator, views.isFloorReady);
    };
    sync(); expect(characters.pickTargets()).toHaveLength(0);
    expect(cabScene.children[0].children[0].visible).toBe(false);
    for (let i = 0; i < 25; i++) views.sync(game.tower.floors, undefined, 0.1);
    sync(); expect(characters.pickTargets()).toHaveLength(2);
    expect(cabScene.children[0].children[0].visible).toBe(true);
    expect(JSON.stringify([rider, stairs, car])).toBe(before);
  });
  it('stages structure, furnishings and sign without background catch-up or nonfinite transforms', () => {
    expect(openingFrame(0)).toMatchObject({ scale: 0.04, furnishings: false, sign: 0, complete: false });
    expect(openingFrame(0.8)).toMatchObject({ furnishings: true, sign: 0 });
    expect(openingFrame(1.7).sign).toBeGreaterThan(0);
    expect(openingFrame(OPENING_DURATION)).toMatchObject({ scale: 1, furnishings: true, sign: 1, complete: true });
    expect(openingDelta(1000)).toBe(0.1);
    for (const dt of [-1, NaN, Infinity]) expect(openingDelta(dt)).toBe(0);
  });

  it('raises the facade, shaft, roof and room together and announces the lit sign exactly once', () => {
    const { game, views } = setup(), floor = game.tower.addFloor('restaurant', 'coffee');
    views.sync(game.tower.floors, undefined, 0);
    const room = views.pickTargets()[2], facade = views.group.getObjectByName('facade-level:2')!;
    const roof = views.group.getObjectByName('tower-roof')!, cornice = views.group.getObjectByName('facade-cornice')!;
    const sign = room.getObjectByName('floor-name-sign') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(room.scale.y).toBe(0.04); expect(facade.scale.y).toBe(room.scale.y);
    expect(facade.position.y).toBe(room.position.y); expect(roof.position.y).toBeCloseTo(-2.88);
    expect(cornice.position.y).toBe(roof.position.y);
    expect(views.group.getObjectByName('tower-shaft')!.scale.y).toBeCloseTo(1 - 2.88 / 9);
    expect(room.getObjectByName('room-furnishings')!.visible).toBe(false); expect(sign.material.opacity).toBe(0);
    const openings = [];
    for (let step = 0; step < 30; step++) openings.push(...views.sync(game.tower.floors, undefined, 0.1));
    expect(openings).toEqual([floor]); expect(room.scale.y).toBe(1); expect(room.position.y).toBe(0);
    expect(roof.position.y).toBeCloseTo(0); expect(cornice.position.y).toBeCloseTo(0); expect(sign.material.opacity).toBe(1);
    expect(sign.material.color.r).toBe(1); expect(room.getObjectByName('room-furnishings')!.visible).toBe(true);
    const signTop = new THREE.Box3().setFromObject(sign).max.y;
    expect(signTop).toBeLessThan(9 - 0.28); // below the lowest cornice dentil
    expect(room.userData).toMatchObject({ pickable: 'floor', floorLevel: 2 });
  });

  it('freezes all reveal transforms and sign state while paused, then continues at normal real-time pace', () => {
    const { game, views } = setup(); game.tower.addFloor('shop', 'boutique');
    views.sync(game.tower.floors, undefined, 0.1);
    const room = views.pickTargets()[2], roof = views.group.getObjectByName('tower-roof')!;
    const before = [room.scale.y, room.position.y, roof.position.y];
    for (let i = 0; i < 100; i++) expect(views.sync(game.tower.floors, undefined, 0)).toEqual([]);
    expect([room.scale.y, room.position.y, roof.position.y]).toEqual(before);
    views.sync(game.tower.floors, undefined, 0.1); expect(room.scale.y).toBeGreaterThan(before[0]);
  });

  it('stacks rapid additions without a floating roof or replaying older floors', () => {
    const { game, views } = setup();
    const a = game.tower.addFloor('shop', 'grocery'), b = game.tower.addFloor('office', 'tech');
    views.sync(game.tower.floors, undefined, 0);
    const lower = views.pickTargets()[2], upper = views.pickTargets()[3];
    const lowerTop = 9 * lower.scale.y + lower.position.y;
    const upperBase = 9 * upper.scale.y + upper.position.y;
    expect(upperBase).toBeCloseTo(lowerTop);
    expect(views.group.getObjectByName('tower-roof')!.position.y).toBeCloseTo(-5.76);
    const openings = [];
    for (let i = 0; i < 30; i++) openings.push(...views.sync(game.tower.floors, undefined, 0.1));
    expect(openings).toEqual([a, b]); expect(views.pickTargets()[1].scale.y).toBe(1);
  });

  it('snaps active reveals to completion on a live reduced-motion change, even while paused', () => {
    const { game, views } = setup(); game.tower.addFloor('restaurant', 'fine-dining');
    views.sync(game.tower.floors, undefined, 0.1); preference.matches = true;
    expect(views.sync(game.tower.floors, undefined, 0)).toEqual([]);
    expect(views.pickTargets()[2].scale.y).toBe(1); expect(views.group.getObjectByName('tower-roof')!.position.y).toBeCloseTo(0);
    preference.matches = false; expect(views.sync(game.tower.floors, undefined, 0.1)).toEqual([]);
    preference.matches = true; const floor = game.tower.addFloor('residential');
    expect(views.sync(game.tower.floors, undefined, 0.1)).toEqual([floor]);
    expect(views.pickTargets()[3].scale.y).toBe(1);
  });

  it('keeps style swaps in phase and makes shaft/subtype rebuilds final without historical opening cues', () => {
    const { game, views } = setup(); game.tower.addFloor('restaurant', 'coffee');
    views.sync(game.tower.floors, undefined, 0.1);
    const scale = views.pickTargets()[2].scale.y;
    views.setAppearance('garden', new Set(['roof-garden']), 'Opening House');
    views.sync(game.tower.floors, undefined, 0);
    expect(views.group.getObjectByName('facade-level:2')!.scale.y).toBe(scale);
    views.setSecondShaft(true); expect(views.sync(game.tower.floors, undefined, 0)).toEqual([]);
    expect(views.pickTargets()[2].scale.y).toBe(1); expect(views.group.getObjectByName('tower-roof')!.position.y).toBeCloseTo(0);
    game.tower.floors[2].subtype = 'bar'; expect(views.sync(game.tower.floors, undefined, 0.1)).toEqual([]);
    expect(views.pickTargets()[2].scale.y).toBe(1);
    const loaded = new FloorViews(new THREE.Group(), 'saved', { x: 0, z: 0 });
    expect(loaded.sync(game.tower.floors, undefined, 0.1)).toEqual([]);
    expect(loaded.pickTargets().every((floor) => floor.scale.y === 1)).toBe(true);
  });
});
