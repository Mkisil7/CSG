import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { officeRoom, OfficeRoom } from './officeRoom';
import { FloorViews, variantDecoration } from './floors';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { ROOM_LIFE, officeDeskX, roomPoses } from '../core/roomLife';
import { toSaveData, townFromSaveData } from '../core/save';
import { FLOOR_HEIGHT, ROOM_LEFT, ROOM_RIGHT } from './layout';
import { createPreviewTown } from '../dev/roomPreview';
import type { OfficeSubtype, Resident } from '../core/types';

const styles: OfficeSubtype[] = ['tech', 'law', 'creative'];
afterEach(() => { vi.unstubAllGlobals(); });
function meshes(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); }); return result;
}
function fixture(subtype: OfficeSubtype) {
  const town = new Town(), game = town.towers()[0]; game.tower.addFloor('residential');
  const floor = game.tower.addFloor('office', subtype), view = officeRoom(floor); view.updateMatrixWorld(true);
  const people = Array.from({ length: 4 }, (_, i) => {
    const r = createResident(1, game.id); r.id = `office-${i}`; r.jobFloor = floor.level; r.jobTowerId = game.id;
    r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'work', floor: floor.level }, startedAt: 600, until: 1200 }; return r;
  });
  return { town, game, floor, view, people };
}
function canvas() {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
}
function visibleFaces(root: THREE.Object3D, poses: ReturnType<typeof roomPoses>, base: number) {
  root.updateMatrixWorld(true);
  for (const pose of poses.values()) {
    const head = new THREE.Vector3(pose.x, base + (pose.seated ? 1.14 : 1.3), pose.z);
    for (const side of [-6, 0, 6]) {
      const camera = head.clone().add(new THREE.Vector3(side, 8, 36));
      const ray = new THREE.Raycaster(camera, head.clone().sub(camera).normalize(), 0, camera.distanceTo(head) - 0.05);
      expect(ray.intersectObject(root, true).length, `${pose.action} x=${pose.x} camera=${side}`).toBe(0);
    }
  }
}

describe('distinct offices with four real work places', () => {
  it.each(styles)('bounds %s furniture, opaque batches and finite geometry without extra actors or lights', subtype => {
    const { floor, view } = fixture(subtype), bounds = new THREE.Box3().setFromObject(view), parts = meshes(view);
    expect(bounds.min.x).toBeGreaterThan(ROOM_LEFT); expect(bounds.max.x).toBeLessThan(ROOM_RIGHT);
    expect(bounds.min.z).toBeGreaterThan(-2.8); expect(bounds.max.z).toBeLessThan(3);
    expect(bounds.min.y).toBeGreaterThanOrEqual(floor.level * FLOOR_HEIGHT - 1e-6);
    expect(bounds.max.y).toBeLessThan((floor.level + 1) * FLOOR_HEIGHT);
    let triangles = 0;
    view.traverse(object => { expect(object instanceof THREE.Light).toBe(false); expect(object.userData.pickable).toBeUndefined(); });
    for (const mesh of parts) {
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      expect(mesh.material.transparent).toBe(false); expect(mesh.castShadow).toBe(false);
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
    }
    expect(parts.length).toBeLessThanOrEqual(34); expect(triangles).toBeLessThan(6500);
    expect(!!view.getObjectByName('technology-server-alcove')).toBe(subtype === 'tech');
    expect(!!view.getObjectByName('law-reference-library')).toBe(subtype === 'law');
    expect(!!view.getObjectByName('creative-material-wall')).toBe(subtype === 'creative');
  });

  it.each(styles)('seats %s meetings and desk workers on real chairs, with a fourth standing workstation', subtype => {
    const { game, floor, view, people } = fixture(subtype), before = JSON.stringify(people), base = floor.level * FLOOR_HEIGHT;
    for (const minute of [610, 700, 910]) {
      const poses = roomPoses(game.tower.floors, people, game.id, minute); expect(poses.size).toBe(4); visibleFaces(view, poses, base);
      for (const pose of poses.values()) if (pose.seated) {
        const chair = new THREE.Raycaster(new THREE.Vector3(pose.x, base + 0.6, pose.z), new THREE.Vector3(0, -1, 0), 0, 0.2);
        expect(chair.intersectObject(view, true)[0]?.point.y).toBeCloseTo(base + 0.48);
      }
      if (minute === 700) {
        expect([...poses.values()].filter(p => p.seated)).toHaveLength(3);
        const fourth = poses.get(people[3].id)!;
        expect(fourth).toMatchObject({ ...ROOM_LIFE.standingDesk, seated: false });
        const desk = new THREE.Raycaster(new THREE.Vector3(fourth.x + 0.7, base + 1.1, fourth.z - 0.75), new THREE.Vector3(0, -1, 0), 0, 0.2);
        expect(desk.intersectObject(view.getObjectByName('office-workstations')!, true)[0]?.point.y).toBeCloseTo(base + 1.0175);
      } else expect([...poses.values()].filter(p => p.action === 'meeting')).toHaveLength(2);
    }
    expect(JSON.stringify(people)).toBe(before);
    const normal = roomPoses(game.tower.floors, people, game.id, 700); people.reverse();
    expect(roomPoses(game.tower.floors, people, game.id, 700)).toEqual(normal);
  });

  it.each(['founders-studio', 'innovation-hub'] as const)('keeps earned %s displays behind real people at both work and meeting times', variant => {
    const { game, floor, view, people } = fixture('tech'); floor.variant = variant;
    const combined = new THREE.Group(), reward = variantDecoration(floor); combined.add(view, reward);
    for (const minute of [610, 700, 910]) visibleFaces(combined, roomPoses(game.tower.floors, people, game.id, minute), floor.level * FLOOR_HEIGHT);
    const bounds = new THREE.Box3().setFromObject(reward);
    expect(bounds.max.z).toBeLessThan(0); expect(bounds.min.z).toBeGreaterThan(-2.8);
  });

  it('keeps desk surfaces separated throughout the repeating floor layouts', () => {
    for (let level = 1; level <= 100; level++) for (let index = 0; index < 3; index++) {
      const x = officeDeskX(level, index); expect(x - 0.825).toBeGreaterThan(ROOM_LEFT);
      if (index < 2) expect(officeDeskX(level, index + 1) - x - 1.65).toBeGreaterThan(0.5);
    }
  });

  it('follows construction, reuses stable rooms and releases owned resources on rebuild and save reconstruction', () => {
    canvas(); vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const town = new Town(), game = town.towers()[0], views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const floor = game.tower.addFloor('office', 'law'), before = toSaveData(town);
    views.sync(game.tower.floors, undefined, 0.1); const room = views.group.getObjectByName('office-interior:law')!;
    let hidden = false; for (let parent: THREE.Object3D | null = room; parent; parent = parent.parent) hidden ||= !parent.visible;
    expect(hidden).toBe(true);
    for (let i = 0; i < 24; i++) views.sync(game.tower.floors, undefined, 0.1);
    expect(views.isFloorReady(floor.level)).toBe(true); expect(views.group.getObjectByName('office-interior:law')).toBe(room);
    const after = toSaveData(town); after.savedAtWallClock = before.savedAtWallClock; expect(after).toEqual(before);
    const geometries = new Set(meshes(room).map(m => m.geometry)), materials = new Set(meshes(room).map(m => m.material)), disposed = vi.fn();
    geometries.forEach(resource => resource.addEventListener('dispose', disposed)); materials.forEach(resource => resource.addEventListener('dispose', disposed));
    floor.subtype = 'creative'; views.sync(game.tower.floors); views.sync(game.tower.floors);
    expect(disposed).toHaveBeenCalledTimes(geometries.size + materials.size);
    for (const style of styles) {
      floor.subtype = style; const restored = townFromSaveData(toSaveData(town))!;
      const loaded = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); loaded.sync(restored.towers()[0].tower.floors);
      expect(loaded.group.getObjectByName(`office-interior:${style}`)).toBeDefined();
    }
  });

  it('lights occupied offices after dark and refreshes the cache on second-shaft rebuild', () => {
    canvas(); const { game, floor, people } = fixture('creative'), views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
    views.sync(game.tower.floors); const room = views.group.getObjectByName('office-interior:creative') as OfficeRoom;
    views.updateLighting(0, people, 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.65);
    views.updateLighting(0, [], 1100); expect(room.lampMaterial.emissiveIntensity).toBe(0.04);
    views.updateLighting(1, people, 610); expect(room.lampMaterial.emissiveIntensity).toBe(0);
    views.setSecondShaft(true); views.sync(game.tower.floors); views.updateLighting(0, people, 1100);
    expect(room.lampMaterial.emissiveIntensity).toBe(0);
    const rebuilt = views.group.getObjectByName(`office-interior:${floor.subtype}`) as OfficeRoom;
    expect(rebuilt).not.toBe(room); expect(rebuilt.lampMaterial.emissiveIntensity).toBe(0.65);
  });

  it('stages all four assigned office workers in the disposable study', () => {
    const town = createPreviewTown(), game = town.towers()[0];
    const staff: Resident[] = game.residents.filter(r => r.jobTowerId === game.id && r.jobFloor === 4);
    expect(staff).toHaveLength(4);
    for (const r of staff) expect(r.state).toMatchObject({ kind: 'idle', floor: 4, activity: { kind: 'work', floor: 4 } });
  });
});
