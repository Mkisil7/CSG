import * as THREE from 'three';
import { fitFrame, townFrameBounds, type TownFrameSlot } from './framing';
import { renderScene, type SceneContext } from './scene';

export const POSTCARD_SCENE = { width: 1504, height: 730 };

/** A reproducible full skyline, independent of device, UI insets and selection. */
export function postcardCamera(slots: TownFrameSlot[]): THREE.PerspectiveCamera {
  const { width, height } = POSTCARD_SCENE;
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
  const frame = fitFrame(townFrameBounds(slots, false), new THREE.Vector3(0.16, 0.2, 1),
    camera.fov, width, height, { left: 28, right: 28, top: 28, bottom: 28 });
  camera.position.copy(frame.position); camera.lookAt(frame.target);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Synchronous capture: restore every temporary render change, even on failure.
 * Reuse the existing WebGL context and bloom chain instead of creating another.
 */
export function capturePostcard<T>(ctx: SceneContext, slots: TownFrameSlot[], copy: (source: HTMLCanvasElement) => T,
  presentation?: { overview: () => void; restore: () => void }): T {
  const camera = ctx.camera.clone(), size = ctx.renderer.getSize(new THREE.Vector2());
  const pixelRatio = ctx.renderer.getPixelRatio();
  const skyPosition = ctx.sky.group.position.clone();
  const fog = ctx.scene.fog instanceof THREE.Fog ? { near: ctx.scene.fog.near, far: ctx.scene.fog.far } : null;
  const hidden: THREE.Object3D[] = [];
  const included = new Set(slots.map((slot) => slot.index));
  ctx.scene.traverse((object) => {
    if (object.visible && object.userData.pickable === 'slot' && !included.has(object.userData.slotIndex)) hidden.push(object);
  });
  try {
    presentation?.overview();
    hidden.forEach((object) => { object.visible = false; });
    ctx.camera.copy(postcardCamera(slots));
    ctx.sky.group.position.copy(ctx.camera.position);
    const distance = ctx.camera.position.distanceTo(townFrameBounds(slots, false).getCenter(new THREE.Vector3()));
    if (ctx.scene.fog instanceof THREE.Fog) { ctx.scene.fog.near = Math.max(190, distance * 0.9); ctx.scene.fog.far = Math.max(460, distance + 300); }
    ctx.renderer.setPixelRatio(1);
    ctx.renderer.setSize(POSTCARD_SCENE.width, POSTCARD_SCENE.height, false);
    ctx.composer.setPixelRatio(1);
    ctx.composer.setSize(POSTCARD_SCENE.width, POSTCARD_SCENE.height);
    ctx.composer.render();
    return copy(ctx.renderer.domElement);
  } finally {
    hidden.forEach((object) => { object.visible = true; });
    ctx.camera.copy(camera);
    ctx.sky.group.position.copy(skyPosition);
    ctx.renderer.setPixelRatio(pixelRatio); ctx.renderer.setSize(size.x, size.y, false);
    ctx.composer.setPixelRatio(pixelRatio); ctx.composer.setSize(size.x, size.y);
    presentation?.restore();
    // Restore the visible frame synchronously; capture must never move the player.
    renderScene(ctx);
    if (fog && ctx.scene.fog instanceof THREE.Fog) { ctx.scene.fog.near = fog.near; ctx.scene.fog.far = fog.far; }
  }
}
