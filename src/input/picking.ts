import * as THREE from 'three';

export type PickResult =
  | { kind: 'floor'; towerId: string; floorLevel: number }
  | { kind: 'resident'; towerId: string; residentId: string }
  | { kind: 'slot'; slotIndex: number }
  | null;

const MAX_CLICK_DELTA_PX = 6;
const MAX_CLICK_MS = 350;

/**
 * Click/tap picking that coexists with OrbitControls: a "click" only counts
 * when the pointer barely moved between down and up, so camera drags never
 * trigger selection. Works identically for mouse and touch (Pointer Events).
 */
export class PickingController {
  private raycaster = new THREE.Raycaster();
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private downValid = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly targets: () => THREE.Object3D[],
    private readonly onPick: (result: PickResult) => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.downTime = performance.now();
      this.downValid = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.downValid) return;
      this.downValid = false;
      const delta = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      const elapsed = performance.now() - this.downTime;
      if (delta > MAX_CLICK_DELTA_PX || elapsed > MAX_CLICK_MS) return;
      this.pick(e.clientX, e.clientY);
    });
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets(), true);

    for (const hit of hits) {
      // The raycaster returns leaf meshes; walk up to the tagged group.
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        const data = obj.userData;
        if (data?.pickable === 'resident') {
          this.onPick({ kind: 'resident', towerId: data.towerId, residentId: data.residentId });
          return;
        }
        if (data?.pickable === 'floor') {
          this.onPick({ kind: 'floor', towerId: data.towerId, floorLevel: data.floorLevel });
          return;
        }
        if (data?.pickable === 'slot') {
          this.onPick({ kind: 'slot', slotIndex: data.slotIndex });
          return;
        }
        obj = obj.parent;
      }
    }
    this.onPick(null);
  }
}
