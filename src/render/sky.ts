import * as THREE from 'three';

/**
 * A painterly sky: a gradient dome that shifts dawn → day → dusk → night, a sun
 * and moon that arc overhead with the clock, and a field of stars that fades in
 * after dark. All of it is emissive/unlit and fog-exempt so it reads as real sky
 * and lights up under bloom. Purely cosmetic — no gameplay coupling.
 */

const DOME_RADIUS = 460;

// Horizon (bottom) and zenith (top) colours for the key times of day.
const DAY_TOP = new THREE.Color(0x5fa8e6);
const DAY_BOTTOM = new THREE.Color(0xcdeaf6);
const DUSK_TOP = new THREE.Color(0x3a4d8f);
const DUSK_BOTTOM = new THREE.Color(0xf2a56b);
const NIGHT_TOP = new THREE.Color(0x0b1030);
const NIGHT_BOTTOM = new THREE.Color(0x28305c);

const SUN_COLOR = new THREE.Color(0xfff2c4);
const MOON_COLOR = new THREE.Color(0xdfe6ff);

const tmpTop = new THREE.Color();
const tmpBottom = new THREE.Color();

export class Sky {
  readonly group = new THREE.Group();
  private domeMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private sunMat: THREE.MeshBasicMaterial;
  private moonMat: THREE.MeshBasicMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;

  constructor(scene: THREE.Scene) {
    // --- gradient dome ---
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: DAY_TOP.clone() },
        bottom: { value: DAY_BOTTOM.clone() },
        exponent: { value: 0.9 },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        uniform float exponent;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, pow(h, exponent)), 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), this.domeMat);
    dome.renderOrder = -1;
    this.group.add(dome);

    // --- sun & moon ---
    this.sunMat = new THREE.MeshBasicMaterial({ color: SUN_COLOR, fog: false });
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 24), this.sunMat);
    this.moonMat = new THREE.MeshBasicMaterial({ color: MOON_COLOR, fog: false });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 24), this.moonMat);
    this.group.add(this.sun, this.moon);

    // --- stars (upper hemisphere) ---
    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Even-ish spread over the dome, biased above the horizon.
      const u = Math.random();
      const v = Math.random() * 0.85 + 0.1;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(v); // 0 at zenith
      const r = DOME_RADIUS * 0.92;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.group.add(this.stars);

    scene.add(this.group);
  }

  /**
   * @param daylight  0 (deep night) → 1 (midday) scalar.
   * @param dayFrac   0 → 1 fraction through the 24h day (drives sun/moon arc).
   * @param center    world-x to keep the dome/celestials centred on the camera area.
   */
  update(daylight: number, dayFrac: number, centerX: number): void {
    this.group.position.x = centerX;

    // Dome colours: blend night → dusk → day. Dusk peaks at the twilight band.
    const dusk = Math.max(0, 1 - Math.abs(daylight - 0.5) / 0.5) * (1 - daylight * 0.4);
    tmpTop.copy(NIGHT_TOP).lerp(DAY_TOP, daylight).lerp(DUSK_TOP, dusk * 0.6);
    tmpBottom.copy(NIGHT_BOTTOM).lerp(DAY_BOTTOM, daylight).lerp(DUSK_BOTTOM, dusk * 0.7);
    (this.domeMat.uniforms.top.value as THREE.Color).copy(tmpTop);
    (this.domeMat.uniforms.bottom.value as THREE.Color).copy(tmpBottom);

    // Sun/moon arc: noon (dayFrac 0.5) overhead, rising east / setting west.
    const sunAngle = (dayFrac - 0.25) * Math.PI * 2; // 0 at 06:00 (horizon east)
    const R = DOME_RADIUS * 0.8;
    this.sun.position.set(Math.cos(sunAngle) * R, Math.sin(sunAngle) * R, -80);
    this.moon.position.set(-Math.cos(sunAngle) * R, -Math.sin(sunAngle) * R, -80);
    this.sun.visible = this.sun.position.y > -30;
    this.moon.visible = this.moon.position.y > -30;
    // Brighten the sun by day, the moon by night (bloom does the rest).
    this.sunMat.color.copy(SUN_COLOR).multiplyScalar(0.5 + 0.9 * daylight);
    this.moonMat.color.copy(MOON_COLOR).multiplyScalar(0.5 + 0.7 * (1 - daylight));

    // Stars fade in through dusk into night.
    this.starMat.opacity = Math.max(0, 1 - daylight * 1.6);
  }
}
