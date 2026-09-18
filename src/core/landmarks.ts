import type { Town } from './town';
import type { LandmarkKind } from './types';

export const LANDMARKS: Record<LandmarkKind, { label: string; description: string; requirement: string; baseCost: number; check: (town: Town) => boolean }> = {
  conservatory: { label: 'Sky Conservatory', description: 'A public winter garden with reading benches, specimen trees and a reflecting pool.',
    requirement: 'Welcome 12 neighbors and open a park', baseCost: 900, check: (t) => t.population >= 12 && t.parkOrigins().length > 0 },
  gallery: { label: 'Neighborhood Gallery', description: 'A public art floor with colorful canvases, a sculpture court and places to meet.',
    requirement: 'Complete 12 missions', baseCost: 1200, check: (t) => t.missions.completedCount >= 12 },
  observatory: { label: 'Skyline Observatory', description: 'A public viewing deck with telescopes, a star chart and a brass orrery.',
    requirement: 'Welcome 32 neighbors', baseCost: 1800, check: (t) => t.population >= 32 },
};
export const LANDMARK_KINDS = Object.keys(LANDMARKS) as LandmarkKind[];
export function isLandmarkKind(value: unknown): value is LandmarkKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LANDMARKS, value);
}

export function landmarkOffer(town: Town, towerId: string, kind: LandmarkKind): { ok: boolean; cost: number; reason?: string } {
  const game = town.towerById(towerId);
  if (!game || !isLandmarkKind(kind)) return { ok: false, cost: 0, reason: 'Choose a tower and landmark' };
  const def = LANDMARKS[kind], cost = def.baseCost + game.tower.height * 75;
  const no = (reason: string) => ({ ok: false, cost, reason });
  if (game.zone !== 'mixed' && game.zone !== 'transit') return no('Requires a Mixed-Use or Transit-Oriented tower');
  if (game.tower.floors.some((f) => f.type === 'landmark')) return no('This tower already has its landmark');
  if (!town.identity.unlocked.has(`landmark-${kind}`) && !def.check(town)) return no(def.requirement);
  if (kind === 'observatory' && game.tower.height < 8) return no('Build 8 floors in this tower first');
  if (town.economy.coins < cost) return no(`Needs ${cost} coins`);
  return { ok: true, cost };
}

/** A new civic floor, never a conversion that evicts residents or deletes jobs. */
export function buildLandmark(town: Town, towerId: string, kind: LandmarkKind): boolean {
  const offer = landmarkOffer(town, towerId, kind);
  if (!offer.ok) return false;
  if (!town.economy.spend(offer.cost)) return false;
  const game = town.towerById(towerId)!;
  const floor = game.tower.addFloor('landmark');
  floor.landmark = kind; floor.name = LANDMARKS[kind].label; floor.landmarkVisits = 0;
  town.identity.unlocked.add(`landmark-${kind}`);
  town.stories.record(town.day, 'place', [], `${floor.name} opened in ${game.name}`,
    'A place for everyone, earned by the neighborhood. Visits are free; neighbors take the lifts and meet here after work.',
    { kind: 'floor', towerId: game.id, level: floor.level });
  town.events.push({ kind: 'build', message: `${floor.name} is open to the neighborhood!` });
  return true;
}
