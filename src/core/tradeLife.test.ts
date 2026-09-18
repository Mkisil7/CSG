import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import { roomPoses, ROOM_LIFE } from './roomLife';
import type { ActivityKind, BusinessSubtype } from './types';

function fixture(subtype: BusinessSubtype = 'grocery') {
  const town = new Town(), game = town.towers()[0];
  const floor = game.tower.addFloor(['assembly', 'foodproc', 'electronics-fab'].includes(subtype) ? 'factory' : 'shop', subtype);
  const person = (activity: ActivityKind, tier = 0) => {
    const r = createResident(1, game.id); r.jobTowerId = game.id; r.jobFloor = floor.level; r.jobTier = tier;
    r.state = { kind: 'idle', floor: floor.level, activity: { kind: activity, floor: floor.level }, startedAt: 600, until: 620 };
    game.residents.push(r); return r;
  };
  return { town, game, floor, person, poses: (now = 600) => roomPoses(game.tower.floors, game.residents, game.id, now) };
}

describe('shops and workshops with real participants', () => {
  it('gives shoppers subtype-specific browsing and a late checkout only with a present worker', () => {
    for (const [subtype, action] of [['grocery', 'browse-grocery'], ['boutique', 'browse-clothes'], ['electronics', 'try-device']] as const) {
      const { person, poses, game } = fixture(subtype), clerk = person('work'), customer = person('shop');
      expect(poses().get(clerk.id)).toMatchObject({ action: 'cashier', x: ROOM_LIFE.checkout.x });
      expect(poses().get(customer.id)?.action).toBe(action);
      const before = JSON.stringify(game.residents), coins = game.economy.coins;
      expect(poses(615).get(customer.id)?.action).toBe('checkout');
      expect(JSON.stringify(game.residents)).toBe(before); expect(game.economy.coins).toBe(coins);
      clerk.state = { kind: 'waiting', floor: 1, to: 0 };
      expect(poses(615).get(customer.id)?.action).toBe(action); expect(poses(615).has(clerk.id)).toBe(false);
      clerk.state = { kind: 'idle', floor: 1, activity: { kind: 'work', floor: 1 }, until: 700 };
      clerk.jobTowerId = 'elsewhere'; expect(poses(615).has(clerk.id)).toBe(false);
    }
  });

  it('uses actual production stations and depicts the foreman separately from line staff', () => {
    for (const [subtype, action] of [['assembly', 'assembling'], ['foodproc', 'food-control'], ['electronics-fab', 'fabricating']] as const) {
      const { person, poses } = fixture(subtype), line = [person('work'), person('work'), person('work')], foreman = person('work', 1), stranger = person('shop');
      const result = poses();
      expect(new Set(line.map((r) => result.get(r.id)!.x)).size).toBe(3);
      for (const r of line) expect(result.get(r.id)).toMatchObject({ action, z: ROOM_LIFE.workstationZ });
      expect(result.get(foreman.id)?.action).toBe('supervising'); expect(result.has(stranger.id)).toBe(false);
      line[0].state = { kind: 'commuting', toTowerId: 't1', until: 630 };
      expect(poses().has(line[0].id)).toBe(false);
    }
  });

  it('keeps old-save visits browsing and deterministically bounds crowds without inventing transactions', () => {
    const { game, person, poses } = fixture('electronics'); person('work');
    const legacy = person('shop'); if (legacy.state.kind === 'idle') delete legacy.state.startedAt;
    for (let i = 0; i < 50; i++) person('shop');
    expect(poses(618).get(legacy.id)?.action).toBe('try-device');
    const before = poses(); game.residents.reverse(); expect(poses()).toEqual(before);
    for (const now of [590, 600, 618]) for (const pose of poses(now).values()) {
      expect(pose.x).toBeGreaterThan(-6.5); expect(pose.x).toBeLessThan(8.5);
      expect(pose.z).toBeGreaterThan(-3); expect(pose.z).toBeLessThan(3);
    }
  });

  it('gives the second shop worker a suitable stocking, folding or demonstration task', () => {
    for (const [subtype, action] of [['grocery', 'stocking'], ['boutique', 'folding'], ['electronics', 'demonstrating']] as const) {
      const { person, poses } = fixture(subtype); person('work'); person('work');
      expect([...poses().values()].map((pose) => pose.action).sort()).toEqual(['cashier', action].sort());
    }
  });
});
