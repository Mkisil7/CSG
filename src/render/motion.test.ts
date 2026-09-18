import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { visualDelta } from './motion';
import { WeatherViews } from './weather';
import { NeighborhoodViews } from './neighborhood';
import { CharacterViews } from './characters';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { ElevatorSystem } from '../core/elevator';
import type { NeighborhoodEvent } from '../core/neighborhood';

let listeners: ((event: { matches: boolean }) => void)[];
let preference: { matches: boolean; addEventListener: (_type: string, callback: (event: { matches: boolean }) => void) => void };
beforeEach(() => {
  listeners = [];
  preference = { matches: false, addEventListener: (_type, callback) => listeners.push(callback) };
  vi.stubGlobal('window', { matchMedia: () => preference, innerHeight: 844 });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) });
});
afterEach(() => { vi.unstubAllGlobals(); });
function reduce(matches: boolean) { preference.matches = matches; listeners.forEach((listener) => listener({ matches })); }
function positions(scene: THREE.Scene, name: string) {
  return Array.from((scene.getObjectByName(name) as THREE.Points).geometry.getAttribute('position').array);
}

describe('consistent decorative motion', () => {
  it('stops for pause/hidden tabs, bounds resumed frames and rejects invalid deltas', () => {
    expect(visualDelta(0.016)).toBe(0.016);
    expect(visualDelta(60)).toBe(0.1);
    expect(visualDelta(0.016, false)).toBe(0);
    expect(visualDelta(0.016, true, false)).toBe(0);
    for (const delta of [-1, NaN, Infinity]) expect(visualDelta(delta)).toBe(0);
  });

  it.each(['rain', 'snow'] as const)('freezes %s geometry and reflections while paused, including camera movement', (kind) => {
    const town = new Town(), scene = new THREE.Scene(), view = new WeatherViews(scene, false);
    town.weather.kind = kind; town.weather.wetness = 1; town.weather.snow = kind === 'snow' ? 0.8 : 0;
    const focus = new THREE.Vector3();
    view.update(town, focus, 0.1, 0.1, false);
    const before = positions(scene, `weather-${kind}`);
    const glint = scene.getObjectByName('street-reflection:t0:0') as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const phase = glint.material.uniforms.time.value;
    focus.x = 200;
    for (let i = 0; i < 20; i++) view.update(town, focus, 0.1, visualDelta(0.016, false), false);
    expect(positions(scene, `weather-${kind}`)).toEqual(before);
    expect(glint.material.uniforms.time.value).toBe(phase);
    view.update(town, focus, 0.1, 0.1, false);
    expect(positions(scene, `weather-${kind}`)).not.toEqual(before);
  });

  it('keeps static weather cues under live reduced motion and resumes without a particle backlog', () => {
    const town = new Town(), scene = new THREE.Scene(), view = new WeatherViews(scene, true);
    town.weather.kind = 'snow'; town.weather.wetness = 1; town.weather.snow = 0.8;
    view.update(town, new THREE.Vector3(), 0.1, 0.1, false);
    const before = positions(scene, 'weather-snow'); reduce(true);
    view.update(town, new THREE.Vector3(), 0.1, 60, false);
    expect(scene.getObjectByName('weather-snow')!.visible).toBe(false);
    expect(scene.getObjectByName('weather-rain')!.visible).toBe(false);
    expect(scene.getObjectByName('street-snow:t0')!.visible).toBe(true);
    expect(scene.getObjectByName('street-reflection:t0:0')!.visible).toBe(true);
    expect(view.cloudCover).toBe(0.6);
    expect(positions(scene, 'weather-snow')).toEqual(before);
    reduce(false); view.update(town, new THREE.Vector3(), 0.1, 0.016, false);
    expect(scene.getObjectByName('weather-snow')!.visible).toBe(true);
    expect(positions(scene, 'weather-snow')).not.toEqual(before);
  });

  it('freezes concert sway and audience bob, but retains arrival locations under reduced motion', () => {
    const town = new Town(), scene = new THREE.Scene(), view = new NeighborhoodViews(scene);
    town.time = 1080; town.slots[1] = { id: 't1', zone: 'park', unlocked: true, game: null };
    const event: NeighborhoodEvent = { id: 'ne1', kind: 'band', towerId: 't1', parkIndex: 1, title: 'Concert', reason: 'A park',
      status: 'active', createdAt: 1080, startedAt: 1080, endsAt: 3960, nextVisitorAt: 1100,
      served: 0, missed: 0, arrivals: 0, reviewPublished: false, outcome: '' };
    town.neighborhood.events.push(event); town.neighborhood.bandstands.add(1);
    town.neighborhood.parkGuests.push({ id: 'pg1', eventId: 'ne1', parkIndex: 1, startedAt: 1080, arrivesAt: 1090, leavesAt: 1150, endsAt: 1160, counted: false });
    view.sync(town, 0.1);
    const musician = scene.getObjectByName('musician:1:0')!, guest = scene.getObjectByName('park-guest:pg1')!;
    const angle = musician.rotation.z, position = guest.position.clone();
    for (let i = 0; i < 10; i++) view.sync(town, visualDelta(0.016, false));
    expect(musician.rotation.z).toBe(angle); expect(guest.position.toArray()).toEqual(position.toArray());
    reduce(true); town.time += 5; view.sync(town, 0.1);
    expect(musician.rotation.z).toBe(0); expect(musician.visible).toBe(true);
    expect(guest.position.x).not.toBe(position.x); expect(guest.position.y).toBe(0.12);
    reduce(false); view.sync(town, 0.1); expect(musician.rotation.z).not.toBe(0);
  });

  it('stops a walking resident at the current pose instead of continuing to drift or settle while paused', () => {
    const town = new Town(), game = town.towers()[0], scene = new THREE.Group();
    game.tower.addFloor('residential'); const resident = createResident(1, game.id);
    resident.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 800 };
    const view = new CharacterViews(scene, game.id, { x: 0, z: 0 });
    view.sync([resident], [], 0.016, 600, 'clear', game.tower.floors);
    const person = view.pickTargets()[0];
    // Start a real walk after initialization, rather than relying on the old
    // origin-to-seat spawn drift to stand in for a journey.
    const system = new ElevatorSystem(), shafts = [{ system, shaftX: -8, waitX: -6 }];
    resident.state = { kind: 'waiting', floor: 1, to: 0 }; system.request(resident.id, 1, 0, 600);
    const seat = person.position.clone();
    view.sync([resident], shafts, 0.016, 600, 'clear', game.tower.floors);
    expect(person.position.equals(seat)).toBe(false);
    const transforms = () => { const rows: number[][] = []; person.traverse((object) => rows.push([...object.position.toArray(), ...object.rotation.toArray().slice(0, 3) as number[]])); return rows; };
    const before = transforms();
    for (let i = 0; i < 20; i++) view.sync([resident], shafts, visualDelta(0.016, false), 600, 'clear', game.tower.floors);
    expect(transforms()).toEqual(before);
    view.sync([resident], shafts, 0.016, 601, 'clear', game.tower.floors);
    expect(transforms()).not.toEqual(before);
  });
});
