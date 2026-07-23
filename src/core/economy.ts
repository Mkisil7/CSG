import { ActivityKind, ECONOMY, JOB_TIERS, MINUTES_PER_DAY } from './types';
import { TowerContext } from './careers';

/**
 * Traffic-driven economy: shops and restaurants earn per actual visit,
 * workers earn wages only for minutes actually spent at work, rent accrues
 * per resident-minute. No timers, no taps — income follows real movement.
 */
export class Economy {
  coins: number;
  incomeToday = 0;

  /**
   * Town-wide multiplier on foot-traffic income, driven by live City Events
   * (a festival or boom lifts it, a recession drags it down). 1 = normal;
   * ephemeral, set each tick by the event system, never persisted.
   */
  eventMultiplier = 1;

  constructor(coins = ECONOMY.startingCoins) {
    this.coins = coins;
  }

  /**
   * Called when a resident actually arrives at a shop or restaurant.
   * The multiplier folds in business quality, subtype, and shopper happiness;
   * the active City-Event multiplier scales the whole town's takings on top.
   */
  recordVisit(kind: ActivityKind, multiplier = 1): number {
    let income = 0;
    if (kind === 'shop') income = ECONOMY.shopVisitIncome;
    if (kind === 'eat') income = ECONOMY.restaurantVisitIncome;
    income = Math.round(income * multiplier * this.eventMultiplier * 100) / 100;
    this.earn(income);
    return income;
  }

  /**
   * Per-tick passive accrual across the whole town: rent for everyone, wages
   * for those at work right now (scaled by their job tier's pay multiplier).
   */
  accrue(dt: number, contexts: TowerContext[]): void {
    const rentPerMinute = ECONOMY.rentPerResidentPerDay / MINUTES_PER_DAY;
    const byId = new Map(contexts.map((c) => [c.id, c]));

    let amount = 0;
    for (const ctx of contexts) {
      amount += ctx.residents.length * rentPerMinute * dt;
      for (const r of ctx.residents) {
        if (r.state.kind !== 'idle' || r.state.activity.kind !== 'work') continue;
        if (r.jobTowerId === null || r.jobFloor === null) continue;
        const jobCtx = byId.get(r.jobTowerId);
        const floor = jobCtx?.tower.floors[r.jobFloor];
        if (!floor || floor.type === 'lobby' || floor.type === 'residential') continue;
        const tier = JOB_TIERS[floor.type][r.jobTier];
        if (!tier) continue;
        const wagePerMinute = ECONOMY.baseWagePerWorkerDay[floor.type] / (8 * 60);
        amount += wagePerMinute * tier.payMultiplier * dt;
      }
    }
    this.earn(amount);
  }

  earn(amount: number): void {
    this.coins += amount;
    this.incomeToday += amount;
  }

  /** Attempt to spend; returns false (and leaves coins untouched) if unaffordable. */
  spend(amount: number): boolean {
    if (this.coins < amount) return false;
    this.coins -= amount;
    return true;
  }

  /** Unavoidable cost (e.g. upkeep): deducts what it can, floored at zero. */
  charge(amount: number): void {
    const taken = Math.min(this.coins, amount);
    this.coins -= taken;
    this.incomeToday -= taken;
  }

  newDay(): void {
    this.incomeToday = 0;
  }
}
