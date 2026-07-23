/**
 * "Live City" events: a lightweight director that periodically throws a
 * town-wide happening at the player — a street festival, a tourism surge, a
 * celebrity move-in, a recession — each with a real, temporary mechanical
 * effect (foot-traffic income and/or town mood) and a duration in days.
 *
 * Effects are exposed as two simple scalars the rest of the sim already knows
 * how to consume: an income multiplier (folded into every shop/restaurant
 * visit via Economy.eventMultiplier) and a mood bonus (added to every
 * resident's daily happiness). Events are deliberately NOT persisted — they're
 * live ambience that regenerates, so there's no save-format churn.
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
  /** True for a beneficial event (used for UI tone and world visuals). */
  good: boolean;
  /** Day it began and the day it ends (exclusive). */
  startDay: number;
  endsDay: number;
  /** Multiplier on town-wide foot-traffic income while active. */
  incomeMultiplier: number;
  /** Happiness points added to every resident while active (may be negative). */
  moodBonus: number;
}

interface EventDef {
  kind: CityEventKind;
  emoji: string;
  title: string;
  blurb: string;
  good: boolean;
  incomeMultiplier: number;
  moodBonus: number;
  minDays: number;
  maxDays: number;
  /** Relative spawn likelihood. Good events outweigh bad ones on purpose. */
  weight: number;
}

const DEFS: EventDef[] = [
  {
    kind: 'festival',
    emoji: '🎉',
    title: 'Street Festival',
    blurb: 'The whole town is out celebrating — shops and restaurants are packed!',
    good: true,
    incomeMultiplier: 1.7,
    moodBonus: 8,
    minDays: 2,
    maxDays: 3,
    weight: 5,
  },
  {
    kind: 'tourism',
    emoji: '📸',
    title: 'Tourist Season',
    blurb: 'Visitors are flooding in and spending big all over town.',
    good: true,
    incomeMultiplier: 1.5,
    moodBonus: 3,
    minDays: 3,
    maxDays: 4,
    weight: 5,
  },
  {
    kind: 'boom',
    emoji: '📈',
    title: 'Economic Boom',
    blurb: 'Wallets are open and business is booming across the town.',
    good: true,
    incomeMultiplier: 1.4,
    moodBonus: 4,
    minDays: 3,
    maxDays: 5,
    weight: 4,
  },
  {
    kind: 'celebrity',
    emoji: '🌟',
    title: 'A Celebrity Moves In',
    blurb: 'A famous face now calls your town home — everyone is thrilled.',
    good: true,
    incomeMultiplier: 1.25,
    moodBonus: 10,
    minDays: 4,
    maxDays: 6,
    weight: 3,
  },
  {
    kind: 'grandOpening',
    emoji: '🎈',
    title: 'Grand-Opening Buzz',
    blurb: 'Buzz is in the air and crowds are drawn to every storefront.',
    good: true,
    incomeMultiplier: 1.6,
    moodBonus: 5,
    minDays: 1,
    maxDays: 2,
    weight: 4,
  },
  {
    kind: 'recession',
    emoji: '📉',
    title: 'Recession',
    blurb: 'Times are tight — people are spending far less than usual.',
    good: false,
    incomeMultiplier: 0.7,
    moodBonus: -6,
    minDays: 2,
    maxDays: 4,
    weight: 3,
  },
  {
    kind: 'heatwave',
    emoji: '🥵',
    title: 'Heat Wave',
    blurb: 'A sweltering spell has everyone cranky and staying indoors.',
    good: false,
    incomeMultiplier: 0.9,
    moodBonus: -8,
    minDays: 2,
    maxDays: 3,
    weight: 2,
  },
  {
    kind: 'rain',
    emoji: '🌧️',
    title: 'Rainy Spell',
    blurb: 'Grey skies and puddles keep the crowds thin this week.',
    good: false,
    incomeMultiplier: 0.85,
    moodBonus: -4,
    minDays: 1,
    maxDays: 3,
    weight: 2,
  },
];

/** Days between the town opening and the first event, and between events. */
const FIRST_EVENT_DELAY = 1;
const MIN_GAP_DAYS = 2;
const MAX_GAP_DAYS = 5;
/** Never run more than this many overlapping events at once. */
const MAX_CONCURRENT = 2;

function randInt(lo: number, hi: number, rng: () => number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function weightedDef(rng: () => number): EventDef {
  const total = DEFS.reduce((s, d) => s + d.weight, 0);
  let r = rng() * total;
  for (const d of DEFS) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return DEFS[0];
}

export class CityEventSystem {
  active: CityEvent[] = [];
  private nextAtDay: number;
  private seq = 0;

  constructor(startDay = 1, rng: () => number = Math.random) {
    this.nextAtDay = startDay + FIRST_EVENT_DELAY + randInt(0, 1, rng);
  }

  /**
   * Advance the director to `day`. Expires finished events and, when the
   * schedule is due (and there's room), starts a new one. Returns what changed
   * so the caller can announce it. Safe to call every tick — it's cheap and
   * idempotent within a day.
   */
  update(day: number, rng: () => number = Math.random): { started: CityEvent[]; ended: CityEvent[] } {
    const ended = this.active.filter((e) => day >= e.endsDay);
    if (ended.length) this.active = this.active.filter((e) => day < e.endsDay);

    const started: CityEvent[] = [];
    // Catch up across any skipped days (e.g. offline catch-up jumps the clock).
    while (day >= this.nextAtDay) {
      const scheduledDay = this.nextAtDay;
      this.nextAtDay = scheduledDay + randInt(MIN_GAP_DAYS, MAX_GAP_DAYS, rng);
      if (this.active.length >= MAX_CONCURRENT) continue;
      const def = weightedDef(rng);
      if (this.active.some((e) => e.kind === def.kind)) continue; // no duplicates
      const evt: CityEvent = {
        id: `evt${this.seq++}`,
        kind: def.kind,
        emoji: def.emoji,
        title: def.title,
        blurb: def.blurb,
        good: def.good,
        startDay: scheduledDay,
        endsDay: scheduledDay + randInt(def.minDays, def.maxDays, rng),
        incomeMultiplier: def.incomeMultiplier,
        moodBonus: def.moodBonus,
      };
      this.active.push(evt);
      started.push(evt);
    }
    return { started, ended };
  }

  /** Product of active income multipliers (1 when nothing is happening). */
  incomeMultiplier(): number {
    return this.active.reduce((m, e) => m * e.incomeMultiplier, 1);
  }

  /** Sum of active mood bonuses (0 when nothing is happening). */
  moodBonus(): number {
    return this.active.reduce((s, e) => s + e.moodBonus, 0);
  }

  /** True while any celebratory event is running (drives festive world visuals). */
  hasFestive(): boolean {
    return this.active.some((e) => e.good && (e.kind === 'festival' || e.kind === 'grandOpening'));
  }
}
