export type FloorType = 'lobby' | 'residential' | 'shop' | 'restaurant' | 'office';

export interface Floor {
  /** Index in the stack; lobby is always 0. */
  level: number;
  type: FloorType;
  /** Player-visible name, auto-generated at build time and renamable. */
  name: string;
}

export type ResidentState =
  | { kind: 'idle'; floor: number; activity: Activity; until: number }
  | { kind: 'waiting'; floor: number; to: number }
  | { kind: 'riding'; to: number }
  /** Travelling between towers at street level; invisible until arrival. */
  | { kind: 'commuting'; toTowerId: string; until: number };

export type ActivityKind = 'home' | 'work' | 'eat' | 'shop' | 'lobby' | 'commute';

export interface Activity {
  kind: ActivityKind;
  floor: number;
}

export interface Resident {
  id: string;
  name: string;
  homeFloor: number;
  /** Tower the resident lives in. */
  homeTowerId: string;
  /** Level of the floor they work at, or null if unemployed. */
  jobFloor: number | null;
  /** Tower the resident works in, or null if unemployed. */
  jobTowerId: string | null;
  /** Index into JOB_TIERS for their floor's type; 0 = entry level. */
  jobTier: number;
  /** Game day they started their current job/tier, for tenure. */
  jobStartDay: number | null;
  /** Consecutive days promotion-eligible but blocked (no free slot). */
  blockedDays: number;
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

export type JobFloorType = 'shop' | 'restaurant' | 'office';

export interface JobTierConfig {
  title: string;
  payMultiplier: number;
  /** How many of this tier's slots each floor of the type has. */
  slots: number;
  /** Days at this tier before becoming promotion-eligible (last tier: Infinity). */
  tenureDaysToPromote: number;
}

/** Per-floor-type career ladders. Slot totals must equal FLOOR_CONFIG[type].jobs. */
export const JOB_TIERS: Record<JobFloorType, JobTierConfig[]> = {
  shop: [
    { title: 'Clerk', payMultiplier: 1, slots: 1, tenureDaysToPromote: 2 },
    { title: 'Shopkeeper', payMultiplier: 1.6, slots: 1, tenureDaysToPromote: Infinity },
  ],
  restaurant: [
    { title: 'Server', payMultiplier: 1, slots: 2, tenureDaysToPromote: 2 },
    { title: 'Chef', payMultiplier: 1.7, slots: 1, tenureDaysToPromote: Infinity },
  ],
  office: [
    { title: 'Intern', payMultiplier: 1, slots: 2, tenureDaysToPromote: 2 },
    { title: 'Associate', payMultiplier: 1.5, slots: 1, tenureDaysToPromote: 3 },
    { title: 'Manager', payMultiplier: 2.2, slots: 1, tenureDaysToPromote: Infinity },
  ],
};

/** Consecutive blocked days before a resident will jump ship for a promotion elsewhere. */
export const POACH_AFTER_BLOCKED_DAYS = 3;

export const ECONOMY = {
  startingCoins: 300,
  rentPerResidentPerDay: 40,
  /** Base wage per worker-day by floor type; multiplied by the job tier's payMultiplier. */
  baseWagePerWorkerDay: { shop: 40, restaurant: 45, office: 60 } as Record<JobFloorType, number>,
  shopVisitIncome: 8,
  restaurantVisitIncome: 6,
};

export const ELEVATOR = {
  capacity: 6,
  /** Floors travelled per game minute (tier-0 default). */
  speed: 0.34,
  /** Door open / load-unload time at each stop, in game minutes (tier-0 default). */
  doorTime: 2,
};

/** Purchasable lift speed tiers; index 0 is the free starting tier. */
export const ELEVATOR_TIERS: { cost: number; speed: number; doorTime: number }[] = [
  { cost: 0, speed: 0.34, doorTime: 2 },
  { cost: 300, speed: 0.5, doorTime: 1.6 },
  { cost: 800, speed: 0.72, doorTime: 1.2 },
  { cost: 2000, speed: 1.05, doorTime: 0.8 },
];

/** One-time unlock for a second, independent lift shaft on the far side. */
export const SECOND_SHAFT = { cost: 1500, unlockPop: 10 };

/** Town-level config: fixed tower footprints and street-level commuting. */
export const TOWN = {
  /** Flat one-way travel time between any two towers, game minutes. */
  commuteMinutes: 60,
  /** Purchase cost per slot index (slot 0 is the free starting tower). */
  slotCosts: [0, 2500, 8000, 20000],
  /** Town-wide population required per slot index. */
  slotUnlockPop: [0, 12, 30, 60],
};

export const MOVE_IN_INTERVAL = 90; // game minutes between move-in checks
