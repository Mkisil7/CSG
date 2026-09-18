import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { landmarkRoom, LandmarkRoom } from './landmarks';
import { LANDMARK_KINDS } from '../core/landmarks';
import { Town } from '../core/town';
import { FloorViews } from './floors';
import { CharacterViews } from './characters';
import { createResident } from '../core/residents';

describe('landmark scenes', () => {
  it.each(LANDMARK_KINDS)('%s practical lighting follows daylight and actual occupancy without animation or extra lights', (kind) => {
    const floor = new Town().towers()[0].tower.addFloor('landmark'); floor.landmark = kind;
    const scene = landmarkRoom(floor);
    const materials = new Set<THREE.MeshStandardMaterial>();
    scene.traverse((o) => {
      expect(o instanceof THREE.Light).toBe(false);
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material.emissive.getHex() !== 0) materials.add(o.material);
    });
    const values = () => [...materials].map((m) => m.emissiveIntensity);
    scene.updateLighting(1, true); expect(values().every((v) => v === 0)).toBe(true);
    scene.updateLighting(0.45, true); const dusk = values();
    scene.updateLighting(0, true); const night = values();
    expect(Math.max(...night)).toBe(kind === 'observatory' ? 0.7 : 1.15);
    expect(night.some((v, i) => v > dusk[i])).toBe(true);
    scene.updateLighting(0, false); expect(values()).toEqual(night.map((v) => v * 0.22));
    scene.updateLighting(0, true); expect(values()).toEqual(night);
    scene.updateLighting(0, true); expect(values()).toEqual(night); // no elapsed-time drift while paused
    const other = landmarkRoom(floor); other.updateLighting(1, false);
    expect(values()).toEqual(night); // no cross-tower shared material mutations
    scene.updateLighting(Number.NaN, true); expect(values().every((v) => v === 0)).toBe(true);
  });

  it('routes real floor occupancy to landmark lighting and releases accent materials on rebuild', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    try {
      const game = new Town().towers()[0], floor = game.tower.addFloor('landmark'); floor.landmark = 'gallery';
      const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); views.sync(game.tower.floors);
      const room = views.pickTargets()[1].getObjectByName('landmark:gallery') as LandmarkRoom;
      const update = vi.spyOn(room, 'updateLighting'), resident = createResident(0, game.id);
      resident.state = { kind: 'waiting', floor: 1, to: 0 };
      views.updateLighting(0, [resident], 1200); expect(update).toHaveBeenLastCalledWith(0, false);
      resident.state = { kind: 'idle', floor: 1, activity: { kind: 'leisure', floor: 1 }, until: 1250 };
      views.updateLighting(0, [resident], 1200); expect(update).toHaveBeenLastCalledWith(0, true);
      const materials = new Set<THREE.Material>();
      room.traverse((o) => { if (o instanceof THREE.Mesh && !Array.isArray(o.material)) materials.add(o.material); });
      const disposed = vi.fn(); materials.forEach((m) => m.addEventListener('dispose', disposed));
      views.setSecondShaft(true); expect(disposed).toHaveBeenCalledTimes(materials.size);
      update.mockClear(); views.sync(game.tower.floors); views.updateLighting(0, [resident], 1200);
      expect(update).not.toHaveBeenCalled();
      expect(views.pickTargets()[1].getObjectByName('landmark:gallery')).toBeInstanceOf(LandmarkRoom);
    } finally { vi.unstubAllGlobals(); }
  });

  it('gives each floor a distinct bounded scene with no invented resident actors or per-room lights', () => {
    const town = new Town(), floor = town.towers()[0].tower.addFloor('landmark');
    const counts: number[] = [];
    for (const kind of LANDMARK_KINDS) {
      floor.landmark = kind;
      const scene = landmarkRoom(floor), box = new THREE.Box3().setFromObject(scene);
      expect(box.min.y).toBeGreaterThanOrEqual(2.9); expect(box.max.y).toBeLessThan(6);
      expect(box.min.x).toBeGreaterThanOrEqual(-6.5); expect(box.max.x).toBeLessThanOrEqual(8.5);
      let meshes = 0;
      scene.traverse((o) => { expect(o instanceof THREE.Light).toBe(false); expect(o.userData.residentId).toBeUndefined(); if (o instanceof THREE.Mesh) meshes++; });
      counts.push(meshes); expect(meshes).toBeLessThan(110);
      if (kind === 'observatory') expect(scene.getObjectByName('landmark-telescope')).toBeDefined();
      if (kind === 'gallery') expect(scene.getObjectByName('landmark-sculpture')).toBeDefined();
    }
    expect(new Set(counts).size).toBe(3);
  });

  it('releases landmark geometry on a shaft rebuild and retains the correct pickable floor', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    try {
      const game = new Town().towers()[0], floor = game.tower.addFloor('landmark'); floor.landmark = 'gallery';
      const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); views.sync(game.tower.floors);
      const oldFloor = views.pickTargets()[1], scene = oldFloor.getObjectByName('landmark:gallery')!;
      expect(oldFloor.userData).toMatchObject({ pickable: 'floor', floorLevel: 1 });
      const meshes: THREE.Mesh[] = []; scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
      const disposed = vi.fn(); for (const mesh of meshes) mesh.geometry.addEventListener('dispose', disposed);
      views.setSecondShaft(true); expect(disposed).toHaveBeenCalledTimes(meshes.length);
      views.sync(game.tower.floors); expect(views.pickTargets()[1].getObjectByName('landmark:gallery')).not.toBe(scene);
    } finally { vi.unstubAllGlobals(); }
  });

  it('clears the telescope leaning pose when a resident leaves for the lift', () => {
    const game = new Town().towers()[0], floor = game.tower.addFloor('landmark'); floor.landmark = 'observatory';
    const r = createResident(0, game.id); r.state = { kind: 'idle', floor: 1, activity: { kind: 'leisure', floor: 1 }, until: 1300 };
    const views = new CharacterViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    for (let i = 0; i < 30; i++) views.sync([r], [], 0.1, 1100 + i, 'clear', game.tower.floors);
    const actor = views.pickTargets()[0]; let leaning = false;
    actor.traverse((o) => { if (o.rotation.x === 0.12) leaning = true; }); expect(leaning).toBe(true);
    r.state = { kind: 'waiting', floor: 1, to: 0 }; views.sync([r], [], 0.1, 1140, 'clear', game.tower.floors);
    leaning = false; actor.traverse((o) => { if (o.rotation.x === 0.12) leaning = true; }); expect(leaning).toBe(false);
  });
});
