import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Town } from '../core/town';
import { FloorViews } from './floors';
import { floorY } from './layout';
import { fitFrame, roomFrameBounds, sceneInsets, towerFrameBounds } from './framing';

afterEach(() => { vi.unstubAllGlobals(); });
function setup(floors = 2) {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  const game = new Town().towers()[0];
  if (floors > 1) game.tower.addFloor('restaurant', 'coffee');
  while (game.tower.floors.length < floors) game.tower.addFloor('residential');
  const view = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 }); view.sync(game.tower.floors);
  return { game, view };
}
function signs(view: FloorViews) {
  const result: THREE.Mesh[] = [];
  view.group.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'floor-name-sign') result.push(o); });
  return result;
}

describe('room exploration nameplates', () => {
  it.each(['heritage', 'modern', 'garden'] as const)('keeps %s nameplates clear of the roof, floor belts and snowy canopy', style => {
    for (const count of [1, 2, 7]) for (const earned of [false, true]) {
      const { game, view } = setup(count);
      view.setAppearance(style, new Set(earned ? ['canopy', 'roof-garden', 'landmark'] : []), 'Our house');
      view.setSecondShaft(earned);
      view.sync(game.tower.floors, undefined, 0, true); view.updateSnow(1);
      for (const detail of [false, true]) {
        view.setRoomDetail(detail); view.group.updateMatrixWorld(true);
        for (const [width, height] of [[1280, 720], [390, 844]]) for (const zoom of detail ? [1.5, 2.4, 3] : [1]) {
          for (const sign of signs(view)) {
            const level = sign.parent!.userData.floorLevel;
            const bounds = detail ? roomFrameBounds({ x: 0, z: 0 }, count, floorY(level) + 1.5, zoom, 1) :
              towerFrameBounds({ x: 0, z: 0 }, count, floorY(level) + 1.5);
            const frame = fitFrame(bounds, new THREE.Vector3(0.16, 0.14, 1), 45, width, height, sceneInsets(width, height, 0, detail));
            expect((sign.material as THREE.Material).depthTest).toBe(true);
            // Stop immediately in front of each printed sample: no solid surface
            // should hide it. This also avoids triangle-edge precision at center.
            for (const x of [-2.65, -1.3, 0, 1.3, 2.65]) for (const y of [-0.24, 0, 0.24]) {
              const point = sign.localToWorld(new THREE.Vector3(x, y, 0));
              const ray = new THREE.Raycaster(frame.position, point.clone().sub(frame.position).normalize(), 0, frame.position.distanceTo(point) - 0.001);
              const hit = ray.intersectObject(view.group, true).find(hit => {
                let visible = true;
                for (let parent: THREE.Object3D | null = hit.object; parent; parent = parent.parent) visible &&= parent.visible;
                return visible;
              });
              expect(hit?.object.name, `${style} floors ${count} earned ${earned} level ${level} ${width} zoom ${zoom} sign (${x},${y})`).toBeUndefined();
            }
          }
        }
      }
    }
  });

  it('remounts existing signs when the roof moves or architecture is earned, without reallocating signs', () => {
    const { game, view } = setup(); view.setRoomDetail(true);
    const [lobby, previousTop] = signs(view), geometry = previousTop.geometry, material = previousTop.material;
    expect(previousTop.position.y).toBeCloseTo(5.5);
    game.tower.addFloor('residential'); view.sync(game.tower.floors, undefined, 0, true);
    expect(previousTop.position.y).toBeCloseTo(5.76);
    const top = signs(view)[2]; expect(top.position.y).toBeCloseTo(8.5);
    for (const style of ['modern', 'garden', 'heritage'] as const) {
      view.setAppearance(style, new Set(['canopy']), 'Our house');
      expect(top.position.y).toBeCloseTo(style === 'heritage' ? 8.5 : 8.7);
      expect(lobby.position.toArray()).toEqual([1, 2.5, 5.22]);
    }
    view.setRoomDetail(false);
    expect(lobby.scale.x).toBe(0.75); expect(lobby.position.z).toBe(5.22);
    view.setAppearance('heritage', new Set(), 'Our house');
    expect(lobby.scale.x).toBe(1); expect(lobby.position.z).toBe(3.04);
    expect(previousTop.geometry).toBe(geometry); expect(previousTop.material).toBe(material);
  });

  it('raises and shrinks existing signs without allocating, changing opacity or mutating floors', () => {
    const { game, view } = setup(), before = JSON.stringify(game.tower.floors), original = signs(view);
    const states = original.map(sign => ({ position: sign.position.clone(), scale: sign.scale.clone(), material: sign.material, geometry: sign.geometry }));
    const material = original[1].material as THREE.MeshBasicMaterial; material.opacity = 0.37;
    view.setRoomDetail(true); view.setRoomDetail(true);
    original.forEach((sign, index) => {
      expect(sign.scale.toArray()).toEqual([0.6, 0.6, 0.6]);
      expect(sign.position.y).toBeCloseTo(floorY(index) + (index === original.length - 1 ? 2.5 : 2.76));
      expect(sign.material).toBe(states[index].material); expect(sign.geometry).toBe(states[index].geometry);
    });
    expect(material.opacity).toBe(0.37); expect(signs(view)).toEqual(original);
    view.setRoomDetail(false); view.setRoomDetail(false);
    original.forEach((sign, i) => { expect(sign.position.equals(states[i].position)).toBe(true); expect(sign.scale.equals(states[i].scale)).toBe(true); });
    expect(material.opacity).toBe(0.37); expect(JSON.stringify(game.tower.floors)).toBe(before);
  });

  it('retains detail through earned variants, new construction and shaft rebuilds without leaking to other towers', () => {
    const { game, view } = setup(), other = new FloorViews(new THREE.Group(), 'other', { x: 30, z: 0 });
    other.sync(game.tower.floors); view.setRoomDetail(true);
    game.tower.floors[1].variant = 'critics-choice'; view.sync(game.tower.floors);
    const floor = game.tower.addFloor('shop', 'boutique'); view.sync(game.tower.floors, undefined, 0.1, false);
    const currentSigns = signs(view), sign = currentSigns[currentSigns.length - 1];
    expect(view.isFloorReady(floor.level)).toBe(false);
    const opacity = (sign.material as THREE.MeshBasicMaterial).opacity;
    view.setRoomDetail(false); view.setRoomDetail(true); view.sync(game.tower.floors, undefined, 0, false);
    expect((sign.material as THREE.MeshBasicMaterial).opacity).toBe(opacity);
    expect(view.isFloorReady(floor.level)).toBe(false);
    view.sync(game.tower.floors, undefined, 0, true); expect(view.isFloorReady(floor.level)).toBe(true);
    view.setSecondShaft(true); view.sync(game.tower.floors);
    expect(signs(view)).toHaveLength(game.tower.floors.length);
    for (const sign of signs(view)) expect(sign.scale.x).toBe(0.6);
    for (const sign of signs(other)) expect(sign.scale.x).toBe(1);
  });
});
