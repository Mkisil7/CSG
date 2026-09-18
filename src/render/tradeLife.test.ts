import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CharacterViews } from './characters';
import { Town } from '../core/town';
import { createResident } from '../core/residents';

describe('work accessories and gestures', () => {
  it('uses one real shopper, changes browsing props for checkout, and clears them before commuting', () => {
    const game = new Town().towers()[0]; game.tower.addFloor('shop', 'boutique');
    const r = createResident(0, game.id), clerk = createResident(0, game.id);
    clerk.jobTowerId = game.id; clerk.jobFloor = 1;
    clerk.state = { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 900 };
    r.state = { kind: 'idle', floor: 1, activity: { kind: 'shop', floor: 1 }, startedAt: 600, until: 620 };
    const views = new CharacterViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    for (let i = 0; i < 30; i++) views.sync([r, clerk], [], 0.1, 600, 'clear', game.tower.floors);
    expect(views.pickTargets()).toHaveLength(2);
    const actor = views.pickTargets().find((o) => o.userData.residentId === r.id)!;
    expect(actor.getObjectByName('work-garment')!.visible).toBe(true);
    for (let i = 0; i < 30; i++) views.sync([r, clerk], [], 0.1, 616, 'clear', game.tower.floors);
    expect(actor.getObjectByName('work-garment')!.visible).toBe(false); expect(actor.getObjectByName('work-bag')!.visible).toBe(true);
    r.state = { kind: 'commuting', toTowerId: 't1', startedAt: 620, until: 650 };
    views.sync([r, clerk], [], 0.1, 621, 'clear', game.tower.floors);
    actor.traverse((o) => { if (o.name.startsWith('work-')) expect(o.visible).toBe(false); });
  });

  it('holds factory gestures under pause/reduced motion, reuses accessories and disposes resources once', () => {
    const preference = { matches: false }; vi.stubGlobal('window', { matchMedia: () => preference });
    try {
      const game = new Town().towers()[0]; game.tower.addFloor('factory', 'assembly');
      const r = createResident(0, game.id); r.jobTowerId = game.id; r.jobFloor = 1;
      r.state = { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 900 };
      const views = new CharacterViews(new THREE.Group(), game.id, { x: 0, z: 0 });
      for (let i = 0; i < 30; i++) views.sync([r], [], 0.1, 600 + i, 'clear', game.tower.floors);
      const actor = views.pickTargets()[0], tool = actor.getObjectByName('work-tool')!;
      expect(tool.visible).toBe(true); expect(actor.getObjectByName('work-helmet')!.visible).toBe(true);
      const frozen = tool.parent!.rotation.toArray();
      for (let i = 0; i < 20; i++) views.sync([r], [], 0.1, 629, 'clear', game.tower.floors);
      expect(tool.parent!.rotation.toArray()).toEqual(frozen);
      preference.matches = true; views.sync([r], [], 0.1, 640, 'clear', game.tower.floors);
      const reduced = tool.parent!.rotation.toArray();
      views.sync([r], [], 0.1, 650, 'clear', game.tower.floors); expect(tool.parent!.rotation.toArray()).toEqual(reduced);
      expect(actor.getObjectByName('work-tool')).toBe(tool);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      actor.traverse((o) => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
      const geometryDispose = vi.fn(), materialDispose = vi.fn();
      geometries.forEach((g) => g.addEventListener('dispose', geometryDispose)); materials.forEach((m) => m.addEventListener('dispose', materialDispose));
      views.sync([], [], 0.1, 660, 'clear', game.tower.floors); views.sync([], [], 0.1, 661, 'clear', game.tower.floors);
      expect(geometryDispose).toHaveBeenCalledTimes(geometries.size); expect(materialDispose).toHaveBeenCalledTimes(materials.size);
    } finally { vi.unstubAllGlobals(); }
  });
});
