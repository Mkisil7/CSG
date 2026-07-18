export type FloorType = 'lobby' | 'residential' | 'shop' | 'restaurant' | 'office' | 'factory';

export type ShopSubtype = 'grocery' | 'boutique' | 'electronics';
/** 'bar' is the nightlife subtype — residents visit it in the evening. */
export type RestaurantSubtype = 'coffee' | 'fastfood' | 'fine-dining' | 'bar';
export type OfficeSubtype = 'tech' | 'law' | 'creative';
export type FactorySubtype = 'assembly' | 'foodproc' | 'electronics-fab';
export type BusinessSubtype = ShopSubtype | RestaurantSubtype | OfficeSubtype | FactorySubtype;

export interface Floor {
  /** Index in the stack; lobby is always 0. */
  level: number;
  type: FloorType;
  /** Player-visible name, auto-generated at build time and renamable. */
  name: string;
  /** Business flavor for shop/restaurant/office floors. */
  subtype?: BusinessSubtype;
  /** Reputation 0-100; drifts daily toward how well the business is run. */
  quality: number;
  /** Yesterday-so-far stats, reset at day rollover after the quality update. */
  visitsToday: number;
  revenueToday: number;
  expensesToday: number;
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

export type Trait = 'practical' | 'trendy' | 'foodie' | 'techie' | 'social' | 'ambitious';

export interface ResidentNeeds {
  housing: number;
  employment: number;
  food: number;
  entertainment: number;
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
  /** 1-2 preference tags that bias which business subtypes they visit. */
  traits: Trait[];
  /** Need satisfaction levels, each 0-100. */
  needs: ResidentNeeds;
  /** Overall wellbeing 0-100, recomputed each day rollover. */
  happiness: number;
  /** Consecutive days below the move-out threshold. */
  unhappyDays: number;
  workStart: number; // game minutes since midnight
  workEnd: number;
  /** Night owls stay out later in the evening and go out more readily. */
  nocturnal: boolean;
  didLunch: boolean;
  /** Went out for an evening meal (refills the food need, like lunch). */
  didDinner: boolean;
  didShop: boolean;
  /** Went out to a bar/lounge this evening (separate from didShop). */
  didNightlife: boolean;
  state: ResidentState;
  /** The activity a resident is travelling toward, applied on elevator arrival. */
  pendingActivity?: { activity: Activity; duration: number };
  /** Pastel color for rendering, hex. */
  color: number;
}

export const MINUTES_PER_DAY = 24 * 60;

/** How fast game time flows: game minutes per real second (at 1x speed). */
export const GAME_MINUTES_PER_SECOND = 6;

export const FLOOR_CONFIG: Record<
  Exclude<FloorType, 'lobby'>,
  { label: string; baseCost: number; jobs: number; homes: number; unlockPop: number }
> = {
  residential: { label: 'Apartments', baseCost: 100, jobs: 0, homes: 4, unlockPop: 0 },
  shop: { label: 'Shop', baseCost: 120, jobs: 2, homes: 0, unlockPop: 2 },
  restaurant: { label: 'Restaurant', baseCost: 150, jobs: 3, homes: 0, unlockPop: 4 },
  office: { label: 'Office', baseCost: 200, jobs: 4, homes: 0, unlockPop: 8 },
  // Factories employ workers who commute in, so they gate on 0 home-pop —
  // an industrial-zoned tower has no apartments of its own.
  factory: { label: 'Factory', baseCost: 180, jobs: 4, homes: 0, unlockPop: 0 },
};

/** Cost multiplier applied per existing floor, so the tower gets pricier as it rises. */
export const FLOOR_COST_GROWTH = 1.18;

export type JobFloorType = 'shop' | 'restaurant' | 'office' | 'factory';

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
  factory: [
    { title: 'Line Worker', payMultiplier: 1, slots: 3, tenureDaysToPromote: 3 },
    { title: 'Foreman', payMultiplier: 1.8, slots: 1, tenureDaysToPromote: Infinity },
  ],
};

/** Consecutive blocked days before a resident will jump ship for a promotion elsewhere. */
export const POACH_AFTER_BLOCKED_DAYS = 3;

export const ECONOMY = {
  startingCoins: 300,
  rentPerResidentPerDay: 40,
  /** Base wage per worker-day by floor type; multiplied by the job tier's payMultiplier. */
  baseWagePerWorkerDay: { shop: 40, restaurant: 45, office: 60, factory: 55 } as Record<
    JobFloorType,
    number
  >,
  shopVisitIncome: 8,
  restaurantVisitIncome: 6,
};

/** Business operations tuning. All values are first-pass, unplaytested starting points. */
export const BUSINESS = {
  /** Customers one staffer can comfortably serve per operating hour. */
  baseCustomersPerStaffPerHour: 1,
  operatingHoursPerDay: 8,
  /** Fixed daily upkeep per staffed business floor, charged at day rollover. */
  upkeepPerDay: 5,
  /** How fast quality moves toward its target per day (0-1). */
  qualityAdaptRate: 0.25,
  /** Visit income multiplier range across quality 0-100 (pinned so 50 → 1.0x). */
  qualityIncomeMinMult: 0.6,
  qualityIncomeMaxMult: 1.4,
  /** Weight boost when a business subtype matches one of a resident's traits. */
  traitAppealBoost: 1.5,
  /** Goods produced per staffed factory worker per day (supply side). */
  goodsPerFactoryWorkerDay: 10,
  /** Goods a shop wants per day per unit of its goodsAffinity (demand side). */
  goodsTargetPerShop: 15,
  /** Max quality-target bonus a fully-supplied, high-affinity shop gets. */
  goodsBonusWeight: 12,
  /** Renovate action: quality points added per renovation, and its pricing. */
  renovateBoost: 18,
  renovateBaseCost: 120,
  renovateQualityCostMult: 3,
  /** Fast-track a promotion (pay to skip the wait): base cost, scaled by tier. */
  promoteCostBase: 220,
  promoteCostPerTier: 180,
};

export interface BusinessProfile {
  subtype: BusinessSubtype;
  label: string;
  costMultiplier: number;
  /** Multiplier on per-visit income for this subtype. */
  incomeMultiplier: number;
  appealTags: Trait[];
  /** Shops only: how strongly this shop benefits from factory-supplied goods. */
  goodsAffinity?: number;
  /** Factories only: relative goods output multiplier. */
  goodsSupply?: number;
}

export const BUSINESS_SUBTYPES: Record<JobFloorType, BusinessProfile[]> = {
  shop: [
    { subtype: 'grocery', label: 'Grocery Store', costMultiplier: 1.0, incomeMultiplier: 1.0, appealTags: ['practical'], goodsAffinity: 0.4 },
    { subtype: 'boutique', label: 'Clothing Boutique', costMultiplier: 1.15, incomeMultiplier: 1.2, appealTags: ['trendy'], goodsAffinity: 0.7 },
    { subtype: 'electronics', label: 'Electronics Shop', costMultiplier: 1.3, incomeMultiplier: 1.4, appealTags: ['techie'], goodsAffinity: 1.0 },
  ],
  restaurant: [
    { subtype: 'coffee', label: 'Coffee Shop', costMultiplier: 1.0, incomeMultiplier: 0.9, appealTags: ['social'] },
    { subtype: 'fastfood', label: 'Fast Food', costMultiplier: 1.1, incomeMultiplier: 1.0, appealTags: ['practical'] },
    { subtype: 'fine-dining', label: 'Fine Dining', costMultiplier: 1.4, incomeMultiplier: 1.6, appealTags: ['foodie'] },
    { subtype: 'bar', label: 'Bar & Lounge', costMultiplier: 1.25, incomeMultiplier: 1.3, appealTags: ['social', 'trendy'] },
  ],
  office: [
    { subtype: 'creative', label: 'Creative Studio', costMultiplier: 1.0, incomeMultiplier: 1.0, appealTags: ['trendy'] },
    { subtype: 'tech', label: 'Technology Office', costMultiplier: 1.2, incomeMultiplier: 1.0, appealTags: ['techie'] },
    { subtype: 'law', label: 'Law Firm', costMultiplier: 1.4, incomeMultiplier: 1.0, appealTags: ['ambitious'] },
  ],
  factory: [
    { subtype: 'assembly', label: 'Assembly Plant', costMultiplier: 1.0, incomeMultiplier: 1.0, appealTags: ['practical'], goodsSupply: 1.0 },
    { subtype: 'foodproc', label: 'Food Processing', costMultiplier: 1.1, incomeMultiplier: 1.0, appealTags: ['practical'], goodsSupply: 1.1 },
    { subtype: 'electronics-fab', label: 'Electronics Fab', costMultiplier: 1.4, incomeMultiplier: 1.0, appealTags: ['techie'], goodsSupply: 1.4 },
  ],
};

export const ALL_TRAITS: Trait[] = ['practical', 'trendy', 'foodie', 'techie', 'social', 'ambitious'];

/** Happiness tuning. All values are first-pass, unplaytested starting points. */
export const HAPPINESS = {
  /** Need weights (sum to 1). */
  weights: { housing: 0.3, employment: 0.25, food: 0.25, entertainment: 0.2 },
  foodDecayPerDay: 25,
  entertainmentDecayPerDay: 20,
  /** Housing need lost at 100% apartment crowding. */
  housingCrowdingWeight: 40,
  unemployedBaseline: 40,
  employmentTierBonus: 15,
  employmentBlockedPenalty: 5,
  /** Lift-wait penalty: minutes over this are penalized, capped. */
  comfortableWaitMinutes: 10,
  waitPenaltyPerMinute: 0.5,
  maxWaitPenalty: 20,
  /** Commute penalty: game minutes over this are penalized, capped. */
  comfortableCommuteMinutes: 30,
  commutePenaltyPerMinute: 0.3,
  maxCommutePenalty: 20,
  /** Max +/- happiness from home-tower average business quality. */
  vibrancyWeight: 8,
  /** Spending swing at happiness extremes (±30%). */
  spendingSwingMax: 0.3,
  moveOutThreshold: 35,
  moveOutAfterDays: 5,
  /** Max happiness bonus for living right next to a park. */
  parkProximityBonus: 8,
  /** World-distance at which the park bonus fades to zero (≈ two lots away). */
  parkFalloffDistance: 68,
  /** Transit-oriented zones: gentler commute penalty (higher threshold, lower slope). */
  transitComfortableCommuteMinutes: 60,
  transitCommutePenaltyPerMinute: 0.15,
};

/**
 * Evening life: after work, residents keep going out — dinner, a drink, some
 * shopping — until their (staggered) bedtime, so the town stays alive at night
 * instead of everyone freezing at home the moment work ends.
 */
export const NIGHTLIFE = {
  /** When the evening begins (earliest an unemployed resident heads out). */
  eveningStart: 17 * 60, // 17:00
  /** Early-to-bed residents settle in around here. */
  bedtime: 22 * 60 + 30, // 22:30
  /** Night owls stay out much later. */
  nocturnalBedtime: 23 * 60 + 45, // 23:45
  /** Share of residents who are night owls. */
  nocturnalFraction: 0.35,
  /** How often (game minutes) a resident at home re-decides whether to go out. */
  recheckMinutes: 35,
  /** Base chance to head out on a given evening check. */
  baseChance: 0.3,
  /** Extra going-out chance for night owls. */
  nocturnalBonus: 0.18,
  dinnerDuration: 40,
  drinksDuration: 45,
  shopDuration: 30,
};

export const ELEVATOR = {
  capacity: 6,
  /** Floors travelled per game minute (tier-0 default). */
  speed: 0.34,
  /** Door open / load-unload time at each stop, in game minutes (tier-0 default). */
  doorTime: 2,
};

/** How strongly an existing queue at a floor counts against a shaft's pickup ETA. */
export const QUEUE_PENALTY_FACTOR = 0.5;

/**
 * Purchasable lift speed tiers; index 0 is the free starting tier. Each tier
 * also raises the car's rider capacity, so upgrading eases congestion directly
 * (real relief without needing extra shaft geometry).
 */
export const ELEVATOR_TIERS: { cost: number; speed: number; doorTime: number; capacity: number }[] = [
  { cost: 0, speed: 0.34, doorTime: 2, capacity: 6 },
  { cost: 300, speed: 0.5, doorTime: 1.6, capacity: 8 },
  { cost: 800, speed: 0.72, doorTime: 1.2, capacity: 11 },
  { cost: 2000, speed: 1.05, doorTime: 0.8, capacity: 15 },
];

/** One-time unlock for a second, independent lift shaft on the far side. */
export const SECOND_SHAFT = { cost: 1500, unlockPop: 10 };

/**
 * Municipal zoning. Each town lot is zoned once when unlocked; the zone
 * permanently constrains which floor types may be built there ("build to
 * code"). Condensed from real-world code families to the ~7 that each carry a
 * distinct gameplay lever. `mixed` is the unrestricted default every existing
 * save falls back to, so zoning never retroactively breaks a built tower.
 */
export type ZoneType =
  | 'mixed'
  | 'residential'
  | 'commercial'
  | 'office'
  | 'industrial'
  | 'park'
  | 'transit';

export interface ZoneConfig {
  label: string;
  /** Blurb naming the real-world code families this stands in for. */
  description: string;
  /** Permitted floor types; null = unrestricted. Lobby is always allowed. */
  allowedFloorTypes: Exclude<FloorType, 'lobby'>[] | null;
  /** Multiplier on the lot purchase cost. */
  costMultiplier: number;
  /** Open-space lot that holds no tower (a park). */
  isPark?: boolean;
  /** Transit-oriented: residents here get gentler commute-happiness penalties. */
  isTransit?: boolean;
  /** Short emoji badge for the HUD/menu. */
  badge: string;
}

export const ZONE_CONFIGS: Record<ZoneType, ZoneConfig> = {
  mixed: {
    label: 'Mixed-Use',
    description: 'MU / MXD — anything goes: homes, shops, dining, offices, industry.',
    allowedFloorTypes: null,
    costMultiplier: 1.0,
    badge: '🏙',
  },
  residential: {
    label: 'Residential',
    description: 'R-1…RM — apartments only. Quiet neighbourhoods.',
    allowedFloorTypes: ['residential'],
    costMultiplier: 0.9,
    badge: '🏠',
  },
  commercial: {
    label: 'Commercial',
    description: 'C-1 / C-2 / CBD — shops, restaurants, and nightlife.',
    allowedFloorTypes: ['shop', 'restaurant'],
    costMultiplier: 1.1,
    badge: '🛍',
  },
  office: {
    label: 'Office',
    description: 'O / OP — workplaces and professional services.',
    allowedFloorTypes: ['office'],
    costMultiplier: 1.15,
    badge: '🏢',
  },
  industrial: {
    label: 'Industrial',
    description: 'I-1 / I-2 — factories that supply goods to shops town-wide.',
    allowedFloorTypes: ['factory'],
    costMultiplier: 0.8,
    badge: '🏭',
  },
  park: {
    label: 'Open Space',
    description: 'OS / PR — a park. No buildings, but lifts the mood of nearby towers.',
    allowedFloorTypes: [],
    costMultiplier: 0.3,
    isPark: true,
    badge: '🌳',
  },
  transit: {
    label: 'Transit-Oriented',
    description: 'TOD — dense mixed-use by transit; commutes feel shorter here.',
    allowedFloorTypes: null,
    costMultiplier: 1.25,
    isTransit: true,
    badge: '🚉',
  },
};

/** Zones a player may assign to a freshly-purchased lot (starting lot is always mixed). */
export const SELECTABLE_ZONES: ZoneType[] = [
  'mixed',
  'residential',
  'commercial',
  'office',
  'industrial',
  'transit',
  'park',
];

/** Town-level config: fixed tower footprints and street-level commuting. */
export const TOWN = {
  /** Fixed lobby/street overhead per commute leg, game minutes. */
  commuteBaseMinutes: 10,
  /** Additional commute minutes per world-unit of distance between plots. */
  commuteMinutesPerUnit: 1.1,
  /** Purchase cost per slot index (slot 0 is the free starting tower). */
  slotCosts: [0, 2500, 8000, 20000],
  /** Town-wide population required per slot index. */
  slotUnlockPop: [0, 12, 30, 60],
};

/** Offline catch-up tuning. */
export const OFFLINE = {
  /** Away time under this shows no report (a quick refresh isn't "away"). */
  minAwayRealSeconds: 120,
  /** Cap on simulated away time, in real hours. */
  maxRealHours: 10,
  /** Fast-forward tick size, game minutes. */
  chunkGameMinutes: 15,
};

export const MOVE_IN_INTERVAL = 90; // game minutes between move-in checks
