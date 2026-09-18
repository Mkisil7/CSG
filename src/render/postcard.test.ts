import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { capturePostcard, postcardCamera, POSTCARD_SCENE } from './postcard';
import { boxCorners, townFrameBounds } from './framing';
import type { SceneContext } from './scene';

describe('full-town postcard capture', () => {
  it('fits earned roofs, towers and parks without the next unowned lot', () => {
    for (const count of [1, 4, 10]) {
      const slots = Array.from({ length: count }, (_, index) => ({ index, floors: index % 3 === 1 ? 0 : 8 + index * 3 }));
      const camera = postcardCamera(slots), bounds = townFrameBounds(slots, false);
      expect(camera.view?.enabled ?? false).toBe(false);
      for (const corner of boxCorners(bounds)) {
        const projected = corner.project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1); expect(Math.abs(projected.y)).toBeLessThan(1);
        expect(projected.z).toBeGreaterThan(-1); expect(projected.z).toBeLessThan(1);
      }
    }
    expect(townFrameBounds([{ index: 0, floors: 4 }], false).max.x).toBeLessThan(townFrameBounds([{ index: 0, floors: 4 }]).max.x);
  });

  it.each([false, true])('restores the exact camera, resolution, sky and plots after capture (failure=%s)', (fail) => {
    const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 600);
    camera.position.set(11, 34, 70); camera.lookAt(0, 20, 0);
    camera.setViewOffset(390, 844, 18, -70, 390, 844);
    const originalCamera = camera.clone(), scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xffffff, 211, 511);
    const sky = new THREE.Group(); sky.position.set(11, 34, 70);
    const plot = new THREE.Group(); plot.userData = { pickable: 'slot', slotIndex: 1 }; scene.add(plot);
    const alreadyHidden = plot.clone(); alreadyHidden.visible = false; scene.add(alreadyHidden);
    let ratio = 2, size = new THREE.Vector2(390, 844), composerRatio = 2, composerSize = size.clone();
    let detail = true;
    const render = vi.fn(() => detail);
    const presentation = { overview: vi.fn(() => { detail = false; }), restore: vi.fn(() => { detail = true; }) };
    const ctx = { camera, scene, sky: { group: sky }, controls: { target: new THREE.Vector3(0, 20, 0) },
      renderer: { domElement: {}, getPixelRatio: () => ratio, getSize: (out: THREE.Vector2) => out.copy(size),
        setPixelRatio: (value: number) => { ratio = value; }, setSize: (w: number, h: number) => { size = new THREE.Vector2(w, h); } },
      composer: { render, setPixelRatio: (value: number) => { composerRatio = value; },
        setSize: (w: number, h: number) => { composerSize = new THREE.Vector2(w, h); } },
    } as unknown as SceneContext;
    const copy = () => {
      expect(detail).toBe(false);
      expect(ratio).toBe(1); expect(size.toArray()).toEqual([POSTCARD_SCENE.width, POSTCARD_SCENE.height]);
      expect(camera.view?.enabled ?? false).toBe(false); expect(plot.visible).toBe(false);
      expect(sky.position.equals(camera.position)).toBe(true);
      if (fail) throw new Error('encoding failed');
      return 'image';
    };
    if (fail) expect(() => capturePostcard(ctx, [{ index: 0, floors: 5 }], copy, presentation)).toThrow('encoding failed');
    else expect(capturePostcard(ctx, [{ index: 0, floors: 5 }], copy, presentation)).toBe('image');
    expect(detail).toBe(true); expect(presentation.overview).toHaveBeenCalledOnce(); expect(presentation.restore).toHaveBeenCalledOnce();
    expect(render.mock.results.map(result => result.value)).toEqual([false, true]);
    expect(camera.position.equals(originalCamera.position)).toBe(true);
    expect(camera.quaternion.equals(originalCamera.quaternion)).toBe(true);
    expect(camera.projectionMatrix.equals(originalCamera.projectionMatrix)).toBe(true);
    expect(camera.view).toEqual(originalCamera.view); expect(camera.far).toBe(600);
    expect(ratio).toBe(2); expect(composerRatio).toBe(2);
    expect(size.toArray()).toEqual([390, 844]); expect(composerSize.toArray()).toEqual([390, 844]);
    expect(sky.position.equals(originalCamera.position)).toBe(true);
    expect(plot.visible).toBe(true); expect(alreadyHidden.visible).toBe(false);
    expect((scene.fog as THREE.Fog).near).toBe(211); expect((scene.fog as THREE.Fog).far).toBe(511);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
