import type { WebGLRenderer } from 'three';

/** Preview-only instrumentation. Includes every shadow/post-processing pass,
 * not just the composer's final full-screen triangle. Never touches saves. */
export function mountPerformanceStudy(renderer: WebGLRenderer) {
  const paused = new URLSearchParams(location.search).get('metrics') === 'paused';
  const panel = document.createElement('output');
  panel.setAttribute('aria-label', 'Development rendering measurements');
  panel.style.cssText = 'position:fixed;left:8px;bottom:150px;z-index:16;max-width:280px;padding:10px;background:#fffffff2;color:#243b35;font:12px/1.5 monospace;border-radius:8px;white-space:pre-line;pointer-events:none';
  panel.textContent = 'Rendering study · warming up…';
  document.body.appendChild(panel);
  renderer.info.autoReset = false;
  const frames: number[] = [], work: number[] = [];
  const started = performance.now(); let previous = 0, start = 0, published = 0;
  const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
  return {
    paused,
    begin(now: number) {
      renderer.info.reset(); start = performance.now();
      if (previous && !document.hidden && now - started > 2000 && now > previous) {
        frames.push(now - previous); if (frames.length > 180) frames.shift();
      }
      previous = document.hidden ? 0 : now;
    },
    end(now: number) {
      if (!document.hidden && now - started > 2000) { work.push(performance.now() - start); if (work.length > 180) work.shift(); }
      if (now - published < 1000) return; published = now;
      panel.textContent = `Local rendering study${paused ? ' · frozen comparison' : ''} · ${frames.length} frames${frames.length < 30 ? ' · sparse sample' : ''}\n` +
        `Frame p50/p95: ${percentile(frames, .5).toFixed(1)} / ${percentile(frames, .95).toFixed(1)} ms\n` +
        `CPU p50/p95: ${percentile(work, .5).toFixed(1)} / ${percentile(work, .95).toFixed(1)} ms\n` +
        `All-pass draw calls: ${renderer.info.render.calls}\nTriangles: ${renderer.info.render.triangles}\n` +
        `Geometries/textures: ${renderer.info.memory.geometries}/${renderer.info.memory.textures}\n` +
        'Desktop hardware · not a phone benchmark';
    },
  };
}
