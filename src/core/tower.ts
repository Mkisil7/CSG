import {
  Floor,
  FloorType,
  FLOOR_CONFIG,
  FLOOR_COST_GROWTH,
  Resident,
} from './types';

export class Tower {
  floors: Floor[] = [{ level: 0, type: 'lobby' }];

  get height(): number {
    return this.floors.length;
  }

  addFloor(type: Exclude<FloorType, 'lobby'>): Floor {
    const floor: Floor = { level: this.floors.length, type };
    this.floors.push(floor);
    return floor;
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

  /** A residential floor with a free bed, if any. */
  vacantHomeFloor(residents: Resident[]): Floor | null {
    for (const floor of this.floorsOfType('residential')) {
      const occupants = residents.filter((r) => r.homeFloor === floor.level).length;
      if (occupants < FLOOR_CONFIG.residential.homes) return floor;
    }
    return null;
  }

  /** A floor with an unfilled job slot, if any. */
  vacantJobFloor(residents: Resident[]): Floor | null {
    for (const floor of this.floors) {
      if (floor.type === 'lobby' || floor.type === 'residential') continue;
      const jobs = FLOOR_CONFIG[floor.type].jobs;
      const workers = residents.filter((r) => r.jobFloor === floor.level).length;
      if (workers < jobs) return floor;
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
