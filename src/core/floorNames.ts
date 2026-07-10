import { FloorType } from './types';

const RESIDENTIAL_FIRST = [
  'Maple', 'Willow', 'Sunset', 'Harbor', 'Cedar', 'Rosewood', 'Juniper', 'Meadow',
  'Aster', 'Birchwood', 'Clover', 'Lantern',
];
const RESIDENTIAL_SECOND = ['Apartments', 'Heights', 'Lofts', 'Court', 'Residences', 'Flats'];

const SHOP_FIRST = [
  'The Corner', 'Tiny', 'Sundial', 'Blue Door', 'Paper Moon', 'Marigold', 'Pocket',
  'Wren & Willow', 'Copper Kettle', 'Lucky Penny',
];
const SHOP_SECOND = ['Boutique', 'Goods', 'Emporium', 'Market', 'Trading Co.', 'Shop'];

const RESTAURANT_FIRST = [
  'The Daily Grind', 'Golden Spoon', 'Little Lemon', 'Ember & Oak', 'Noodle Cloud',
  'Butterbean', 'Saffron Street', 'The Hungry Owl', 'Two Forks', 'Miso Happy',
];
const RESTAURANT_SECOND = ['Café', 'Bistro', 'Diner', 'Kitchen', 'Eatery', 'Grill'];

const OFFICE_FIRST = [
  'Meridian', 'Northwind', 'Cobalt', 'Summit', 'Beacon', 'Fig & Vine', 'Atlas',
  'Brightside', 'Keystone', 'Larkspur',
];
const OFFICE_SECOND = ['& Co.', 'Group', 'Studios', 'Partners', 'Labs', 'Consulting'];

const POOLS: Partial<Record<FloorType, [string[], string[]]>> = {
  residential: [RESIDENTIAL_FIRST, RESIDENTIAL_SECOND],
  shop: [SHOP_FIRST, SHOP_SECOND],
  restaurant: [RESTAURANT_FIRST, RESTAURANT_SECOND],
  office: [OFFICE_FIRST, OFFICE_SECOND],
};

export const MAX_FLOOR_NAME_LENGTH = 30;

export function generateFloorName(type: FloorType, rand: () => number = Math.random): string {
  const pool = POOLS[type];
  if (!pool) return 'Lobby';
  const [first, second] = pool;
  return `${first[Math.floor(rand() * first.length)]} ${second[Math.floor(rand() * second.length)]}`;
}
