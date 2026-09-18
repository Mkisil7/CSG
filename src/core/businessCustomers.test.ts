import { describe, expect, it } from 'vitest';
import { businessCustomerPhase } from './business';
import { createResident } from './residents';
import { Tower } from './tower';
import type { ResidentState } from './types';

describe('real neighborhood customers', () => {
  it.each([['shop', 'shop'], ['restaurant', 'eat']] as const)('classifies %s arrivals without changing needs, flags or takings', (type, activity) => {
    const tower = new Tower(), floor = tower.addFloor(type), r = createResident(1, 't0');
    r.pendingActivity = { activity: { kind: activity, floor: floor.level }, duration: 40 };
    const journeys: ResidentState[] = [
      { kind: 'waiting', floor: 0, to: floor.level },
      { kind: 'riding', to: floor.level },
      { kind: 'stairs', from: 0, to: floor.level, startedAt: 0, until: 10 },
    ];
    for (const state of journeys) {
      r.state = state; const before = JSON.stringify({ r, floor });
      expect(businessCustomerPhase(r, floor)).toBe('on-way');
      expect(JSON.stringify({ r, floor })).toBe(before);
    }
    r.state = { kind: 'idle', floor: floor.level, activity: { kind: activity, floor: floor.level }, until: 40 };
    expect(businessCustomerPhase(r, floor)).toBe('here');
    expect(floor.visitsToday).toBe(0); expect(floor.revenueToday).toBe(0);
    r.state.activity.kind = 'work'; expect(businessCustomerPhase(r, floor)).toBeNull();
    r.state.activity.kind = activity; r.state.floor++;
    expect(businessCustomerPhase(r, floor)).toBeNull();
  });

  it('excludes cancelled trips, wrong activities, different destinations and intertower commuters', () => {
    const tower = new Tower(), floor = tower.addFloor('restaurant'), r = createResident(1, 't0');
    r.state = { kind: 'waiting', floor: 0, to: floor.level };
    expect(businessCustomerPhase(r, floor)).toBeNull();
    r.pendingActivity = { activity: { kind: 'work', floor: floor.level }, duration: 40 };
    expect(businessCustomerPhase(r, floor)).toBeNull();
    r.pendingActivity.activity.kind = 'eat'; r.pendingActivity.activity.floor++;
    expect(businessCustomerPhase(r, floor)).toBeNull();
    r.pendingActivity.activity.floor = floor.level; r.state.to++;
    expect(businessCustomerPhase(r, floor)).toBeNull();
    r.state = { kind: 'commuting', toTowerId: 't1', until: 10 };
    expect(businessCustomerPhase(r, floor)).toBeNull();
    r.state = { kind: 'stairs', from: 0, to: floor.level, startedAt: 0, until: 10 };
    r.pendingActivity = undefined; expect(businessCustomerPhase(r, floor)).toBeNull();
    for (const type of ['office', 'factory', 'residential', 'landmark'] as const) {
      floor.type = type;
      r.state = { kind: 'idle', floor: floor.level, activity: { kind: 'eat', floor: floor.level }, until: 10 };
      expect(businessCustomerPhase(r, floor)).toBeNull();
    }
  });
});
