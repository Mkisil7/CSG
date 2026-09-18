import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { stairLandingX, stairPosition, STAIR_STEPS, STAIR_Z } from './stairs';
import { buildStairFlight } from './floors';
import { CharacterViews } from './characters';
import { createResident } from '../core/residents';
import { FLOOR_HEIGHT } from './layout';
import { stableRoomHash } from '../core/roomLife';

const preference = { matches: false };
beforeEach(() => {
  preference.matches = false;
  vi.stubGlobal('window', { matchMedia: () => preference });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('connected stair journeys', () => {
  it('joins alternating flights in both directions, including exact floor boundaries', () => {
    for (let level = 1; level < 12; level++) {
      const below = stairPosition(0, 12, (level - 0.000001) / 12);
      const above = stairPosition(0, 12, (level + 0.000001) / 12);
      expect(Math.abs(above.x - below.x)).toBeLessThan(0.00001);
      expect(stairPosition(0, 12, level / 12).x).toBe(stairLandingX(level));
    }
    for (let i = 0; i <= 100; i++) {
      const up = stairPosition(0, 7, i / 100), down = stairPosition(7, 0, 1 - i / 100);
      expect(up.x).toBeCloseTo(down.x); expect(up.y).toBeCloseTo(down.y); expect(up.z).toBe(STAIR_Z);
    }
    expect(stairPosition(1, 3, -1)).toEqual(stairPosition(1, 3, 0));
    expect(stairPosition(1, 3, 2)).toEqual(stairPosition(1, 3, 1));
    expect(stairPosition(2, 2, NaN)).toEqual(stairPosition(2, 2, 0));
  });

  it('places each visible tread on the same path as residents and connects upper landings to rooms', () => {
    for (let level = 1; level < 5; level++) {
      const flight = buildStairFlight(level); flight.updateMatrixWorld(true);
      for (let i = 0; i < STAIR_STEPS; i++) {
        const tread = new THREE.Box3().setFromObject(flight.children[i]);
        const point = stairPosition(level - 1, level, (i + 0.5) / STAIR_STEPS);
        expect(point.x).toBeCloseTo((tread.min.x + tread.max.x) / 2);
        expect(point.z).toBeCloseTo((tread.min.z + tread.max.z) / 2);
        expect(tread.max.y - point.y).toBeCloseTo(FLOOR_HEIGHT / STAIR_STEPS / 2);
      }
      const landing = new THREE.Box3().setFromObject(flight.children[STAIR_STEPS]);
      expect(landing.max.y).toBeCloseTo(level * FLOOR_HEIGHT);
      expect(landing.min.z).toBeLessThan(3); expect(landing.max.z).toBeGreaterThan(STAIR_Z);
    }
  });

  it('keeps real resident positions on the path at any frame rate and freezes them when time is paused', () => {
    const resident = createResident(1, 't0');
    resident.state = { kind: 'stairs', from: 0, to: 4, startedAt: 480, until: 490 };
    const view = new CharacterViews(new THREE.Group(), 't0', { x: 0, z: 0 });
    const pace = (stableRoomHash(resident.id) % 101 / 100 - 0.5) * 1.6;
    for (const time of [480, 481, 482.49, 482.5, 482.51, 485, 489, 490]) {
      view.sync([resident], [], 0.016, time);
      const person = view.pickTargets()[0], expected = stairPosition(0, 4, (time - 480) / 10, pace);
      expect(person.position.toArray()).toEqual([expected.x, expected.y, expected.z]);
      const before = person.position.clone();
      for (let frame = 0; frame < 10; frame++) view.sync([resident], [], 0, time);
      expect(person.position.equals(before)).toBe(true);
    }
    preference.matches = true;
    view.sync([resident], [], 0.016, 486);
    const point = stairPosition(0, 4, 0.6, pace);
    expect(view.pickTargets()[0].position.toArray()).toEqual([point.x, point.y, point.z]);
    expect(view.pickTargets()[0].userData.residentId).toBe(resident.id);
  });

  it('separates simultaneous walkers with monotone cadence while preserving both arrival endpoints', () => {
    const heights = new Set<number>();
    for (const pace of [-0.8, -0.4, 0, 0.4, 0.8]) {
      expect(stairPosition(0, 8, 0, pace)).toEqual(stairPosition(0, 8, 0));
      expect(stairPosition(0, 8, 1, pace)).toEqual(stairPosition(0, 8, 1));
      heights.add(stairPosition(0, 8, 0.5, pace).y);
      let previous = -1;
      for (let i = 0; i <= 100; i++) {
        const position = stairPosition(0, 8, i / 100, pace);
        expect(position.y).toBeGreaterThan(previous); previous = position.y;
      }
    }
    expect(heights.size).toBe(5);
  });
});
