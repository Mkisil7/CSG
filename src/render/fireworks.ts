import * as THREE from 'three';

/**
 * Celebratory fireworks that burst over the skyline while a festive City Event
 * (a Street Festival or grand-opening buzz) is running after dark. Each burst is
 * a short-lived cloud of additive points that rockets up, explodes, and drifts
 * down under gravity — bloom makes them pop. Pure eye-candy, pooled so it never
 * allocates during play.
 */

const MAX_BURSTS = 6;
const PARTICLES_PER_BURST = 44;
const GRAVITY = -9;
const BURST_COLORS = [0xffd166, 0xef476f, 0x06d6a0, 0x8ecae6, 0xf78c6b, 0xc792ea];

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number; // seconds remaining
  maxLife: number;
  active: boolean;
}

export class Fireworks {
  private bursts: Burst[] = [];
  private cooldown = 0;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < MAX_BURSTS; i++) this.bursts.push(this.makeBurst());
  }

  private makeBurst(): Burst {
    const positions = new Float32Array(PARTICLES_PER_BURST * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, velocities: new Float32Array(PARTICLES_PER_BURST * 3), life: 0, maxLife: 1, active: false };
  }

  private ignite(x: number): void {
    const burst = this.bursts.find((b) => !b.active);
    if (!burst) return;
    const cx = x + (Math.random() - 0.5) * 20;
    const cy = 26 + Math.random() * 22;
    const cz = (Math.random() - 0.5) * 20;
    const pos = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      pos.setXYZ(i, cx, cy, cz);
      // Random direction on a sphere, varied speed → a round burst.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 5 + Math.random() * 7;
      burst.velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      burst.velocities[i * 3 + 1] = Math.cos(phi) * speed;
      burst.velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
    }
    pos.needsUpdate = true;
    (burst.points.material as THREE.PointsMaterial).color.setHex(
      BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
    );
    burst.maxLife = 1.4 + Math.random() * 0.7;
    burst.life = burst.maxLife;
    burst.active = true;
    burst.points.visible = true;
  }

  /**
   * @param active  whether a festive event is running.
   * @param night   0..1 darkness (fireworks only after dusk).
   * @param centerX world-x of the town centre to burst above.
   * @param dt      real seconds since last frame.
   */
  update(active: boolean, night: number, centerX: number, dt: number): void {
    if (active && night > 0.45) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.ignite(centerX);
        this.cooldown = 0.5 + Math.random() * 1.1;
      }
    }

    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.life -= dt;
      if (burst.life <= 0) {
        burst.active = false;
        burst.points.visible = false;
        continue;
      }
      const pos = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < PARTICLES_PER_BURST; i++) {
        burst.velocities[i * 3 + 1] += GRAVITY * dt;
        arr[i * 3] += burst.velocities[i * 3] * dt;
        arr[i * 3 + 1] += burst.velocities[i * 3 + 1] * dt;
        arr[i * 3 + 2] += burst.velocities[i * 3 + 2] * dt;
      }
      pos.needsUpdate = true;
      const t = burst.life / burst.maxLife;
      (burst.points.material as THREE.PointsMaterial).opacity = Math.min(1, t * 1.6) * night;
    }
  }
}
