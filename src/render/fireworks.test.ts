import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Fireworks } from './fireworks';

type Points = THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
const fixtures: Fireworks[] = [];
function fixture(reducedMotion = false) {
  const preference = {
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('window', { matchMedia: () => preference });
  const scene = new THREE.Scene(), view = new Fireworks(scene, () => 0.5);
  const points = scene.children as Points[];
  const result = {
    view, scene, points, preference,
    rocket: scene.getObjectByName('firework-rocket:0') as Points,
    burst: scene.getObjectByName('firework-burst:0') as Points,
    tick(count: number, active = true, dt = 0.1, roof = 24) {
      for (let i = 0; i < count; i++) view.update(active, 1, 0, dt, roof);
    },
    visible: () => points.filter((p) => p.visible),
  };
  fixtures.push(view);
  return result;
}
const positions = (points: Points) => Array.from(points.geometry.getAttribute('position').array);

afterEach(() => {
  for (const view of fixtures) view.dispose();
  fixtures.length = 0;
  vi.unstubAllGlobals();
});

describe('skyline fireworks', () => {
  it('uses one soft round texture and screen-sized sparks, not giant perspective squares', () => {
    const f = fixture();
    const texture = f.burst.material.map as THREE.DataTexture;
    const { data, width, height } = texture.image;
    expect(width).toBe(32); expect(height).toBe(32);
    const alpha = (x: number, y: number) => data[(y * width + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0); expect(alpha(31, 31)).toBe(0);
    expect(alpha(15, 15)).toBeGreaterThan(250);
    expect(alpha(15, 2)).toBeLessThan(alpha(15, 8));
    for (const points of f.points) {
      expect(points.material.map).toBe(texture);
      expect(points.material.sizeAttenuation).toBe(false);
      expect(points.material.size).toBeLessThanOrEqual(4.5);
      expect(points.material.depthTest).toBe(true);
      expect(points.material.depthWrite).toBe(false);
      const colors = points.geometry.getAttribute('color');
      expect(colors.getX(0)).toBeGreaterThan(colors.getX(1));
      expect(colors.getX(1)).toBeGreaterThan(colors.getX(2));
    }
  });

  it('launches a rising rocket before a spread of trailing sparks above the roof', () => {
    const f = fixture(); f.tick(7, true, 0.1, 60);
    expect(f.rocket.visible).toBe(true); expect(f.burst.visible).toBe(false);
    const firstY = f.rocket.geometry.getAttribute('position').getY(0);
    f.tick(3, false);
    const rocket = f.rocket.geometry.getAttribute('position');
    expect(rocket.getY(0)).toBeGreaterThan(firstY);
    expect(rocket.getY(0)).toBeGreaterThan(rocket.getY(8));
    f.tick(10, false);
    expect(f.rocket.visible).toBe(false); expect(f.burst.visible).toBe(true);
    const sparks = f.burst.geometry.getAttribute('position');
    expect(sparks.getY(0)).toBeGreaterThan(70);
    expect(sparks.getY(0)).toBeGreaterThan(sparks.getY(3));
    for (let i = 0; i < sparks.count; i++) expect(sparks.getZ(i)).toBeLessThan(-14);
    const opacity = f.burst.material.opacity;
    f.tick(8, false);
    expect(f.burst.material.opacity).toBeLessThan(opacity);
    f.tick(30, false);
    expect(f.visible()).toHaveLength(0);
  });

  it('freezes launch, trails, fading and spawning while paused', () => {
    const f = fixture(); f.tick(100, true, 0);
    expect(f.visible()).toHaveLength(0);
    f.tick(7);
    const launch = positions(f.rocket), launchOpacity = f.rocket.material.opacity;
    f.tick(500, true, 0);
    expect(positions(f.rocket)).toEqual(launch);
    expect(f.rocket.material.opacity).toBe(launchOpacity);
    f.tick(15, false);
    const sparks = positions(f.burst), opacity = f.burst.material.opacity;
    f.tick(500, true, 0);
    expect(positions(f.burst)).toEqual(sparks);
    expect(f.burst.material.opacity).toBe(opacity);
    expect(f.visible()).toHaveLength(1);
    f.tick(1, false);
    expect(positions(f.burst)).not.toEqual(sparks);
  });

  it('follows the same burst trajectory at different frame rates', () => {
    const a = fixture(), b = fixture(); a.tick(7); b.tick(7);
    a.tick(18, false, 0.1); b.tick(36, false, 0.05);
    const aa = positions(a.burst), bb = positions(b.burst);
    expect(a.burst.visible).toBe(true); expect(b.burst.visible).toBe(true);
    for (let i = 0; i < aa.length; i++) expect(aa[i]).toBeCloseTo(bb[i], 5);
    expect(a.burst.material.opacity).toBeCloseTo(b.burst.material.opacity, 8);
  });

  it('suppresses daytime/inactive launches and clears existing sparks at dawn', () => {
    const f = fixture(); f.tick(50, false);
    expect(f.visible()).toHaveLength(0);
    for (let i = 0; i < 50; i++) f.view.update(true, 0.3, 0, 0.1);
    expect(f.visible()).toHaveLength(0);
    f.tick(20); expect(f.visible()).toHaveLength(1);
    f.view.update(true, 0.2, 0, 0);
    expect(f.visible()).toHaveLength(0);
  });

  it('applies live reduced motion immediately, even while paused, without a catch-up burst', () => {
    const f = fixture(true); f.tick(100);
    expect(f.visible()).toHaveLength(0);
    f.preference.matches = false; f.tick(20);
    expect(f.burst.visible).toBe(true);
    f.preference.matches = true;
    const listener = f.preference.addEventListener.mock.calls[0][1];
    listener();
    expect(f.visible()).toHaveLength(0);
    f.tick(100, true, 0);
    f.preference.matches = false; listener(); f.tick(1);
    expect(f.visible()).toHaveLength(0);
    f.tick(7);
    expect(f.rocket.visible).toBe(true); expect(f.burst.visible).toBe(false);
  });

  it('reuses a bounded pool through long celebrations and ignores invalid timing', () => {
    const f = fixture();
    const objects = [...f.points], geometries = f.points.map((p) => p.geometry);
    const arrays = f.points.map((p) => p.geometry.getAttribute('position').array);
    expect(f.points).toHaveLength(8);
    expect(f.points.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0)).toBe(932);
    let maximum = 0;
    for (let i = 0; i < 6000; i++) {
      f.view.update(true, 1, 10, 0.1, 120);
      maximum = Math.max(maximum, f.visible().length);
    }
    expect(maximum).toBeLessThanOrEqual(2);
    for (const dt of [NaN, Infinity, -1, 0]) {
      const before = f.points.map(positions);
      f.view.update(true, 1, 10, dt);
      expect(f.points.map(positions)).toEqual(before);
    }
    expect(f.scene.children).toEqual(objects);
    for (let i = 0; i < objects.length; i++) {
      expect(f.points[i].geometry).toBe(geometries[i]);
      expect(f.points[i].geometry.getAttribute('position').array).toBe(arrays[i]);
      expect(positions(f.points[i]).every(Number.isFinite)).toBe(true);
    }
  });

  it('does not catch up after a background gap or launch from invalid coordinates', () => {
    const a = fixture(), b = fixture(); a.tick(7); b.tick(7);
    a.view.update(true, 1, 0, 300); b.view.update(true, 1, 0, 0.1);
    expect(positions(a.rocket)).toEqual(positions(b.rocket));
    const c = fixture();
    for (let i = 0; i < 30; i++) c.view.update(true, 1, NaN, 0.1, Infinity);
    expect(c.visible()).toHaveLength(0);
  });

  it('disposes every owned resource and motion listener once and cannot restart afterward', () => {
    const f = fixture(); f.tick(20);
    const disposed = vi.fn(), removed = vi.fn();
    for (const p of f.points) {
      p.geometry.addEventListener('dispose', disposed);
      p.material.addEventListener('dispose', disposed);
      p.addEventListener('removed', removed);
    }
    f.burst.material.map!.addEventListener('dispose', disposed);
    f.view.dispose(); f.view.dispose(); f.tick(100);
    expect(disposed).toHaveBeenCalledTimes(17);
    expect(removed).toHaveBeenCalledTimes(8);
    expect(f.scene.children).toHaveLength(0);
    expect(f.preference.removeEventListener).toHaveBeenCalledOnce();
    expect(f.preference.removeEventListener.mock.calls[0]).toEqual(f.preference.addEventListener.mock.calls[0]);
  });
});
