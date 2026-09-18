import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NeighborhoodViews } from './neighborhood';
import { hostBenchPlacements } from './hostLayout';
import { createPreviewTown } from '../dev/hostPreview';
import { streetJourneyPosition, TOWER_SLOT_ORIGINS } from '../core/townLayout';
import { encodeTown, decodeTown } from '../core/share';
import { PickingController } from '../input/picking';

const fillText = vi.fn();
beforeEach(() => {
  fillText.mockClear();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {} }) });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText }) }) });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('individual host dedications', () => {
  it('restores two paid dedications without replaying charges or stacking the shared mood bonus', async () => {
    const town = createPreviewTown();
    expect(town.economy.coins).toBe(1760);
    expect(town.allResidents().filter((r) => r.townRole)).toHaveLength(2);
    expect(town.towers()[0].communityMood).toBe(2);
    const restored = (await decodeTown(await encodeTown(town)))!;
    expect(restored.economy.coins).toBe(1760); expect(restored.towers()[0].communityMood).toBe(2);
    const scene = new THREE.Scene(), view = new NeighborhoodViews(scene); view.sync(restored, 0);
    expect(view.pickTargets()).toHaveLength(2);
    expect(fillText.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(['Maya’s welcome bench', 'Noah’s welcome bench']));
  });

  it('keeps each dedication separate, outside street routes and public art, independent of commute-array order', () => {
    const town = createPreviewTown(), hosts = town.allResidents().filter((r) => r.townRole);
    const positions = hostBenchPlacements(hosts);
    expect(hostBenchPlacements([...hosts].reverse())).toEqual(positions);
    const scene = new THREE.Scene(), view = new NeighborhoodViews(scene); view.sync(town, 0); scene.updateMatrixWorld(true);
    const bounds = view.pickTargets().map((bench) => new THREE.Box3().setFromObject(bench));
    expect(bounds[0].intersectsBox(bounds[1])).toBe(false);
    for (const bound of bounds) {
      expect(bound.min.x).toBeGreaterThan(TOWER_SLOT_ORIGINS[0].x + 11.8); // plaque edge; solid seat/pad is farther right
      for (let a = 0; a < town.slots.length; a++) for (let b = 0; b < town.slots.length; b++) {
        if (a === b) continue;
        for (let step = 0; step <= 50; step++) {
          const p = streetJourneyPosition(`t${a}`, `t${b}`, step / 50);
          expect(bound.intersectsBox(new THREE.Box3(new THREE.Vector3(p.x - 0.28, 0.12, p.z - 0.28), new THREE.Vector3(p.x + 0.28, 1.9, p.z + 0.28)))).toBe(false);
        }
      }
    }
    const objects = view.pickTargets(); town.towers()[0].residents.reverse(); view.sync(town, 0);
    expect(view.pickTargets()).toEqual(objects);
  });

  it('opens the matching resident through the same pointer picker as the game', () => {
    const town = createPreviewTown(), scene = new THREE.Scene(), view = new NeighborhoodViews(scene); view.sync(town, 0); scene.updateMatrixWorld(true);
    const bench = view.pickTargets()[1], handlers = new Map<string, (event: { clientX: number; clientY: number }) => void>();
    const canvas = { addEventListener: (name: string, fn: (event: { clientX: number; clientY: number }) => void) => handlers.set(name, fn), getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) } as unknown as HTMLCanvasElement;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(bench.position.x, 0.6, bench.position.z + 6); camera.lookAt(bench.position.x, 0.6, bench.position.z); camera.updateMatrixWorld(true);
    const picked = vi.fn(); new PickingController(canvas, camera, () => view.pickTargets(), picked);
    handlers.get('pointerdown')!({ clientX: 200, clientY: 200 }); handlers.get('pointerup')!({ clientX: 200, clientY: 200 });
    expect(picked).toHaveBeenLastCalledWith({ kind: 'resident', towerId: bench.userData.towerId, residentId: bench.userData.residentId });
  });

  it('reuses label and snow resources, updates names, and releases a departing host’s complete dedication', () => {
    const town = createPreviewTown(), scene = new THREE.Scene(), view = new NeighborhoodViews(scene); view.sync(town, 0);
    const host = town.allResidents().find((r) => r.townRole)!, group = scene.getObjectByName(`host-bench:${host.id}`)!;
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.InstancedMesh>();
    group.traverse((node) => {
      if (node instanceof THREE.Mesh) resources.add(node.geometry);
      if (node instanceof THREE.InstancedMesh) resources.add(node);
      if (node instanceof THREE.Mesh || node instanceof THREE.Sprite) {
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          resources.add(material); const map = (material as THREE.SpriteMaterial).map; if (map) resources.add(map);
        }
      }
    });
    const disposed = vi.fn();
    for (const resource of resources) {
      if (resource instanceof THREE.Material) resource.addEventListener('dispose', disposed);
      else if (resource instanceof THREE.Texture) resource.addEventListener('dispose', disposed);
      else if (resource instanceof THREE.InstancedMesh) resource.addEventListener('dispose', disposed);
      else resource.addEventListener('dispose', disposed);
    }
    host.name = 'Maya Rose'; town.weather.snow = 0.8; view.sync(town, 0);
    expect(scene.getObjectByName(`host-bench:${host.id}`)).toBe(group);
    expect(fillText).toHaveBeenCalledWith('Maya Rose’s welcome bench', 320, 58, 610);
    expect(group.getObjectByName('host-bench-snow')!.visible).toBe(true);
    expect(disposed).not.toHaveBeenCalled();
    town.towers()[0].residents = town.towers()[0].residents.filter((r) => r.id !== host.id); view.sync(town, 0); view.sync(town, 0);
    expect(view.pickTargets()).toHaveLength(1); expect(group.parent).toBeNull(); expect(disposed).toHaveBeenCalledTimes(resources.size);
  });
});
