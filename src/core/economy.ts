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

  constructor(coins = ECONOMY.startingCoins) {
    this.coins = coins;
  }

  /** Called when a resident actually arrives at a shop or restaurant. */
  recordVisit(kind: ActivityKind): number {
    let income = 0;
    if (kind === 'shop') income = ECONOMY.shopVisitIncome;
    if (kind === 'eat') income = ECONOMY.restaurantVisitIncome;
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

  newDay(): void {
    this.incomeToday = 0;
  }
}
