/**
 * Compatibility for positive bonuses saved by the retired random director.
 * No new events originate here. Neighborhood invitations are now the single
 * source of new happenings: actual people/venues, explained eligibility and a
 * player choice. Existing positive bonuses expire normally; arbitrary penalties
 * are not restored. Weather continues to affect actual journeys independently.
 */

export type CityEventKind =
  | 'festival'
  | 'tourism'
  | 'boom'
  | 'celebrity'
  | 'grandOpening'
  | 'recession'
  | 'heatwave'
  | 'rain';

export interface CityEvent {
  id: string;
  kind: CityEventKind;
  emoji: string;
  title: string;
  blurb: string;
  /** True for the beneficial legacy bonuses still supported by saves. */
  good: boolean;
  /** Day it began and the day it ends (exclusive). */
  startDay: number;
  endsDay: number;
  /** Multiplier on town-wide foot-traffic income while active. */
  incomeMultiplier: number;
  /** Happiness points added to every resident while this saved bonus lasts. */
  moodBonus: number;
}

export interface CityEventsSave {
  active: Pick<CityEvent, 'id' | 'kind' | 'startDay' | 'endsDay'>[];
  /** Legacy scheduling fields are accepted but never resumed. */
  nextAtDay?: number;
  seq?: number;
}

interface EventDef {
  kind: CityEventKind;
  emoji: string;
  title: string;
  blurb: string;
  good: boolean;
  incomeMultiplier: number;
  moodBonus: number;
  maxDays: number;
}

const DEFS: EventDef[] = [
  {
    kind: 'festival',
    emoji: '🎉',
    title: 'Saved festival bonus',
    blurb: 'A spending and mood bonus from an earlier version. New festivals require a neighborhood invitation; this saved bonus does not spawn guests.',
    good: true,
    incomeMultiplier: 1.7,
    moodBonus: 8,
    maxDays: 3,
  },
  {
    kind: 'tourism',
    emoji: '📸',
    title: 'Saved spending bonus',
    blurb: 'A temporary bonus from an earlier version, applied only when somebody actually visits a business.',
    good: true,
    incomeMultiplier: 1.5,
    moodBonus: 3,
    maxDays: 4,
  },
  {
    kind: 'boom',
    emoji: '📈',
    title: 'Saved business bonus',
    blurb: 'Your previously saved spending and mood bonus lasts until its original end date.',
    good: true,
    incomeMultiplier: 1.4,
    moodBonus: 4,
    maxDays: 5,
  },
  {
    kind: 'celebrity',
    emoji: '🌟',
    title: 'Saved community buzz',
    blurb: 'A community bonus saved by an earlier version. No fictional resident is added; familiar faces now grow from real friendships.',
    good: true,
    incomeMultiplier: 1.25,
    moodBonus: 10,
    maxDays: 6,
  },
  {
    kind: 'grandOpening',
    emoji: '🎈',
    title: 'Saved opening bonus',
    blurb: 'A previously saved opening bonus. New storefront rewards come from actual service and quality.',
    good: true,
    incomeMultiplier: 1.6,
    moodBonus: 5,
    maxDays: 2,
  },
];

/** Never run more than this many overlapping events at once. */
const MAX_CONCURRENT = 2;

export class CityEventSystem {
  active: CityEvent[] = [];
  snapshot(): CityEventsSave {
    return { active: this.active.map(({ id, kind, startDay, endsDay }) => ({ id, kind, startDay, endsDay })) };
  }

  restore(saved: CityEventsSave | undefined, day: number): void {
    this.active = [];
    const seen = new Set<CityEventKind>();
    for (const event of Array.isArray(saved?.active) ? saved.active : []) {
      if (!event) continue;
      const def = DEFS.find((candidate) => candidate.kind === event.kind);
      if (!def?.good || seen.has(def.kind) || typeof event.id !== 'string' || !/^evt\d+$/.test(event.id) ||
        !Number.isSafeInteger(Number(event.id.slice(3))) ||
        !Number.isSafeInteger(event.startDay) || !Number.isSafeInteger(event.endsDay) ||
        event.startDay < 1 || event.startDay > day || event.endsDay <= day ||
        event.endsDay > event.startDay + def.maxDays) continue;
      // Presentation and multipliers come from known definitions, not a share code.
      this.active.push({ id: event.id, kind: def.kind, startDay: event.startDay, endsDay: event.endsDay,
        emoji: def.emoji, title: def.title, blurb: def.blurb, good: def.good,
        incomeMultiplier: def.incomeMultiplier, moodBonus: def.moodBonus });
      seen.add(def.kind);
      if (this.active.length === MAX_CONCURRENT) break;
    }
  }

  /**
   * Finish saved bonuses without generating replacements or replaying old news.
   */
  update(day: number): { ended: CityEvent[] } {
    const ended = this.active.filter((e) => day >= e.endsDay);
    if (ended.length) this.active = this.active.filter((e) => day < e.endsDay);

    return { ended };
  }

  /** Product of active income multipliers (1 when nothing is happening). */
  incomeMultiplier(): number {
    return this.active.reduce((m, e) => m * e.incomeMultiplier, 1);
  }

  /** Sum of active mood bonuses (0 when nothing is happening). */
  moodBonus(): number {
    return this.active.reduce((s, e) => s + e.moodBonus, 0);
  }

}
