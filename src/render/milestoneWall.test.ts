import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Town } from '../core/town';
import { MISSION_DEFS } from '../core/missions';
import { MILESTONE_TILES, earnedMilestoneTiles } from '../core/milestoneWall';
import { createResident } from '../core/residents';
import { toSaveData, townFromSaveData } from '../core/save';
import { encodeTown, decodeTown } from '../core/share';
import { MilestoneWall } from './milestoneWall';
import { FloorViews } from './floors';
import { fitFrame, roomFrameBounds, sceneInsets } from './framing';

afterEach(() => { vi.unstubAllGlobals(); });
function canvas() { vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) }); }
const all = new Set(MISSION_DEFS.map(def => def.id));
function transforms(wall: MilestoneWall) {
  return Array.from({ length: wall.tiles.count }, (_, i) => {
    const matrix = new THREE.Matrix4(); wall.tiles.getMatrixAt(i, matrix); return matrix.elements;
  });
}

describe('permanent mission story wall', () => {
  it('maps every catalog mission once, ignores unknown IDs and keeps slots independent of earning order', () => {
    expect(new Set(MILESTONE_TILES.map(tile => tile.id)).size).toBe(MISSION_DEFS.length);
    expect(new Set(MILESTONE_TILES.map(tile => tile.index)).size).toBe(MISSION_DEFS.length);
    expect(earnedMilestoneTiles(new Set())).toEqual([]);
    expect(earnedMilestoneTiles(new Set(['made-up', ...all]))).toHaveLength(MISSION_DEFS.length);
    expect(earnedMilestoneTiles(new Set([...all].reverse()))).toEqual(earnedMilestoneTiles(all));
  });

  it('adds a tile only when the actual mission earns its normal one-time reward', () => {
    const town = new Town(), game = town.towers()[0], wall = new MilestoneWall();
    wall.sync(town.missions.completed); expect(wall.tiles.count).toBe(0);
    game.tower.addFloor('residential'); game.residents.push(createResident(1, game.id));
    const before = town.economy.coins, events = town.missions.checkInstant(town);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(e => e.message.includes('town story wall'))).toBe(true);
    expect(town.economy.coins - before).toBe(MISSION_DEFS.filter(d => town.missions.completed.has(d.id)).reduce((sum, d) => sum + d.reward, 0));
    const afterReward = toSaveData(town); wall.sync(town.missions.completed);
    expect(wall.tiles.count).toBe(town.missions.completedCount);
    expect(town.missions.checkInstant(town)).toEqual([]); wall.sync(town.missions.completed);
    const afterRender = toSaveData(town); afterRender.savedAtWallClock = afterReward.savedAtWallClock;
    expect(afterRender).toEqual(afterReward);
  });

  it('reconstructs the same wall from ordinary saved completions and a read-only shared town', async () => {
    const town = new Town(); town.missions.completed = new Set(['first-meal', 'happy-town', 'lift-second']);
    const initial = new MilestoneWall(); initial.sync(town.missions.completed);
    for (const restored of [townFromSaveData(toSaveData(town))!, (await decodeTown(await encodeTown(town)))!]) {
      const wall = new MilestoneWall(); wall.sync(restored.missions.completed);
      expect(transforms(wall)).toEqual(transforms(initial));
      expect(Array.from(wall.tiles.instanceColor!.array)).toEqual(Array.from(initial.tiles.instanceColor!.array));
      expect(restored.economy.coins).toBe(town.economy.coins);
    }
  });

  it('reuses one bounded instanced tile mesh for the full catalog without lights, actors or non-finite vertices', () => {
    const wall = new MilestoneWall(); wall.sync(all); wall.updateMatrixWorld(true);
    expect(wall.tiles.count).toBe(MISSION_DEFS.length);
    const bounds = new THREE.Box3().setFromObject(wall);
    expect(bounds.min.x).toBeGreaterThan(2.7); expect(bounds.max.x).toBeLessThan(7);
    expect(bounds.min.y).toBeGreaterThan(0.45); expect(bounds.max.y).toBeLessThan(2.1);
    expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(-2.3);
    let meshes = 0, triangles = 0;
    wall.traverse(object => {
      expect(object instanceof THREE.Light).toBe(false); expect(object.userData.pickable).toBeUndefined();
      if (object instanceof THREE.Mesh) {
        meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
        expect(object.material.transparent).toBe(false); expect(object.castShadow).toBe(false);
        expect(Array.from(object.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      }
    });
    expect(meshes).toBe(3); expect(triangles).toBeLessThan(1600);
  });

  it('updates instances only on changes, clears them on a fresh town, and keeps night highlights finite', () => {
    const wall = new MilestoneWall(); wall.sync(new Set(['first-meal']));
    const geometry = wall.tiles.geometry, version = wall.tiles.instanceMatrix.version, matrix = transforms(wall);
    wall.sync(new Set(['unknown', 'first-meal'])); expect(wall.tiles.instanceMatrix.version).toBe(version);
    wall.sync(new Set(['first-shop-customer', 'first-meal'])); expect(wall.tiles.count).toBe(2);
    expect(transforms(wall)[1]).toEqual(matrix[0]); expect(wall.tiles.geometry).toBe(geometry);
    wall.updateLighting(0); expect((wall.tiles.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0.1);
    wall.updateLighting(NaN); expect((wall.tiles.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0);
    wall.sync(new Set()); expect(wall.tiles.count).toBe(0);
  });

  it('keeps every tile visible past real lobby furniture and the floor above in room exploration', () => {
    canvas();
    for (const style of ['heritage', 'modern', 'garden'] as const) for (const secondShaft of [false, true]) {
      const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
      const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
      views.setSecondShaft(secondShaft); views.setAppearance(style, new Set(['canopy']), 'Founders House');
      views.sync(game.tower.floors); views.syncMilestones(all); views.group.updateMatrixWorld(true);
      const wall = views.group.getObjectByName('town-story-wall') as MilestoneWall;
      for (const [width, height] of [[1280, 720], [390, 844], [320, 568]]) {
        const frame = fitFrame(roomFrameBounds({ x: 0, z: 0 }, 2, 1.5, 2.4, 1),
          new THREE.Vector3(0.16, 0.14, 1), 45, width, height, sceneInsets(width, height, width >= 1000 ? 306 : 0, true));
        for (let i = 0; i < wall.tiles.count; i++) {
          const matrix = new THREE.Matrix4(); wall.tiles.getMatrixAt(i, matrix);
          const point = new THREE.Vector3(0, 0, 0.021).applyMatrix4(matrix).applyMatrix4(wall.tiles.matrixWorld);
          const direction = point.clone().sub(frame.position);
          const ray = new THREE.Raycaster(frame.position, direction.clone().normalize(), 0, direction.length() + 0.1);
          const hit = ray.intersectObject(views.group, true)[0];
          expect(hit?.object.name, `${style}, shaft ${secondShaft}, ${width}px, tile ${i}`).toBe(wall.tiles.name);
          expect(hit?.instanceId).toBe(i);
        }
      }
    }
  });

  it('lives under the lobby reveal and picking owner, and releases its instances and materials exactly once on shaft rebuild', () => {
    canvas(); const town = new Town(), game = town.towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); views.syncMilestones(all);
    const wall = views.group.getObjectByName('town-story-wall') as MilestoneWall;
    expect(wall.parent?.name).toBe('room-furnishings');
    const lobby = views.pickTargets()[0]; expect(lobby.getObjectByName('town-story-wall')).toBe(wall);
    expect(lobby.userData).toMatchObject({ pickable: 'floor', floorLevel: 0 });
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), disposed = vi.fn(), instanceDispose = vi.spyOn(wall.tiles, 'dispose');
    wall.traverse(object => { if (object instanceof THREE.Mesh) { geometry.add(object.geometry); materials.add(object.material); } });
    geometry.forEach(g => g.addEventListener('dispose', disposed)); materials.forEach(m => m.addEventListener('dispose', disposed));
    views.setSecondShaft(true); views.sync(game.tower.floors); views.syncMilestones(all); views.syncMilestones(all);
    expect(disposed).toHaveBeenCalledTimes(geometry.size + materials.size); expect(instanceDispose).toHaveBeenCalledTimes(1);
    const rebuilt = views.group.getObjectByName('town-story-wall') as MilestoneWall;
    expect(rebuilt).not.toBe(wall); expect(rebuilt.tiles.count).toBe(all.size);
  });
});
