import {
  FLOOR_CONFIG,
  FloorType,
  MINUTES_PER_DAY,
  MOVE_IN_INTERVAL,
  ELEVATOR,
  Resident,
} from './types';
import { Tower } from './tower';
import { ElevatorSystem } from './elevator';
import { Economy } from './economy';
import { createResident, planNext, resetDailyFlags } from './residents';

export interface GameEvent {
  kind: 'visit' | 'move-in';
  message: string;
}

export class Game {
  tower = new Tower();
  elevator = new ElevatorSystem(1);
  economy = new Economy();
  residents: Resident[] = [];

  /** Total game minutes elapsed since the tower opened. */
  time = 8 * 60; // day 1 starts at 08:00 so things happen right away
  moveInTimer = 0;

  /** Events emitted during the last tick, for UI toasts. */
  events: GameEvent[] = [];

  get day(): number {
    return Math.floor(this.time / MINUTES_PER_DAY) + 1;
  }

  get timeOfDay(): number {
    return this.time % MINUTES_PER_DAY;
  }

  get population(): number {
    return this.residents.length;
  }

  // ---- player actions -------------------------------------------------

  canBuild(type: Exclude<FloorType, 'lobby'>): { ok: boolean; reason?: string } {
    if (this.population < FLOOR_CONFIG[type].unlockPop) {
      return { ok: false, reason: `Needs ${FLOOR_CONFIG[type].unlockPop} residents` };
    }
    if (this.economy.coins < this.tower.nextFloorCost(type)) {
      return { ok: false, reason: 'Not enough coins' };
    }
    return { ok: true };
  }

  buildFloor(type: Exclude<FloorType, 'lobby'>): boolean {
    if (!this.canBuild(type).ok) return false;
    this.economy.spend(this.tower.nextFloorCost(type));
    this.tower.addFloor(type);
    this.assignJobs();
    return true;
  }

  canAddCar(): { ok: boolean; reason?: string } {
    if (this.elevator.cars.length >= ELEVATOR.maxCars) {
      return { ok: false, reason: 'Shaft is full' };
    }
    if (this.economy.coins < this.economy.nextElevatorCarCost(this.elevator.cars.length)) {
      return { ok: false, reason: 'Not enough coins' };
    }
    return { ok: true };
  }

  addElevatorCar(): boolean {
    if (!this.canAddCar().ok) return false;
    this.economy.spend(this.economy.nextElevatorCarCost(this.elevator.cars.length));
    this.elevator.addCar();
    return true;
  }

  // ---- simulation -----------------------------------------------------

  tick(dt: number): void {
    this.events = [];
    const prevDay = this.day;
    this.time += dt;

    if (this.day !== prevDay) {
      resetDailyFlags(this.residents);
      this.economy.newDay();
    }

    this.handleMoveIns(dt);

    // The elevator moves people; boarding/arrival events drive resident state.
    const { arrivals, boardings } = this.elevator.tick(dt, this.time);
    for (const { residentId } of boardings) {
      const resident = this.residents.find((r) => r.id === residentId);
      if (resident && resident.state.kind === 'waiting') {
        resident.state = { kind: 'riding', to: resident.state.to };
      }
    }
    for (const { residentId, floor } of arrivals) {
      const resident = this.residents.find((r) => r.id === residentId);
      if (resident) this.arrive(resident, floor);
    }

    // Residents whose current activity ended decide what to do next.
    for (const resident of this.residents) {
      if (resident.state.kind === 'idle' && this.time >= resident.state.until) {
        this.startNextActivity(resident);
      }
    }

    this.economy.accrue(dt, this.residents);
  }

  private startNextActivity(resident: Resident): void {
    if (resident.state.kind !== 'idle') return;
    const currentFloor = resident.state.floor;
    const { activity, duration } = planNext(resident, this.timeOfDay, this.tower);

    if (activity.floor === currentFloor) {
      resident.state = { kind: 'idle', floor: currentFloor, activity, until: this.time + duration };
      this.onActivityStart(resident);
      return;
    }

    resident.state = { kind: 'waiting', floor: currentFloor, to: activity.floor };
    resident.pendingActivity = { activity, duration };
    this.elevator.request(resident.id, currentFloor, activity.floor, this.time);
  }

  private arrive(resident: Resident, floor: number): void {
    const pending = resident.pendingActivity;
    resident.pendingActivity = undefined;
    if (pending && pending.activity.floor === floor) {
      resident.state = {
        kind: 'idle',
        floor,
        activity: pending.activity,
        until: this.time + pending.duration,
      };
      this.onActivityStart(resident);
    } else {
      // Plans went stale mid-ride; stand here briefly and replan.
      resident.state = {
        kind: 'idle',
        floor,
        activity: { kind: 'lobby', floor },
        until: this.time + 1,
      };
    }
  }

  private onActivityStart(resident: Resident): void {
    if (resident.state.kind !== 'idle') return;
    const kind = resident.state.activity.kind;
    if (kind === 'shop' || kind === 'eat') {
      const income = this.economy.recordVisit(kind);
      this.events.push({
        kind: 'visit',
        message: `${resident.name} spent ${income} coins ${kind === 'eat' ? 'eating' : 'shopping'}`,
      });
    }
  }

  private handleMoveIns(dt: number): void {
    this.moveInTimer += dt;
    if (this.moveInTimer < MOVE_IN_INTERVAL) return;
    this.moveInTimer = 0;

    const vacancy = this.tower.vacantHomeFloor(this.residents);
    if (!vacancy) return;

    const resident = createResident(vacancy.level);
    if (resident.state.kind === 'idle') resident.state.until = this.time;
    this.residents.push(resident);
    this.assignJobs();
    this.events.push({ kind: 'move-in', message: `${resident.name} moved in!` });
  }

  /** Fill open job slots with unemployed residents. */
  private assignJobs(): void {
    for (const resident of this.residents) {
      if (resident.jobFloor !== null) continue;
      const job = this.tower.vacantJobFloor(this.residents);
      if (!job) return;
      resident.jobFloor = job.level;
    }
  }
}
