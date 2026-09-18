import type { Game } from './game';
import { MINUTES_PER_DAY } from './types';

export interface TransitTrip {
  sequence: number;
  time: number;
  wait: number;
  stairs: boolean;
  missedVisit: boolean;
}
export interface LiftImprovement {
  label: string;
  atSequence: number;
  beforeWait: number | null;
  afterWait: number | null;
  observedTrips: number;
}
export interface TransitSave {
  trips: TransitTrip[];
  improvement: LiftImprovement | null;
  totals?: { day: number; stairs: number; missed: number; trips: number };
}

/** Actual resolved trips, not a prediction that an upgrade must have worked. */
export class TransitLedger {
  trips: TransitTrip[] = [];
  improvement: LiftImprovement | null = null;
  private sequence = 0;
  private totals = { day: 0, stairs: 0, missed: 0, trips: 0 };

  record(time: number, wait: number, stairs: boolean, missedVisit: boolean): void {
    const day = Math.floor(time / MINUTES_PER_DAY);
    if (this.totals.day !== day) this.totals = { day, stairs: 0, missed: 0, trips: 0 };
    this.totals.trips++;
    if (stairs) this.totals.stairs++;
    if (missedVisit) this.totals.missed++;
    this.trips.push({ sequence: ++this.sequence, time, wait: Math.max(0, wait), stairs, missedVisit });
    // One game-day of reports, with a hard cap for dense towns.
    this.trips = this.trips.filter((t) => time - t.time <= MINUTES_PER_DAY).slice(-500);
    const report = this.improvement;
    if (report && report.observedTrips < 20) {
      const after = this.trips.filter((t) => t.sequence > report.atSequence).slice(0, 20);
      report.observedTrips = after.length;
      if (after.length >= 10) report.afterWait = meanWait(after);
    }
  }

  beginImprovement(label: string): void {
    const before = this.trips.slice(-20);
    this.improvement = {
      label, atSequence: this.sequence,
      beforeWait: before.length >= 3 ? meanWait(before) : null,
      afterWait: null, observedTrips: 0,
    };
  }

  restore(save: TransitSave | undefined): void {
    this.trips = (Array.isArray(save?.trips) ? save.trips : []).filter((t) =>
      t && Number.isFinite(t.time) && Number.isFinite(t.wait) && t.wait >= 0 && Number.isFinite(t.sequence),
    ).slice(-500).map((t) => ({ ...t, stairs: t.stairs === true, missedVisit: t.missedVisit === true }));
    this.sequence = Math.max(0, ...this.trips.map((t) => t.sequence));
    const report = save?.improvement;
    this.improvement = report && typeof report.label === 'string' && Number.isFinite(report.atSequence) &&
      (report.beforeWait === null || Number.isFinite(report.beforeWait)) &&
      (report.afterWait === null || Number.isFinite(report.afterWait)) && Number.isFinite(report.observedTrips)
      ? { ...report, label: report.label.slice(0, 80) } : null;
    this.sequence = Math.max(this.sequence, this.improvement?.atSequence ?? 0);
    if (save?.totals && Object.values(save.totals).every((n) => Number.isFinite(n) && n >= 0)) {
      this.totals = { ...save.totals };
    }
  }

  today(now: number) {
    return this.totals.day === Math.floor(now / MINUTES_PER_DAY) ? { ...this.totals } : { day: Math.floor(now / MINUTES_PER_DAY), stairs: 0, missed: 0, trips: 0 };
  }

  snapshot(): TransitSave {
    return { trips: this.trips.map((t) => ({ ...t })), improvement: this.improvement ? { ...this.improvement } : null, totals: { ...this.totals } };
  }
}

function meanWait(trips: TransitTrip[]): number {
  return trips.length ? trips.reduce((sum, t) => sum + t.wait, 0) / trips.length : 0;
}

export function transitSnapshot(game: Game, now: number) {
  const queues = game.shafts().flatMap((s) => [...s.queues.values()].flat());
  const today = game.transit.today(now);
  return {
    waiting: queues.length,
    longest: Math.max(0, ...queues.map((r) => now - r.enqueuedAt)),
    stairsToday: today.stairs,
    missedToday: today.missed,
    average: game.averageWait(),
    improvement: game.transit.improvement,
  };
}

/** Urgency is current pressure, not a shaft's long-lived historical average.
 * Use up to 20 resolved trips from the last game hour, including abandonments.
 * After a purchase, only post-upgrade trips justify another upgrade prompt.
 * A genuinely old live queue always remains actionable, even before ten trips. */
export function liftPressure(game: Game, now: number) {
  const live = transitSnapshot(game, now);
  const since = game.transit.improvement?.atSequence ?? -1;
  const recent = game.transit.trips.filter(t => t.time <= now && now - t.time <= 60 && t.sequence > since).slice(-20);
  const recentWait = recent.length >= 3 ? recent.reduce((n, t) => n + t.wait, 0) / recent.length : null;
  return { ...live, recentWait,
    urgent: live.waiting > 0 && (live.longest > 20 || (recentWait !== null && recentWait > 20)) };
}
