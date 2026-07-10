import * as THREE from 'three';
import { Town } from '../core/town';
import { TOWN } from '../core/types';
import { ROOM_DEPTH, TOWER_SLOT_ORIGINS } from './layout';

const PAD_LOCKED = new THREE.MeshLambertMaterial({ color: 0xcbbfa3 });
const PAD_UNLOCKED = new THREE.MeshLambertMaterial({ color: 0xbfb49b });
const SIGN_POST = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
const SIGN_PANEL = new THREE.MeshLambertMaterial({ color: 0xf7e3b0 });

/**
 * Ground pads for each tower slot. Locked slots show a "for sale" sign and are
 * clickable to open the purchase panel; unlocked slots keep a subtle base pad.
 */
export class PlotViews {
  private pads: THREE.Group[] = [];
  private wasUnlocked: boolean[] = [];

  constructor(private readonly scene: THREE.Scene) {
    TOWER_SLOT_ORIGINS.forEach((origin, i) => {
      const pad = new THREE.Group();
      pad.position.set(origin.x, 0, origin.z);

      const base = new THREE.Mesh(new THREE.BoxGeometry(24, 0.24, ROOM_DEPTH + 8), PAD_LOCKED);
      base.position.y = 0.12;
      base.receiveShadow = true;
      base.name = 'pad-base';
      pad.add(base);

      const sign = new THREE.Group();
      sign.name = 'sale-sign';
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), SIGN_POST);
      post.position.y = 1.1;
      post.castShadow = true;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 0.16), SIGN_PANEL);
      panel.position.y = 2.4;
      panel.castShadow = true;
      sign.add(post, panel);
      pad.add(sign);

      pad.userData = { pickable: 'slot', slotIndex: i };
      this.pads.push(pad);
      this.wasUnlocked.push(false);
      this.scene.add(pad);
    });
  }

  sync(town: Town): void {
    town.slots.forEach((slot, i) => {
      const pad = this.pads[i];
      const sign = pad.getObjectByName('sale-sign');
      const base = pad.getObjectByName('pad-base') as THREE.Mesh;
      if (slot.unlocked && !this.wasUnlocked[i]) {
        this.wasUnlocked[i] = true;
        if (sign) sign.visible = false;
        base.material = PAD_UNLOCKED;
      }
      // Hide pads for slots beyond what's purchasable yet (visual clutter control):
      // all slots stay visible — the sign communicates "buy me".
      void TOWN;
    });
  }

  pickTargets(): THREE.Object3D[] {
    return this.pads;
  }
}
