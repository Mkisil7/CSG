import { ActivityKind, ECONOMY, MINUTES_PER_DAY, Resident } from './types';

/**
 * Traffic-driven economy: shops and restaurants earn per actual visit,
 * offices earn per worker-minute actually spent at work, rent accrues
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

  /** Per-tick passive accrual: rent for everyone, wages for those at work right now. */
  accrue(dt: number, residents: Resident[]): void {
    const rentPerMinute = ECONOMY.rentPerResidentPerDay / MINUTES_PER_DAY;
    const officePerMinute = ECONOMY.officeIncomePerWorkerDay / (8 * 60);

    let amount = residents.length * rentPerMinute * dt;
    for (const r of residents) {
      if (r.state.kind === 'idle' && r.state.activity.kind === 'work') {
        amount += officePerMinute * dt;
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

  nextElevatorCarCost(currentCars: number): number {
    return Math.round(
      ECONOMY.elevatorCarBaseCost * Math.pow(ECONOMY.elevatorCarCostGrowth, currentCars - 1),
    );
  }

  newDay(): void {
    this.incomeToday = 0;
  }
}
