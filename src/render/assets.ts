import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Optional real-model overrides. The game is fully procedural out of the box;
 * to use real assets, drop .glb files under public/models/ and point the
 * manifest entries at them (e.g. character: 'models/character.glb'). Any entry
 * left null (or that fails to load) silently falls back to the procedural
 * geometry, so partial packs are fine and no other code changes are needed.
 */
const MANIFEST: Record<AssetKey, string | null> = {
  character: null,
  'furniture-lobby': null,
  'furniture-residential': null,
  'furniture-shop': null,
  'furniture-restaurant': null,
  'furniture-office': null,
  'elevator-cab': null,
};

export type AssetKey =
  | 'character'
  | 'furniture-lobby'
  | 'furniture-residential'
  | 'furniture-shop'
  | 'furniture-restaurant'
  | 'furniture-office'
  | 'elevator-cab';

const cache = new Map<AssetKey, THREE.Group>();

/** Kick off loading of any manifest-listed models; safe to call once at startup. */
export async function preloadAssets(): Promise<void> {
  const loader = new GLTFLoader();
  const jobs = (Object.keys(MANIFEST) as AssetKey[])
    .filter((key) => MANIFEST[key] !== null)
    .map(async (key) => {
      try {
        const gltf = await loader.loadAsync(MANIFEST[key]!);
        const group = new THREE.Group();
        group.add(gltf.scene);
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
        });
        cache.set(key, group);
      } catch {
        // Missing/broken file: procedural fallback covers it.
      }
    });
  await Promise.all(jobs);
}

/** A clone of the loaded model for this key, or null to use procedural geometry. */
export function getAsset(key: AssetKey): THREE.Group | null {
  const asset = cache.get(key);
  return asset ? (asset.clone(true) as THREE.Group) : null;
}
