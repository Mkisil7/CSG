import * as THREE from 'three';
import type { Town } from '../core/town';
import { FLOOR_HEIGHT, TOWER_SLOT_ORIGINS } from './layout';
import { visualDelta } from './motion';

/** Bounded weather particles, street snow and lit wet-street reflections.
 * Roof snow belongs to FloorViews so it follows construction and style rebuilds.
 * The sim owns weather and surfaces; this layer only interpolates their appearance. */
export class WeatherViews {
  cloudCover = 0;
  private rain: THREE.LineSegments;
  private flakes: THREE.Points;
  private rainMat = new THREE.LineBasicMaterial({ color: 0xbfd9ef, transparent: true, opacity: 0.28, depthWrite: false });
  private flakeMat: THREE.ShaderMaterial;
  private count: number;
  private particles: Float32Array;
  private lines: Float32Array;
  private elapsed = 0;
  private particlesReady = false;
  private initialized = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private streets = new Map<string, { snow: THREE.Mesh; wet: THREE.Mesh; glints: THREE.Mesh[] }>();
  private snowMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.94 });
  private wetMaterial = new THREE.MeshStandardMaterial({ color: 0x596979, roughness: 0.16, metalness: 0.15, transparent: true, opacity: 0, depthWrite: false });
  private box = new THREE.BoxGeometry(1, 1, 1);
  private plane = new THREE.PlaneGeometry(1, 1);

  constructor(private scene: THREE.Scene, coarse: boolean) {
    this.count = coarse ? 260 : 700;
    this.particles = new Float32Array(this.count * 3);
    this.lines = new Float32Array(this.count * 6);
    this.particles.fill(-1000);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.lines, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(geometry, this.rainMat);
    this.rain.name = 'weather-rain';
    this.rain.frustumCulled = false;
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(this.particles, 3).setUsage(THREE.DynamicDrawUsage));
    this.flakeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { opacity: { value: 0.8 }, scale: { value: 1 } },
      vertexShader: `uniform float scale; void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_PointSize = clamp(scale / -p.z, 1.5, 5.0); }`,
      fragmentShader: `uniform float opacity; void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.93, 0.97, 1.0, (1.0 - smoothstep(0.1, 0.5, r)) * opacity); }`,
    });
    this.flakes = new THREE.Points(snowGeometry, this.flakeMat);
    this.flakes.name = 'weather-snow';
    this.flakes.frustumCulled = false;
    scene.add(this.rain, this.flakes);
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { this.reducedMotion = e.matches; });
  }

  update(town: Town, focus: THREE.Vector3, daylight: number, dt: number, wide: boolean): void {
    const { kind, wetness, snow } = town.weather;
    dt = visualDelta(dt);
    this.elapsed += this.reducedMotion ? 0 : dt;
    const cover = kind === 'clear' ? 0 : kind === 'snow' ? 0.6 : 0.85;
    if (!this.initialized || this.reducedMotion) this.cloudCover = cover;
    else this.cloudCover += (cover - this.cloudCover) * (1 - Math.exp(-dt / 2));
    this.initialized = true;
    this.rain.visible = kind === 'rain' && !this.reducedMotion;
    this.flakes.visible = kind === 'snow' && !this.reducedMotion;
    this.rainMat.opacity = 0.16 + daylight * 0.17;
    this.flakeMat.uniforms.scale.value = window.innerHeight * 0.18;
    this.wetMaterial.opacity = wetness * 0.43;

    town.slots.forEach((slot, i) => {
      if (!slot.unlocked) return;
      const origin = TOWER_SLOT_ORIGINS[i];
      if (!this.streets.has(slot.id)) {
        const snowMesh = new THREE.Mesh(this.box, this.snowMaterial);
        snowMesh.name = `street-snow:${slot.id}`;
        snowMesh.position.set(origin.x, 0.18, 8.5); snowMesh.scale.set(33.8, 0.05, 3.8);
        snowMesh.receiveShadow = true;
        const wet = new THREE.Mesh(this.plane, this.wetMaterial);
        wet.name = `street-wet:${slot.id}`;
        wet.rotation.x = -Math.PI / 2; wet.position.set(origin.x, 0.128, 8.5); wet.scale.set(34, 4, 1);
        wet.receiveShadow = true;
        const glints = [0, 1, 2].map((j) => {
          const reflection = new THREE.Mesh(this.plane, reflectionMaterial(j));
          reflection.name = `street-reflection:${slot.id}:${j}`;
          reflection.rotation.x = -Math.PI / 2;
          reflection.position.set(origin.x - 4 + j * 5, 0.132, 8.5);
          reflection.scale.set(3.5, 3.9, 1);
          this.scene.add(reflection); return reflection;
        });
        this.scene.add(snowMesh, wet);
        this.streets.set(slot.id, { snow: snowMesh, wet, glints });
      }
      const street = this.streets.get(slot.id)!;
      street.snow.visible = snow > 0.025;
      street.snow.scale.y = 0.015 + snow * 0.14;
      street.snow.position.y = 0.13 + street.snow.scale.y / 2;
      // Snow accumulates along the edges first, leaving the center walkable.
      street.snow.scale.z = 0.12 + snow * 1.05;
      street.snow.position.z = 10.0;
      const businesses = slot.game?.tower.floors.filter((f) => slot.game!.staffedLevels.has(f.level)) ?? [];
      street.glints.forEach((glint, j) => {
        const material = glint.material as THREE.ShaderMaterial;
        material.uniforms.time.value = this.elapsed;
        material.uniforms.opacity.value = wetness * (1 - daylight * 0.9) * (1 - snow);
        glint.visible = wetness > 0.01 && (j === 0 || businesses.length >= j);
        material.uniforms.tint.value.set(j === 0 ? 0xffc686 : businesses[j - 1]?.type === 'restaurant' ? 0xff7895 : 0x79cbd9);
      });
    });

    if (!this.rain.visible && !this.flakes.visible) return;
    // A paused camera move must not recycle rain/snow into different positions.
    // The initial frame still receives a static precipitation field.
    if (dt === 0 && this.particlesReady) return;
    this.particlesReady = true;
    const radius = wide ? 100 : 24;
    const ceiling = Math.max(32, focus.y + 24);
    for (let i = 0; i < this.count; i++) {
      const p = i * 3;
      let x = this.particles[p], y = this.particles[p + 1], z = this.particles[p + 2];
      y -= dt * (kind === 'rain' ? 32 : 2.4 + i % 3 * 0.45);
      x += dt * (kind === 'rain' ? -3 : Math.sin(this.elapsed + i) * 0.8);
      let surface = 0.1;
      for (const slot of town.slots) {
        if (!slot.game || !slot.unlocked) continue;
        const origin = TOWER_SLOT_ORIGINS[Number(slot.id.slice(1))];
        if (z > -3.4 && z < 3.4 && x > origin.x - 10 && x < origin.x + 12) surface = slot.game.tower.floors.length * FLOOR_HEIGHT + 0.4;
      }
      if (y < surface || y > ceiling || Math.abs(x - focus.x) > radius || z < -8 || z > 19) {
        x = focus.x + (Math.random() * 2 - 1) * radius;
        y = Math.random() * ceiling;
        z = -8 + Math.random() * 27;
        // Do not spawn precipitation inside a dollhouse room.
        if (z > -3.5 && z < 3.5) z = 4 + Math.random() * 15;
      }
      this.particles[p] = x; this.particles[p + 1] = y; this.particles[p + 2] = z;
      const l = i * 6;
      this.lines[l] = x; this.lines[l + 1] = y; this.lines[l + 2] = z;
      this.lines[l + 3] = x + 0.09; this.lines[l + 4] = y + 0.9; this.lines[l + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.flakes.geometry.attributes.position.needsUpdate = true;
  }
}

function reflectionMaterial(phase: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, opacity: { value: 0 }, tint: { value: new THREE.Color(0xffc686) }, phase: { value: phase } },
    vertexShader: `varying vec2 uvP; void main() { uvP = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 uvP; uniform float time, opacity, phase; uniform vec3 tint;
      void main() {
        float ripple = sin(uvP.y * 82.0 + time * 1.7 + phase) * 0.055 + sin(uvP.y * 39.0 - time) * 0.035;
        float width = 0.14 + uvP.y * 0.21;
        float streak = 1.0 - smoothstep(width * 0.2, width, abs(uvP.x - 0.5 + ripple));
        float end = smoothstep(0.0, 0.18, uvP.y) * (1.0 - smoothstep(0.72, 1.0, uvP.y));
        float broken = 0.5 + 0.5 * sin(uvP.y * 165.0 + ripple * 15.0);
        gl_FragColor = vec4(tint, streak * end * broken * opacity * 0.58);
      }`,
  });
}
