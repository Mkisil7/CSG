import { ELEVATOR_TIERS, Floor, Resident } from './types';
import { Game } from './game';
import { Town } from './town';
import { ElevatorSystem } from './elevator';
import { bumpIdCounter } from './residents';

const SAVE_KEY = 'tower-town-save-v2';

interface TowerSave {
  id: string;
  unlocked: boolean;
  floors: Floor[];
  elevatorTier: number;
  secondShaft: boolean;
  residents: Resident[];
}

interface SaveData {
  version: 2;
  time: number;
  coins: number;
  moveInTimer: number;
  towers: TowerSave[];
}

export function saveGame(town: Town, storage: Storage = localStorage): void {
  const data: SaveData = {
    version: 2,
    time: town.time,
    coins: town.economy.coins,
    moveInTimer: town.moveInTimer,
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

export function loadGame(storage: Storage = localStorage): Town | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 2) return null;

    const town = new Town();
    town.time = data.time;
    town.moveInTimer = data.moveInTimer ?? 0;
    town.economy.coins = data.coins;

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
      game.tower.floors = saved.floors;
      game.elevatorTier = Math.min(saved.elevatorTier, ELEVATOR_TIERS.length - 1);
      game.elevator.applyTier(ELEVATOR_TIERS[game.elevatorTier]);
      if (saved.secondShaft) {
        game.secondElevator = new ElevatorSystem(1);
        game.secondElevator.applyTier(ELEVATOR_TIERS[game.elevatorTier]);
      }
      game.residents = saved.residents;

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
    return town;
  } catch {
    return null;
  }
}

export function clearSave(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
    storage.removeItem('tower-town-save-v1'); // clean up pre-town saves too
  } catch {
    // ignore
  }
}
