import {
  BUSINESS,
  BusinessSubtype,
  ELEVATOR,
  ELEVATOR_TIERS,
  FLOOR_CONFIG,
  FloorType,
  Resident,
  SECOND_SHAFT,
  ZONE_CONFIGS,
  ZoneType,
} from './types';
import { Tower } from './tower';
import { ElevatorSystem } from './elevator';
import { Economy } from './economy';
import { planNext } from './residents';
import { commuteMinutesBetween } from './townLayout';
import { isJobFloorType, pickBusinessFloor, qualityIncomeMultiplier, subtypeProfile } from './business';
import { spendingMultiplier } from './happiness';

export type GameEventKind =
  | 'visit'
  | 'move-in'
  | 'move-out'
  | 'hire'
  | 'promotion'
  | 'job-switch'
  | 'build'
  | 'mission'
  | 'event';

export interface GameEvent {
  kind: GameEventKind;
  message: string;
}

/**
 * Which events are rare/notable enough to interrupt with a floating toast.
 * Routine, high-frequency events (shop/restaurant visits, hires) only go to
 * the Activity log so the screen stays clean — especially on mobile.
 */
const TOAST_WORTHY: ReadonlySet<GameEventKind> = new Set<GameEventKind>([
  'move-in',
  'move-out',
  'promotion',
  'job-switch',
  'build',
  'mission',
  'event',
]);

export function isToastWorthy(kind: GameEventKind): boolean {
  return TOAST_WORTHY.has(kind);
}

export interface Departure {
  residentId: string;
  toTowerId: string;
}

/** Pick the shaft likely to pick a rider up first (estimated ETA, ties → first). */
export function chooseShaft(shafts: ElevatorSystem[], floor: number): ElevatorSystem {
  let best = shafts[0];
  let bestEta = best.estimatePickupEta(floor);
  for (const shaft of shafts.slice(1)) {
    const eta = shaft.estimatePickupEta(floor);
    if (eta < bestEta) {
      best = shaft;
      bestEta = eta;
    }
  }
  return best;
}

/**
 * One tower's simulation: floors, lift shafts, and the residents physically
 * inside it right now. The clock and wallet are shared town-wide and injected;
 * cross-tower concerns (hiring, move-ins, commute handoffs) live in Town.
 */
export class Game {
  tower = new Tower();
  elevator = new ElevatorSystem(1);
  secondElevator: ElevatorSystem | null = null;
  elevatorTier = 0;

  /** Residents currently inside this tower (home tower's array by default). */
  residents: Resident[] = [];

  /** Residents whose home is this tower — maintained by Town each tick. */
  homePopulation = 0;

  /** Whole-town population — maintained by Town each tick. Business/workplace
   *  floors gate on this (their staff and customers come from anywhere in town),
   *  so a commercial/office/industrial lot with no homes of its own can still
   *  be built up once the town has enough people. */
  townPopulation = 0;

  /** Business levels with at least one hired staffer — maintained by Town. */
  staffedLevels = new Set<number>();

  /** Events emitted during the last tick, for UI toasts. */
  events: GameEvent[] = [];
  /** Residents whose commute finished this tick; Town moves them between towers. */
  readyToDepart: Departure[] = [];

  /** Town time, mirrored in at each tick for internal scheduling. */
  private time = 0;

  constructor(
    public readonly id: string,
    public economy: Economy,
    /** Municipal zone; constrains which floor types may be built. Default is
     *  unrestricted mixed-use, so existing saves/tests behave unchanged. */
    public readonly zone: ZoneType = 'mixed',
  ) {
    // A Transit-zoned tower's first shaft starts with the throughput bonus too.
    this.tuneShaft(this.elevator);
  }

  shafts(): ElevatorSystem[] {
    return this.secondElevator ? [this.elevator, this.secondElevator] : [this.elevator];
  }

  /**
   * Apply the current lift tier to a shaft, plus the Transit-Oriented throughput
   * bonus if this lot is zoned Transit — so zoning a lot Transit visibly relieves
   * its lift queues (more riders per trip, quicker doors), which is exactly what
   * a player expects a "transit" building to do.
   */
  private tuneShaft(shaft: ElevatorSystem): void {
    shaft.applyTier(ELEVATOR_TIERS[this.elevatorTier]);
    if (this.zone === 'transit') {
      shaft.capacity = Math.round(shaft.capacity * ELEVATOR.transitCapacityMultiplier);
      shaft.doorTime *= ELEVATOR.transitDoorMultiplier;
    }
  }

  // ---- player actions -------------------------------------------------

  canBuild(type: Exclude<FloorType, 'lobby'>): { ok: boolean; reason?: string } {
    const allowed = ZONE_CONFIGS[this.zone].allowedFloorTypes;
    if (allowed !== null && !allowed.includes(type)) {
      return { ok: false, reason: `Not zoned for this — ${ZONE_CONFIGS[this.zone].label}` };
    }
    if (this.townPopulation < FLOOR_CONFIG[type].unlockPop) {
      return { ok: false, reason: `Needs ${FLOOR_CONFIG[type].unlockPop} town residents` };
    }
    if (this.economy.coins < this.tower.nextFloorCost(type)) {
      return { ok: false, reason: 'Not enough coins' };
    }
    return { ok: true };
  }

  buildFloor(type: Exclude<FloorType, 'lobby'>, subtype?: BusinessSubtype): boolean {
    if (!this.canBuild(type).ok) return false;
    if (this.economy.coins < this.tower.nextFloorCost(type, subtype)) return false;
    this.economy.spend(this.tower.nextFloorCost(type, subtype));
    this.tower.addFloor(type, subtype);
    return true;
  }

  nextSpeedTierCost(): number | null {
    const next = ELEVATOR_TIERS[this.elevatorTier + 1];
    return next ? next.cost : null;
  }

  canUpgradeSpeed(): { ok: boolean; reason?: string } {
    const cost = this.nextSpeedTierCost();
    if (cost === null) return { ok: false, reason: 'Lift is already top speed' };
    if (this.economy.coins < cost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  upgradeSpeed(): boolean {
    if (!this.canUpgradeSpeed().ok) return false;
    const cost = this.nextSpeedTierCost()!;
    this.economy.spend(cost);
    this.elevatorTier++;
    for (const shaft of this.shafts()) this.tuneShaft(shaft);
    return true;
  }

  /** Cost to renovate a business floor (rises with its current quality). */
  renovateCost(level: number): number | null {
    const floor = this.tower.floors[level];
    if (!floor || !isJobFloorType(floor.type)) return null;
    return Math.round(BUSINESS.renovateBaseCost + floor.quality * BUSINESS.renovateQualityCostMult);
  }

  canRenovate(level: number): { ok: boolean; reason?: string } {
    const floor = this.tower.floors[level];
    if (!floor || !isJobFloorType(floor.type)) return { ok: false, reason: 'Not a business' };
    if (floor.quality >= 100) return { ok: false, reason: 'Already top quality' };
    const cost = this.renovateCost(level)!;
    if (this.economy.coins < cost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  /** Spend coins for an instant quality boost (a direct lever on business grade). */
  renovate(level: number): boolean {
    if (!this.canRenovate(level).ok) return false;
    const floor = this.tower.floors[level];
    this.economy.spend(this.renovateCost(level)!);
    floor.quality = Math.min(100, floor.quality + BUSINESS.renovateBoost);
    return true;
  }

  canUnlockSecondShaft(): { ok: boolean; reason?: string } {
    if (this.secondElevator) return { ok: false, reason: 'Already built' };
    if (this.townPopulation < SECOND_SHAFT.unlockPop) {
      return { ok: false, reason: `Needs ${SECOND_SHAFT.unlockPop} town residents` };
    }
    if (this.economy.coins < SECOND_SHAFT.cost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  unlockSecondShaft(): boolean {
    if (!this.canUnlockSecondShaft().ok) return false;
    this.economy.spend(SECOND_SHAFT.cost);
    this.secondElevator = new ElevatorSystem(1);
    this.tuneShaft(this.secondElevator);
    return true;
  }

  /** Rider-weighted average wait: pools raw samples across shafts, so an
   *  idle second shaft can't dilute a congested first one. */
  averageWait(): number {
    const samples = this.shafts().flatMap((s) => [...s.recentWaits()]);
    if (samples.length === 0) return 0;
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }

  // ---- simulation -----------------------------------------------------

  tick(dt: number, now: number): void {
    this.time = now;
    this.events = [];
    this.readyToDepart = [];

    // Lifts move people; boarding/arrival events drive resident state.
    for (const shaft of this.shafts()) {
      const { arrivals, boardings, abandonments } = shaft.tick(dt, now);
      for (const { residentId } of boardings) {
        const resident = this.residents.find((r) => r.id === residentId);
        if (resident && resident.state.kind === 'waiting') {
          resident.state = { kind: 'riding', to: resident.state.to };
        }
      }
      // A rider who gave up on the lift walks the stairs — they still reach
      // their destination, just after eating the full wait penalty.
      for (const { residentId, floor } of abandonments) {
        const resident = this.residents.find((r) => r.id === residentId);
        if (resident && resident.state.kind === 'waiting') this.arrive(resident, floor);
      }
      for (const { residentId, floor } of arrivals) {
        const resident = this.residents.find((r) => r.id === residentId);
        if (resident) this.arrive(resident, floor);
      }
    }

    for (const resident of this.residents) {
      if (resident.state.kind === 'idle' && now >= resident.state.until) {
        this.startNextActivity(resident);
      } else if (resident.state.kind === 'commuting' && now >= resident.state.until) {
        this.readyToDepart.push({
          residentId: resident.id,
          toTowerId: resident.state.toTowerId,
        });
      }
    }
  }

  private startNextActivity(resident: Resident): void {
    if (resident.state.kind !== 'idle') return;
    const currentFloor = resident.state.floor;
    const crossTowerJob = resident.jobTowerId !== null && resident.jobTowerId !== this.id;
    const crossTowerHome = resident.homeTowerId !== this.id;
    const commuteMinutes = crossTowerJob
      ? commuteMinutesBetween(this.id, resident.jobTowerId!)
      : 0;
    const { activity, duration } = planNext(
      resident,
      this.time % (24 * 60),
      (type, subtype) =>
        pickBusinessFloor(this.tower, this.staffedLevels, type, resident.traits, Math.random, subtype),
      Math.random,
      crossTowerJob,
      crossTowerHome,
      commuteMinutes,
      this.averageWait(),
    );

    if (activity.kind === 'commute' && currentFloor === 0) {
      this.beginCommute(resident);
      return;
    }

    if (activity.floor === currentFloor && activity.kind !== 'commute') {
      resident.state = { kind: 'idle', floor: currentFloor, activity, until: this.time + duration };
      this.onActivityStart(resident);
      return;
    }

    resident.state = { kind: 'waiting', floor: currentFloor, to: activity.floor };
    resident.pendingActivity = { activity, duration };
    chooseShaft(this.shafts(), currentFloor).request(
      resident.id,
      currentFloor,
      activity.floor,
      this.time,
    );
  }

  private beginCommute(resident: Resident): void {
    // Standing in home tower → head to job tower; otherwise head home.
    const toTowerId =
      resident.homeTowerId === this.id ? resident.jobTowerId! : resident.homeTowerId;
    resident.pendingActivity = undefined;
    resident.state = {
      kind: 'commuting',
      toTowerId,
      until: this.time + commuteMinutesBetween(this.id, toTowerId),
    };
  }

  private arrive(resident: Resident, floor: number): void {
    const pending = resident.pendingActivity;
    resident.pendingActivity = undefined;
    if (pending && pending.activity.kind === 'commute' && floor === 0) {
      this.beginCommute(resident);
      return;
    }
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
      const floor = this.tower.floors[resident.state.activity.floor];
      let multiplier = spendingMultiplier(resident.happiness);
      if (floor) {
        multiplier *= qualityIncomeMultiplier(floor.quality);
        multiplier *= subtypeProfile(floor)?.incomeMultiplier ?? 1;
      }
      const income = this.economy.recordVisit(kind, multiplier);
      if (floor) {
        floor.visitsToday++;
        floor.revenueToday += income;
      }
      this.events.push({
        kind: 'visit',
        message: `${resident.name} spent ${income} coins ${kind === 'eat' ? 'eating' : 'shopping'}`,
      });
    }
  }
}
