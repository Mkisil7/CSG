import {
  JOB_TIERS,
  MINUTES_PER_DAY,
  MOVE_IN_INTERVAL,
  BUSINESS,
  Resident,
  TOWN,
  ZONE_CONFIGS,
  ZoneType,
} from './types';
import { Game, GameEvent } from './game';
import { Economy } from './economy';
import { createResident, resetDailyFlags } from './residents';
import { assignJobs, processPromotions, TowerContext } from './careers';
import {
  assignedStaff,
  isJobFloorType,
  staffedBusinessLevels,
  updateBusinessDay,
  resetBusinessDay,
} from './business';
import { updateHappinessAndEvict } from './happiness';
import { Missions } from './missions';
import { CityEventSystem } from './events';
import { TOWER_SLOT_ORIGINS } from './townLayout';

/** How many recent events the Activity feed retains. */
const ACTIVITY_LOG_MAX = 200;

export interface TownSlot {
  id: string;
  unlocked: boolean;
  /** Municipal zone chosen at unlock; 'mixed' by default (and for the free lot). */
  zone: ZoneType;
  /** The tower simulation, or null for a park lot (which holds no tower). */
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
  /** Live "City Events" director (festivals, booms, recessions). Not persisted. */
  cityEvents = new CityEventSystem();

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
      zone: 'mixed' as ZoneType,
      game: i === 0 ? new Game('t0', this.economy, 'mixed') : null,
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

  /** World-space origins of every unlocked park lot (for park-proximity happiness). */
  parkOrigins(): { x: number; z: number }[] {
    return this.slots.flatMap((s, i) =>
      s.unlocked && ZONE_CONFIGS[s.zone].isPark ? [TOWER_SLOT_ORIGINS[i]] : [],
    );
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

  /** Purchase cost of a lot at a given zone (zone multiplier applied). */
  slotCost(index: number, zone: ZoneType = 'mixed'): number {
    return Math.round(TOWN.slotCosts[index] * ZONE_CONFIGS[zone].costMultiplier);
  }

  canUnlockSlot(index: number, zone: ZoneType = 'mixed'): { ok: boolean; reason?: string } {
    const slot = this.slots[index];
    if (!slot || slot.unlocked) return { ok: false, reason: 'Not available' };
    if (this.population < TOWN.slotUnlockPop[index]) {
      return { ok: false, reason: `Needs ${TOWN.slotUnlockPop[index]} town residents` };
    }
    if (this.economy.coins < this.slotCost(index, zone)) {
      return { ok: false, reason: 'Not enough coins' };
    }
    return { ok: true };
  }

  unlockSlot(index: number, zone: ZoneType = 'mixed'): boolean {
    if (!this.canUnlockSlot(index, zone).ok) return false;
    const slot = this.slots[index];
    this.economy.spend(this.slotCost(index, zone));
    slot.unlocked = true;
    slot.zone = zone;
    if (ZONE_CONFIGS[zone].isPark) {
      // A park holds no tower — it beautifies the block for nearby residents.
      slot.game = null;
      this.events.push({ kind: 'build', message: 'Opened a new park! 🌳' });
    } else {
      slot.game = new Game(slot.id, this.economy, zone);
      this.events.push({ kind: 'build', message: 'Broke ground on a new tower!' });
    }
    return true;
  }

  // ---- manual promotion (fast-track) ------------------------------------

  /** The worker on a floor who could be promoted right now (tenure met, a
   *  senior slot free), most-tenured first — or null if none. */
  private promotionCandidate(towerId: string, level: number): Resident | null {
    const game = this.towerById(towerId);
    const floor = game?.tower.floors[level];
    if (!game || !floor || !isJobFloorType(floor.type)) return null;
    const tiers = JOB_TIERS[floor.type];
    const staff = assignedStaff(this.allResidents(), towerId, level);
    const eligible = staff
      .filter((r) => {
        if (r.jobTier >= tiers.length - 1) return false;
        const tenure = this.day - (r.jobStartDay ?? this.day);
        return tenure >= (tiers[r.jobTier]?.tenureDaysToPromote ?? Infinity);
      })
      .sort((a, b) => (a.jobStartDay ?? this.day) - (b.jobStartDay ?? this.day));
    for (const r of eligible) {
      const nextTier = r.jobTier + 1;
      const atNext = staff.filter((s) => s.jobTier === nextTier).length;
      if (atNext < (tiers[nextTier]?.slots ?? 0)) return r;
    }
    return null;
  }

  /** Coins to fast-track the current candidate's promotion, or null if none. */
  promoteCostAt(towerId: string, level: number): number | null {
    const cand = this.promotionCandidate(towerId, level);
    if (!cand) return null;
    return BUSINESS.promoteCostBase + cand.jobTier * BUSINESS.promoteCostPerTier;
  }

  canPromoteAt(towerId: string, level: number): { ok: boolean; reason?: string } {
    const game = this.towerById(towerId);
    const floor = game?.tower.floors[level];
    if (!game || !floor || !isJobFloorType(floor.type)) {
      return { ok: false, reason: 'Not a business' };
    }
    const cost = this.promoteCostAt(towerId, level);
    if (cost === null) return { ok: false, reason: 'No one is due for a promotion' };
    if (this.economy.coins < cost) return { ok: false, reason: 'Not enough coins' };
    return { ok: true };
  }

  /** Pay to promote the due worker now instead of waiting for the daily check. */
  promoteAt(towerId: string, level: number): boolean {
    const cand = this.promotionCandidate(towerId, level);
    const cost = this.promoteCostAt(towerId, level);
    if (!cand || cost === null || this.economy.coins < cost) return false;
    const floor = this.towerById(towerId)!.tower.floors[level];
    if (!isJobFloorType(floor.type)) return false;
    this.economy.spend(cost);
    cand.jobTier += 1;
    cand.jobStartDay = this.day;
    cand.blockedDays = 0;
    this.events.push({
      kind: 'promotion',
      message: `${cand.name} was promoted to ${JOB_TIERS[floor.type][cand.jobTier].title} at ${floor.name}!`,
    });
    return true;
  }

  // ---- simulation --------------------------------------------------------

  tick(dt: number): void {
    this.events = [];
    const prevDay = this.day;
    this.time += dt;

    // Live City Events: start/expire happenings and publish their combined
    // effect (income multiplier now, mood bonus consumed at day rollover).
    const { started, ended } = this.cityEvents.update(this.day);
    for (const e of started) {
      this.events.push({ kind: 'event', message: `${e.emoji} ${e.title} — ${e.blurb}` });
    }
    for (const e of ended) {
      this.events.push({ kind: 'event', message: `${e.emoji} ${e.title} has wrapped up.` });
    }
    this.economy.eventMultiplier = this.cityEvents.incomeMultiplier();

    if (this.day !== prevDay) this.dayRollover();

    this.handleMoveIns(dt);

    const townPop = this.population;
    for (const game of this.towers()) {
      game.homePopulation = this.homeResidentsOf(game.id).length;
      game.townPopulation = townPop;
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
    this.events.push(
      ...updateHappinessAndEvict(games, this.day, this.parkOrigins(), this.cityEvents.moodBonus()),
    );
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
