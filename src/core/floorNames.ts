import { BUSINESS_SUBTYPES, type BusinessSubtype, type FloorType } from './types';

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

const FACTORY_FIRST = [
  'Ironworks', 'Redbrick', 'Foundry', 'Cogwheel', 'Steamline', 'Anvil', 'Gearhart',
  'Millstone', 'Copperfield', 'Forge & Bolt',
];
const FACTORY_SECOND = ['Works', 'Manufacturing', 'Industries', 'Fabrication', 'Assembly', 'Mill'];

const POOLS: Partial<Record<FloorType, [string[], string[]]>> = {
  residential: [RESIDENTIAL_FIRST, RESIDENTIAL_SECOND],
  shop: [SHOP_FIRST, SHOP_SECOND],
  restaurant: [RESTAURANT_FIRST, RESTAURANT_SECOND],
  office: [OFFICE_FIRST, OFFICE_SECOND],
  factory: [FACTORY_FIRST, FACTORY_SECOND],
};

// The sign should describe the room the player actually chose. Keep two random
// draws, as in the original names, so dressing never changes the town's future.
const SUBTYPE_POOLS: Record<BusinessSubtype, [string[], string[]]> = {
  grocery: [['The Corner', 'Clover', 'Orchard', 'Marigold', 'Little Harvest', 'Green Basket'],
    ['Market', 'Grocers', 'Pantry']],
  boutique: [['Paper Moon', 'Wren & Willow', 'Blue Door', 'Marigold', 'Velvet Finch', 'Thread & Thimble'],
    ['Boutique', 'Clothiers', 'Wardrobe']],
  electronics: [['Pocket', 'Bright Circuit', 'Copper Wire', 'Blue Signal', 'Pixel Corner', 'Sundial'],
    ['Electronics', 'Gadgets', 'Tech Shop']],
  coffee: [['Copper Kettle', 'The Daily Grind', 'Little Lantern', 'Juniper', 'Daybreak', 'Paper Moon', 'Morning Dove', 'Honeycomb'],
    ['Coffee', 'Café', 'Coffee House', 'Roasters']],
  fastfood: [['Golden Spoon', 'Butterbean', 'The Hungry Owl', 'Lucky Bun', 'Little Lemon', 'Noodle Cloud'],
    ['Diner', 'Quick Bites', 'Takeaway']],
  'fine-dining': [['Ember & Oak', 'Saffron Street', 'Two Forks', 'Juniper', 'Golden Fig', 'Lark & Laurel'],
    ['Bistro', 'Dining Room', 'Table']],
  bar: [['The Lantern', 'Blue Hour', 'Copper Moon', 'Velvet Fox', 'The Night Owl', 'Ember'],
    ['Bar', 'Lounge', 'Social Club']],
  creative: [['Paper Kite', 'Fig & Vine', 'Larkspur', 'Brightside', 'Ink & Thread', 'Wildflower'],
    ['Studios', 'Design House', 'Creative']],
  tech: [['Meridian', 'Northwind', 'Cobalt', 'Beacon', 'Atlas', 'Brightside'],
    ['Labs', 'Systems', 'Technologies']],
  law: [['Meridian', 'Summit', 'Beacon', 'Keystone', 'Cedar', 'Larkspur'],
    ['Legal', 'Law Partners', 'Law Offices']],
  assembly: [FACTORY_FIRST, ['Works', 'Assembly', 'Manufacturing']],
  foodproc: [['Little Harvest', 'Green Basket', 'Millstone', 'Redbrick', 'Golden Grain', 'Orchard'],
    ['Foodworks', 'Provisions', 'Food Co.']],
  'electronics-fab': [['Copperfield', 'Cobalt', 'Bright Circuit', 'Northwind', 'Beacon', 'Silicon Grove'],
    ['Circuits', 'Microdevices', 'Electronics Fab']],
};

export const MAX_FLOOR_NAME_LENGTH = 30;

export function generateFloorName(type: FloorType, rand: () => number = Math.random, subtype?: BusinessSubtype): string {
  const validSubtype = subtype && type !== 'lobby' && type !== 'residential' && type !== 'landmark' &&
    BUSINESS_SUBTYPES[type].some((profile) => profile.subtype === subtype);
  const pool = validSubtype ? SUBTYPE_POOLS[subtype] : POOLS[type];
  if (!pool) return 'Lobby';
  const [first, second] = pool;
  return `${first[Math.floor(rand() * first.length)]} ${second[Math.floor(rand() * second.length)]}`;
}
