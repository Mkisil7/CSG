import type { Town } from './town';
import { assignedStaff } from './business';
import { createResident } from './residents';
import { MINUTES_PER_DAY, type Visitor } from './types';
import { slotIndexOfTowerId, TOWER_SLOT_ORIGINS } from './townLayout';
import type { StoryPlace } from './stories';

export type NeighborhoodKind = 'critic' | 'band' | 'startup' | 'character' | 'festival';
export interface NeighborhoodEvent {
  id: string;
  kind: NeighborhoodKind;
  title: string;
  reason: string;
  towerId: string;
  level?: number;
  parkIndex?: number;
  residentId?: string;
  /** The actual chosen expansion, retained so its earned room stays visitable. */
  studio?: { towerId: string; level: number };
  status: 'offered' | 'active' | 'completed' | 'declined';
  createdAt: number;
  startedAt: number;
  endsAt: number;
  nextVisitorAt: number;
  served: number;
  missed: number;
  arrivals: number;
  reviewPublished: boolean;
  outcome: string;
}
export interface ParkGuest {
  id: string; eventId: string; parkIndex: number; startedAt: number;
  arrivesAt: number; leavesAt: number; endsAt: number; counted: boolean;
}
export interface NeighborhoodSave {
  events: NeighborhoodEvent[]; parkGuests: ParkGuest[];
  bandstands?: number[];
  nextId: number; nextGuest: number; nextOfferAt: number;
}
export const EVENT_COSTS: Record<NeighborhoodKind, number> = { critic: 60, band: 80, startup: 350, character: 120, festival: 200 };
export const EVENT_ACTIONS: Record<NeighborhoodKind, string> = {
  critic: 'Host a tasting', band: 'Book the park concert', startup: 'Open the second studio',
  character: 'Dedicate a welcome bench', festival: 'Host the neighborhood festival',
};
export const VARIANT_LABELS = {
  'critics-choice': 'Critic’s choice · +10% visitor spending',
  'founders-studio': 'Founders’ studio · home of a growing local team',
  'innovation-hub': 'Innovation hub · +20% wages while staff are at work',
  'festival-market': 'Festival favorite · +10% visitor spending',
};
type Candidate = Pick<NeighborhoodEvent, 'kind' | 'title' | 'reason' | 'towerId' | 'level' | 'parkIndex' | 'residentId'>;

function eventPlace(event: NeighborhoodEvent): StoryPlace | undefined {
  // Host dedications remain personal stories; a startup's reward is its new room.
  if (event.kind === 'character') return undefined;
  if (event.kind === 'band' && event.parkIndex !== undefined) return { kind: 'slot', index: event.parkIndex };
  const location = event.studio ?? event;
  return location.level !== undefined ? { kind: 'floor', towerId: location.towerId, level: location.level } : undefined;
}

/** Contextual opportunities, not random penalties. Invitations wait for the player.
 * Temporary benefits have a clock; permanent rewards and histories survive reloads. */
export class Neighborhood {
  events: NeighborhoodEvent[] = [];
  parkGuests: ParkGuest[] = [];
  /** Earned scenery must not depend on the bounded event archive. */
  bandstands = new Set<number>();
  private nextId = 1;
  private nextGuest = 1;
  private nextOfferAt = 1440;

  pending(): NeighborhoodEvent[] { return this.events.filter((e) => e.status === 'offered' || e.status === 'active'); }
  active(kind?: NeighborhoodKind): NeighborhoodEvent[] { return this.events.filter((e) => e.status === 'active' && (!kind || e.kind === kind)); }

  discover(town: Town): void {
    if (town.time < this.nextOfferAt || this.pending().length >= 3) return;
    this.nextOfferAt = town.time + 60;
    const candidates = this.candidates(town).filter((candidate) => !this.events.some((e) => e.kind === candidate.kind &&
      (e.status === 'offered' || e.status === 'active' || town.time - e.endsAt < MINUTES_PER_DAY * (e.status === 'declined' ? 3 : 12))));
    const lastOffered = (kind: NeighborhoodKind) => Math.max(0, ...this.events.filter((e) => e.kind === kind).map((e) => e.createdAt));
    const candidate = candidates.sort((a, b) => lastOffered(a.kind) - lastOffered(b.kind))[0];
    if (!candidate) return;
    const event: NeighborhoodEvent = { ...candidate, id: `ne${this.nextId++}`, status: 'offered', createdAt: town.time,
      startedAt: 0, endsAt: 0, nextVisitorAt: 0, served: 0, missed: 0, arrivals: 0, reviewPublished: false, outcome: '' };
    this.events.push(event);
    this.events = this.events.filter((e) => e.status === 'offered' || e.status === 'active').concat(this.events.filter((e) => e.status !== 'offered' && e.status !== 'active').slice(-15));
    this.nextOfferAt = town.time + MINUTES_PER_DAY;
    town.events.push({ kind: 'event', message: `${event.title} — a new invitation in Neighborhood happenings.` });
  }

  private candidates(town: Town): Candidate[] {
    const people = town.allResidents();
    const candidates: Candidate[] = [];
    const businesses = town.towers().flatMap((g) => g.tower.floors.map((f) => ({ g, f, staff: assignedStaff(people, g.id, f.level) })));
    const reserved = (towerId: string, level: number) => this.pending().some((e) =>
      (e.kind === 'critic' || e.kind === 'festival') && e.towerId === towerId && e.level === level);
    const restaurant = businesses.find(({ g, f, staff }) => f.type === 'restaurant' && f.quality >= 65 && f.visitsToday >= 4 && staff.length >= 2 && !f.variant && !reserved(g.id, f.level));
    if (restaurant) candidates.push({ kind: 'critic', towerId: restaurant.g.id, level: restaurant.f.level,
      title: `A critic noticed ${restaurant.f.name}`, reason: `Its ${Math.round(restaurant.f.quality)} quality, ${restaurant.staff.length} staff and ${restaurant.f.visitsToday} visits today caught Jules’s attention.` });
    const parkIndex = town.slots.findIndex((s) => s.unlocked && s.zone === 'park');
    const social = people.filter((r) => r.traits.includes('social'));
    if (parkIndex >= 0 && people.length >= 8 && social.length >= 2) candidates.push({ kind: 'band', towerId: town.slots[parkIndex].id, parkIndex,
      title: 'The Lantern Trio found your park', reason: `${social[0].name} and ${social[1].name} helped spread the word. A real park and a growing neighborhood make a good place for a concert.` });
    const startup = businesses.find(({ f, staff }) => f.subtype === 'tech' && !f.variant && f.quality >= 70 && staff.length >= 3 && staff.some((r) => r.jobTier > 0));
    if (startup) candidates.push({ kind: 'startup', towerId: startup.g.id, level: startup.f.level,
      title: `${startup.f.name} needs room to grow`, reason: `${startup.staff.length} teammates and a senior worker have built a ${Math.round(startup.f.quality)}-quality studio. They are ready for a second workspace.` });
    const character = people.find((r) => !r.townRole && r.happiness >= 70 &&
      (town.stories.people[r.id]?.friends.filter((f) => f.daysTogether >= 3).length ?? 0) >= 2 &&
      town.stories.people[r.id]?.arrivalDay !== null && town.day - (town.stories.people[r.id]?.arrivalDay ?? town.day) >= 5);
    if (character) candidates.push({ kind: 'character', towerId: character.homeTowerId, residentId: character.id,
      title: `${character.name} is becoming a familiar face`, reason: 'At least five days here, two lasting friendships, and a happy life in town. Give this neighbor a place to welcome others.' });
    const venues = businesses.filter(({ f, staff }) => (f.type === 'shop' || f.type === 'restaurant') && staff.length);
    const festivalHost = venues.find(({ g, f }) => !f.variant && !reserved(g.id, f.level));
    if (people.length >= 16 && parkIndex >= 0 && venues.length >= 3 && festivalHost) candidates.push({ kind: 'festival', towerId: festivalHost.g.id, level: festivalHost.f.level, parkIndex,
      title: 'Your neighborhood is ready for a street party', reason: `${people.length} neighbors, a park and ${venues.length} staffed places to eat or shop: you have built everything a festival needs.` });
    return candidates;
  }

  studioOptions(town: Town, event: NeighborhoodEvent): { towerId: string; level: number; label: string }[] {
    return town.towers().flatMap((g) => g.tower.floors.filter((f) => f.type === 'office' && !f.variant &&
      !(g.id === event.towerId && f.level === event.level) && assignedStaff(town.allResidents(), g.id, f.level).length === 0)
      .map((f) => ({ towerId: g.id, level: f.level, label: `${g.name} · ${f.name}` })));
  }

  canRespond(town: Town, id: string, studio?: { towerId: string; level: number }): { ok: boolean; reason?: string } {
    const event = this.events.find((e) => e.id === id);
    if (!event || event.status !== 'offered') return { ok: false, reason: 'This invitation has already been answered.' };
    const game = town.towerById(event.towerId);
    const floor = game?.tower.floors[event.level ?? -1];
    const staff = floor ? assignedStaff(town.allResidents(), event.towerId, floor.level) : [];
    if (event.kind === 'critic' && (floor?.type !== 'restaurant' || staff.length < 2 || floor.variant)) return { ok: false, reason: 'The restaurant needs two staff and must not already have a special variant.' };
    if (event.kind === 'startup') {
      if (floor?.subtype !== 'tech' || staff.length < 3 || floor.variant) return { ok: false, reason: 'The original studio needs three staff and must not already have expanded.' };
      if (!studio || !this.studioOptions(town, event).some((s) => s.towerId === studio.towerId && s.level === studio.level)) return { ok: false, reason: 'Build or choose an unstaffed office for the second studio.' };
    }
    if (event.kind === 'character' && !town.allResidents().some((r) => r.id === event.residentId && !r.townRole)) return { ok: false, reason: 'This neighbor is no longer eligible.' };
    if (event.kind === 'festival' && (!floor || floor.variant || !staff.length)) return { ok: false, reason: 'The host storefront needs staff and must not already have a special variant.' };
    if ((event.kind === 'band' || event.kind === 'festival') && town.slots[event.parkIndex ?? -1]?.zone !== 'park') return { ok: false, reason: 'A park is needed for this gathering.' };
    if (town.economy.coins < EVENT_COSTS[event.kind]) return { ok: false, reason: `Needs ${EVENT_COSTS[event.kind]} coins.` };
    return { ok: true };
  }

  respond(town: Town, id: string, studio?: { towerId: string; level: number }): boolean {
    if (!this.canRespond(town, id, studio).ok) return false;
    const event = this.events.find((e) => e.id === id)!;
    if (!town.economy.spend(EVENT_COSTS[event.kind])) return false;
    event.status = 'active'; event.startedAt = town.time; event.nextVisitorAt = town.time;
    event.endsAt = town.time + MINUTES_PER_DAY * (event.kind === 'critic' ? 3 : 2);
    if (event.kind === 'startup' && studio) {
      const source = town.towerById(event.towerId)!.tower.floors[event.level!];
      const destination = town.towerById(studio.towerId)!.tower.floors[studio.level];
      event.studio = { towerId: studio.towerId, level: studio.level };
      const team = assignedStaff(town.allResidents(), event.towerId, source.level).slice().sort((a, b) => a.jobTier - b.jobTier).slice(0, 2);
      source.variant = 'founders-studio'; destination.variant = 'innovation-hub'; destination.subtype = 'tech'; destination.quality = Math.max(destination.quality, source.quality);
      for (const r of team) {
        r.jobTowerId = studio.towerId; r.jobFloor = studio.level; r.jobStartDay = town.day; r.blockedDays = 0;
        if (r.state.kind === 'idle') r.state.until = town.time;
        if (r.pendingActivity?.activity.kind === 'work') r.pendingActivity.duration = 0;
      }
      town.refreshStaffing();
      event.outcome = `Two teammates moved into ${destination.name}. Its Innovation hub earns 20% more wages while staff actually work. The original studio can hire again.`;
      this.finish(town, event, team.map((r) => r.id));
    } else if (event.kind === 'character') {
      const person = town.allResidents().find((r) => r.id === event.residentId)!;
      person.townRole = 'Neighborhood host';
      event.outcome = `${person.name} has a named welcome bench outside their home. Select the bench to meet its host. Neighbors in that tower gain +2 community mood while a host lives here; multiple hosts do not stack this bonus.`;
      this.finish(town, event, [person.id]);
    } else {
      if (event.kind === 'band') this.bandstands.add(event.parkIndex!);
      event.outcome = event.kind === 'critic' ? 'Jules will visit between 09:00 and 21:00. A completed tasting earns a permanent Critic’s choice sign and +25% spending here for the rest of the three-day visit.' :
        event.kind === 'band' ? 'The trio plays 17:00–22:00 for two town days. Nearby homes gain up to +6 community mood, and an audience walks into the park. The bandstand stays for future concerts.' :
        'Visitors arrive 17:00–22:00 for two town days. They queue and spend at staffed businesses; 12 served guests earn a permanent Festival favorite storefront.';
      town.stories.record(town.day, 'place', [], event.title, event.outcome, eventPlace(event));
    }
    this.applyEffects(town);
    return true;
  }

  decline(town: Town, id: string): boolean {
    const event = this.events.find((e) => e.id === id && e.status === 'offered');
    if (!event) return false;
    event.status = 'declined'; event.endsAt = town.time; event.outcome = 'Maybe another time. No penalty.';
    return true;
  }

  /** Before tower ticks: benefits and demand are published to the actual sim. */
  update(town: Town): void {
    for (const guest of this.parkGuests) {
      if (!guest.counted && town.time >= guest.arrivesAt) {
        guest.counted = true;
        const event = this.events.find((e) => e.id === guest.eventId);
        if (event) event.arrivals++;
      }
    }
    this.parkGuests = this.parkGuests.filter((g) => g.endsAt > town.time);
    for (const event of this.active()) {
      if (town.time >= event.endsAt) {
        event.outcome = event.kind === 'band' ? `${event.arrivals} listeners came to the park. The neighborhood has a concert to remember.` :
          `${event.served} guest visits completed; ${event.missed} could not be served. ${event.reviewPublished ? 'The earned storefront distinction remains.' : 'No special storefront was earned this time.'}`;
        this.finish(town, event); continue;
      }
      const open = town.timeOfDay >= (event.kind === 'critic' ? 540 : 1020) && town.timeOfDay < (event.kind === 'critic' ? 1260 : 1320);
      if (!open || town.time < event.nextVisitorAt) continue;
      event.nextVisitorAt = town.time + (event.kind === 'critic' ? 120 : event.kind === 'band' ? 18 : 10);
      if (event.kind === 'band') {
        if (this.parkGuests.length < 12) this.parkGuests.push({ id: `pg${this.nextGuest++}`, eventId: event.id, parkIndex: event.parkIndex!,
          startedAt: town.time, arrivesAt: town.time + 12, leavesAt: town.time + 62, endsAt: town.time + 74, counted: false });
        continue;
      }
      if (event.kind !== 'critic' && event.kind !== 'festival') continue;
      const guests = town.towers().flatMap((g) => g.visitors);
      if (guests.length >= 28 || event.kind === 'critic' && (event.reviewPublished || guests.some((g) => g.visit.eventId === event.id))) continue;
      const venues = town.towers().flatMap((g) => g.tower.floors.filter((f) => (f.type === 'shop' || f.type === 'restaurant') &&
        assignedStaff(town.allResidents(), g.id, f.level).length > 0 && (event.kind === 'festival' || g.id === event.towerId && f.level === event.level)).map((f) => ({ g, f })));
      if (!venues.length) continue;
      const venue = venues[this.nextGuest % venues.length];
      const visitor: Visitor = { ...createResident(0, venue.g.id), id: `guest${this.nextGuest++}`, name: event.kind === 'critic' ? 'Jules · food critic' : 'Festival visitor',
        visit: { eventId: event.id, target: venue.f.level, credited: false } };
      visitor.state = { kind: 'idle', floor: 0, activity: { kind: 'lobby', floor: 0 }, until: town.time };
      venue.g.visitors.push(visitor); event.arrivals++;
    }
    this.applyEffects(town);
  }

  afterTrips(town: Town): void {
    for (const game of town.towers()) for (const result of game.visitorOutcomes.splice(0)) {
      const event = this.events.find((e) => e.id === result.eventId);
      if (!event) continue;
      if (result.served) event.served++; else event.missed++;
      if (event.status !== 'active' || !result.served) continue;
      const floor = town.towerById(event.towerId)?.tower.floors[event.level ?? -1];
      if (event.kind === 'critic' && floor && !floor.variant && !event.reviewPublished) {
        event.reviewPublished = true; floor.variant = 'critics-choice';
        event.outcome = `Jules was served at ${floor.name}. A glowing review brings +25% visitor spending for the rest of the visit, plus permanent Critic’s choice status (+10%). The restaurant displays a framed award and dressed tables.`;
        town.stories.record(town.day, 'place', assignedStaff(town.allResidents(), event.towerId, floor.level).map((r) => r.id), `${floor.name} earned a glowing review`, event.outcome, eventPlace(event));
        town.events.push({ kind: 'event', message: `${floor.name} is now a Critic’s choice!` });
      }
      if (event.kind === 'festival' && event.served >= 12 && floor && !floor.variant && !event.reviewPublished) {
        event.reviewPublished = true;
        floor.variant = 'festival-market';
        event.outcome = 'Twelve guests reached a business. Your host storefront earned Festival favorite status (+10% visitor spending), with permanent fabric bunting and a festival award.';
        town.stories.record(town.day, 'place', [], 'A festival to remember', event.outcome, eventPlace(event));
        town.events.push({ kind: 'event', message: event.outcome });
      }
    }
  }

  private applyEffects(town: Town): void {
    const hosts = town.allResidents().filter((r) => r.townRole === 'Neighborhood host');
    for (const game of town.towers()) {
      game.floorVisitBonuses.clear();
      game.communityMood = hosts.some((r) => r.homeTowerId === game.id) ? 2 : 0;
      for (const event of this.active()) {
        if (event.kind === 'critic' && event.reviewPublished && event.towerId === game.id) game.floorVisitBonuses.set(event.level!, 1.25);
        if (event.kind === 'band') {
          const a = TOWER_SLOT_ORIGINS[slotIndexOfTowerId(game.id)], b = TOWER_SLOT_ORIGINS[event.parkIndex!];
          if (a && b) game.communityMood += Math.max(0, 6 * (1 - Math.abs(a.x - b.x) / 102));
        }
      }
      game.communityMood = Math.min(8, game.communityMood);
    }
  }

  private finish(town: Town, event: NeighborhoodEvent, ids: string[] = []): void {
    event.status = 'completed'; event.endsAt = town.time;
    town.stories.record(town.day, 'place', ids, event.title, event.outcome, eventPlace(event));
  }

  snapshot(): NeighborhoodSave { return structuredClone({ events: this.events, parkGuests: this.parkGuests, bandstands: [...this.bandstands], nextId: this.nextId, nextGuest: this.nextGuest, nextOfferAt: this.nextOfferAt }); }

  restore(data: NeighborhoodSave | undefined, town: Town): void {
    this.events = []; this.parkGuests = []; this.bandstands.clear();
    this.nextId = 1; this.nextGuest = 1; this.nextOfferAt = town.time + 120;
    if (!data) { this.applyEffects(town); return; }
    const kinds: NeighborhoodKind[] = ['critic', 'band', 'startup', 'character', 'festival'];
    const parkExists = (index: number) => Number.isInteger(index) && town.slots[index]?.unlocked && town.slots[index]?.zone === 'park';
    const validTarget = (e: NeighborhoodEvent) => {
      const floor = town.towerById(e.towerId)?.tower.floors[e.level ?? -1];
      if (e.kind === 'band' || e.kind === 'festival') {
        if (!parkExists(e.parkIndex!)) return false;
        if (e.kind === 'band') return town.slots[e.parkIndex!].id === e.towerId;
      }
      if (e.kind === 'critic') return Number.isInteger(e.level) && floor?.type === 'restaurant';
      if (e.kind === 'startup') return Number.isInteger(e.level) && floor?.type === 'office';
      if (e.kind === 'festival') return Number.isInteger(e.level) && (floor?.type === 'shop' || floor?.type === 'restaurant');
      return typeof e.residentId === 'string';
    };
    const eventIds = new Set<string>();
    this.events = (Array.isArray(data.events) ? data.events : []).filter((e) => e && typeof e.id === 'string' && /^ne[1-9]\d*$/.test(e.id) && kinds.includes(e.kind) &&
      typeof e.title === 'string' && typeof e.reason === 'string' && typeof e.outcome === 'string' && ['offered', 'active', 'completed', 'declined'].includes(e.status) &&
      [e.createdAt, e.startedAt, e.endsAt, e.nextVisitorAt].every((n) => Number.isFinite(n) && n >= 0) &&
      [e.served, e.missed, e.arrivals].every((n) => Number.isSafeInteger(n) && n >= 0) &&
      (e.status !== 'active' || e.endsAt > e.startedAt && ['critic', 'band', 'festival'].includes(e.kind)) &&
      town.slots.some((s) => s.id === e.towerId && s.unlocked) && validTarget(e) &&
      !eventIds.has(e.id) && !!eventIds.add(e.id))
      .slice(-20).map((e) => ({ ...e, reviewPublished: e.reviewPublished === true,
        title: e.title.slice(0, 200), reason: e.reason.slice(0, 1000), outcome: e.outcome.slice(0, 1000),
        studio: e.kind === 'startup' && e.status === 'completed' && e.studio && Number.isInteger(e.studio.level) &&
          town.towerById(e.studio.towerId)?.tower.floors[e.studio.level]?.variant === 'innovation-hub' ?
          { towerId: e.studio.towerId, level: e.studio.level } : undefined }));
    const guestIds = new Set<string>();
    this.parkGuests = (Array.isArray(data.parkGuests) ? data.parkGuests : []).filter((g) => g && this.events.some((e) => e.id === g.eventId) &&
      typeof g.id === 'string' && /^pg[1-9]\d*$/.test(g.id) && parkExists(g.parkIndex) &&
      this.events.some((e) => e.id === g.eventId && e.kind === 'band' && e.parkIndex === g.parkIndex) &&
      [g.startedAt, g.arrivesAt, g.leavesAt, g.endsAt].every((n) => Number.isFinite(n) && n >= 0) &&
      g.startedAt < g.arrivesAt && g.arrivesAt <= g.leavesAt && g.leavesAt < g.endsAt && g.endsAt > town.time &&
      !guestIds.has(g.id) && !!guestIds.add(g.id)).slice(0, 12).map((g) => ({ ...g, counted: g.counted === true }));
    this.bandstands = new Set([
      ...(Array.isArray(data.bandstands) ? data.bandstands : []),
      ...this.events.filter((e) => e.kind === 'band' && (e.status === 'active' || e.status === 'completed')).map((e) => e.parkIndex!),
    ].filter(parkExists));
    const serial = (n: number) => Number.isSafeInteger(n) && n > 0 ? n : 1;
    this.nextId = Math.max(serial(data.nextId), ...this.events.map((e) => serial(Number(e.id.slice(2)) + 1)));
    this.nextGuest = Math.max(serial(data.nextGuest), ...this.parkGuests.map((g) => serial(Number(g.id.slice(2)) + 1)),
      ...town.towers().flatMap((g) => g.visitors.map((v) => serial(Number(v.id.slice(5)) + 1))));
    this.nextOfferAt = Number.isFinite(data.nextOfferAt) ? Math.max(town.time, data.nextOfferAt) : town.time + 120;
    this.applyEffects(town);
  }
}
