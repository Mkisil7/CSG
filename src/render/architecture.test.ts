import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { architectureFacade, architectureRoof } from './architecture';
import { FloorViews } from './floors';
import { Town } from '../core/town';
import { FLOOR_HEIGHT, WAIT_X, WAIT_X_RIGHT } from './layout';

const styles = ['heritage', 'modern', 'garden'] as const;
type StyledMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

describe('earned tower architecture', () => {
  it('gives each style distinct structural details and a recognizable roof silhouette', () => {
    const details = ['brick-pier', 'steel-mullion', 'terrace-planter'];
    const roofs = ['water-tank', 'rooftop-plant', 'pergola-slat'];
    for (const [i, style] of styles.entries()) {
      const facade = architectureFacade(style, 8), roof = architectureRoof(style, 24);
      expect(facade.getObjectByName(details[i])).toBeDefined();
      expect(roof.getObjectByName(roofs[i])).toBeDefined();
      for (const other of details.filter((_, n) => n !== i)) expect(facade.getObjectByName(other)).toBeUndefined();
      let triangles = 0;
      for (const group of [facade, roof]) group.traverse((object) => {
        expect(object instanceof THREE.Light).toBe(false);
        expect(object.userData.pickable).toBeUndefined(); expect(object.userData.residentId).toBeUndefined();
        if (object instanceof THREE.Mesh) triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      });
      expect(triangles).toBeLessThan(12000);
      const bounds = new THREE.Box3().setFromObject(roof);
      expect(bounds.min.y).toBeGreaterThanOrEqual(24.3); expect(bounds.max.y).toBeLessThan(26.5);
    }
  });

  it('leaves the cutaway rooms and both lift waiting lanes unobstructed', () => {
    for (const style of styles) {
      const facade = architectureFacade(style, 8); facade.updateMatrixWorld(true);
      const geometry: THREE.Box3[] = [];
      facade.traverse((object) => { if (object instanceof THREE.Mesh) geometry.push(new THREE.Box3().setFromObject(object)); });
      for (let level = 0; level < 8; level++) {
        const base = level * FLOOR_HEIGHT;
        const interior = new THREE.Box3(new THREE.Vector3(-6, base + 0.3, -2.9), new THREE.Vector3(8, base + 2.6, 3.6));
        for (const bounds of geometry) expect(bounds.intersectsBox(interior)).toBe(false);
        for (const x of [WAIT_X, WAIT_X_RIGHT]) {
          const person = new THREE.Box3(new THREE.Vector3(x - 0.3, base + 0.3, -0.3), new THREE.Vector3(x + 0.3, base + 2, 0.3));
          for (const bounds of geometry) expect(bounds.intersectsBox(person)).toBe(false);
        }
      }
    }
  });

  it('keeps textured masonry scale stable as floors are added and uses filtered repeatable texture', () => {
    const short = architectureFacade('heritage', 2), tall = architectureFacade('heritage', 20);
    const a = short.getObjectByName('brick-pier') as StyledMesh, b = tall.getObjectByName('brick-pier') as StyledMesh;
    expect([...a.geometry.getAttribute('uv').array]).toEqual([...b.geometry.getAttribute('uv').array]);
    const texture = a.material.map as THREE.DataTexture;
    expect(texture.wrapS).toBe(THREE.RepeatWrapping); expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace); expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(new Set(texture.image.data).size).toBeGreaterThan(20);
  });

  it('releases each owned material, texture and geometry once across style, height and shaft rebuilds', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    try {
      const game = new Town().towers()[0]; game.tower.addFloor('residential');
      const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
      views.setAppearance('heritage', new Set(), 'Masonry House'); views.sync(game.tower.floors);
      const observe = () => {
        const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
        for (const name of styles.flatMap((style) => [`architecture:${style}`, `roof-style:${style}`])) {
          views.group.getObjectByName(name)?.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            resources.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              resources.add(material);
              for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
            }
          });
        }
        const callbacks = [...resources].map((resource) => {
          const callback = vi.fn();
          if (resource instanceof THREE.Material) resource.addEventListener('dispose', callback);
          else if (resource instanceof THREE.Texture) resource.addEventListener('dispose', callback);
          else resource.addEventListener('dispose', callback);
          return callback;
        });
        expect(callbacks.length).toBeGreaterThan(30);
        return () => callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
      };
      const sharedSlab = (views.pickTargets()[0].children.find((o) => o instanceof THREE.Mesh) as THREE.Mesh).material as THREE.Material;
      const sharedDisposed = vi.fn(); sharedSlab.addEventListener('dispose', sharedDisposed);
      const styleCheck = observe(); views.setAppearance('modern', new Set(), 'Masonry House'); styleCheck();
      const heightCheck = observe(); game.tower.addFloor('shop', 'boutique'); views.sync(game.tower.floors); heightCheck();
      const shaftCheck = observe(); views.setSecondShaft(true); views.sync(game.tower.floors); shaftCheck();
      expect(sharedDisposed).not.toHaveBeenCalled();
      expect(views.pickTargets()).toHaveLength(3);
      expect(views.pickTargets()[2].userData).toMatchObject({ pickable: 'floor', floorLevel: 2 });
    } finally { vi.unstubAllGlobals(); }
  });

  it('preserves earned rooftop gardens, crown and art across style changes without changing the simulation', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {} }) }) });
    try {
      const game = new Town().towers()[0]; game.tower.addFloor('residential');
      const before = JSON.stringify(game.tower.floors), features = new Set(['roof-garden', 'landmark', 'canopy', 'public-art']);
      const views = new FloorViews(new THREE.Group(), game.id, { x: 0, z: 0 });
      views.sync(game.tower.floors);
      for (const style of styles) {
        views.setAppearance(style, features, 'Town House');
        expect(views.group.getObjectByName(`architecture:${style}`)).toBeDefined();
        let shrubs = 0, spires = 0, sculptures = 0;
        views.group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          if (object.geometry instanceof THREE.SphereGeometry && object.position.y === 7.15) shrubs++;
          if (object.geometry instanceof THREE.ConeGeometry && object.position.y === 9.2) spires++;
          if (object.geometry instanceof THREE.TorusKnotGeometry) sculptures++;
        });
        expect(shrubs).toBe(3); expect(spires).toBe(1); expect(sculptures).toBe(1);
      }
      expect(JSON.stringify(game.tower.floors)).toBe(before);
    } finally { vi.unstubAllGlobals(); }
  });
});
