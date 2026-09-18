import type { Town } from './town';
import { HAPPINESS, Resident, type Floor } from './types';
import { assignedStaff } from './business';
import { jobTitle } from './careers';
import { residentTravelPressure } from './happiness';
import { residentPet } from './roomLife';

export type StoryKind = 'arrival' | 'career' | 'friendship' | 'concern' | 'recovery' | 'departure' | 'place';
export type StoryPlace = { kind: 'floor'; towerId: string; level: number } | { kind: 'slot'; index: number };
export interface ResidentStory {
  id: number;
  day: number;
  kind: StoryKind;
  residentIds: string[];
  title: string;
  text: string;
  /** Stable location, independent of names, staff moves and the event archive. */
  place?: StoryPlace;
}
export interface Friendship {
  residentId: string;
  daysTogether: number;
  lastDay: number;
}
export interface ResidentLife {
  name: string;
  /** Null means they predate this feature; don't invent an arrival date. */
  arrivalDay: number | null;
  job: string | null;
  tier: number;
  worried: boolean;
  friends: Friendship[];
  memories: ResidentStory[];
}
export interface StoriesSave {
  people: Record<string, ResidentLife>;
  journal: ResidentStory[];
  nextId: number;
}

const JOURNAL_LIMIT = 80;
const MEMORY_LIMIT = 8;
const FRIEND_LIMIT = 6;

/** Events come from observed simulation changes, never from randomly chosen names. */
export class TownStories {
  people: Record<string, ResidentLife> = Object.create(null) as Record<string, ResidentLife>;
  journal: ResidentStory[] = [];
  private nextId = 1;
  private lastSample = -Infinity;

  private life(r: Resident, day: number | null): ResidentLife {
    return {
      name: r.name, arrivalDay: day, job: jobKey(r), tier: r.jobTier,
      worried: r.unhappyDays > 0, friends: [], memories: [],
    };
  }

  restore(saved: StoriesSave | undefined, residents: Resident[]): void {
    // JSON data is untrusted: rebuild into a null-prototype dictionary and only
    // restore records belonging to current residents. Old saves start quietly.
    this.people = Object.create(null) as Record<string, ResidentLife>;
    const ids = new Set(residents.map((r) => r.id));
    for (const r of residents) {
      const old = saved?.people?.[r.id];
      const baseline = this.life(r, null);
      this.people[r.id] = old && typeof old === 'object' ? {
        ...baseline,
        arrivalDay: Number.isFinite(old.arrivalDay) ? old.arrivalDay : null,
        friends: Array.isArray(old.friends) ? old.friends.filter((f) =>
          ids.has(f.residentId) && f.residentId !== r.id && Number.isFinite(f.daysTogether) &&
          f.daysTogether > 0 && Number.isFinite(f.lastDay),
        ).slice(0, FRIEND_LIMIT).map((f) => ({ ...f })) : [],
        memories: cleanStories(old.memories).slice(-MEMORY_LIMIT),
      } : baseline;
    }
    this.journal = cleanStories(saved?.journal).slice(-JOURNAL_LIMIT);
    const memories = Object.values(this.people).flatMap((p) => p.memories);
    this.nextId = Math.max(0, ...this.journal.map((s) => s.id), ...memories.map((s) => s.id)) + 1;
  }

  snapshot(): StoriesSave {
    // Detached snapshot: visits and subsequent ticks must not mutate a saved town.
    return JSON.parse(JSON.stringify({ people: this.people, journal: this.journal, nextId: this.nextId })) as StoriesSave;
  }

  record(day: number, kind: StoryKind, ids: string[], title: string, text: string, place?: StoryPlace): void {
    const story: ResidentStory = { id: this.nextId++, day, kind, residentIds: ids, title, text };
    if (kind === 'place' && validStoryPlace(place)) story.place = { ...place };
    this.journal.push(story);
    this.journal = this.journal.slice(-JOURNAL_LIMIT);
    for (const id of ids) {
      const life = this.people[id];
      if (!life) continue;
      life.memories.push(story);
      life.memories = life.memories.slice(-MEMORY_LIMIT);
    }
  }

  /** A paid promotion is an immediate player action, including while paused.
   * Commit its memory before the edit's save, rather than waiting for sampling. */
  recordPromotion(town: Town, resident: Resident): void {
    const floor = resident.jobTowerId && resident.jobFloor !== null
      ? town.towerById(resident.jobTowerId)?.tower.floors[resident.jobFloor] : undefined;
    const title = jobTitle(resident, floor); if (!title || !floor) return;
    const life = this.people[resident.id] ?? (this.people[resident.id] = this.life(resident, null));
    this.record(town.day, 'career', [resident.id], `${resident.name} earned a promotion`,
      `${title} at ${floor.name}. ${resident.traits.includes('ambitious') ? 'The next rung is already on their mind.' : 'A new chapter in town.'}`);
    life.job = jobKey(resident); life.tier = resident.jobTier;
  }

  /** Sample at most once per game minute, independent of rendering frame rate. */
  update(town: Town): void {
    if (town.time - this.lastSample < 1) return;
    this.lastSample = town.time;
    const residents = town.allResidents();
    const ids = new Set(residents.map((r) => r.id));
    for (const r of residents) {
      let life = this.people[r.id];
      if (!life) {
        life = this.people[r.id] = this.life(r, town.day);
        // Capture a first job too, even if hiring happened on the arrival tick.
        life.job = null;
        this.record(town.day, 'arrival', [r.id], `${r.name} has arrived`,
          `${traitDescription(r)} A new home on floor ${r.homeFloor}.`);
      }
      const currentJob = jobKey(r);
      if (currentJob !== life.job || r.jobTier !== life.tier) {
        const floor = r.jobTowerId && r.jobFloor !== null
          ? town.towerById(r.jobTowerId)?.tower.floors[r.jobFloor] : undefined;
        const title = jobTitle(r, floor);
        const verb = life.job === null ? 'landed a first job' :
          life.job !== currentJob ? 'found a new opportunity' : 'earned a promotion';
        this.record(town.day, 'career', [r.id], `${r.name} ${currentJob ? verb : 'is looking for work'}`,
          title && floor ? `${title} at ${floor.name}. ${r.traits.includes('ambitious') ? 'The next rung is already on their mind.' : 'A new chapter in town.'}` : 'A staffed workplace gives them a reason to stay.');
        life.job = currentJob;
        life.tier = r.jobTier;
      }
      if (!life.worried && r.unhappyDays > 0) {
        this.record(town.day, 'concern', [r.id], `${r.name} is thinking of leaving`, residentThought(town, r));
        life.worried = true;
      } else if (life.worried && r.unhappyDays === 0 && r.happiness >= HAPPINESS.moveOutThreshold) {
        this.record(town.day, 'recovery', [r.id], `${r.name} is settling in again`,
          `Their happiness has recovered to ${Math.round(r.happiness)}. The move-out countdown has cleared.`);
        life.worried = false;
      }
      life.friends = life.friends.filter((f) => ids.has(f.residentId));
    }
    for (const [id, life] of Object.entries(this.people)) {
      if (ids.has(id)) continue;
      this.record(town.day, 'departure', [id], `${life.name} moved away`,
        'Their chapter remains in the town journal. Better housing, jobs and shorter waits help future neighbors stay.');
      delete this.people[id];
    }
    this.observeFriendships(town);
  }

  private observeFriendships(town: Town): void {
    for (const game of town.towers()) {
      const groups = new Map<string, Resident[]>();
      for (const r of game.residents) {
        if (r.state.kind !== 'idle' || !['work', 'eat', 'shop', 'leisure'].includes(r.state.activity.kind)) continue;
        const key = `${r.state.floor}:${r.state.activity.kind}`;
        const group = groups.get(key) ?? [];
        group.push(r);
        groups.set(key, group);
      }
      // Adjacent pairs keep this linear in population, and stable resident IDs
      // prevent changes in array order from producing different friendships.
      for (const group of groups.values()) {
        group.sort((a, b) => a.id.localeCompare(b.id));
        for (let i = 0; i < group.length - 1; i++) {
          const a = group[i], b = group[i + 1];
          const pa = this.people[a.id], pb = this.people[b.id];
          if (!pa || !pb) continue;
          let ab = pa.friends.find((f) => f.residentId === b.id);
          let ba = pb.friends.find((f) => f.residentId === a.id);
          if (!ab || !ba) {
            if (pa.friends.length >= FRIEND_LIMIT || pb.friends.length >= FRIEND_LIMIT) continue;
            ab = { residentId: b.id, daysTogether: 0, lastDay: 0 };
            ba = { residentId: a.id, daysTogether: 0, lastDay: 0 };
            pa.friends.push(ab);
            pb.friends.push(ba);
          }
          if (ab.lastDay >= town.day) continue;
          ab.daysTogether++;
          ba.daysTogether = ab.daysTogether;
          ab.lastDay = ba.lastDay = town.day;
          if (ab.daysTogether === 3) {
            const floor = a.state.kind === 'idle' ? game.tower.floors[a.state.floor] : undefined;
            this.record(town.day, 'friendship', [a.id, b.id], `${a.name} & ${b.name} became friends`,
              `Three shared days brought them together at ${floor?.name ?? 'a local business'}. Familiar faces make this place home.`);
          }
        }
      }
    }
  }
}

function jobKey(r: Resident): string | null {
  return r.jobTowerId !== null && r.jobFloor !== null ? `${r.jobTowerId}:${r.jobFloor}` : null;
}

function cleanStories(value: unknown): ResidentStory[] {
  if (!Array.isArray(value)) return [];
  const kinds: StoryKind[] = ['arrival', 'career', 'friendship', 'concern', 'recovery', 'departure', 'place'];
  return value.filter((s): s is ResidentStory => s && Number.isFinite(s.id) && Number.isFinite(s.day) &&
    kinds.includes(s.kind) && typeof s.title === 'string' && typeof s.text === 'string' &&
    Array.isArray(s.residentIds) && s.residentIds.every((id: unknown) => typeof id === 'string'))
    .map((s) => ({ id: s.id, day: s.day, kind: s.kind, title: s.title.slice(0, 200), text: s.text.slice(0, 500), residentIds: s.residentIds.slice(0, 2),
      ...(s.kind === 'place' && validStoryPlace(s.place) ? { place: s.place.kind === 'floor'
        ? { kind: 'floor' as const, towerId: s.place.towerId, level: s.place.level }
        : { kind: 'slot' as const, index: s.place.index } } : {}) }));
}

function validStoryPlace(value: unknown): value is StoryPlace {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<StoryPlace> & { towerId?: unknown; level?: unknown; index?: unknown };
  return p.kind === 'floor' ? typeof p.towerId === 'string' && p.towerId.length > 0 && p.towerId.length <= 80 &&
    Number.isSafeInteger(p.level) && (p.level as number) >= 0 : p.kind === 'slot' && Number.isSafeInteger(p.index) && (p.index as number) >= 0;
}

/** Resolve against this town now; malformed/missing places never become links. */
export function storyPlace(town: Town, story: ResidentStory): StoryPlace | null {
  const place = story.place;
  if (story.kind !== 'place' || !validStoryPlace(place)) return null;
  if (place.kind === 'floor') return town.towerById(place.towerId)?.tower.floors[place.level] ? { ...place } : null;
  const slot = town.slots[place.index];
  return slot?.unlocked && slot.zone === 'park' ? { ...place } : null;
}

/** Personal memories can outlive the bounded public journal and event history. */
export function findStoryPlace(town: Town, id: number): StoryPlace | null {
  const story = town.stories.journal.find(s => s.id === id) ??
    Object.values(town.stories.people).flatMap(life => life.memories).find(s => s.id === id);
  return story ? storyPlace(town, story) : null;
}

export function traitDescription(r: Resident): string {
  const descriptions = {
    practical: 'Knows every bargain on the block.', trendy: 'Always finds the next favorite spot.',
    foodie: 'Plans the day around a good meal.', techie: 'Has an idea for a better tomorrow.',
    social: 'Turns familiar faces into friends.', ambitious: 'Dreams of a corner office.',
  };
  return descriptions[r.traits[0]] ?? 'Ready to make this town home.';
}

export interface ResidentConcern {
  kind: 'lift' | 'commute' | 'food' | 'leisure' | 'job' | 'promotion' | 'housing';
  pressure: number;
  text: string;
  label: string;
  detail?: string;
  target: { kind: 'floor'; towerId: string; level: number } | { kind: 'transit'; towerId: string } | { kind: 'happiness' };
}

/** Ordinary residents eat and go out where they live/work, not in arbitrary
 * towers elsewhere in town. Prefer the tower they are currently standing in. */
function localAmenity(town: Town, r: Resident, leisure: boolean) {
  const people = town.allResidents();
  const games = town.towers().filter(g => g.id === r.homeTowerId || g.id === r.jobTowerId)
    .sort((a, b) => Number(b.residents.some(person => person.id === r.id)) - Number(a.residents.some(person => person.id === r.id)));
  for (const game of games) {
    const floor = game.tower.floors.find((f: Floor) => leisure
      ? f.type === 'landmark' || ((f.type === 'shop' || f.type === 'restaurant' && f.subtype === 'bar') && assignedStaff(people, game.id, f.level).length > 0)
      : f.type === 'restaurant' && assignedStaff(people, game.id, f.level).length > 0);
    if (floor) return { game, floor };
  }
  return null;
}

/** Rank actionable concerns by happiness points, not by an arbitrary UI order.
 * Ordinary full homes need not dominate the thoughts of contented residents. */
export function residentConcern(town: Town, r: Resident): ResidentConcern | null {
  const game = town.towerById(r.homeTowerId);
  const job = r.jobTowerId ? town.towerById(r.jobTowerId) : undefined;
  const travel = residentTravelPressure(r, game ?? undefined, job ?? undefined);
  const candidates: ResidentConcern[] = [];
  const mood = { kind: 'happiness' as const };
  if (game && travel.waitMinutes > 20) candidates.push({ kind: 'lift', pressure: travel.waitPenalty,
    text: `Our home tower's average lift wait is ${Math.round(travel.waitMinutes)} minutes. Could we improve its lift flow?`,
    label: 'Inspect my home lifts', target: { kind: 'transit', towerId: game.id } });
  if (travel.commutePenalty > 0) candidates.push({ kind: 'commute', pressure: travel.commutePenalty,
    text: `My usual street route to work is ${travel.commuteMinutes} minutes, before weather and lift waits. A job closer to home would help.`,
    label: 'See travel pressures', target: mood });
  if (r.needs.food < 50) {
    const place = localAmenity(town, r, false);
    candidates.push({ kind: 'food', pressure: (100 - r.needs.food) * HAPPINESS.weights.food,
    text: 'Meals have been hard to fit in lately. I need an open restaurant I can reach in time.',
    label: place ? `Inspect ${place.floor.name}` : 'See food and neighborhood needs',
    detail: place ? `Staffed restaurant in ${place.game.name}. Check its traffic and lift access; opening this panel does not send them there. Food and happiness are reviewed at day’s end.` :
      'No staffed restaurant in their home or work tower. Build or staff one there; a restaurant elsewhere does not give them a normal meal stop.',
    target: place ? { kind: 'floor', towerId: place.game.id, level: place.floor.level } : mood });
  }
  if (r.needs.entertainment < 45) {
    const place = localAmenity(town, r, true);
    candidates.push({ kind: 'leisure', pressure: (100 - r.needs.entertainment) * HAPPINESS.weights.entertainment,
    text: "I'd love time for an outing: a shop, a bar, or a public landmark in a tower where I live or work.",
    label: place ? `Inspect ${place.floor.name}` : 'See leisure and neighborhood needs',
    detail: place ? `An outing option in ${place.game.name}. Visits depend on their schedule and lift access; inspecting it does not start a visit.` :
      'No staffed shop, staffed bar or public landmark in their home or work tower. Add an outing option there.',
    target: place ? { kind: 'floor', towerId: place.game.id, level: place.floor.level } : mood });
  }
  if (r.jobFloor === null) candidates.push({ kind: 'job', pressure: (100 - HAPPINESS.unemployedBaseline) * HAPPINESS.weights.employment,
    text: "I'm looking for a job. Is there a business here with an open entry-level place?",
    label: 'See employment needs', target: mood });
  else if (r.blockedDays > 0 && job?.tower.floors[r.jobFloor]) candidates.push({ kind: 'promotion',
    pressure: Math.max(1, (100 - r.needs.employment) * HAPPINESS.weights.employment),
    text: `I've waited ${r.blockedDays} day${r.blockedDays === 1 ? '' : 's'} for my next career step. Is there a senior place available now?`,
    label: 'Inspect my workplace', target: { kind: 'floor', towerId: job.id, level: r.jobFloor } });
  if (r.needs.housing < 65 && r.happiness < 70) candidates.push({ kind: 'housing',
    pressure: (100 - r.needs.housing) * HAPPINESS.weights.housing,
    text: 'Sharing a busy home feels cramped. A nearby park and a thriving neighborhood could help balance that.',
    label: 'See neighborhood wellbeing', target: mood });
  return candidates.sort((a, b) => b.pressure - a.pressure)[0] ?? null;
}

/** Thoughts describe actual concerns or observed moments, without mutating stories. */
export function residentThought(town: Town, r: Resident): string {
  const remaining = Math.max(0, HAPPINESS.moveOutAfterDays - r.unhappyDays);
  const warning = r.unhappyDays > 0 ? `I may leave after ${remaining} more unhappy day${remaining === 1 ? '' : 's'}. ` : '';
  const concern = residentConcern(town, r);
  if (concern) return `${warning}${concern.text}`;
  if (warning) return `${warning}I'm still finding my feet. Let's look at how the neighborhood is doing.`;
  if (r.state.kind === 'idle') {
    const here = town.towers().find((g) => g.residents.some((person) => person.id === r.id));
    const state = r.state, floor = here?.tower.floors[state.floor];
    if (['work', 'eat', 'shop', 'leisure'].includes(state.activity.kind)) {
      const friends = new Set(town.stories.people[r.id]?.friends.filter((f) => f.daysTogether >= 3).map((f) => f.residentId));
      const friend = here?.residents.find((person) => friends.has(person.id) && person.state.kind === 'idle' &&
        person.state.floor === state.floor && person.state.activity.kind === state.activity.kind);
      if (friend && floor) return `It's good to see ${friend.name} here at ${floor.name}. Familiar faces make this town feel like home.`;
    }
    if (state.activity.kind === 'work' && floor) return `I'm on shift at ${floor.name}. It's good to have a place in the neighborhood.`;
    if (state.activity.kind === 'eat' && floor) return `A little time to sit down at ${floor.name}. This is the part of the day I was looking forward to.`;
    if (state.activity.kind === 'leisure' && floor) return `A quiet moment at ${floor.name}. There's more to this town than the daily routine.`;
    const pet = residentPet(r);
    if (state.activity.kind === 'home' && here?.id === r.homeTowerId && state.floor === r.homeFloor && pet)
      return `Home with ${pet.name} by the window. Little things make this apartment ours.`;
  }
  if (r.nocturnal) return 'The town is my favorite after dark. A late dinner, familiar faces, lights in the windows.';
  return `${traitDescription(r)} ${r.happiness >= 75 ? 'I can see myself staying here.' : 'This place has potential.'}`;
}
