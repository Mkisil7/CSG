import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FLOOR_HEIGHT, TOWER_SLOT_ORIGINS } from './layout';
import { applyFrameInsets, fitFrame, sceneInsets, towerFrameBounds, roomFrameBounds, townFrameBounds, type TownFrameSlot } from './framing';
import { Sky } from './sky';
import { lightingAt } from './lighting';
import { LandscapeView } from './landscape';
import { SceneComposer } from './sceneComposer';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  sky: Sky;
  landscape: LandscapeView;
  composer: EffectComposer;
  leftInset: number;
}

const SKY_DAY = new THREE.Color(0xbfe3f2);
const SUN_DAY = new THREE.Color(0xfff3d6);
const SUN_NIGHT = new THREE.Color(0xaabfea);
const SUN_GOLDEN = new THREE.Color(0xffb779);
const AMBIENT_DAY = new THREE.Color(0xdfefff);
const AMBIENT_NIGHT = new THREE.Color(0x879ac5);
const AMBIENT_TWILIGHT = new THREE.Color(0xffdfc7);
const GROUND_DAY = new THREE.Color(0xc3c6ad);
const GROUND_NIGHT = new THREE.Color(0x776b7b);

/** Coarse-pointer (touch) devices get cheaper shadows and a lower pixel cap. */
export const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// ---- tower lock (scroll-only camera) --------------------------------------
// When focused on a tower the camera is pinned to a fixed straight-on angle and
// only scrolls up/down; the player can't orbit or drift sideways. Town view
// restores the free orbit camera.
// A lower eye line exposes the rooms instead of presenting mostly rooftop.
const TOWER_DIR = new THREE.Vector3(0.16, 0.14, 1).normalize();
let towerLock: { origin: { x: number; z: number } } | null = null;
let towerScrollY: number | null = null;
let townFrameKey = '';
let towerFrameKey = '';
let towerDetail = false;
let roomZoom = 1;
let roomPanX = 1;

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  // Geometry is smoothed in SceneComposer; the canvas only receives its final
  // full-screen output, so allocating a second MSAA buffer here adds no detail.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_COARSE_POINTER ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Filmic tone mapping + bloom give the town a soft, cinematic glow (especially
  // the warm windows and celestial bodies at night).
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.background = SKY_DAY.clone();
  scene.fog = new THREE.Fog(SKY_DAY.clone(), 190, 460);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(18, 14, 34);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 280; // pull back far enough to survey a wide town
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.target.set(0, FLOOR_HEIGHT * 2, 0);
  // Touch: one-finger orbit, two-finger dolly+pan (three.js defaults, made explicit).
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const ambient = new THREE.HemisphereLight(0xdfefff, 0xa8c79a, 0.9);
  scene.add(ambient);

  // A single, shadowless front fill keeps miniature interiors legible. No
  // per-room point lights/shadow maps, even in a town with hundreds of floors.
  const fill = new THREE.DirectionalLight(0xffdfc4, 0.35);
  fill.position.set(0, 12, 40);
  scene.add(fill, fill.target);

  const sun = new THREE.DirectionalLight(SUN_DAY, 1.6);
  sun.position.set(35, 50, 30);
  sun.castShadow = true;
  // The shadow frustum follows the focused tower (see focusSunOn) so distant
  // towers still cast crisp shadows without a giant, low-res shadow map.
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
  const shadowSize = IS_COARSE_POINTER ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 200;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  const landscape = new LandscapeView(scene);

  const sky = new Sky(scene);

  // Post-processing: render → bloom → tone-map/output.
  const composer = new SceneComposer(renderer, !!IS_COARSE_POINTER);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    IS_COARSE_POINTER ? 0.26 : 0.34, // restrained halos, not a veil over furniture
    0.45, // radius
    1.05, // reserve bloom for genuinely luminous highlights
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // Vertical-scroll input for the locked tower view (ignored in town view,
  // where OrbitControls is in charge). Picking has its own click threshold, so
  // these drags never trigger selection.
  canvas.style.touchAction = 'none';
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!towerLock) return;
      e.preventDefault();
      towerScrollY = (towerScrollY ?? controls.target.y) - e.deltaY * 0.02 / roomZoom;
    },
    { passive: false },
  );
  const pointers = new Map<number, { x: number; y: number }>();
  canvas.addEventListener('pointerdown', (e) => {
    if (towerLock) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!towerLock || !pointers.has(e.pointerId)) return;
    const previous = pointers.get(e.pointerId)!;
    const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size !== 1) return;
    // Drag down → look further up the tower (grab-the-scene feel).
    const units = 2 * camera.position.distanceTo(controls.target) * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, canvas.clientHeight);
    towerScrollY = (towerScrollY ?? controls.target.y) + dy * units;
    if (roomZoom > 1) roomPanX -= dx * units;
  });
  const dropPointer = (e: PointerEvent) => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', dropPointer);
  canvas.addEventListener('pointercancel', dropPointer);
  canvas.addEventListener('pointerleave', dropPointer);
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Town scene. Up/down scroll floors; Home goes to the street, End to the roof. In room exploration use left/right to pan, plus/minus to zoom, Escape for the full tower.');
  canvas.addEventListener('keydown', (event) => {
    if (navigateTowerKey(event.key, controls.target.y)) event.preventDefault();
  });

  return { renderer, scene, camera, controls, sun, ambient, fill, sky, landscape, composer, leftInset: 0 };
}

/** Reserve desktop journal space without letting it hide the left lift shaft. */
export function setSceneInset(ctx: SceneContext, pixels: number): void {
  ctx.leftInset = pixels;
  const w = ctx.renderer.domElement.clientWidth;
  const h = ctx.renderer.domElement.clientHeight;
  if (w > 0 && h > 0) applyFrameInsets(ctx.camera, w, h, sceneInsets(w, h, pixels, roomZoom > 1));
}

/** Render the scene through the post-processing chain (bloom + tone map). */
export function renderScene(ctx: SceneContext): void {
  // Portrait town surveys can be much farther out than a tower close-up.
  const distance = ctx.camera.position.distanceTo(ctx.controls.target);
  if (ctx.scene.fog instanceof THREE.Fog) {
    ctx.scene.fog.near = Math.max(190, distance * 0.9);
    ctx.scene.fog.far = Math.max(460, distance + 300);
  }
  ctx.composer.render();
}

/**
 * Shift sky and sun with the time of day for a soft day/night cycle. Returns
 * the 0-1 daylight scalar so callers can drive matching effects (window glow,
 * park lamps) off the same value.
 */
export function updateDaylight(ctx: SceneContext, timeOfDay: number, cloudCover = 0): number {
  const light = lightingAt(timeOfDay, cloudCover);
  const { daylight } = light;
  ctx.sun.color.copy(light.moon ? SUN_NIGHT : SUN_DAY);
  if (!light.moon) ctx.sun.color.lerp(SUN_GOLDEN, light.golden * (1 - light.cloud * 0.7));
  ctx.sun.intensity = light.keyIntensity;
  const direction = light.moon ? -1 : 1;
  ctx.sun.position.set(ctx.sun.target.position.x + Math.cos(light.angle) * 55 * direction,
    Math.max(8, light.elevation * 65 * direction), 30);
  ctx.ambient.color.lerpColors(AMBIENT_NIGHT, AMBIENT_DAY, daylight);
  ctx.ambient.color.lerp(AMBIENT_TWILIGHT, light.twilight * (1 - light.cloud) * 0.25);
  ctx.ambient.groundColor.lerpColors(GROUND_NIGHT, GROUND_DAY, daylight);
  ctx.ambient.intensity = light.ambientIntensity;
  ctx.fill.intensity = light.fillIntensity;
  ctx.fill.position.set(ctx.sun.target.position.x, 12, 40);
  ctx.fill.target.position.copy(ctx.sun.target.position);
  ctx.fill.target.updateMatrixWorld();

  ctx.sky.update(light, ctx.camera.position);
  (ctx.scene.background as THREE.Color).copy(ctx.sky.horizonColor);
  ctx.scene.fog?.color.copy(ctx.sky.horizonColor);
  return daylight;
}

/** Reframe only on actual layout/town changes; leave free orbit/zoom untouched. */
export function updateTownCam(ctx: SceneContext, slots: TownFrameSlot[]): void {
  const { clientWidth: width, clientHeight: height } = ctx.renderer.domElement;
  const key = `${width}:${height}:${ctx.leftInset}:${slots.map((slot) => `${slot.index}/${slot.floors}/${slot.hosts ?? 0}`).join(',')}`;
  if (key === townFrameKey || width <= 0 || height <= 0) return;
  townFrameKey = key;
  const direction = ctx.camera.position.clone().sub(ctx.controls.target);
  if (direction.lengthSq() < 0.01) direction.set(0.16, 0.2, 1);
  placeFrame(ctx, townFrameBounds(slots), direction, width, height);
}

// ---- locked tower view ----------------------------------------------------

export function isTowerLocked(): boolean {
  return towerLock !== null;
}

function placeFrame(ctx: SceneContext, bounds: THREE.Box3, direction: THREE.Vector3, width: number, height: number, exploring = false): void {
  const insets = sceneInsets(width, height, ctx.leftInset, exploring);
  applyFrameInsets(ctx.camera, width, height, insets);
  const frame = fitFrame(bounds, direction, ctx.camera.fov, width, height, insets);
  ctx.controls.target.copy(frame.target);
  ctx.camera.position.copy(frame.position);
  ctx.controls.maxDistance = Math.max(280, frame.distance * 1.5);
  ctx.camera.far = Math.max(500, ctx.controls.maxDistance + bounds.getSize(new THREE.Vector3()).length() + 300);
  ctx.camera.updateProjectionMatrix();
  ctx.camera.lookAt(frame.target);
}

/** Slide the sun (and its shadow frustum) to centre on a world-x. */
function focusSunOn(ctx: SceneContext, x: number): void {
  ctx.sun.position.x += x - ctx.sun.target.position.x;
  ctx.sun.target.position.set(x, 0, 0);
  ctx.sun.target.updateMatrixWorld();
}

/** Enter the locked, scroll-only view of one tower. */
export function enterTowerLock(ctx: SceneContext, slotIndex: number, floorCount: number, hosts = 0): void {
  const origin = TOWER_SLOT_ORIGINS[slotIndex];
  towerLock = { origin };
  ctx.controls.enabled = false;
  focusSunOn(ctx, origin.x);
  towerScrollY = null;
  towerDetail = false;
  roomZoom = 1; roomPanX = 1;
  towerFrameKey = '';
  updateTowerCam(ctx, floorCount, hosts);
}

/** Bring a known floor to the center of the locked tower view. */
export function lookAtFloor(level: number): void {
  if (towerLock && Number.isFinite(level)) {
    towerDetail = true;
    towerScrollY = Math.max(0, level) * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
  }
}

export function exploreRoom(level: number): void {
  if (!towerLock || !Number.isFinite(level)) return;
  lookAtFloor(level); roomZoom = 2.4; roomPanX = 1;
}

export function zoomRoom(delta: number): void {
  if (towerLock && roomZoom > 1 && Number.isFinite(delta)) roomZoom = THREE.MathUtils.clamp(roomZoom + delta, 1.5, 3);
}

export function panRoom(delta: number): void {
  if (towerLock && roomZoom > 1 && Number.isFinite(delta)) roomPanX += delta;
}

export function resetTowerView(): void {
  roomZoom = 1; roomPanX = 1; towerDetail = false; towerScrollY = null;
}

export function roomViewState(): { active: boolean; zoom: number } {
  return { active: towerLock !== null && roomZoom > 1, zoom: roomZoom };
}

/** Shared by the scene and its exploration controls; never intercepts form typing. */
export function navigateTowerKey(key: string, currentY: number): boolean {
  if (!towerLock) return false;
  if (roomZoom > 1 && ['ArrowLeft', 'ArrowRight', '+', '=', '-', 'Escape'].includes(key)) {
    if (key === 'Escape') resetTowerView();
    else if (key === 'ArrowLeft' || key === 'ArrowRight') panRoom(key === 'ArrowLeft' ? -2 : 2);
    else zoomRoom(key === '-' ? -0.3 : 0.3);
    return true;
  }
  if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(key)) return false;
  const step = key.startsWith('Page') ? FLOOR_HEIGHT * 3 : FLOOR_HEIGHT;
  towerScrollY = key === 'Home' ? 0 : key === 'End' ? Number.MAX_SAFE_INTEGER :
    (towerScrollY ?? currentY) + (key.endsWith('Up') ? step : -step);
  return true;
}

/** Leave the locked view and restore the free town-view orbit camera. */
export function exitTowerLock(ctx: SceneContext, slots: TownFrameSlot[]): void {
  towerLock = null;
  resetTowerView();
  ctx.controls.enabled = true;
  const xs = slots.map((slot) => TOWER_SLOT_ORIGINS[slot.index].x);
  focusSunOn(ctx, xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0);
  townFrameKey = '';
  updateTownCam(ctx, slots);
}

/** Per-frame camera placement for the locked tower (call instead of controls.update()). */
export function updateTowerCam(ctx: SceneContext, floorCount: number, hosts = 0): void {
  if (!towerLock) return;
  const { origin } = towerLock;
  const { clientWidth: width, clientHeight: height } = ctx.renderer.domElement;
  const key = `${origin.x}:${origin.z}:${floorCount}:${hosts}:${towerScrollY}:${towerDetail}:${roomZoom}:${roomPanX}:${width}:${height}:${ctx.leftInset}`;
  if (key === towerFrameKey || width <= 0 || height <= 0) return;
  const bounds = roomZoom > 1 ? roomFrameBounds(origin, floorCount, towerScrollY, roomZoom, roomPanX) : towerFrameBounds(origin, floorCount, towerScrollY, towerDetail, hosts);
  if (towerScrollY !== null) towerScrollY = bounds.getCenter(new THREE.Vector3()).y;
  if (roomZoom > 1) roomPanX = bounds.getCenter(new THREE.Vector3()).x - origin.x;
  towerFrameKey = `${origin.x}:${origin.z}:${floorCount}:${hosts}:${towerScrollY}:${towerDetail}:${roomZoom}:${roomPanX}:${width}:${height}:${ctx.leftInset}`;
  placeFrame(ctx, bounds, TOWER_DIR, width, height, roomZoom > 1);
}
