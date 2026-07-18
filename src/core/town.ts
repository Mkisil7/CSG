import { MINUTES_PER_DAY, MOVE_IN_INTERVAL, Resident, TOWN } from './types';
import { Game, GameEvent } from './game';
import { Economy } from './economy';
import { createResident, resetDailyFlags } from './residents';
import { assignJobs, processPromotions, TowerContext } from './careers';
import { staffedBusinessLevels, updateBusinessDay, resetBusinessDay } from './business';
import { updateHappinessAndEvict } from './happiness';
import { Missions } from './missions';

/** How many recent events the Activity feed retains. */
const ACTIVITY_LOG_MAX = 200;

export interface TownSlot {
  id: string;
  unlocked: boolean;
  game: Game | null;
}

/**
 * The whole town: a fixed row of tower slots sharing one wallet and one clock.
 * Town runs each tower's local simulation, handles town-wide concerns
 * (move-ins, hiring, promotions, business quality, happiness, missions, day
 * rollover), and hands commuting residents off between towers when their
 * street-level travel time elapses.
 */
export class Town {
  slots: TownSlot[];
  economy = new Economy();
  missions = new Missions();

  /** Total game minutes elapsed since the town opened. */
  time = 8 * 60; // day 1 starts at 08:00 so things happen right away
  moveInTimer = 0;

  /** Events emitted during the last tick, for UI toasts. */
  events: GameEvent[] = [];

  /**
   * Rolling feed of recent events (newest last), the source for the Activity
   * panel. Not persisted — it's a live feed, not save data.
   */
  activityLog: GameEvent[] = [];

  constructor() {
    this.slots = TOWN.slotCosts.map((_, i) => ({
      id: `t${i}`,
      unlocked: i === 0,
      game: i === 0 ? new Game('t0', this.economy) : null,
    }));
  }

  get day(): number {
    return Math.floor(this.time / MINUTES_PER_DAY) + 1;
  }

  get timeOfDay(): number {
    return this.time % MINUTES_PER_DAY;
  }

  /** All unlocked towers' games. */
  towers(): Game[] {
    return this.slots.filter((s) => s.unlocked && s.game).map((s) => s.game!);
  }

  towerById(id: string): Game | null {
    return this.towers().find((g) => g.id === id) ?? null;
  }

  private contexts(): TowerContext[] {
    return this.towers();
  }

  /** All residents, wherever they currently are. */
  allResidents(): Resident[] {
    return this.towers().flatMap((g) => g.residents);
  }

  get population(): number {
    return this.towers().reduce((sum, g) => sum + g.residents.length, 0);
  }

  /** Residents whose home is the given tower, regardless of where they stand. */
  homeResidentsOf(towerId: string): Resident[] {
    return this.allResidents().filter((r) => r.homeTowerId === towerId);
  }

  // ---- tower slot purchase ---------------------------------------------

  canUnlockSlot(index: number): { ok: boolean; reason?: string } {
    const slot = this.slots[index];
    if (!slot || slot.unlocked) return { ok: false, reason: 'Not available' };
    if (this.population < TOWN.slotUnlockPop[index]) {
      return { ok: false, reason: `Needs ${TOWN.slotUnlockPop[index]} town residents` };
    }
    if (this.economy.coins < TOWN.slotCosts[index]) {
      return { ok: false, reason: 'Not enough coins' };
    }
    return { ok: true };
  }

  unlockSlot(index: number): boolean {
    if (!this.canUnlockSlot(index).ok) return false;
    const slot = this.slots[index];
    this.economy.spend(TOWN.slotCosts[index]);
    slot.unlocked = true;
    slot.game = new Game(slot.id, this.economy);
    this.events.push({ kind: 'build', message: 'Broke ground on a new tower!' });
    return true;
  }

  // ---- simulation --------------------------------------------------------

  tick(dt: number): void {
    this.events = [];
    const prevDay = this.day;
    this.time += dt;

    if (this.day !== prevDay) this.dayRollover();

    this.handleMoveIns(dt);

    for (const game of this.towers()) {
      game.homePopulation = this.homeResidentsOf(game.id).length;
      game.staffedLevels = staffedBusinessLevels(game.tower, game.id, this.allResidents());
      game.tick(dt, this.time);
      this.events.push(...game.events);
    }

    // Street-level handoffs: residents whose commute just finished switch towers.
    for (const game of this.towers()) {
      for (const dep of game.readyToDepart) {
        const idx = game.residents.findIndex((r) => r.id === dep.residentId);
        const dest = this.towerById(dep.toTowerId);
        if (idx === -1 || !dest) continue;
        const [resident] = game.residents.splice(idx, 1);
        resident.state = {
          kind: 'idle',
          floor: 0,
          activity: { kind: 'lobby', floor: 0 },
          until: this.time,
        };
        dest.residents.push(resident);
      }
    }

    assignJobs(this.contexts(), this.day);
    this.economy.accrue(dt, this.contexts());
    this.events.push(...this.missions.checkInstant(this));

    // Append this tick's events to the rolling Activity feed (bounded).
    if (this.events.length > 0) {
      this.activityLog.push(...this.events);
      const overflow = this.activityLog.length - ACTIVITY_LOG_MAX;
      if (overflow > 0) this.activityLog.splice(0, overflow);
    }
  }

  /**
   * Day rollover, in a deliberate order: promotions first (so nobody is
   * judged on stale pre-promotion state), then business quality (consumes
   * yesterday's visit counts), then happiness/evictions (consumes yesterday's
   * meal/shopping flags and fresh quality), then daily missions (fresh
   * happiness, income still un-reset), and only then the daily resets.
   */
  private dayRollover(): void {
    const games = this.towers();
    for (const game of games) {
      game.staffedLevels = staffedBusinessLevels(game.tower, game.id, this.allResidents());
    }
    this.events.push(...processPromotions(this.contexts(), this.day));
    updateBusinessDay(this.contexts(), this.economy);
    this.events.push(...updateHappinessAndEvict(games, this.day));
    this.events.push(...this.missions.checkDaily(this));
    resetBusinessDay(this.contexts());
    resetDailyFlags(this.allResidents());
    this.economy.newDay();
  }

  private handleMoveIns(dt: number): void {
    this.moveInTimer += dt;
    if (this.moveInTimer < MOVE_IN_INTERVAL) return;
    this.moveInTimer = 0;

    for (const game of this.towers()) {
      const homeResidents = this.homeResidentsOf(game.id);
      const vacancy = game.tower.vacantHomeFloor(homeResidents);
      if (!vacancy) continue;

      const resident = createResident(vacancy.level, game.id);
      if (resident.state.kind === 'idle') resident.state.until = this.time;
      game.residents.push(resident);
      this.events.push({ kind: 'move-in', message: `${resident.name} moved in!` });
      return; // one move-in per interval, town-wide
    }
  }
}
