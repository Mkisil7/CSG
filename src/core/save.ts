import { Floor, Resident, Visitor, ZONE_CONFIGS, ZoneType, MINUTES_PER_DAY } from './types';
import { Game } from './game';
import { Town } from './town';
import { bumpIdCounter } from './residents';
import type { StoriesSave } from './stories';
import type { TransitSave } from './transit';
import { ARCHITECTURES, Architecture, IdentitySave } from './identity';
import type { WeatherSave } from './weather';
import { VARIANT_LABELS, type NeighborhoodSave } from './neighborhood';
import { isLandmarkKind } from './landmarks';
import type { CityEventsSave } from './events';
import { readGiftLedger, writeGiftLedger, restoreGiftData, type GiftData } from './giftLedger';

const SAVE_KEY = 'tower-town-save-v4';

interface TowerSave {
  id: string;
  unlocked: boolean;
  zone: ZoneType;
  floors: Floor[];
  elevatorTier: number;
  secondShaft: boolean;
  residents: Resident[];
  visitors?: Visitor[];
  transit?: TransitSave;
  name?: string;
  architecture?: Architecture;
}

export interface SaveData {
  version: 4;
  time: number;
  coins: number;
  /** Net earnings so far this game day; may be negative after upkeep. */
  incomeToday?: number;
  moveInTimer: number;
  /** Wall-clock ms at save time, for the offline catch-up report. */
  savedAtWallClock: number;
  completedMissions: string[];
  missionStreaks?: Record<string, number>;
  stories?: StoriesSave;
  identity?: IdentitySave;
  weather?: WeatherSave;
  neighborhood?: NeighborhoodSave;
  cityEvents?: CityEventsSave;
  gifts?: GiftData;
  towers: TowerSave[];
}

/** Pure snapshot of a town into the save shape (no storage). Reused for sharing. */
export function toSaveData(town: Town): SaveData {
  return {
    version: 4,
    time: town.time,
    coins: town.economy.coins,
    incomeToday: town.economy.incomeToday,
    moveInTimer: town.moveInTimer,
    savedAtWallClock: Date.now(),
    completedMissions: [...town.missions.completed],
    missionStreaks: { ...town.missions.streaks },
    stories: town.stories.snapshot(),
    identity: town.identity.snapshot(),
    weather: town.weather.snapshot(),
    neighborhood: town.neighborhood.snapshot(),
    cityEvents: town.cityEvents.snapshot(),
    gifts: structuredClone(town.gifts),
    towers: town.slots.map((slot) => ({
      id: slot.id,
      unlocked: slot.unlocked,
      zone: slot.zone,
      floors: structuredClone(slot.game?.tower.floors ?? []),
      elevatorTier: slot.game?.elevatorTier ?? 0,
      secondShaft: !!slot.game?.secondElevator,
      residents: structuredClone(slot.game?.residents ?? []),
      visitors: structuredClone(slot.game?.visitors ?? []),
      transit: slot.game?.transit.snapshot(),
      name: slot.game?.name,
      architecture: slot.game?.architecture,
    })),
  };
}

export function saveGame(town: Town, storage?: Storage): boolean {
  try {
    (storage ?? localStorage).setItem(SAVE_KEY, JSON.stringify(toSaveData(town)));
    return true;
  } catch {
    return false;
  }
}

export interface LoadResult {
  town: Town;
  /** Real seconds since the save was written (0 if unknown). */
  awayRealSeconds: number;
}

/** Rebuild a Town from save data (pure). Returns null on a version mismatch. */
export function townFromSaveData(data: SaveData): Town | null {
  if (!data || data.version !== 4) return null;

  const town = new Town();
  town.time = data.time;
  town.moveInTimer = data.moveInTimer ?? 0;
  town.economy.coins = data.coins;
  town.gifts = restoreGiftData(data.gifts);
  town.economy.incomeToday = Number.isFinite(data.incomeToday) ? data.incomeToday! : 0;
  town.identity.restore(data.identity);
  town.weather.restore(data.weather, town.time);
  town.cityEvents.restore(data.cityEvents, town.day);
  town.economy.eventMultiplier = town.cityEvents.incomeMultiplier();
  town.missions.completed = new Set(data.completedMissions ?? []);
  town.missions.streaks = Object.fromEntries(Object.entries(data.missionStreaks ?? {})
    .filter(([, n]) => Number.isFinite(n) && n >= 0).map(([id, n]) => [id, Math.floor(n)]));

  let maxId = 0;
  for (let i = 0; i < town.slots.length; i++) {
    const saved = data.towers[i];
    const slot = town.slots[i];
    if (!saved || !saved.unlocked) {
      if (i > 0) {
        slot.unlocked = false;
        slot.zone = 'mixed';
        slot.game = null;
      }
      continue;
    }
    slot.unlocked = true;
    slot.zone = saved.zone ?? 'mixed';
    // A park lot holds no tower — restore it and move on.
    if (ZONE_CONFIGS[slot.zone].isPark) {
      slot.game = null;
      continue;
    }
    const game =
      slot.game && slot.game.zone === slot.zone
        ? slot.game
        : new Game(slot.id, town.economy, slot.zone);
    slot.game = game;
    if (saved.name) game.rename(saved.name);
    if (saved.architecture && Object.prototype.hasOwnProperty.call(ARCHITECTURES, saved.architecture)) game.architecture = saved.architecture;
    game.tower.floors = saved.floors.map(repairFloor);
    game.restoreLifts(saved.elevatorTier, saved.secondShaft);
    game.residents = saved.residents.map(repairResident);
    game.visitors = (Array.isArray(saved.visitors) ? saved.visitors : []).filter((v) => v && typeof v.id === 'string' &&
      /^guest[1-9]\d*$/.test(v.id) && v.visit && typeof v.visit.eventId === 'string' && Number.isInteger(v.visit.target) && ['shop', 'restaurant'].includes(game.tower.floors[v.visit.target]?.type)).slice(0, 28).map((v) => ({
        ...repairResident(v), homeFloor: 0, homeTowerId: game.id, pendingActivity: undefined,
        visit: { ...v.visit, credited: v.visit.credited === true, resolved: v.visit.resolved === true || v.visit.credited === true },
        state: { kind: 'idle', floor: 0, activity: { kind: v.visit.resolved || v.visit.credited ? 'home' : 'lobby', floor: 0 }, until: town.time },
      }));
    game.transit.restore(saved.transit);

    // Lift queues and street commutes aren't saved: put every in-transit
    // resident back on solid ground and let them replan immediately.
    for (const r of game.residents) {
      const idNum = parseInt(r.id.slice(1), 10);
      if (!Number.isNaN(idNum)) maxId = Math.max(maxId, idNum);
      // Plans set meal/shop flags before departure. A discarded journey has
      // not served that need: restore its same-day flags so the resident retries.
      const before = r.pendingActivity?.beforeFlags;
      if (r.state.kind !== 'idle' && before && before.day === Math.floor(town.time / MINUTES_PER_DAY)) {
        r.didLunch = before.didLunch; r.didDinner = before.didDinner;
        r.didShop = before.didShop; r.didNightlife = before.didNightlife;
      }
      if (r.state.kind === 'stairs') {
        r.state = { kind: 'idle', floor: r.state.from, activity: { kind: 'lobby', floor: r.state.from }, until: town.time };
      } else if (r.state.kind === 'waiting') {
        r.state = {
          kind: 'idle',
          floor: r.state.floor,
          activity: { kind: 'lobby', floor: r.state.floor },
          until: town.time,
        };
      } else if (r.state.kind === 'riding' || r.state.kind === 'commuting') {
        r.state = {
          kind: 'idle',
          floor: 0,
          activity: { kind: 'lobby', floor: 0 },
          until: town.time,
        };
      }
      r.pendingActivity = undefined;
    }
  }
  bumpIdCounter(maxId);
  // UI/build gates must be correct immediately after loading, before the first
  // simulation frame (including paused and shared towns).
  town.refreshStaffing();
  for (const game of town.towers()) {
    game.townPopulation = town.population;
    game.homePopulation = town.homeResidentsOf(game.id).length;
  }
  town.stories.restore(data.stories, town.allResidents());
  town.neighborhood.restore(data.neighborhood, town);
  const guestIds = new Set<string>();
  for (const game of town.towers()) game.visitors = game.visitors.filter((v) =>
    guestIds.size < 28 && !guestIds.has(v.id) && town.neighborhood.events.some((e) =>
      e.id === v.visit.eventId && e.status === 'active' && e.endsAt > town.time &&
      (e.kind === 'festival' || e.kind === 'critic' && e.towerId === game.id && e.level === v.visit.target)) && !!guestIds.add(v.id));
  return town;
}

export type SaveReadResult = { status: 'loaded'; result: LoadResult } | { status: 'empty' | 'unavailable' | 'invalid' };

/** Distinguish a fresh start from a failed read so startup cannot overwrite an
 * existing town after a permission error, malformed save or version mismatch. */
export function readGame(storage?: Storage): SaveReadResult {
  let raw: string | null = null;
  try {
    raw = (storage ?? localStorage).getItem(SAVE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };

  try {
    const data = JSON.parse(raw) as SaveData;
    if (!Array.isArray(data?.towers) || !data.towers[0]?.unlocked || !Array.isArray(data.towers[0].floors)
      || data.towers[0].floors[0]?.type !== 'lobby' || !Number.isFinite(data.time) || data.time < 0 || !Number.isFinite(data.coins)) return { status: 'invalid' };
    const town = townFromSaveData(data);
    if (!town || !Number.isFinite(town.time) || town.time < 0 || !Number.isFinite(town.economy.coins)) return { status: 'invalid' };
    const awayRealSeconds = Number.isFinite(data.savedAtWallClock) && data.savedAtWallClock > 0
      ? Math.max(0, (Date.now() - data.savedAtWallClock) / 1000)
      : 0;
    return { status: 'loaded', result: { town, awayRealSeconds } };
  } catch {
    return { status: 'invalid' };
  }
}

/** Compatibility wrapper for callers that do not start an autosaving session. */
export function loadGame(storage?: Storage): LoadResult | null {
  const read = readGame(storage); return read.status === 'loaded' ? read.result : null;
}

/** Defensive defaults so a hand-edited or older-shaped save can't crash the sim. */
function repairFloor(f: Floor): Floor {
  return {
    ...f,
    variant: f.variant && Object.prototype.hasOwnProperty.call(VARIANT_LABELS, f.variant) ? f.variant : undefined,
    landmark: f.type === 'landmark' ? isLandmarkKind(f.landmark) ? f.landmark : 'gallery' : undefined,
    landmarkVisits: f.type === 'landmark' ? Math.max(0, Math.floor(Number.isFinite(f.landmarkVisits) ? f.landmarkVisits! : 0)) : undefined,
    quality: f.quality ?? 50,
    visitsToday: f.visitsToday ?? 0,
    revenueToday: f.revenueToday ?? 0,
    expensesToday: f.expensesToday ?? 0,
  };
}

function repairResident(r: Resident): Resident {
  return {
    ...r,
    traits: [...(r.traits ?? [])],
    needs: { ...(r.needs ?? { housing: 100, employment: 100, food: 100, entertainment: 100 }) },
    state: structuredClone(r.state),
    pendingActivity: r.pendingActivity ? structuredClone(r.pendingActivity) : undefined,
    happiness: r.happiness ?? 100,
    unhappyDays: r.unhappyDays ?? 0,
    nocturnal: r.nocturnal ?? false,
    didDinner: r.didDinner ?? false,
    didNightlife: r.didNightlife ?? false,
    didLandmark: r.didLandmark === true,
  };
}

export function clearSave(storage?: Storage): boolean {
  try {
    const target = storage ?? localStorage;
    // Copy committed redemptions to the device ledger before deleting their
    // wallet. Failure aborts reset; it cannot turn received gifts into new ones.
    const raw = target.getItem(SAVE_KEY);
    const redeemed = raw ? restoreGiftData((JSON.parse(raw) as SaveData).gifts).redeemed : [];
    if (redeemed.length) {
      const existing = readGiftLedger(target);
      if (existing === null || !writeGiftLedger([...existing, ...redeemed], target)) return false;
    }
    target.removeItem(SAVE_KEY);
    for (const key of ['tower-town-save-v3', 'tower-town-save-v2', 'tower-town-save-v1']) {
      try { target.removeItem(key); } catch { /* Old formats are not loaded. */ }
    }
    return true;
  } catch {
    return false;
  }
}

/** One session-level write gate shared by edits, autosaves, reset and unload. */
export class SaveSession {
  constructor(private readonly town: Town, public enabled: boolean, private readonly storage?: Storage) {}
  save(): boolean | null { return this.enabled ? saveGame(this.town, this.storage) : null; }
  reset(): boolean {
    if (!this.enabled || !clearSave(this.storage)) return false;
    this.enabled = false; return true;
  }
}
