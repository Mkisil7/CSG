import { MINUTES_PER_DAY, MOVE_IN_INTERVAL, Resident, TOWN } from './types';
import { Game, GameEvent } from './game';
import { Economy } from './economy';
import { createResident, resetDailyFlags } from './residents';
import { assignJobs, processPromotions, TowerContext } from './careers';

export interface TownSlot {
  id: string;
  unlocked: boolean;
  game: Game | null;
}

/**
 * The whole town: a fixed row of tower slots sharing one wallet and one clock.
 * Town runs each tower's local simulation, handles town-wide concerns
 * (move-ins, hiring, promotions, day rollover), and hands commuting residents
 * off between towers when their street-level travel time elapses.
 */
export class Town {
  slots: TownSlot[];
  economy = new Economy();

  /** Total game minutes elapsed since the town opened. */
  time = 8 * 60; // day 1 starts at 08:00 so things happen right away
  moveInTimer = 0;

  /** Events emitted during the last tick, for UI toasts. */
  events: GameEvent[] = [];

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

    if (this.day !== prevDay) {
      resetDailyFlags(this.allResidents());
      this.economy.newDay();
      this.events.push(...processPromotions(this.contexts(), this.day));
    }

    this.handleMoveIns(dt);

    for (const game of this.towers()) {
      game.homePopulation = this.homeResidentsOf(game.id).length;
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
