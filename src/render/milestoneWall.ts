import * as THREE from 'three';
import { MILESTONE_COLORS, MILESTONE_TILES, earnedMilestoneTiles } from '../core/milestoneWall';

/** Small glazed enamel tiles in a brass-edged community display. A single
 * instanced mesh grows from the saved mission set, with no particles or lights. */
export class MilestoneWall extends THREE.Group {
  readonly tiles: THREE.InstancedMesh;
  private key = '';
  private readonly glaze: THREE.MeshStandardMaterial;

  constructor() {
    // Below the front slab's sightline, not just inside the rear wall bounds.
    super(); this.name = 'town-story-wall'; this.position.set(4.85, 1.25, -2.55);
    const frame = new THREE.MeshStandardMaterial({ color: 0xb69d72, metalness: 0.25, roughness: 0.55 });
    const backing = new THREE.MeshStandardMaterial({ color: 0x374d49, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.65, 1.5, 0.09), frame); base.receiveShadow = true; this.add(base);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.49, 1.34, 0.035), backing); panel.position.z = 0.065; panel.receiveShadow = true; this.add(panel);
    this.glaze = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.08, emissive: 0xffd8a8, emissiveIntensity: 0 });
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.193, 0.112, 0.04), this.glaze, MILESTONE_TILES.length);
    this.tiles.name = 'earned-milestone-tiles'; this.tiles.count = 0; this.tiles.receiveShadow = true; this.add(this.tiles);
  }

  sync(completed: ReadonlySet<string>): void {
    const earned = earnedMilestoneTiles(completed), key = earned.map(tile => tile.id).join('|');
    if (key === this.key) return;
    this.key = key;
    const columns = 15, rows = Math.ceil(MILESTONE_TILES.length / columns);
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    earned.forEach((tile, instance) => {
      // Fit future catalog growth within the same architectural panel.
      const step = Math.min(0.148, 1.18 / rows);
      matrix.makeScale(1, Math.min(1, step / 0.148), 1);
      matrix.setPosition((tile.index % columns - 7) * 0.22, (Math.floor(tile.index / columns) - (rows - 1) / 2) * step, 0.107);
      this.tiles.setMatrixAt(instance, matrix);
      this.tiles.setColorAt(instance, color.setHex(MILESTONE_COLORS[tile.family].color));
    });
    this.tiles.count = earned.length; this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.tiles.computeBoundingBox(); this.tiles.computeBoundingSphere();
  }

  updateLighting(daylight: number): void {
    const day = Number.isFinite(daylight) ? Math.max(0, Math.min(1, daylight)) : 1;
    this.glaze.emissiveIntensity = (1 - day) * 0.1;
  }
}
