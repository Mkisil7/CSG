import * as THREE from 'three';

const MAX_BURSTS = 4;
const SPARKS = 56;
const TRAIL_SAMPLES = 4;
const ROCKET_SAMPLES = 9;
const DRAG = 0.65;
const GRAVITY = 2.2;
const COLORS = [0xffd58b, 0xf59c8b, 0x9edcca, 0xaccbf3, 0xd8b8ed];

type SparkPoints = THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
interface Burst {
  rocket: SparkPoints;
  sparks: SparkPoints;
  velocities: Float32Array;
  age: number;
  launchDuration: number;
  burstDuration: number;
  x: number;
  y: number;
  z: number;
  launchY: number;
  drift: number;
  active: boolean;
}

/** One shared soft disc: a point has no square corners, even when zoomed in. */
function sparkTexture(): THREE.DataTexture {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      const offset = (y * size + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 255;
      data[offset + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - radius * radius), 2));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Quiet, pooled skyline celebrations. Visual seconds do not accelerate at 4×. */
export class Fireworks {
  private readonly texture = sparkTexture();
  private readonly bursts: Burst[] = [];
  private readonly preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private cooldown = 0.6;
  private disposed = false;
  private readonly onMotionChange = () => {
    if (this.preference.matches) this.clear();
  };

  constructor(private scene: THREE.Scene, private random: () => number = Math.random) {
    this.preference.addEventListener('change', this.onMotionChange);
    for (let i = 0; i < MAX_BURSTS; i++) {
      this.bursts.push({
        rocket: this.makePoints(`firework-rocket:${i}`, 1, ROCKET_SAMPLES, 4.5),
        sparks: this.makePoints(`firework-burst:${i}`, SPARKS, TRAIL_SAMPLES, 4),
        velocities: new Float32Array(SPARKS * 3),
        age: 0, launchDuration: 1, burstDuration: 2,
        x: 0, y: 0, z: 0, launchY: 0, drift: 0, active: false,
      });
    }
  }

  private makePoints(name: string, count: number, samples: number, size: number): SparkPoints {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * samples * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const colors = new Float32Array(count * samples * 3);
    for (let i = 0; i < count * samples; i++) {
      const brightness = Math.pow(1 - (i % samples) / samples, 2.5);
      colors.fill(brightness, i * 3, i * 3 + 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: this.texture, size, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    points.name = name;
    points.visible = false;
    points.frustumCulled = false;
    this.scene.add(points);
    return points;
  }

  private launch(centerX: number, roofHeight: number): void {
    const burst = this.bursts.find((candidate) => !candidate.active);
    if (!burst) return;
    burst.x = centerX + (this.random() - 0.5) * 28;
    burst.y = roofHeight + 10 + this.random() * 9;
    // All sparks stay behind the cutaway rooms, not between the camera and people.
    burst.z = -20 - this.random() * 6;
    burst.launchY = Math.max(3, roofHeight - 6);
    burst.drift = (this.random() - 0.5) * 3;
    burst.launchDuration = 0.85 + this.random() * 0.3;
    burst.burstDuration = 2 + this.random() * 0.5;
    burst.age = 0;
    burst.active = true;
    burst.sparks.visible = false;
    burst.rocket.material.color.setHex(0xffdca0);
    burst.sparks.material.color.setHex(COLORS[Math.floor(this.random() * COLORS.length)]);
    for (let i = 0; i < SPARKS; i++) {
      // Evenly spread directions, with small seeded irregularities and varied reach.
      const vertical = 1 - 2 * (i + 0.5) / SPARKS;
      const angle = i * Math.PI * (3 - Math.sqrt(5)) + this.random() * 0.18;
      const speed = 4.2 + this.random() * 2.5;
      const radial = Math.sqrt(1 - vertical * vertical);
      burst.velocities[i * 3] = Math.cos(angle) * radial * speed;
      burst.velocities[i * 3 + 1] = vertical * speed;
      burst.velocities[i * 3 + 2] = Math.sin(angle) * radial * speed * 0.5;
    }
  }

  private draw(burst: Burst, night: number): void {
    if (burst.age < burst.launchDuration) {
      burst.rocket.visible = true;
      const positions = burst.rocket.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let sample = 0; sample < ROCKET_SAMPLES; sample++) {
        const t = Math.max(0, (burst.age - sample * 0.018) / burst.launchDuration);
        const ascent = 1 - (1 - t) * (1 - t);
        positions.setXYZ(sample, burst.x - burst.drift * (1 - t), burst.launchY + (burst.y - burst.launchY) * ascent, burst.z);
      }
      positions.needsUpdate = true;
      burst.rocket.material.opacity = Math.min(1, burst.age / 0.12) * night * 0.9;
      return;
    }
    burst.rocket.visible = false;
    burst.sparks.visible = true;
    const elapsed = burst.age - burst.launchDuration;
    const positions = burst.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SPARKS; i++) {
      for (let sample = 0; sample < TRAIL_SAMPLES; sample++) {
        // Analytic trajectories keep the curve independent of display frame rate.
        // Tail samples grow with the burst, avoiding a bright stack at its origin.
        const t = elapsed * (1 - sample * 0.065);
        const reach = (1 - Math.exp(-DRAG * t)) / DRAG;
        positions.setXYZ(i * TRAIL_SAMPLES + sample,
          burst.x + burst.velocities[i * 3] * reach,
          burst.y + burst.velocities[i * 3 + 1] * reach - 0.5 * GRAVITY * t * t,
          burst.z + burst.velocities[i * 3 + 2] * reach);
      }
    }
    positions.needsUpdate = true;
    const fadeIn = Math.min(1, elapsed / 0.18);
    const fadeOut = Math.pow(Math.max(0, 1 - elapsed / burst.burstDuration), 1.15);
    burst.sparks.material.opacity = fadeIn * fadeOut * night;
  }

  private clear(): void {
    for (const burst of this.bursts) {
      burst.active = false;
      burst.rocket.visible = burst.sparks.visible = false;
    }
    this.cooldown = 0.6;
  }

  /** Pass dt=0 when paused. Existing bursts finish when a festival ends. */
  update(active: boolean, night: number, centerX: number, dt: number, roofHeight = 24): void {
    if (this.disposed) return;
    night = Number.isFinite(night) ? Math.max(0, Math.min(1, night)) : 0;
    if (this.preference.matches || night <= 0.45) { this.clear(); return; }
    if (!Number.isFinite(dt) || dt <= 0) return;
    // A background-tab gap must never become a catch-up barrage.
    dt = Math.min(0.1, dt);
    if (active) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && Number.isFinite(centerX) && Number.isFinite(roofHeight)) {
        this.launch(centerX, Math.max(0, roofHeight));
        this.cooldown = 2.1 + this.random() * 1.3;
      }
    } else {
      this.cooldown = 0.6;
    }
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.age += dt;
      if (burst.age >= burst.launchDuration + burst.burstDuration) {
        burst.active = false;
        burst.rocket.visible = burst.sparks.visible = false;
      } else {
        this.draw(burst, night);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.preference.removeEventListener('change', this.onMotionChange);
    this.clear();
    for (const burst of this.bursts) {
      for (const points of [burst.rocket, burst.sparks]) {
        this.scene.remove(points);
        points.geometry.dispose();
        points.material.dispose();
      }
    }
    this.texture.dispose();
  }
}
