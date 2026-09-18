import * as THREE from 'three';
import type { Town } from '../core/town';
import { TOWER_SLOT_ORIGINS } from '../core/townLayout';
import { visualDelta } from './motion';
import { SnowCover } from './snowCover';
import { hostBenchPlacements } from './hostLayout';

/** Performances, visitors and earned places follow the actual event ledger. */
export class NeighborhoodViews {
  private stages = new Map<number, { group: THREE.Group; musicians: THREE.Group[]; title: THREE.Sprite; light: THREE.PointLight }>();
  private benches = new Map<string, { group: THREE.Group; plaque: THREE.Sprite; name: string; snow: SnowCover }>();
  private audience = new Map<string, THREE.Group>();
  private festival: THREE.Group | null = null;
  private festivalKey = '';
  private time = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private scene: THREE.Scene) {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { this.reducedMotion = e.matches; });
  }

  pickTargets(): THREE.Object3D[] { return [...this.benches.values()].map((bench) => bench.group); }

  sync(town: Town, dt: number): void {
    if (!this.reducedMotion) this.time += visualDelta(dt);
    const evening = town.timeOfDay >= 1020 && town.timeOfDay < 1320;
    for (const index of town.neighborhood.bandstands) {
      if (!this.stages.has(index)) {
        const group = new THREE.Group();
        group.name = `bandstand:${index}`;
        const origin = TOWER_SLOT_ORIGINS[index]; group.position.set(origin.x, 0.45, origin.z);
        group.add(box(6.4, 0.3, 3.1, 0x947455, 3, 0.15, -0.9));
        for (let plank = 0; plank < 16; plank++) group.add(box(0.38, 0.035, 3, plank % 3 === 0 ? 0xa28768 : 0x927657, 0.02 + plank * 0.4, 0.32, -0.9));
        for (const x of [0, 6]) group.add(box(0.15, 3, 0.15, 0x4f6264, x, 1.5, -1.8));
        group.add(box(6.3, 0.16, 2.6, 0x487a70, 3, 3, -1.2));
        group.add(box(6.2, 0.08, 0.08, 0x4f6264, 3, 2.55, 0.1));
        for (let bulb = 0; bulb < 9; bulb++) {
          const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe3ac, emissive: 0xffc677, emissiveIntensity: 0.55, roughness: 0.5 }));
          lantern.position.set(0.25 + bulb * 0.68, 2.45 - Math.sin(bulb / 8 * Math.PI) * 0.2, 0.13); group.add(lantern);
        }
        const light = new THREE.PointLight(0xffd6a0, 0, 9, 2); light.position.set(3, 2.6, 0.5); group.add(light);
        const musicians = [0xe9b26e, 0x7baba1, 0xc68082].map((c, i) => {
          const musician = human(c); musician.position.set(1 + i * 2, 0.3, -0.6); group.add(musician);
          musician.name = `musician:${index}:${i}`;
          if (i === 1) {
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x836244, roughness: 0.6 }));
            drum.position.set(0, 0.65, 0.45); musician.add(drum);
          } else {
            const guitar = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshStandardMaterial({ color: i === 0 ? 0xc5914a : 0x8c4a37, roughness: 0.6 }));
            guitar.scale.set(1, 1.4, 0.3); guitar.position.set(0, 0.75, 0.26); musician.add(guitar);
            musician.add(box(0.08, 0.7, 0.08, 0x584537, 0.08, 1.15, 0.25));
          }
          return musician;
        });
        const title = label('THE LANTERN TRIO', '#ecdfbd'); title.position.set(3, 3.35, -0.8); title.scale.set(6, 0.8, 1); group.add(title);
        this.scene.add(group); this.stages.set(index, { group, musicians, title, light });
      }
    }
    for (const [index, stage] of this.stages) {
      if (!town.neighborhood.bandstands.has(index)) { this.remove(stage.group); this.stages.delete(index); continue; }
      const playing = evening && town.neighborhood.active('band').some((e) => e.parkIndex === index);
      stage.musicians.forEach((m, i) => { m.visible = playing; m.rotation.z = this.reducedMotion ? 0 : Math.sin(this.time * 2 + i) * 0.035; });
      stage.title.visible = playing;
      stage.light.intensity = playing ? 6 : 0;
    }
    const seenGuests = new Set<string>();
    for (const guest of town.neighborhood.parkGuests) {
      seenGuests.add(guest.id);
      let person = this.audience.get(guest.id);
      if (!person) { person = human([0x659e99, 0xd7a55c, 0xb58dab][Number(guest.id.slice(2)) % 3]); person.name = `park-guest:${guest.id}`; this.scene.add(person); this.audience.set(guest.id, person); }
      const seed = Number(guest.id.slice(2));
      const origin = TOWER_SLOT_ORIGINS[guest.parkIndex];
      const seatX = origin.x + 0.5 + seed % 6, seatZ = 1.8 + seed % 3 * 0.55, entryX = origin.x - 10;
      let p = Math.min(1, Math.max(0, (town.time - guest.startedAt) / (guest.arrivesAt - guest.startedAt)));
      if (town.time > guest.leavesAt) p = 1 - Math.min(1, (town.time - guest.leavesAt) / (guest.endsAt - guest.leavesAt));
      person.position.set(entryX + (seatX - entryX) * p, p > 0.7 ? 0.5 : 0.12, 8.5 + (seatZ - 8.5) * p);
      person.rotation.y = p >= 1 ? Math.PI : Math.atan2(seatX - entryX, seatZ - 8.5) + (town.time > guest.leavesAt ? Math.PI : 0);
      person.position.y += this.reducedMotion ? 0 : Math.abs(Math.sin(this.time * (p < 1 ? 8 : 2) + seed)) * 0.025;
    }
    for (const [id, person] of this.audience) if (!seenGuests.has(id)) { this.remove(person); this.audience.delete(id); }
    const hosts = town.allResidents().filter((r) => r.townRole === 'Neighborhood host');
    const positions = hostBenchPlacements(hosts);
    for (const r of hosts) {
      const position = positions.get(r.id); if (!position) continue;
      let entry = this.benches.get(r.id);
      if (!entry) {
        const bench = new THREE.Group(); bench.name = `host-bench:${r.id}`;
        bench.add(box(3.15, 0.08, 1.45, 0xb8b4a2, 0, 0.04, 0));
        bench.add(box(2.6, 0.16, 0.7, 0x927359, 0, 0.6, 0));
        bench.add(box(2.6, 0.6, 0.14, 0x927359, 0, 0.95, -0.3));
        for (const x of [-1, 1]) bench.add(box(0.12, 0.6, 0.55, 0x465d59, x, 0.3, 0));
        const plaque = label(`${r.name}’s welcome bench`, '#ead5a0'); plaque.position.set(0, 1.6, 0); plaque.scale.set(4.6, 0.65, 1); bench.add(plaque);
        const snow = new SnowCover([
          { x: 0, y: 0.68, z: 0, width: 2.6, depth: 0.7 },
          { x: 0, y: 1.25, z: -0.3, width: 2.6, depth: 0.14 },
        ], 'host-bench-snow'); bench.add(snow);
        entry = { group: bench, plaque, name: r.name, snow };
        this.scene.add(bench); this.benches.set(r.id, entry);
      }
      entry.group.position.set(position.x, 0, position.z);
      entry.group.userData = { pickable: 'resident', residentId: r.id, towerId: r.homeTowerId };
      if (entry.name !== r.name) { paintLabel(entry.plaque, `${r.name}’s welcome bench`, '#ead5a0'); entry.name = r.name; }
      entry.snow.setAmount(town.weather.snow);
    }
    for (const [id, bench] of this.benches) if (!positions.has(id)) { this.remove(bench.group); this.benches.delete(id); }
    const festivals = town.neighborhood.active('festival');
    const key = festivals.map((e) => e.id).join(':');
    if (key !== this.festivalKey) {
      this.festivalKey = key; if (this.festival) this.remove(this.festival);
      this.festival = new THREE.Group();
      for (const e of festivals) {
        const origin = TOWER_SLOT_ORIGINS[e.parkIndex!];
        for (const x of [-12, 12]) this.festival.add(box(0.14, 4, 0.14, 0x5a685b, origin.x + x, 2, 7));
        for (let i = 0; i < 18; i++) {
          const flag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.65, 3), new THREE.MeshStandardMaterial({ color: [0xd2aa66, 0xad6371, 0x6aab9e][i % 3], roughness: 0.7 }));
          flag.rotation.z = Math.PI; flag.position.set(origin.x - 11.5 + i * 1.35, 3.4 - Math.sin(i / 17 * Math.PI) * 0.5, 7); this.festival.add(flag);
        }
      }
      this.scene.add(this.festival);
    }
  }

  private remove(group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) node.dispose();
      if (node instanceof THREE.Mesh) node.geometry.dispose();
      if (node instanceof THREE.Mesh || node instanceof THREE.Sprite) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if ('map' in material) (material.map as THREE.Texture | null)?.dispose(); material.dispose();
      }
    });
  }
}

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.78 }));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function human(color: number): THREE.Group {
  const group = new THREE.Group(); group.add(box(0.4, 0.52, 0.25, color, 0, 0.85, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe4bd99, roughness: 0.9 }));
  head.position.y = 1.3; head.castShadow = true; group.add(head);
  for (const x of [-0.12, 0.12]) group.add(box(0.13, 0.58, 0.16, 0x3c4c58, x, 0.3, 0));
  for (const x of [-0.27, 0.27]) group.add(box(0.1, 0.45, 0.1, color, x, 0.86, 0.03));
  return group;
}
function label(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 96;
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, toneMapped: false }));
  paintLabel(sprite, text, color); return sprite;
}
function paintLabel(sprite: THREE.Sprite, text: string, color: string): void {
  const canvas = sprite.material.map!.image as HTMLCanvasElement;
  const c = canvas.getContext('2d')!; c.fillStyle = '#24463e'; c.fillRect(0, 0, 640, 96);
  c.strokeStyle = color; c.strokeRect(5, 5, 630, 86); c.fillStyle = color; c.font = '30px Georgia'; c.textAlign = 'center'; c.fillText(text, 320, 58, 610);
  sprite.material.map!.needsUpdate = true;
}
