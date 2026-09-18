import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { roomWallLightMap } from './roomLight';
import { FloorViews } from './floors';
import { lightingAt } from './lighting';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { toSaveData } from '../core/save';

afterEach(() => { vi.unstubAllGlobals(); });
function setup() {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
  const town = new Town(), game = town.towers()[0];
  game.tower.addFloor('residential'); game.tower.addFloor('restaurant', 'coffee');
  const views = new FloorViews(new THREE.Group(), game.id, { x: 42, z: 20 }); views.sync(game.tower.floors);
  const resident = createResident(1, game.id); resident.nocturnal = false;
  resident.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 5000 }; game.residents.push(resident);
  const wall = (level: number) => (views.pickTargets()[level].getObjectByName('room-lit-wall') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  return { town, game, views, resident, wall };
}

describe('warm inhabited-room wall lighting', () => {
  it.each([false, true])('uses a bounded, warm native UV light map with soft pools (home=%s)', residential => {
    const map = roomWallLightMap(residential), data = map.image.data as Uint8Array;
    expect(map.image.width).toBe(64); expect(map.image.height).toBe(32); expect(data.byteLength).toBe(8192);
    expect(map.channel).toBe(0); expect(map.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(map.minFilter).toBe(THREE.LinearFilter); expect(map.magFilter).toBe(THREE.LinearFilter);
    const red = (x: number, y: number) => data[(y * 64 + x) * 4];
    const sourceY = residential ? 10 : 26;
    expect(red(16, sourceY)).toBeGreaterThan(red(0, sourceY));
    expect(red(16, sourceY)).toBeGreaterThan(red(16, residential ? 31 : 0));
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThan(data[i + 1]); expect(data[i + 1]).toBeGreaterThan(data[i + 2]); expect(data[i + 3]).toBe(255);
    }
    for (let y = 0; y < 32; y++) for (let x = 1; x < 64; x++) expect(Math.abs(red(x, y) - red(x - 1, y))).toBeLessThan(15);
    map.dispose();
  });

  it('fades through dusk on actual occupied rooms, dims sleep, and leaves the simulation unchanged', () => {
    const s = setup(), saved = toSaveData(s.town), meshCount = s.views.group.children.length;
    const materials = [s.wall(0), s.wall(1), s.wall(2)], maps = materials.map(m => m.lightMap);
    let previous = 0;
    for (let minute = 960; minute <= 1200; minute++) {
      s.views.updateLighting(lightingAt(minute).daylight, [s.resident], minute);
      const intensity = s.wall(1).lightMapIntensity;
      // One game-minute sample (six per real second at 1x); no switch-on jump.
      expect(intensity).toBeGreaterThanOrEqual(previous); expect(intensity - previous).toBeLessThan(0.04); previous = intensity;
      expect(s.wall(2).lightMapIntensity).toBe(0);
    }
    expect(previous).toBeGreaterThan(0.5); expect(s.wall(0).lightMapIntensity).toBeGreaterThan(0);
    s.views.updateLighting(0, [s.resident], 0); expect(s.wall(1).lightMapIntensity).toBeCloseTo(previous * 0.12);
    s.resident.state = { kind: 'idle', floor: 2, activity: { kind: 'eat', floor: 2 }, until: 5000 };
    const moved = JSON.stringify(s.resident); s.views.updateLighting(0, [s.resident], 1200);
    expect(s.wall(1).lightMapIntensity).toBe(0); expect(s.wall(2).lightMapIntensity).toBeGreaterThan(0.5);
    expect(JSON.stringify(s.resident)).toBe(moved);
    s.views.updateLighting(1, [s.resident], 720); materials.forEach(m => expect(m.lightMapIntensity).toBe(0));
    materials.forEach((m, i) => expect(m.lightMap).toBe(maps[i]));
    expect(s.views.group.children.length).toBe(meshCount);
    let extraLights = 0; s.views.group.traverse(o => { if (o instanceof THREE.Light) extraLights++; }); expect(extraLights).toBe(0);
    s.resident.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 5000 };
    expect({ ...toSaveData(s.town), savedAtWallClock: saved.savedAtWallClock }).toEqual(saved);
  });

  it('keeps a night owl’s room warm after other households sleep', () => {
    const s = setup(); s.resident.nocturnal = true;
    s.views.updateLighting(0, [s.resident], 1380); const awake = s.wall(1).lightMapIntensity;
    s.resident.nocturnal = false; s.views.updateLighting(0, [s.resident], 1380);
    expect(awake).toBeGreaterThan(s.wall(1).lightMapIntensity * 5);
  });

  it('disposes owned textures once on subtype/shaft rebuilds and restores lighting on new walls', () => {
    const s = setup(), original = s.wall(2), disposed = vi.fn(); original.lightMap!.addEventListener('dispose', disposed);
    s.game.tower.floors[2].variant = 'critics-choice'; s.views.sync(s.game.tower.floors); s.views.sync(s.game.tower.floors);
    expect(disposed).toHaveBeenCalledOnce(); expect(s.wall(2).lightMap).not.toBe(original.lightMap);
    const maps = [s.wall(0), s.wall(1), s.wall(2)].map(m => m.lightMap!); const replaced = vi.fn();
    maps.forEach(map => map.addEventListener('dispose', replaced));
    s.views.setSecondShaft(true); s.views.setSecondShaft(true); expect(replaced).toHaveBeenCalledTimes(3);
    s.views.sync(s.game.tower.floors); s.views.updateLighting(0, [s.resident], 1200);
    expect(s.wall(1).lightMapIntensity).toBeGreaterThan(0.5); expect(s.wall(1).lightMap).not.toBe(maps[1]);
  });
});
