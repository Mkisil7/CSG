import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { lightingAt, windowLight } from './lighting';
import { Sky } from './sky';
import { updateDaylight, type SceneContext } from './scene';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { createResident } from '../core/residents';

describe('solar lighting', () => {
  it('makes sunset, blue hour and night distinct instead of retaining daytime brightness', () => {
    expect(lightingAt(720).daylight).toBe(1);
    expect(lightingAt(1080).daylight).toBeGreaterThan(0.25);
    expect(lightingAt(1080).daylight).toBeLessThan(0.5);
    expect(lightingAt(1080).twilight).toBe(1);
    expect(lightingAt(1020).golden).toBeGreaterThan(0.8);
    expect(lightingAt(1140).daylight).toBe(0);
    expect(lightingAt(1260).stars).toBe(1);
    expect(lightingAt(720).stars).toBe(0);
  });

  it('wraps through midnight and bounds every daylight/weather scalar', () => {
    expect(lightingAt(-60)).toEqual(lightingAt(1380));
    expect(lightingAt(2880)).toEqual(lightingAt(0));
    for (const cloud of [-2, 0, 0.6, 1, 4, NaN]) {
      for (let minute = 0; minute <= 1440; minute++) {
        const light = lightingAt(minute, cloud);
        for (const key of ['daylight', 'twilight', 'golden', 'stars', 'cloud'] as const) {
          expect(light[key]).toBeGreaterThanOrEqual(0); expect(light[key]).toBeLessThanOrEqual(1);
        }
        expect(Number.isFinite(light.keyIntensity)).toBe(true);
      }
    }
    expect(lightingAt(NaN).daylight).toBe(1);
  });

  it('changes smoothly through dawn, dusk, and the solar/moonlight handover', () => {
    for (let minute = 0; minute < 1440; minute++) {
      const before = lightingAt(minute), after = lightingAt(minute + 1);
      for (const key of ['daylight', 'twilight', 'stars', 'keyIntensity', 'ambientIntensity'] as const) {
        expect(Math.abs(after[key] - before[key])).toBeLessThan(0.045);
      }
    }
  });

  it('attenuates direct light and stars under cloud without extinguishing readable interiors', () => {
    expect(lightingAt(720, 1).keyIntensity).toBeLessThan(lightingAt(720).keyIntensity * 0.3);
    expect(lightingAt(1260, 1).stars).toBe(0);
    expect(lightingAt(1260, 1).ambientIntensity).toBeGreaterThan(0.5);
    expect(lightingAt(1260, 1).fillIntensity).toBeGreaterThan(0.5);
  });

  it('adds twilight skylight without brightening midday or full night', () => {
    expect(lightingAt(720).ambientIntensity).toBe(1);
    expect(lightingAt(0).ambientIntensity).toBe(0.65);
    const dusk = lightingAt(1080), dawn = lightingAt(360);
    expect(dusk.ambientIntensity).toBeCloseTo(0.65 + dusk.daylight * 0.35 + 0.16);
    expect(dawn.ambientIntensity).toBeCloseTo(dusk.ambientIntensity);
    expect(lightingAt(1080, 1).ambientIntensity).toBeLessThan(dusk.ambientIntensity);
  });

  it('uses exactly the sky horizon for fog and preserves the focused tower while moving the key', () => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(); scene.fog = new THREE.Fog(0, 190, 460);
    const sky = new Sky(scene), sun = new THREE.DirectionalLight(); sun.target.position.x = 180;
    const ctx = { scene, sky, sun, ambient: new THREE.HemisphereLight(), fill: new THREE.DirectionalLight(), camera: new THREE.PerspectiveCamera() } as SceneContext;
    ctx.camera.position.set(180, 30, 60);
    updateDaylight(ctx, 540); const morningX = sun.position.x;
    updateDaylight(ctx, 1020);
    expect(sun.position.x).toBeLessThan(morningX);
    expect(sun.target.position.x).toBe(180);
    expect(ctx.fill.target.position.x).toBe(180);
    expect(scene.fog.color.equals(sky.horizonColor)).toBe(true);
    expect((scene.background as THREE.Color).equals(sky.horizonColor)).toBe(true);
    expect(sky.group.position.equals(ctx.camera.position)).toBe(true);
    updateDaylight(ctx, 1260, 0.85);
    expect(scene.fog.color.equals(sky.horizonColor)).toBe(true);
    expect(sun.position.y).toBeGreaterThan(8);
  });
});

describe('inhabited window lights', () => {
  it('staggers switch-on, dims empty rooms and keeps nighttime emission below bloom clipping', () => {
    expect(windowLight(0.5, 0, true, false, 1080)).not.toBe(windowLight(0.5, 6, true, false, 1080));
    for (let phase = 0; phase < 20; phase++) {
      expect(windowLight(0, phase, false, false, 1260)).toBe(0);
      expect(windowLight(1, phase, true, false, 720)).toBe(0);
      expect(windowLight(0, phase, true, false, 1260)).toBeLessThanOrEqual(0.8);
      expect(windowLight(0, phase, true, true, 0)).toBeLessThan(windowLight(0, phase, true, true, 1260));
    }
  });

  it('updates actual room panes from occupants and releases their unique materials on rebuild', () => {
    const context = { clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
    try {
      const town = new Town(), game = town.towers()[0];
      game.tower.addFloor('residential'); game.tower.addFloor('restaurant', 'coffee');
      const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
      views.sync(game.tower.floors, new Set([2]));
      const pane = (level: number) => (views.pickTargets()[level].getObjectByName('window-pane:0') as THREE.Mesh).material as THREE.MeshLambertMaterial;
      const resident = createResident(1, game.id);
      resident.state = { kind: 'idle', floor: 1, activity: { kind: 'home', floor: 1 }, until: 1400 };
      views.updateLighting(0, [resident], 1260);
      expect(pane(0).emissiveIntensity).toBeGreaterThan(0);
      expect(pane(1).emissiveIntensity).toBeGreaterThan(0);
      expect(pane(2).emissiveIntensity).toBe(0);
      resident.state = { kind: 'idle', floor: 2, activity: { kind: 'eat', floor: 2 }, until: 1400 };
      views.updateLighting(0, [resident], 1260);
      expect(pane(1).emissiveIntensity).toBe(0);
      expect(pane(2).emissiveIntensity).toBeGreaterThan(0);
      const old = pane(2), dispose = vi.fn(); old.addEventListener('dispose', dispose);
      views.setSecondShaft(true); expect(dispose).toHaveBeenCalledOnce();
      views.sync(game.tower.floors, new Set([2])); views.updateLighting(0, [resident], 1260);
      expect(pane(2)).not.toBe(old); expect(pane(2).emissiveIntensity).toBeGreaterThan(0);
      const replacement = pane(2), disposeReplacement = vi.fn(); replacement.addEventListener('dispose', disposeReplacement);
      game.tower.floors[2].subtype = 'fine-dining'; views.sync(game.tower.floors, new Set([2]));
      expect(disposeReplacement).toHaveBeenCalledOnce();
      views.updateLighting(0, [], 1260); expect(pane(2).emissiveIntensity).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});
