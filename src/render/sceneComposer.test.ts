import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneComposer, sceneSamples, SAMPLE_PIXEL_LIMIT } from './sceneComposer';

function fixture(color: number[] = [4, 2], depth: number[] = [4, 2], ratio = 1, touch = false) {
  const gl = { RENDERBUFFER: 1, RGBA16F: 2, DEPTH_COMPONENT24: 3, SAMPLES: 4,
    getInternalformatParameter: vi.fn((_target: number, format: number) => new Int32Array(format === 2 ? color : depth)) };
  const renderer = { getPixelRatio: () => ratio, getSize: (out: THREE.Vector2) => out.set(1280, 720),
    getContext: () => gl, capabilities: { maxSamples: 4 } } as unknown as THREE.WebGLRenderer;
  return { gl, composer: new SceneComposer(renderer, touch) };
}

describe('bounded off-screen edge smoothing', () => {
  it('uses only supported sample counts within the actual pixel budget', () => {
    expect(sceneSamples(1280, 720, [8, 4, 2], false)).toBe(4);
    expect(sceneSamples(1920, 1080, [4, 2], false)).toBe(2);
    expect(sceneSamples(3840, 2160, [4, 2], false)).toBe(0);
    expect(sceneSamples(585, 1266, [4], true)).toBe(4);
    expect(sceneSamples(1280, 720, [4, 2], true)).toBe(2);
    expect(sceneSamples(1920, 1080, [4], false)).toBe(0);
    for (const touch of [false, true]) for (const width of [320, 585, 1280, 1920, 3840]) {
      const height = width * 1.5, samples = sceneSamples(width, height, [4, 2], touch);
      expect(width * height * samples).toBeLessThanOrEqual(touch ? SAMPLE_PIXEL_LIMIT.touch : SAMPLE_PIXEL_LIMIT.desktop);
    }
    for (const width of [0, -1, Infinity, NaN]) expect(sceneSamples(width, 720, [4, 2], false)).toBe(0);
  });

  it('intersects HDR color/depth support and preserves the HDR target configuration', () => {
    const { composer, gl } = fixture([8, 4, 2], [2]);
    expect(gl.getInternalformatParameter).toHaveBeenCalledTimes(2);
    for (const target of [composer.readBuffer, composer.writeBuffer]) {
      expect(target.samples).toBe(2); expect(target.texture.type).toBe(THREE.HalfFloatType);
      expect(target.depthBuffer).toBe(true); expect(target.stencilBuffer).toBe(false);
    }
    composer.dispose();
    const fallback = fixture([], [4]).composer;
    expect(fallback.readBuffer.samples).toBe(0); expect(fallback.writeBuffer.samples).toBe(0);
    fallback.dispose();
  });

  it('keeps stable buffers on ordinary frames and reapplies the budget on resize and pixel-ratio changes', () => {
    const { composer } = fixture();
    const read = composer.readBuffer, write = composer.writeBuffer;
    const disposeRead = vi.spyOn(read, 'dispose'), disposeWrite = vi.spyOn(write, 'dispose');
    composer.setSize(1280, 720); composer.setSize(1280, 720);
    expect(disposeRead).not.toHaveBeenCalled(); expect(disposeWrite).not.toHaveBeenCalled();
    expect(read.samples).toBe(4);
    composer.setPixelRatio(2);
    expect(read.width).toBe(2560); expect(read.height).toBe(1440); expect(read.samples).toBe(0);
    expect(disposeRead).toHaveBeenCalled(); expect(disposeWrite).toHaveBeenCalled();
    composer.setPixelRatio(1); expect(read.samples).toBe(4);
    expect(composer.readBuffer).toBe(read); expect(composer.writeBuffer).toBe(write);
    composer.dispose();
  });

  it('restores the previous sampling budget after a postcard-sized render', () => {
    const { composer } = fixture([4, 2], [4, 2], 2);
    composer.setSize(1920, 1080); expect(composer.readBuffer.samples).toBe(0);
    composer.setPixelRatio(1); composer.setSize(1504, 730);
    expect(composer.readBuffer.samples).toBe(2);
    composer.setPixelRatio(2); composer.setSize(1920, 1080);
    expect(composer.readBuffer.samples).toBe(0);
    composer.dispose();
  });
});
