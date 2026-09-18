import * as THREE from 'three';
import type { Game } from '../core/game';
import { floorY, ROOM_LEFT } from './layout';

/** Small readable queue signs appear only where somebody is actually waiting. */
export class QueueViews {
  private group = new THREE.Group();
  private badges = new Map<number, { sprite: THREE.Sprite; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture; key: string }>();

  constructor(parent: THREE.Object3D, origin: { x: number; z: number }) {
    this.group.position.set(origin.x, 0, origin.z);
    parent.add(this.group);
  }

  sync(game: Game, now: number, isFloorReady: (level: number) => boolean = () => true): void {
    const queues = new Map<number, { count: number; longest: number }>();
    for (const shaft of game.shafts()) for (const [floor, riders] of shaft.queues) {
      const q = queues.get(floor) ?? { count: 0, longest: 0 };
      q.count += riders.length;
      q.longest = Math.max(q.longest, ...riders.map((r) => Math.max(0, now - r.enqueuedAt)));
      queues.set(floor, q);
    }
    for (const [floor, badge] of this.badges) badge.sprite.visible = queues.has(floor) && isFloorReady(floor);
    for (const [floor, queue] of queues) {
      if (!queue.count) continue;
      let badge = this.badges.get(floor);
      if (!badge) {
        const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 72;
        const context = canvas.getContext('2d')!;
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false }));
        sprite.scale.set(3.5, 0.66, 1); sprite.position.set(ROOM_LEFT + 2.1, floorY(floor) + 1.95, 3.65);
        sprite.renderOrder = 10;
        this.group.add(sprite);
        badge = { sprite, context, texture, key: '' };
        this.badges.set(floor, badge);
      }
      badge.sprite.visible = isFloorReady(floor);
      const minutes = Math.floor(queue.longest);
      const key = `${queue.count}:${minutes}`;
      if (key === badge.key) continue;
      badge.key = key;
      const ctx = badge.context;
      ctx.clearRect(0, 0, 384, 72);
      ctx.fillStyle = minutes > 20 ? '#93462e' : '#254d48'; ctx.fillRect(0, 0, 384, 72);
      ctx.fillStyle = '#fff5e2'; ctx.font = '26px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${queue.count} waiting · ${minutes} min`, 192, 46);
      badge.texture.needsUpdate = true;
    }
  }
}
