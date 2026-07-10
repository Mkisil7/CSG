import {
  BUSINESS_SUBTYPES,
  BusinessSubtype,
  Floor,
  FloorType,
  FLOOR_CONFIG,
  FLOOR_COST_GROWTH,
  Resident,
} from './types';
import { generateFloorName, MAX_FLOOR_NAME_LENGTH } from './floorNames';

function emptyDayStats() {
  return { quality: 50, visitsToday: 0, revenueToday: 0, expensesToday: 0 };
}

export class Tower {
  floors: Floor[] = [{ level: 0, type: 'lobby', name: 'Lobby', ...emptyDayStats() }];

  get height(): number {
    return this.floors.length;
  }

  addFloor(
    type: Exclude<FloorType, 'lobby'>,
    subtype?: BusinessSubtype,
    rand: () => number = Math.random,
  ): Floor {
    // Business floors default to their first subtype if none was chosen.
    const resolved =
      subtype ??
      (type === 'residential' ? undefined : BUSINESS_SUBTYPES[type]?.[0]?.subtype);
    const floor: Floor = {
      level: this.floors.length,
      type,
      name: generateFloorName(type, rand),
      subtype: resolved,
      ...emptyDayStats(),
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

  /** Cost of the next floor of the given type/subtype, scaling with tower height. */
  nextFloorCost(type: Exclude<FloorType, 'lobby'>, subtype?: BusinessSubtype): number {
    const built = this.floors.length - 1; // don't count the free lobby
    const subtypeMult =
      type !== 'residential' && subtype
        ? BUSINESS_SUBTYPES[type]?.find((p) => p.subtype === subtype)?.costMultiplier ?? 1
        : 1;
    return Math.round(
      FLOOR_CONFIG[type].baseCost * subtypeMult * Math.pow(FLOOR_COST_GROWTH, built),
    );
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
