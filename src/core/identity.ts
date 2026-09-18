import type { Town } from './town';
import type { GameEvent } from './game';
import { assignedStaff, isJobFloorType } from './business';
import { averageHappiness } from './happiness';
import { LANDMARK_KINDS, LANDMARKS } from './landmarks';

export type Architecture = 'heritage' | 'modern' | 'garden';
export const ARCHITECTURES: Record<Architecture, string> = {
  heritage: 'Heritage · brick & brass', modern: 'Modern · steel & glass', garden: 'Garden · timber & greenery',
};
export interface IdentitySave {
  name: string;
  districtNames: Record<string, string>;
  unlocked: string[];
}
export const SKYLINE_REWARDS = [
  { id: 'canopy', label: 'Welcoming entrance canopies', description: 'Welcome 8 neighbors', check: (t: Town) => t.population >= 8 },
  { id: 'modern', label: 'Modern architecture', description: 'Welcome 20 neighbors', check: (t: Town) => t.population >= 20 },
  { id: 'garden', label: 'Garden architecture', description: 'Open a park', check: (t: Town) => t.parkOrigins().length > 0 },
  { id: 'roof-garden', label: 'Rooftop gardens', description: 'Open a park and welcome 12 neighbors', check: (t: Town) => t.parkOrigins().length > 0 && t.population >= 12 },
  { id: 'public-art', label: 'Sculptures on the street', description: 'Complete 12 missions', check: (t: Town) => t.missions.completedCount >= 12 },
  { id: 'landmark', label: 'Landmark rooftop crowns', description: 'Welcome 50 neighbors', check: (t: Town) => t.population >= 50 },
  ...LANDMARK_KINDS.map((kind) => ({ id: `landmark-${kind}`, label: LANDMARKS[kind].label, description: LANDMARKS[kind].requirement, check: LANDMARKS[kind].check })),
] as const;

export class TownIdentity {
  name = 'Tower Town';
  districtNames: Record<string, string> = {};
  unlocked = new Set<string>(['heritage']);
  private lastCheck = -Infinity;

  rename(name: string): boolean {
    const value = cleanName(name);
    if (!value) return false;
    this.name = value; return true;
  }

  renameDistrict(index: number, name: string): boolean {
    const value = cleanName(name);
    if (!value || !Number.isInteger(index) || index < 0 || index > 3) return false;
    this.districtNames[String(index)] = value; return true;
  }

  update(town: Town): GameEvent[] {
    if (town.time - this.lastCheck < 1) return [];
    this.lastCheck = town.time;
    const events: GameEvent[] = [];
    for (const reward of SKYLINE_REWARDS) {
      if (this.unlocked.has(reward.id) || !reward.check(town)) continue;
      this.unlocked.add(reward.id);
      events.push({ kind: 'build', message: `Skyline reward: ${reward.label}!` });
    }
    // A signature business is earned through quality and real operation.
    const residents = town.allResidents();
    for (const game of town.towers()) for (const floor of game.tower.floors) {
      if (!isJobFloorType(floor.type) || floor.signature || floor.quality < 85) continue;
      const staff = assignedStaff(residents, game.id, floor.level);
      const busy = floor.type === 'shop' || floor.type === 'restaurant'
        ? floor.visitsToday >= 8 : staff.length >= 2 && staff.some((r) => r.jobTier > 0);
      if (!staff.length || !busy) continue;
      floor.signature = true;
      town.stories.record(town.day, 'place', staff.slice(0, 2).map((r) => r.id), `${floor.name} became a local favorite`,
        `Quality and a thriving business earned Signature status. The team has given the neighborhood something to be proud of.`,
        { kind: 'floor', towerId: game.id, level: floor.level });
      events.push({ kind: 'event', message: `${floor.name} is now a Signature ${floor.subtype ?? floor.type} — a local landmark!` });
    }
    return events;
  }

  restore(saved?: IdentitySave): void {
    if (!saved) return;
    this.name = cleanName(saved.name) ?? 'Tower Town';
    this.districtNames = Object.fromEntries(Object.entries(saved.districtNames ?? {})
      .filter(([id, value]) => /^[0-3]$/.test(id) && cleanName(value)).map(([id, value]) => [id, cleanName(value)!]));
    const known = new Set<string>(['heritage', ...SKYLINE_REWARDS.map((r) => r.id)]);
    this.unlocked = new Set((Array.isArray(saved.unlocked) ? saved.unlocked : []).filter((id) => known.has(id)));
    this.unlocked.add('heritage');
  }

  snapshot(): IdentitySave {
    return { name: this.name, districtNames: { ...this.districtNames }, unlocked: [...this.unlocked] };
  }
}

export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const value = name.trim().replace(/\s+/g, ' ');
  return value.length > 0 && value.length <= 32 ? value : null;
}

export function districts(town: Town) {
  const groups = [];
  for (let index = 0; index < Math.ceil(town.slots.length / 3); index++) {
    const slots = town.slots.slice(index * 3, index * 3 + 3).filter((s) => s.unlocked);
    if (!slots.length) continue;
    const games = slots.flatMap((s) => s.game ? [s.game] : []);
    const floors = games.flatMap((g) => g.tower.floors);
    const residents = town.allResidents().filter((r) => slots.some((s) => s.id === r.homeTowerId));
    const parks = slots.filter((s) => s.zone === 'park').length;
    const votes = [
      { name: 'Garden Quarter', score: parks * 4 + residents.length / 12, detail: 'Homes and green space' },
      { name: 'Midtown Tech', score: floors.filter((f) => f.subtype === 'tech' || f.subtype === 'electronics').length * 2 + slots.filter((s) => s.zone === 'office').length, detail: 'Offices and technology' },
      { name: 'The Arts Quarter', score: floors.filter((f) => f.subtype === 'creative' || f.subtype === 'boutique').length * 2, detail: 'Studios and independent shops' },
      { name: 'Market Street', score: floors.filter((f) => f.type === 'shop').length * 1.5 + slots.filter((s) => s.zone === 'commercial').length, detail: 'Shops and daily essentials' },
      { name: 'After Hours', score: floors.filter((f) => f.subtype === 'bar').length * 3 + floors.filter((f) => f.type === 'restaurant').length, detail: 'Dining and nightlife' },
      { name: 'The Works', score: floors.filter((f) => f.type === 'factory').length * 2 + slots.filter((s) => s.zone === 'industrial').length, detail: 'Makers and industry' },
      { name: 'Station Quarter', score: slots.filter((s) => s.zone === 'transit').length * 4, detail: 'A district built for movement' },
    ].sort((a, b) => b.score - a.score);
    const theme = votes[0].score >= 2 ? votes[0] : { name: 'Founders’ Row', detail: 'A neighborhood finding its character' };
    groups.push({ index, slots, population: residents.length, theme: theme.name, detail: theme.detail,
      name: town.identity.districtNames[String(index)] ?? theme.name });
  }
  return groups;
}

export function attractiveness(town: Town) {
  if (town.population === 0) return { score: 0, diversity: 0, quality: 0, wellbeing: 0, greenery: 0, movement: 0 };
  const floors = town.towers().flatMap((g) => g.tower.floors);
  const businesses = floors.filter((f) => isJobFloorType(f.type));
  const diversity = Math.min(25, new Set(businesses.map((f) => f.subtype)).size * 3);
  const quality = businesses.length ? businesses.reduce((n, f) => n + f.quality, 0) / businesses.length * 0.2 : 0;
  const wellbeing = averageHappiness(town.allResidents()) * 0.25;
  const greenery = Math.min(20, town.parkOrigins().length * 7 + floors.filter((f) => f.type === 'landmark').length * 3);
  const averageWait = town.towers().reduce((n, g) => n + g.averageWait(), 0) / Math.max(1, town.towers().length);
  const movement = Math.max(0, 10 - Math.max(0, averageWait - 8) / 3);
  return { score: Math.round(diversity + quality + wellbeing + greenery + movement), diversity, quality, wellbeing, greenery, movement };
}
