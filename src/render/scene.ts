import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MINUTES_PER_DAY } from '../core/types';
import { FLOOR_HEIGHT } from './layout';

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

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = SKY_DAY.clone();
  scene.fog = new THREE.Fog(SKY_DAY.clone(), 60, 160);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.set(18, 14, 30);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.target.set(0, FLOOR_HEIGHT * 2, 0);

  const ambient = new THREE.HemisphereLight(0xdfefff, 0xa8c79a, 0.9);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(SUN_DAY, 1.6);
  sun.position.set(25, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.far = 120;
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
    new THREE.CylinderGeometry(70, 70, 1, 48),
    new THREE.MeshLambertMaterial({ color: 0xa9d9a0 }),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // A scattering of pastel trees for charm.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0xb08968 });
  const leafColors = [0x8fd694, 0x7cc98f, 0xa2e0a0];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4;
    const radius = 22 + ((i * 13.7) % 30);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x) < 14 && z > -8) continue; // keep the tower frontage clear

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

/** Shift sky and sun with the time of day for a soft day/night cycle. */
export function updateDaylight(ctx: SceneContext, timeOfDay: number): void {
  // 0 at midnight, 1 at noon, smooth cosine in between.
  const t = 0.5 - 0.5 * Math.cos((timeOfDay / MINUTES_PER_DAY) * Math.PI * 2);
  const daylight = Math.min(1, Math.max(0, (t - 0.15) / 0.5));

  (ctx.scene.background as THREE.Color).lerpColors(SKY_NIGHT, SKY_DAY, daylight);
  ctx.scene.fog?.color.copy(ctx.scene.background as THREE.Color);
  ctx.sun.color.lerpColors(SUN_NIGHT, SUN_DAY, daylight);
  ctx.sun.intensity = 0.25 + 1.35 * daylight;
  ctx.ambient.intensity = 0.35 + 0.6 * daylight;
}

/** Keep the camera target centered on the growing tower. */
export function trackTowerHeight(ctx: SceneContext, floorCount: number): void {
  const targetY = Math.max(2, (floorCount * FLOOR_HEIGHT) / 2);
  ctx.controls.target.y += (targetY - ctx.controls.target.y) * 0.02;
}
