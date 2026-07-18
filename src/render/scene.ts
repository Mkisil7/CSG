import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MINUTES_PER_DAY } from '../core/types';
import { FLOOR_HEIGHT, TOWER_SLOT_ORIGINS, TOWER_SPACING } from './layout';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
}

const SKY_DAY = new THREE.Color(0xbfe3f2);
const SKY_NIGHT = new THREE.Color(0x2a2f4a);
const SUN_DAY = new THREE.Color(0xfff3d6);
const SUN_NIGHT = new THREE.Color(0x9aa8ff);

/** Coarse-pointer (touch) devices get cheaper shadows and a lower pixel cap. */
export const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_COARSE_POINTER ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = SKY_DAY.clone();
  scene.fog = new THREE.Fog(SKY_DAY.clone(), 90, 240);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(18, 14, 34);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.target.set(0, FLOOR_HEIGHT * 2, 0);
  // Touch: one-finger orbit, two-finger dolly+pan (three.js defaults, made explicit).
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const ambient = new THREE.HemisphereLight(0xdfefff, 0xa8c79a, 0.9);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(SUN_DAY, 1.6);
  sun.position.set(35, 50, 30);
  sun.castShadow = true;
  const shadowSize = IS_COARSE_POINTER ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 200;
  scene.add(sun);

  addGround(scene);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, controls, sun, ambient };
}

function addGround(scene: THREE.Scene): void {
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(110, 110, 1, 56),
    new THREE.MeshLambertMaterial({ color: 0xa9d9a0 }),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // A paved street connecting the tower slots.
  const streetLength = TOWER_SPACING * TOWER_SLOT_ORIGINS.length + 10;
  const street = new THREE.Mesh(
    new THREE.BoxGeometry(streetLength, 0.12, 4),
    new THREE.MeshLambertMaterial({ color: 0xcfc8bc }),
  );
  street.position.set(0, 0.06, 8.5);
  street.receiveShadow = true;
  scene.add(street);

  // A scattering of pastel trees for charm, kept clear of the tower row.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0xb08968 });
  const leafColors = [0x8fd694, 0x7cc98f, 0xa2e0a0];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4;
    const radius = 30 + ((i * 13.7) % 60);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(z) < 14) continue; // keep the whole tower row and street clear

    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 6), trunkMat);
    trunk.position.y = 0.6;
    const scale = 0.8 + ((i * 7.1) % 10) / 12;
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(1.4 * scale, 2.6 * scale, 7),
      new THREE.MeshLambertMaterial({ color: leafColors[i % leafColors.length] }),
    );
    leaves.position.y = 1.2 + 1.3 * scale;
    trunk.castShadow = leaves.castShadow = true;
    tree.add(trunk, leaves);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }
}

/**
 * Shift sky and sun with the time of day for a soft day/night cycle. Returns
 * the 0-1 daylight scalar so callers can drive matching effects (window glow,
 * park lamps) off the same value.
 */
export function updateDaylight(ctx: SceneContext, timeOfDay: number): number {
  const t = 0.5 - 0.5 * Math.cos((timeOfDay / MINUTES_PER_DAY) * Math.PI * 2);
  const daylight = Math.min(1, Math.max(0, (t - 0.15) / 0.5));

  (ctx.scene.background as THREE.Color).lerpColors(SKY_NIGHT, SKY_DAY, daylight);
  ctx.scene.fog?.color.copy(ctx.scene.background as THREE.Color);
  ctx.sun.color.lerpColors(SUN_NIGHT, SUN_DAY, daylight);
  ctx.sun.intensity = 0.25 + 1.35 * daylight;
  ctx.ambient.intensity = 0.35 + 0.6 * daylight;
  return daylight;
}

/** Re-aim the camera at a new target, preserving the current viewing angle. */
function moveFocus(ctx: SceneContext, target: THREE.Vector3, distance: number): void {
  const offset = ctx.camera.position.clone().sub(ctx.controls.target);
  if (offset.lengthSq() < 0.01) offset.set(0.5, 0.5, 1);
  offset.setLength(distance);
  ctx.controls.target.copy(target);
  ctx.camera.position.copy(target).add(offset);
}

/** Frame one tower's cross-section (classic single-tower view). */
export function focusTower(ctx: SceneContext, slotIndex: number, floorCount: number): void {
  const origin = TOWER_SLOT_ORIGINS[slotIndex];
  const y = Math.max(2, (floorCount * FLOOR_HEIGHT) / 2);
  moveFocus(ctx, new THREE.Vector3(origin.x, y, origin.z), 26 + floorCount * 1.5);
}

/** Wide framing centered on the unlocked slots plus the next purchasable lot. */
export function focusTown(ctx: SceneContext, unlockedSlotIndices: number[]): void {
  const shown = [...unlockedSlotIndices];
  const next = Math.max(...shown, -1) + 1;
  if (next < TOWER_SLOT_ORIGINS.length) shown.push(next); // tease the next lot
  const xs = shown.map((i) => TOWER_SLOT_ORIGINS[i].x);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const spread = Math.max(...xs) - Math.min(...xs) + TOWER_SPACING;
  moveFocus(ctx, new THREE.Vector3(centerX, 7, 0), Math.max(50, spread * 1.05));
}

/** Gentle per-frame vertical tracking while focused on a growing tower. */
export function trackTowerHeight(ctx: SceneContext, slotIndex: number, floorCount: number): void {
  const origin = TOWER_SLOT_ORIGINS[slotIndex];
  const targetY = Math.max(2, (floorCount * FLOOR_HEIGHT) / 2);
  ctx.controls.target.x += (origin.x - ctx.controls.target.x) * 0.03;
  ctx.controls.target.y += (targetY - ctx.controls.target.y) * 0.02;
}
