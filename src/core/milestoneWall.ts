import { MISSION_DEFS } from './missions';

export const MILESTONE_COLORS = {
  neighbors: { label: 'Neighbors & wellbeing', color: 0x83a995 },
  work: { label: 'Work & careers', color: 0x8ca9bf },
  trade: { label: 'Trade & prosperity', color: 0xd6b372 },
  movement: { label: 'Journeys & lifts', color: 0x9a9cbd },
  place: { label: 'Places & town life', color: 0xc98d78 },
};
export type MilestoneFamily = keyof typeof MILESTONE_COLORS;

function family(id: string): MilestoneFamily {
  if (/^(first-neighbors|pop-|happy-)/.test(id)) return 'neighbors';
  if (/^(first-manager|fully-staffed|staff|promo-|top-tier-|employed-)/.test(id)) return 'work';
  if (/^(smooth-lifts|lift-|commuter)/.test(id)) return 'movement';
  if (/^(first-shop-customer|first-meal|big-day|wealth-|day-income-|grade-|quality-)/.test(id)) return 'trade';
  return 'place';
}

/** One permanent visual token per known completed mission. Slots follow the
 * canonical catalog, never completion order; this needs no second reward ledger. */
export const MILESTONE_TILES = MISSION_DEFS.map((def, index) => ({
  id: def.id, label: def.label, index, family: family(def.id),
}));

export function earnedMilestoneTiles(completed: ReadonlySet<string>) {
  return MILESTONE_TILES.filter(tile => completed.has(tile.id));
}
