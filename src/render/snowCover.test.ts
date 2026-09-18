import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SnowCover, boxSnowSurfaces } from './snowCover';
import { FloorViews } from './floors';
import { LandscapeView } from './landscape';
import { Town } from '../core/town';

const preference = { matches: false };
beforeEach(() => {
  preference.matches = false;
  vi.stubGlobal('window', { matchMedia: () => preference });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('settled winter snow', () => {
  it('grows upward from actual surface tops, thaws, clamps invalid input and reuses one geometry', () => {
    const cover = new SnowCover([{ x: 4, y: 3, z: 2, width: 2, depth: 1 }], 'snow');
    const geometry = cover.geometry, material = cover.material;
    expect(cover.visible).toBe(false);
    cover.setAmount(0.1); const dusting = cover.boundingBox!.clone();
    expect(dusting.min.y).toBeCloseTo(3.003); expect(dusting.max.x - dusting.min.x).toBeLessThan(2);
    cover.setAmount(1); const deep = cover.boundingBox!;
    expect(deep.min.y).toBeCloseTo(dusting.min.y);
    expect(deep.max.y).toBeGreaterThan(dusting.max.y);
    expect(deep.getSize(new THREE.Vector3()).x).toBeCloseTo(2);
    expect(deep.getSize(new THREE.Vector3()).z).toBeCloseTo(1);
    const version = cover.instanceMatrix.version; cover.setAmount(1); expect(cover.instanceMatrix.version).toBe(version);
    cover.setAmount(2); expect(cover.instanceMatrix.version).toBe(version);
    for (const amount of [0, -1, NaN, Infinity]) { cover.setAmount(amount); expect(cover.visible).toBe(false); }
    cover.setAmount(0.8); expect(cover.visible).toBe(true);
    expect(cover.geometry).toBe(geometry); expect(cover.material).toBe(material); expect(material.transparent).toBe(false);
  });

  it('derives nested box tops in roof-local space without leaking tower offsets into snow placement', () => {
    const parent = new THREE.Group(), roof = new THREE.Group(), nested = new THREE.Group();
    parent.position.set(68, 0, 0); roof.position.y = -2.5; nested.position.set(1, 12, 0);
    parent.add(roof); roof.add(nested);
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 3)); box.position.y = 0.25; nested.add(box);
    nested.add(new THREE.Mesh(new THREE.ConeGeometry(1, 2, 8)));
    expect(boxSnowSurfaces(roof)).toEqual([{ x: 1, y: 12.5, z: 0, width: 4, depth: 3 }]);
  });

  it('keeps roof snow attached through construction, pause, reduced motion and style/shaft rebuilds', () => {
    const town = new Town(), game = town.towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 68, z: 0 });
    game.tower.addFloor('residential'); views.setAppearance('heritage', new Set(['canopy', 'roof-garden']), 'Winter');
    views.sync(game.tower.floors); views.updateSnow(0.8);
    const old = views.group.getObjectByName('roof-snow') as SnowCover;
    const disposed = vi.fn(); old.addEventListener('dispose', disposed); old.geometry.addEventListener('dispose', disposed); old.material.addEventListener('dispose', disposed);
    game.tower.addFloor('residential'); views.sync(game.tower.floors, undefined, 0);
    const cap = views.group.getObjectByName('roof-snow') as SnowCover, roof = views.group.getObjectByName('tower-roof')!;
    expect(disposed).toHaveBeenCalledTimes(3); expect(cap.parent).toBe(roof); expect(cap.visible).toBe(true);
    expect(roof.position.y).toBeCloseTo(-2.88);
    views.group.updateMatrixWorld(true);
    const before = new THREE.Box3().setFromObject(cap);
    views.sync(game.tower.floors, undefined, 0); views.updateSnow(0.8);
    expect(new THREE.Box3().setFromObject(cap).equals(before)).toBe(true);
    preference.matches = true; views.sync(game.tower.floors, undefined, 0);
    views.group.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromObject(cap); expect(after.min.y - before.min.y).toBeCloseTo(2.88);
    for (const style of ['modern', 'garden'] as const) {
      views.setAppearance(style, new Set(['canopy']), 'Winter'); views.sync(game.tower.floors);
      expect(views.group.getObjectByName('roof-snow')!.visible).toBe(true);
      expect(views.group.getObjectByName('canopy-snow')!.visible).toBe(true);
    }
    views.setSecondShaft(true); views.sync(game.tower.floors); expect(views.group.getObjectByName('roof-snow')!.visible).toBe(true);
    views.updateSnow(0); expect(views.group.getObjectByName('roof-snow')!.visible).toBe(false);
    expect(views.group.getObjectByName('canopy-snow')!.visible).toBe(false);
  });

  it('places bounded snow caps on benches and lamps outside pedestrian routes with no simulation writes', () => {
    const town = new Town(), view = new LandscapeView(new THREE.Scene());
    town.weather.snow = 0.8; const snapshot = town.weather.snapshot(); view.update(town, 1);
    const caps = view.group.getObjectByName('street-furniture-snow') as SnowCover;
    expect(caps.count).toBe(3); expect(caps.visible).toBe(true);
    expect(caps.boundingBox!.min.z).toBeGreaterThan(10.5);
    expect(town.weather.snapshot()).toEqual(snapshot);
    town.weather.snow = 0; view.update(town, 1); expect(caps.visible).toBe(false);
    view.dispose();
  });
});
