import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PickingController } from './picking';

function setup() {
  const listeners = new Map<string, (e: { pointerId: number; clientX: number; clientY: number }) => void>();
  const canvas = { addEventListener: (event: string, callback: (e: { pointerId: number; clientX: number; clientY: number }) => void) => listeners.set(event, callback),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) };
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.z = 5; camera.updateMatrixWorld(true);
  const picked = vi.fn(); new PickingController(canvas as unknown as HTMLCanvasElement, camera, () => [], picked);
  const fire = (name: string, id = 1, x = 200, y = 200) => listeners.get(name)!({ pointerId: id, clientX: x, clientY: y });
  return { fire, picked };
}

describe('camera gestures do not become accidental scene selections', () => {
  it('keeps ordinary taps and small pointer jitter selectable', () => {
    const s = setup(); s.fire('pointerdown'); s.fire('pointermove', 1, 202); s.fire('pointerup', 1, 202);
    expect(s.picked).toHaveBeenCalledOnce();
  });
  it('rejects a drag even if it returns to its starting position', () => {
    const s = setup(); s.fire('pointerdown'); s.fire('pointermove', 1, 230); s.fire('pointermove'); s.fire('pointerup');
    expect(s.picked).not.toHaveBeenCalled();
  });
  it.each(['pointercancel', 'pointerleave'])('rejects %s and permits the next deliberate tap', (event) => {
    const s = setup(); s.fire('pointerdown'); s.fire(event); s.fire('pointerup'); expect(s.picked).not.toHaveBeenCalled();
    s.fire('pointerdown'); s.fire('pointerup'); expect(s.picked).toHaveBeenCalledOnce();
  });
  it('rejects both fingers of a multi-touch gesture without poisoning the next tap', () => {
    const s = setup(); s.fire('pointerdown'); s.fire('pointerdown', 2); s.fire('pointerup', 2); s.fire('pointerup');
    expect(s.picked).not.toHaveBeenCalled();
    s.fire('pointerdown'); s.fire('pointerup'); expect(s.picked).toHaveBeenCalledOnce();
  });
});
