import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyFrameInsets, boxCorners, fitFrame, sceneInsets, towerFrameBounds, roomFrameBounds, townFrameBounds } from './framing';
import { enterTowerLock, exitTowerLock, lookAtFloor, exploreRoom, zoomRoom, panRoom, resetTowerView, roomViewState, navigateTowerKey, updateTowerCam, updateTownCam, type SceneContext } from './scene';
import { hostBenchPlacements } from './hostLayout';

const sizes = [[390, 844], [320, 568], [844, 390], [768, 1024], [1388, 951], [1920, 1080]];
const directions = [new THREE.Vector3(0.16, 0.14, 1), new THREE.Vector3(-0.45, 0.6, 1), new THREE.Vector3(1, 1, -1)];

function checkFit(bounds: THREE.Box3, direction: THREE.Vector3, width: number, height: number, exploring = false) {
  const insets = sceneInsets(width, height, width >= 1000 ? 306 : 0, exploring);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
  applyFrameInsets(camera, width, height, insets);
  const frame = fitFrame(bounds, direction, 45, width, height, insets);
  camera.position.copy(frame.position); camera.lookAt(frame.target); camera.updateMatrixWorld(true);
  for (const corner of boxCorners(bounds)) {
    const p = corner.project(camera), x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
    expect(x).toBeGreaterThanOrEqual(insets.left); expect(x).toBeLessThanOrEqual(width - insets.right);
    expect(y).toBeGreaterThanOrEqual(insets.top); expect(y).toBeLessThanOrEqual(height - insets.bottom);
    expect(p.z).toBeGreaterThan(-1); expect(p.z).toBeLessThan(1);
  }
}

describe('responsive town and tower composition', () => {
  it('reserves one desktop dock row while preserving phone controls and room-tool clearance', () => {
    for (const width of [901, 1280, 1920]) {
      expect(sceneInsets(width, 720, 306).bottom).toBe(80);
      expect(sceneInsets(width, 720, 306, true).bottom).toBe(168);
    }
    expect(sceneInsets(390, 844, 0).bottom).toBe(128);
    expect(sceneInsets(390, 844, 0, true).bottom).toBe(216);
  });

  it('fits intentional room crops above the exploration controls and clamps both pan axes', () => {
    for (const [width, height] of sizes) for (const zoom of [1.5, 2.4, 3]) {
      const origin = { x: 102, z: 0 };
      for (const x of [-1000, 1, 1000]) for (const y of [-1000, 13.5, 1000]) {
        const crop = roomFrameBounds(origin, 20, y, zoom, x);
        expect(crop.min.x).toBeGreaterThanOrEqual(91);
        expect(crop.max.x).toBeLessThanOrEqual(115);
        expect(crop.min.y).toBeGreaterThanOrEqual(0);
        expect(crop.max.y).toBeLessThanOrEqual(65.2);
        expect(crop.getSize(new THREE.Vector3()).x).toBeCloseTo(24 / zoom);
        checkFit(crop, directions[0], width, height, true);
      }
    }
  });

  it('enlarges a phone room, pans safely, persists across resize, and resets on full-tower/town navigation', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500), sun = new THREE.DirectionalLight();
    const element = { clientWidth: 390, clientHeight: 844 };
    const ctx = { camera, sun, leftInset: 0, renderer: { domElement: element }, controls: { target: new THREE.Vector3(), enabled: true, maxDistance: 280 } } as unknown as SceneContext;
    enterTowerLock(ctx, 0, 8); const full = camera.position.distanceTo(ctx.controls.target), originX = ctx.controls.target.x - 1;
    exploreRoom(3); updateTowerCam(ctx, 8);
    expect(roomViewState()).toEqual({ active: true, zoom: 2.4 });
    expect(camera.position.distanceTo(ctx.controls.target)).toBeLessThan(full * 0.6);
    expect(ctx.controls.target.y).toBeCloseTo(10.5);
    panRoom(10000); zoomRoom(100); updateTowerCam(ctx, 8);
    expect(roomViewState().zoom).toBe(3); expect(ctx.controls.target.x).toBeCloseTo(originX + 9);
    panRoom(-10000); updateTowerCam(ctx, 8); expect(ctx.controls.target.x).toBeCloseTo(originX - 7);
    element.clientWidth = 844; element.clientHeight = 390; updateTowerCam(ctx, 8);
    expect(roomViewState().active).toBe(true); expect(ctx.controls.target.x).toBeCloseTo(originX - 7);
    zoomRoom(-100); updateTowerCam(ctx, 8); expect(roomViewState().zoom).toBe(1.5);
    expect(navigateTowerKey('ArrowUp', ctx.controls.target.y)).toBe(true); updateTowerCam(ctx, 8);
    expect(ctx.controls.target.y).toBeCloseTo(13.5);
    expect(navigateTowerKey('x', ctx.controls.target.y)).toBe(false);
    expect(navigateTowerKey('+', ctx.controls.target.y)).toBe(true); expect(roomViewState().zoom).toBeCloseTo(1.8);
    expect(navigateTowerKey('Escape', ctx.controls.target.y)).toBe(true);
    updateTowerCam(ctx, 8); expect(roomViewState().active).toBe(false);
    expect(ctx.controls.target.x).toBe(originX + 1);
    exploreRoom(3); exitTowerLock(ctx, [{ index: 0, floors: 8 }]); expect(roomViewState().active).toBe(false);
    expect(navigateTowerKey('ArrowUp', ctx.controls.target.y)).toBe(false);
    enterTowerLock(ctx, 1, 8); expect(roomViewState().active).toBe(false);
    exploreRoom(3); resetTowerView(); expect(roomViewState().active).toBe(false);
  });
  it('includes every earned host plaque in tower, town and postcard framing', () => {
    for (const count of [1, 2, 8]) {
      const hosts = Array.from({ length: count }, (_, i) => ({ id: `host${i}`, homeTowerId: 't0' }));
      const positions = hostBenchPlacements(hosts), origin = [...positions.values()][0];
      const towerOrigin = { x: origin.x - 14.2, z: 0 };
      const tower = towerFrameBounds(towerOrigin, 3, null, false, count);
      const postcard = townFrameBounds([{ index: 0, floors: 3, hosts: count }], false);
      for (const point of positions.values()) for (const bounds of [tower, postcard]) {
        expect(bounds.containsPoint(new THREE.Vector3(point.x + 2.3, 1.925, point.z))).toBe(true);
        expect(bounds.containsPoint(new THREE.Vector3(point.x, 1.925, point.z - 2.3))).toBe(true);
      }
      for (const [width, height] of sizes) {
        checkFit(tower, directions[0], width, height);
        for (const direction of directions) checkFit(postcard, direction, width, height);
      }
    }
  });
  it('fits complete small towers, both shafts and earned crowns outside the permanent UI', () => {
    for (const [width, height] of sizes) for (const floors of [1, 3, 5, 8]) {
      const bounds = towerFrameBounds({ x: 102, z: 0 }, floors, null);
      expect(bounds.min.y).toBe(0); expect(bounds.max.y).toBeCloseTo(floors * 3 + 5.2);
      checkFit(bounds, directions[0], width, height);
    }
  });

  it('fits every unlocked lot plus the next lot across aspect ratios, heights and orbit angles', () => {
    for (const count of [1, 3, 10]) {
      const slots = Array.from({ length: count }, (_, index) => ({ index, floors: index % 3 === 0 ? 0 : 5 + index * 2 }));
      const bounds = townFrameBounds(slots);
      for (const [width, height] of sizes) for (const direction of directions) checkFit(bounds, direction, width, height);
    }
    expect(townFrameBounds([]).isEmpty()).toBe(false);
    expect(townFrameBounds([{ index: 1, floors: 0 }]).max.x).toBeGreaterThan(townFrameBounds([{ index: 0, floors: 1 }]).max.x);
  });

  it('preserves a readable tall-tower window and clamps street and roof scrolling', () => {
    const origin = { x: 0, z: 0 };
    const bottom = towerFrameBounds(origin, 30, -1000), roof = towerFrameBounds(origin, 30, Number.MAX_SAFE_INTEGER);
    expect(bottom.min.y).toBe(0); expect(bottom.max.y).toBeCloseTo(29.2);
    expect(roof.max.y).toBeCloseTo(95.2); expect(roof.max.y - roof.min.y).toBeCloseTo(29.2);
    for (const [width, height] of sizes) checkFit(roof, directions[0], width, height);
    const middle = towerFrameBounds(origin, 30, 45);
    expect(middle.getCenter(new THREE.Vector3()).y).toBe(45);
  });

  it('reframes on resize/growth, keeps distant towns inside the far plane and respects manual town zoom', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500), sun = new THREE.DirectionalLight();
    camera.position.set(10, 10, 30);
    const element = { clientWidth: 1388, clientHeight: 951 };
    const ctx = { camera, sun, leftInset: 306, renderer: { domElement: element }, controls: { target: new THREE.Vector3(), enabled: true, maxDistance: 280 } } as unknown as SceneContext;
    enterTowerLock(ctx, 0, 5); const firstDistance = camera.position.distanceTo(ctx.controls.target);
    expect(ctx.controls.enabled).toBe(false);
    element.clientWidth = 390; element.clientHeight = 844; ctx.leftInset = 0;
    updateTowerCam(ctx, 5); expect(camera.position.distanceTo(ctx.controls.target)).toBeGreaterThan(firstDistance);
    updateTowerCam(ctx, 30); lookAtFloor(29); updateTowerCam(ctx, 30);
    expect(ctx.controls.target.y).toBeGreaterThan(70);
    lookAtFloor(0); updateTowerCam(ctx, 30); expect(ctx.controls.target.y).toBeCloseTo(4.5);
    const slots = Array.from({ length: 10 }, (_, index) => ({ index, floors: 25 }));
    exitTowerLock(ctx, slots); expect(ctx.controls.enabled).toBe(true);
    const townDistance = camera.position.distanceTo(ctx.controls.target);
    expect(townDistance).toBeGreaterThan(280); expect(camera.far).toBeGreaterThan(townDistance + 300);
    expect(ctx.controls.maxDistance).toBeGreaterThan(townDistance);
    expect(camera.far).toBeGreaterThan(ctx.controls.maxDistance + 300);
    camera.position.add(new THREE.Vector3(0, 0, -10)); const manual = camera.position.clone();
    updateTownCam(ctx, slots); expect(camera.position.equals(manual)).toBe(true);
    element.clientWidth = 1388; element.clientHeight = 951; ctx.leftInset = 306;
    updateTownCam(ctx, slots); expect(camera.position.equals(manual)).toBe(false);
    const beforeGrowth = ctx.controls.target.y; slots[0].floors = 50;
    updateTownCam(ctx, slots); expect(ctx.controls.target.y).toBeGreaterThan(beforeGrowth);
  });

  it('allows an explicitly selected floor to stay centered even in a small tower', () => {
    const bounds = towerFrameBounds({ x: 0, z: 0 }, 5, 13.5, true);
    expect(bounds.getCenter(new THREE.Vector3()).y).toBe(13.5);
    expect(bounds.getSize(new THREE.Vector3()).y).toBe(9);
    for (const [width, height] of sizes) checkFit(bounds, directions[0], width, height);
  });
});
