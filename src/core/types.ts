export type FloorType = 'lobby' | 'residential' | 'shop' | 'restaurant' | 'office';

export interface Floor {
  /** Index in the stack; lobby is always 0. */
  level: number;
  type: FloorType;
}

export type ResidentState =
  | { kind: 'idle'; floor: number; activity: Activity; until: number }
  | { kind: 'waiting'; floor: number; to: number }
  | { kind: 'riding'; to: number };

export type ActivityKind = 'home' | 'work' | 'eat' | 'shop' | 'lobby';

export interface Activity {
  kind: ActivityKind;
  floor: number;
}

export interface Resident {
  id: string;
  name: string;
  homeFloor: number;
  /** Level of the floor they work at, or null if unemployed. */
  jobFloor: number | null;
  workStart: number; // game minutes since midnight
  workEnd: number;
  didLunch: boolean;
  didShop: boolean;
  state: ResidentState;
  /** The activity a resident is travelling toward, applied on elevator arrival. */
  pendingActivity?: { activity: Activity; duration: number };
  /** Pastel color for rendering, hex. */
  color: number;
}

export const MINUTES_PER_DAY = 24 * 60;

/** How fast game time flows: game minutes per real second. */
export const GAME_MINUTES_PER_SECOND = 6;

export const FLOOR_CONFIG: Record<
  Exclude<FloorType, 'lobby'>,
  { label: string; baseCost: number; jobs: number; homes: number; unlockPop: number }
> = {
  residential: { label: 'Apartments', baseCost: 100, jobs: 0, homes: 4, unlockPop: 0 },
  shop: { label: 'Shop', baseCost: 120, jobs: 2, homes: 0, unlockPop: 2 },
  restaurant: { label: 'Restaurant', baseCost: 150, jobs: 3, homes: 0, unlockPop: 4 },
  office: { label: 'Office', baseCost: 200, jobs: 4, homes: 0, unlockPop: 8 },
};

/** Cost multiplier applied per existing floor, so the tower gets pricier as it rises. */
export const FLOOR_COST_GROWTH = 1.18;

export const ECONOMY = {
  startingCoins: 300,
  rentPerResidentPerDay: 40,
  officeIncomePerWorkerDay: 60,
  shopVisitIncome: 8,
  restaurantVisitIncome: 6,
  elevatorCarBaseCost: 250,
  elevatorCarCostGrowth: 1.6,
};

export const ELEVATOR = {
  capacity: 6,
  /** Floors travelled per game minute. */
  speed: 0.34,
  /** Door open / load-unload time at each stop, in game minutes. */
  doorTime: 2,
  maxCars: 4,
};

export const MOVE_IN_INTERVAL = 90; // game minutes between move-in checks
