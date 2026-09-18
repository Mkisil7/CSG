import * as THREE from 'three';
import { FLOOR_HEIGHT, TOWER_SLOT_ORIGINS } from './layout';
import { hostSceneryExtent } from './hostLayout';

export interface FrameInsets { left: number; right: number; top: number; bottom: number }
export interface TownFrameSlot { index: number; floors: number; hosts?: number }

/** Space occupied by the persistent controls, not transient inspector sheets. */
export function sceneInsets(width: number, height: number, journalWidth: number, exploring = false): FrameInsets {
  const landscape = height <= 550 && width > 640;
  return {
    left: Math.min(width * 0.4, Math.max(journalWidth, landscape ? 260 : 12)),
    right: 12,
    top: Math.min(height * 0.34, width <= 640 ? 256 : width < 1000 && !landscape ? 240 : 110),
    bottom: Math.min(height * 0.25, width <= 640 ? 128 : 80) + (exploring ? 88 : 0),
  };
}

/** An intentional crop of the tower, with bounded panning instead of drifting away.
 * Street host gardens belong to the full overview, not the room-detail fit. */
export function roomFrameBounds(origin: { x: number; z: number }, floors: number, requestedY: number | null, zoom: number, panX: number): THREE.Box3 {
  const scale = Number.isFinite(zoom) ? THREE.MathUtils.clamp(zoom, 1.5, 3) : 2.4;
  const full = towerFrameBounds(origin, floors, requestedY, true);
  const halfWidth = (full.max.x - full.min.x) / (2 * scale);
  const halfHeight = (full.max.y - full.min.y) / (2 * scale);
  const x = THREE.MathUtils.clamp(origin.x + (Number.isFinite(panX) ? panX : 1), full.min.x + halfWidth, full.max.x - halfWidth);
  const height = Math.max(1, floors) * FLOOR_HEIGHT + 5.2;
  const y = THREE.MathUtils.clamp(requestedY ?? full.getCenter(new THREE.Vector3()).y, halfHeight, height - halfHeight);
  return new THREE.Box3(new THREE.Vector3(x - halfWidth, y - halfHeight, full.min.z),
    new THREE.Vector3(x + halfWidth, y + halfHeight, full.max.z));
}

export function applyFrameInsets(camera: THREE.PerspectiveCamera, width: number, height: number, insets: FrameInsets): void {
  camera.aspect = width / height;
  camera.setViewOffset(width, height, (insets.right - insets.left) / 2, (insets.bottom - insets.top) / 2, width, height);
}

export function boxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  return [bounds.min.x, bounds.max.x].flatMap((x) => [bounds.min.y, bounds.max.y]
    .flatMap((y) => [bounds.min.z, bounds.max.z].map((z) => new THREE.Vector3(x, y, z))));
}

/** Exact perspective fit for all eight corners, including near-side depth. */
export function fitFrame(bounds: THREE.Box3, direction: THREE.Vector3, fov: number, width: number, height: number, insets: FrameInsets) {
  const target = bounds.getCenter(new THREE.Vector3());
  const forward = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const tanY = Math.tan(fov * Math.PI / 360) * Math.max(0.1, (height - insets.top - insets.bottom) / height);
  const tanX = Math.tan(fov * Math.PI / 360) * width / height * Math.max(0.1, (width - insets.left - insets.right) / width);
  let distance = 16;
  for (const corner of boxCorners(bounds)) {
    corner.sub(target);
    distance = Math.max(distance, corner.dot(forward) + Math.max(Math.abs(corner.dot(right)) / tanX, Math.abs(corner.dot(up)) / tanY) * 1.06);
  }
  return { target, distance, position: target.clone().addScaledVector(forward, distance) };
}

/** Small towers fit in full; tall towers retain a readable, scrollable window. */
export function towerFrameBounds(origin: { x: number; z: number }, floors: number, requestedY: number | null, detail = false, hosts = 0): THREE.Box3 {
  const height = Math.max(1, floors) * FLOOR_HEIGHT + 5.2; // earned crown and roof furniture
  const visibleHeight = Math.min(height, detail ? 9 : 29.2);
  const centerY = THREE.MathUtils.clamp(requestedY ?? visibleHeight / 2, visibleHeight / 2, height - visibleHeight / 2);
  const scenery = hostSceneryExtent(hosts);
  return new THREE.Box3(new THREE.Vector3(origin.x - 11, centerY - visibleHeight / 2, origin.z + Math.min(-4, scenery.back)),
    new THREE.Vector3(origin.x + scenery.right, centerY + visibleHeight / 2, origin.z + 6.5));
}

/** Includes real towers, public parks and exactly the next purchasable lot. */
export function townFrameBounds(slots: TownFrameSlot[], includeNext = true): THREE.Box3 {
  const valid = slots.filter((slot) => TOWER_SLOT_ORIGINS[slot.index]);
  const next = Math.max(-1, ...valid.map((slot) => slot.index)) + 1;
  const shown = [...valid];
  if ((includeNext || shown.length === 0) && next < TOWER_SLOT_ORIGINS.length) shown.push({ index: next, floors: 0 });
  const bounds = new THREE.Box3();
  for (const slot of shown) {
    const origin = TOWER_SLOT_ORIGINS[slot.index];
    const scenery = hostSceneryExtent(slot.hosts ?? 0);
    bounds.expandByPoint(new THREE.Vector3(origin.x - 13, 0, origin.z + Math.min(-7, scenery.back)));
    bounds.expandByPoint(new THREE.Vector3(origin.x + scenery.right, slot.floors > 0 ? slot.floors * FLOOR_HEIGHT + 5.2 : 6, origin.z + 15));
  }
  return bounds;
}
