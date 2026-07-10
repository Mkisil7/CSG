import {
  Floor,
  FloorType,
  FLOOR_CONFIG,
  FLOOR_COST_GROWTH,
  Resident,
} from './types';
import { generateFloorName, MAX_FLOOR_NAME_LENGTH } from './floorNames';

export class Tower {
  floors: Floor[] = [{ level: 0, type: 'lobby', name: 'Lobby' }];

  get height(): number {
    return this.floors.length;
  }

  addFloor(type: Exclude<FloorType, 'lobby'>, rand: () => number = Math.random): Floor {
    const floor: Floor = {
      level: this.floors.length,
      type,
      name: generateFloorName(type, rand),
    };
    this.floors.push(floor);
    return floor;
  }

  /** Player rename; trims and rejects empty/overlong names. Lobby keeps its name. */
  renameFloor(level: number, name: string): boolean {
    const floor = this.floors[level];
    if (!floor || floor.type === 'lobby') return false;
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FLOOR_NAME_LENGTH) return false;
    floor.name = trimmed;
    return true;
  }

  /** Cost of the next floor of the given type, scaling with tower height. */
  nextFloorCost(type: Exclude<FloorType, 'lobby'>): number {
    const built = this.floors.length - 1; // don't count the free lobby
    return Math.round(FLOOR_CONFIG[type].baseCost * Math.pow(FLOOR_COST_GROWTH, built));
  }

  floorsOfType(type: FloorType): Floor[] {
    return this.floors.filter((f) => f.type === type);
  }

  /** Total residential capacity across the tower. */
  homeCapacity(): number {
    return this.floorsOfType('residential').length * FLOOR_CONFIG.residential.homes;
  }

  /** A residential floor with a free bed, if any. Residents filtered by caller for this tower. */
  vacantHomeFloor(residents: Resident[]): Floor | null {
    for (const floor of this.floorsOfType('residential')) {
      const occupants = residents.filter((r) => r.homeFloor === floor.level).length;
      if (occupants < FLOOR_CONFIG.residential.homes) return floor;
    }
    return null;
  }

  /** Pick a random floor of the given type, or null if none exist. */
  randomFloorOfType(type: FloorType, rand: () => number = Math.random): Floor | null {
    const options = this.floorsOfType(type);
    if (options.length === 0) return null;
    return options[Math.floor(rand() * options.length)];
  }
}
