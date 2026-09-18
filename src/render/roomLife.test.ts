import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RoomLifeViews } from './roomLife';
import { CharacterViews } from './characters';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { residentAppearance, residentPet } from '../core/roomLife';
import { residentPortrait } from '../ui/storyViews';

describe('room life rendering lifecycle', () => {
  it('uses the same resident colors in the portrait and the procedural character', () => {
    const resident = createResident(1, 't0'), scene = new THREE.Group();
    const view = new CharacterViews(scene, 't0', { x: 0, z: 0 });
    view.sync([resident], [], 0, 600);
    const colors = new Set<number>();
    view.pickTargets()[0].traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) colors.add(object.material.color.getHex());
    });
    const appearance = residentAppearance(resident), portrait = residentPortrait(resident);
    for (const color of Object.values(appearance)) expect(colors.has(color)).toBe(true);
    for (const color of [appearance.skin, appearance.hair, appearance.shirt]) expect(portrait).toContain(`#${color.toString(16).padStart(6, '0')}`);
  });

  it('keeps a cat at home while its owner commutes and releases it when the household leaves', () => {
    const town = new Town(), g = town.towers()[0], scene = new THREE.Group();
    g.tower.addFloor('residential');
    let owner = createResident(1, g.id);
    for (let i = 0; i < 10 && !residentPet(owner); i++) owner = createResident(1, g.id);
    expect(residentPet(owner)).not.toBeNull();
    owner.state = { kind: 'commuting', toTowerId: 't1', until: 700, startedAt: 600 };
    const view = new RoomLifeViews(scene, g.id, { x: 0, z: 0 });
    view.sync(g.tower.floors, [], [owner], 605, 0.1);
    const cat = view.pickTargets()[0]; expect(cat.userData.residentId).toBe(owner.id);
    let disposed = 0;
    cat.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.addEventListener('dispose', () => disposed++); });
    view.sync(g.tower.floors, [], [], 606, 0.1);
    expect(view.pickTargets()).toHaveLength(0); expect(disposed).toBeGreaterThan(0);
  });

  it('reuses the real character for cooking and clears its accessories when the shift ends', () => {
    const town = new Town(), g = town.towers()[0], scene = new THREE.Group();
    g.tower.addFloor('restaurant', 'fine-dining');
    const worker = createResident(0, g.id); worker.jobTowerId = g.id; worker.jobFloor = 1;
    worker.state = { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 1000 };
    const view = new CharacterViews(scene, g.id, { x: 0, z: 0 });
    for (let i = 0; i < 30; i++) view.sync([worker], [], 0.1, 600 + i, 'clear', g.tower.floors);
    expect(view.pickTargets()).toHaveLength(1);
    const actor = view.pickTargets()[0]; expect(actor.position.x).toBeCloseTo(4.9);
    const pan = actor.getObjectByName('room-pan')!;
    expect(pan.visible).toBe(true);
    expect(actor.getObjectByName('room-hat')!.visible).toBe(false);
    worker.state = { kind: 'waiting', floor: 1, to: 0 };
    view.sync([worker], [], 0.1, 631, 'clear', g.tower.floors);
    expect(pan.visible).toBe(false);
    view.sync([], [], 0.1, 632, 'clear', g.tower.floors);
    expect(view.pickTargets()).toHaveLength(0);
  });

  it('hands the stove and hat to the promoted resident while retaining both real actors and their props', () => {
    const town = new Town(), g = town.towers()[0]; town.time = 3 * 1440 + 600; town.economy.coins = 1000;
    g.tower.addFloor('residential'); g.tower.addFloor('restaurant', 'fine-dining');
    const workers = [0, 1].map((index) => {
      const r = createResident(1, g.id); r.id = `r801${index}`;
      r.jobTowerId = g.id; r.jobFloor = 2; r.jobTier = 0; r.jobStartDay = town.day - index * 2;
      r.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, until: town.time + 180 }; return r;
    });
    g.residents.push(...workers);
    const views = new CharacterViews(new THREE.Group(), g.id, { x: 0, z: 0 });
    const settle = () => { for (let i = 0; i < 30; i++) views.sync(workers, [], 0.1, town.time, 'clear', g.tower.floors); };
    settle(); const [cover, senior] = views.pickTargets();
    const pan = senior.getObjectByName('room-pan')!, tray = cover.getObjectByName('room-tray')!;
    expect(cover.getObjectByName('room-pan')!.visible).toBe(true); expect(senior.getObjectByName('room-tray')!.visible).toBe(true);
    expect(senior.getObjectByName('room-hat')!.visible).toBe(false);
    expect(town.promoteAt(g.id, 2)).toBe(true); settle();
    expect(views.pickTargets()).toEqual([cover, senior]); expect(senior.position.x).toBeCloseTo(4.9);
    expect(cover.position.x).toBeCloseTo(5.6); expect(tray.visible).toBe(true);
    expect(cover.getObjectByName('room-hat')!.visible).toBe(false);
    expect(pan.visible).toBe(true); expect(senior.getObjectByName('room-hat')!.visible).toBe(true);
    expect(senior.getObjectByName('room-pan')).toBe(pan);
    workers[1].state = { kind: 'waiting', floor: 2, to: 0 };
    views.sync(workers, [], 0.1, town.time + 1, 'clear', g.tower.floors);
    for (const name of ['hat', 'pan', 'tray', 'apron']) expect(senior.getObjectByName(`room-${name}`)!.visible).toBe(false);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    for (const actor of [cover, senior]) actor.traverse((object) => {
      if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); }
    });
    const disposed = vi.fn(); geometries.forEach((g) => g.addEventListener('dispose', disposed)); materials.forEach((m) => m.addEventListener('dispose', disposed));
    views.sync([], [], 0, town.time); views.sync([], [], 0, town.time);
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
  });

  it('responds to a reduced-motion change without losing the scene or keeping steam particles', () => {
    const preference = { matches: false };
    vi.stubGlobal('window', { matchMedia: () => preference });
    try {
      const town = new Town(), g = town.towers()[0], scene = new THREE.Group();
      g.tower.addFloor('restaurant', 'coffee');
      const worker = createResident(0, g.id); worker.jobTowerId = g.id; worker.jobFloor = 1;
      worker.state = { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 1000 };
      const characters = new CharacterViews(scene, g.id, { x: 0, z: 0 });
      const details = new RoomLifeViews(scene, g.id, { x: 0, z: 0 });
      details.sync(g.tower.floors, [worker], [], 600, 0.1);
      expect(scene.getObjectByName('room-steam:1')!.visible).toBe(true);
      preference.matches = true;
      for (let i = 0; i < 30; i++) characters.sync([worker], [], 0.1, 600 + i, 'clear', g.tower.floors);
      details.sync(g.tower.floors, [worker], [], 630, 0.1);
      expect(scene.getObjectByName('room-steam:1')!.visible).toBe(false);
      const actor = characters.pickTargets()[0], cup = actor.getObjectByName('room-cup')!;
      const pose = cup.parent!.rotation.toArray();
      characters.sync([worker], [], 1, 640, 'clear', g.tower.floors);
      expect(cup.visible).toBe(true); expect(cup.parent!.rotation.toArray()).toEqual(pose);
      preference.matches = false;
      details.sync(g.tower.floors, [], [], 641, 0.1);
      expect(scene.getObjectByName('room-steam:1')!.visible).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});
