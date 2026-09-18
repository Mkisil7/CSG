import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

// Per-target sample-pixel limits. Two HDR color/depth targets at the desktop
// limit require at most ~96 MiB of multisample storage, in addition to the
// existing resolved textures/bloom buffers. Touch uses a lower 72 MiB ceiling.
export const SAMPLE_PIXEL_LIMIT = { desktop: 4_194_304, touch: 3_145_728 };

/** Smooth geometry, not the finished text/image: retain the existing HDR bloom
 * chain and bound MSAA by actual framebuffer pixels rather than CSS viewport. */
export function sceneSamples(width: number, height: number, supported: readonly number[], touch: boolean): number {
  const pixels = width * height;
  if (!Number.isFinite(pixels) || width <= 0 || height <= 0) return 0;
  const budget = touch ? SAMPLE_PIXEL_LIMIT.touch : SAMPLE_PIXEL_LIMIT.desktop;
  return Math.max(0, ...supported.filter(n => (n === 2 || n === 4) && pixels * n <= budget));
}

/** Canvas antialiasing cannot smooth geometry drawn into an off-screen target.
 * Query both attachment formats; a global MAX_SAMPLES alone is not sufficient.
 * Unsupported HDR multisampling safely keeps the existing single-sample path. */
export class SceneComposer extends EffectComposer {
  private readonly supported: number[];

  constructor(renderer: THREE.WebGLRenderer, private readonly touch: boolean) {
    super(renderer);
    const gl = renderer.getContext();
    const color: Int32Array | null = 'getInternalformatParameter' in gl
      ? gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) : null;
    const depth: Int32Array | null = 'getInternalformatParameter' in gl
      ? gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) : null;
    this.supported = Array.from(color ?? []).filter(n => depth?.includes(n) && n <= renderer.capabilities.maxSamples);
    this.configureSamples();
  }

  override setSize(width: number, height: number): void {
    super.setSize(width, height);
    // EffectComposer.setPixelRatio also routes through setSize. This covers
    // normal resize and temporary postcard capture/restoration automatically.
    this.configureSamples();
  }

  private configureSamples(): void {
    for (const target of [this.renderTarget1, this.renderTarget2]) {
      const samples = sceneSamples(target.width, target.height, this.supported, this.touch);
      if (target.samples === samples) continue;
      target.dispose(); // Release the old framebuffer before its next allocation.
      target.samples = samples;
    }
  }
}
