import { Floor, Resident } from './types';
import { Game } from './game';
import { bumpIdCounter } from './residents';

const SAVE_KEY = 'tower-town-save-v1';

interface SaveData {
  version: 1;
  time: number;
  coins: number;
  floors: Floor[];
  cars: number;
  residents: Resident[];
}

export function saveGame(game: Game, storage: Storage = localStorage): void {
  const data: SaveData = {
    version: 1,
    time: game.time,
    coins: game.economy.coins,
    floors: game.tower.floors,
    cars: game.elevator.cars.length,
    residents: game.residents,
  };
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — losing an autosave isn't fatal.
  }
}

export function loadGame(storage: Storage = localStorage): Game | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return null;

    const game = new Game();
    game.time = data.time;
    game.economy.coins = data.coins;
    game.tower.floors = data.floors;
    while (game.elevator.cars.length < data.cars) game.elevator.addCar();
    game.residents = data.residents;

    // Elevator queues aren't saved: put every in-transit resident back on
    // solid ground at their last floor and let them replan immediately.
    let maxId = 0;
    for (const r of game.residents) {
      const idNum = parseInt(r.id.slice(1), 10);
      if (!Number.isNaN(idNum)) maxId = Math.max(maxId, idNum);
      if (r.state.kind === 'waiting') {
        r.state = {
          kind: 'idle',
          floor: r.state.floor,
          activity: { kind: 'lobby', floor: r.state.floor },
          until: game.time,
        };
      } else if (r.state.kind === 'riding') {
        r.state = {
          kind: 'idle',
          floor: 0,
          activity: { kind: 'lobby', floor: 0 },
          until: game.time,
        };
      }
      r.pendingActivity = undefined;
    }
    bumpIdCounter(maxId);
    return game;
  } catch {
    return null;
  }
}

export function clearSave(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
