import { ELEVATOR_TIERS, Floor, Resident } from './types';
import { Game } from './game';
import { Town } from './town';
import { ElevatorSystem } from './elevator';
import { bumpIdCounter } from './residents';

const SAVE_KEY = 'tower-town-save-v3';

interface TowerSave {
  id: string;
  unlocked: boolean;
  floors: Floor[];
  elevatorTier: number;
  secondShaft: boolean;
  residents: Resident[];
}

interface SaveData {
  version: 3;
  time: number;
  coins: number;
  moveInTimer: number;
  /** Wall-clock ms at save time, for the offline catch-up report. */
  savedAtWallClock: number;
  completedMissions: string[];
  towers: TowerSave[];
}

export function saveGame(town: Town, storage: Storage = localStorage): void {
  const data: SaveData = {
    version: 3,
    time: town.time,
    coins: town.economy.coins,
    moveInTimer: town.moveInTimer,
    savedAtWallClock: Date.now(),
    completedMissions: [...town.missions.completed],
    towers: town.slots.map((slot) => ({
      id: slot.id,
      unlocked: slot.unlocked,
      floors: slot.game?.tower.floors ?? [],
      elevatorTier: slot.game?.elevatorTier ?? 0,
      secondShaft: !!slot.game?.secondElevator,
      residents: slot.game?.residents ?? [],
    })),
  };
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — losing an autosave isn't fatal.
  }
}

export interface LoadResult {
  town: Town;
  /** Real seconds since the save was written (0 if unknown). */
  awayRealSeconds: number;
}

export function loadGame(storage: Storage = localStorage): LoadResult | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 3) return null;

    const town = new Town();
    town.time = data.time;
    town.moveInTimer = data.moveInTimer ?? 0;
    town.economy.coins = data.coins;
    town.missions.completed = new Set(data.completedMissions ?? []);

    let maxId = 0;
    for (let i = 0; i < town.slots.length; i++) {
      const saved = data.towers[i];
      const slot = town.slots[i];
      if (!saved || !saved.unlocked) {
        if (i > 0) {
          slot.unlocked = false;
          slot.game = null;
        }
        continue;
      }
      slot.unlocked = true;
      const game = slot.game ?? new Game(slot.id, town.economy);
      slot.game = game;
      game.tower.floors = saved.floors.map(repairFloor);
      game.elevatorTier = Math.min(saved.elevatorTier, ELEVATOR_TIERS.length - 1);
      game.elevator.applyTier(ELEVATOR_TIERS[game.elevatorTier]);
      if (saved.secondShaft) {
        game.secondElevator = new ElevatorSystem(1);
        game.secondElevator.applyTier(ELEVATOR_TIERS[game.elevatorTier]);
      }
      game.residents = saved.residents.map(repairResident);

      // Lift queues and street commutes aren't saved: put every in-transit
      // resident back on solid ground and let them replan immediately.
      for (const r of game.residents) {
        const idNum = parseInt(r.id.slice(1), 10);
        if (!Number.isNaN(idNum)) maxId = Math.max(maxId, idNum);
        if (r.state.kind === 'waiting') {
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

    const awayRealSeconds = data.savedAtWallClock
      ? Math.max(0, (Date.now() - data.savedAtWallClock) / 1000)
      : 0;
    return { town, awayRealSeconds };
  } catch {
    return null;
  }
}

/** Defensive defaults so a hand-edited or older-shaped save can't crash the sim. */
function repairFloor(f: Floor): Floor {
  return {
    ...f,
    quality: f.quality ?? 50,
    visitsToday: f.visitsToday ?? 0,
    revenueToday: f.revenueToday ?? 0,
    expensesToday: f.expensesToday ?? 0,
  };
}

function repairResident(r: Resident): Resident {
  return {
    ...r,
    traits: r.traits ?? [],
    needs: r.needs ?? { housing: 100, employment: 100, food: 100, entertainment: 100 },
    happiness: r.happiness ?? 100,
    unhappyDays: r.unhappyDays ?? 0,
  };
}

export function clearSave(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem('tower-town-save-v2'); // clean up older saves too
    storage.removeItem('tower-town-save-v1');
  } catch {
    // ignore
  }
}
