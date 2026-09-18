import type { Resident } from '../core/types';
import { TOWER_SLOT_ORIGINS, slotIndexOfTowerId } from '../core/townLayout';

const BENCH_X = 14.2, FRONT_Z = 5.2, SPACING = 2.8;

/** Includes the camera-facing name plaque at any orbit angle. */
export function hostSceneryExtent(count: number): { right: number; back: number } {
  return count > 0 ? { right: BENCH_X + 2.5, back: FRONT_Z - (count - 1) * SPACING - 2.5 } : { right: 13, back: -4 };
}

/** Home ownership, not current commute order, determines the welcome walk. */
export function hostBenchPlacements(hosts: Pick<Resident, 'id' | 'homeTowerId'>[]): Map<string, { x: number; z: number }> {
  const counts = new Map<string, number>(), positions = new Map<string, { x: number; z: number }>();
  for (const host of [...hosts].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const origin = TOWER_SLOT_ORIGINS[slotIndexOfTowerId(host.homeTowerId)];
    if (!origin) continue;
    const index = counts.get(host.homeTowerId) ?? 0; counts.set(host.homeTowerId, index + 1);
    positions.set(host.id, { x: origin.x + BENCH_X, z: origin.z + FRONT_Z - index * SPACING });
  }
  return positions;
}
