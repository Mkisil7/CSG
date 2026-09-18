import * as THREE from 'three';

/** A small baked indirect-light field for the shell's existing UVs. Native
 * lightMap shading retains the painted wall color and adds no lights, meshes,
 * animation or shadow passes. Each wall owns its texture for normal disposal. */
export function roomWallLightMap(residential: boolean): THREE.DataTexture {
  const width = 64, height = 32, pixels = new Uint8Array(width * height * 4);
  const warm = new THREE.Color(residential ? 0xffce98 : 0xffdda9);
  const sourceHeight = residential ? 0.34 : 0.82;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + 0.5) / width, v = (y + 0.5) / height;
    const pool = (center: number) => Math.exp(-(((u - center) / 0.24) ** 2) - ((v - sourceHeight) / 0.6) ** 2);
    const intensity = Math.min(1, 0.10 + 0.74 * (pool(0.25) + pool(0.75)));
    const offset = (y * width + x) * 4;
    pixels[offset] = Math.round(warm.r * intensity * 255);
    pixels[offset + 1] = Math.round(warm.g * intensity * 255);
    pixels[offset + 2] = Math.round(warm.b * intensity * 255);
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = 'room-wall-bounce'; texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.channel = 0; texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
