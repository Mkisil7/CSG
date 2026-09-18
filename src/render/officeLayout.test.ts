import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { roomPoses, ROOM_LIFE } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { FLOOR_HEIGHT } from './layout';

beforeEach(() => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
});
afterEach(() => { vi.unstubAllGlobals(); });

function setup() {
  const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
  const floor = game.tower.addFloor('office', 'tech');
  const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
  views.sync(game.tower.floors);
  const alcove = views.group.getObjectByName('technology-server-alcove')!;
  views.group.updateMatrixWorld(true);
  return { town, game, floor, views, alcove };
}

describe('inhabited technology-office sightlines', () => {
  it('puts detailed equipment behind work areas in three opaque batches without lights', () => {
    const { alcove, floor } = setup(), bounds = new THREE.Box3().setFromObject(alcove);
    expect(bounds.min.x).toBeGreaterThan(1.2); expect(bounds.max.x).toBeLessThan(3.8);
    expect(bounds.min.z).toBeGreaterThan(-2.7); expect(bounds.max.z).toBeLessThan(-1.9);
    expect(bounds.min.y).toBeCloseTo(floor.level * FLOOR_HEIGHT);
    expect(bounds.max.y).toBeLessThan(floor.level * FLOOR_HEIGHT + 2);
    const meshes: THREE.Mesh[] = []; let triangles = 0;
    alcove.traverse((object) => {
      expect(object instanceof THREE.Light).toBe(false);
      if (object instanceof THREE.Mesh) {
        meshes.push(object); triangles += object.geometry.index.count / 3;
        expect(object.castShadow).toBe(false); expect(object.material.transparent).toBe(false);
      }
    });
    expect(meshes).toHaveLength(3); expect(triangles).toBeLessThan(1000);
    // Back-of-desk footprints and the meeting circle remain separate from equipment.
    for (const x of ROOM_LIFE.deskX) expect(bounds.intersectsBox(new THREE.Box3(
      new THREE.Vector3(x - 1.21, bounds.min.y, -1.92), new THREE.Vector3(x + 1.21, bounds.min.y + 1.3, 0.1),
    ))).toBe(false);
    expect(bounds.max.x).toBeLessThan(ROOM_LIFE.meeting.x - ROOM_LIFE.meeting.radius - 0.4);
  });

  it.each([610, 700])('does not intersect or occlude actual meeting/typing poses at minute %s', (minute) => {
    const { game, floor, alcove } = setup();
    const workers = Array.from({ length: 4 }, () => {
      const resident = createResident(1, game.id); resident.jobFloor = floor.level; resident.jobTowerId = game.id;
      resident.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, until: 1000 };
      return resident;
    });
    const before = JSON.stringify(workers), poses = roomPoses(game.tower.floors, workers, game.id, minute);
    expect(poses.size).toBe(4);
    const bounds = new THREE.Box3().setFromObject(alcove);
    for (const pose of poses.values()) {
      const base = floor.level * FLOOR_HEIGHT;
      const body = new THREE.Box3(new THREE.Vector3(pose.x - 0.3, base, pose.z - 0.3), new THREE.Vector3(pose.x + 0.3, base + 1.6, pose.z + 0.3));
      expect(bounds.intersectsBox(body)).toBe(false);
      const head = new THREE.Vector3(pose.x, base + 1.3, pose.z);
      for (const side of [-14, 0, 14]) {
        const camera = head.clone().add(new THREE.Vector3(side, 12, 36));
        const ray = new THREE.Raycaster(camera, head.clone().sub(camera).normalize(), 0, camera.distanceTo(head));
        expect(ray.intersectObject(alcove, true)).toHaveLength(0);
      }
    }
    expect(JSON.stringify(workers)).toBe(before);
  });

  it('reuses stable scenery, disposes rebuilt geometry and reconstructs it from a normal save', () => {
    const { town, game, floor, views, alcove } = setup();
    const before = JSON.stringify(toSaveData(town)); views.sync(game.tower.floors);
    expect(views.group.getObjectByName('technology-server-alcove')).toBe(alcove);
    const after = toSaveData(town); after.savedAtWallClock = JSON.parse(before).savedAtWallClock;
    expect(JSON.stringify(after)).toBe(before);
    const geometries = new Set<THREE.BufferGeometry>();
    alcove.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    const disposed = vi.fn(); for (const geometry of geometries) geometry.addEventListener('dispose', disposed);
    floor.subtype = 'law'; views.sync(game.tower.floors);
    expect(disposed).toHaveBeenCalledTimes(geometries.size);
    expect(views.group.getObjectByName('technology-server-alcove')).toBeUndefined();
    const restored = townFromSaveData(JSON.parse(before))!;
    const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); loaded.sync(restored.towers()[0].tower.floors);
    expect(loaded.group.getObjectByName('technology-server-alcove')).toBeDefined();
  });
});
