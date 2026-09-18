import { NIGHTLIFE, type Floor, type Resident } from './types';

export type RoomAction = 'barista' | 'chef' | 'cook' | 'server' | 'collect-coffee' | 'drink-coffee' | 'dine' | 'meeting' | 'typing' | 'reading' | 'resting' | 'admiring' | 'stargazing'
  | 'cashier' | 'stocking' | 'folding' | 'demonstrating' | 'browse-grocery' | 'browse-clothes' | 'try-device' | 'checkout'
  | 'assembling' | 'food-control' | 'fabricating' | 'supervising';
export interface RoomPose { action: RoomAction; x: number; z: number; facing: number; seated?: boolean; chef?: boolean }

/** Shared coordinates keep the miniature performances aligned with their furniture. */
export const ROOM_LIFE = {
  coffee: { x: 1, z: 1.9, staffX: 0.15, staffZ: 1.12 },
  kitchen: { x: 6.1, z: -1.5, staffZ: -0.6 },
  meeting: { x: 6.8, z: 0.5, radius: 0.85 },
  deskX: [-4.6, -2.4, -0.2],
  standingDesk: { x: 2.7, z: 0.9 },
  diningX: [-4.7, -2.5, -0.3],
  homeSeats: [{ x: -4.5, z: 1.25 }, { x: -3.7, z: 1.25 }, { x: 4.5, z: 1.25 }, { x: 2.5, z: 1.25 }],
  homeBedX: [-4.5, -1.9, 1.6, 4.2],
  homeBedZ: -1.4,
  homeRestHeight: 0.7,
  checkout: { x: -4.1, z: -0.1, staffZ: -0.85, customerZ: 0.72 },
  displayX: [-1, 1, 3],
  deviceDisplayX: [-0.6, 1, 2.6],
  factoryX: [-1, 1, 3],
  workstationZ: 2.78,
};

export function roomJitter(level: number, index: number): number {
  return (((level * 13 + index * 7) % 5) - 2) * 0.18;
}

/** Shift the whole dining layout together: independently jittered tables can
 * overlap the backs of neighboring chairs even when each guest has a seat. */
export function diningTableX(level: number, index: number): number {
  return ROOM_LIFE.diningX[index] + roomJitter(level, 0);
}

/** Keep desk spacing consistent instead of independently jittering tabletops. */
export function officeDeskX(level: number, index: number): number {
  return ROOM_LIFE.deskX[index] + roomJitter(level, 0);
}

export function stableRoomHash(value: string): number {
  let hash = 0;
  for (const c of value) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return hash;
}

/** The portrait and the miniature resident share an identity, not just a name. */
export function residentAppearance(resident: Pick<Resident, 'id' | 'color'>): { skin: number; hair: number; shirt: number; pants: number } {
  const hash = stableRoomHash(resident.id);
  return { skin: [0xefc09c, 0xba8060, 0x8d5b46, 0xe0a880][hash % 4],
    hair: [0x382a27, 0x66503b, 0xb28048, 0x343a46][Math.floor(hash / 4) % 4],
    shirt: resident.color & 0xffffff,
    pants: [0x4a5568, 0x6b5b4a, 0x3f5566, 0x5a4a6b][Math.floor(hash / 8) % 4] };
}

/** A stable part of a neighbor's identity, derived from their persisted ID.
 * No extra households, rent, or invisible residents are created for the scenery. */
export function residentPet(resident: Pick<Resident, 'id' | 'homeFloor'>): { name: string; color: number } | null {
  if (resident.homeFloor < 1 || !/^r\d+$/.test(resident.id)) return null;
  const hash = stableRoomHash(resident.id);
  if (hash % 4 !== 0) return null;
  return { name: ['Miso', 'Pebble', 'Clover', 'Toast', 'Fig'][Math.floor(hash / 4) % 5],
    color: [0xd2a16e, 0x7b858b, 0xede1cc, 0x534d49][Math.floor(hash / 7) % 4] };
}

/** Staging only: every actor is a real, physically present participant. Café
 * customers collect an already-purchased drink, then sit; this is not another
 * income source or a second simulated lift/service queue. Old saves without an
 * activity start time show the settled pose instead of replaying collection. */
export function homeResting(resident: Pick<Resident, 'nocturnal'>, now: number): boolean {
  const time = ((now % 1440) + 1440) % 1440;
  return time < 420 || time >= (resident.nocturnal ? NIGHTLIFE.nocturnalBedtime : NIGHTLIFE.bedtime);
}

export function roomPoses(floors: Floor[], residents: Resident[], towerId: string, now: number, households: Resident[] = residents): Map<string, RoomPose> {
  const poses = new Map<string, RoomPose>();
  const present = new Map<number, Resident[]>();
  for (const r of residents) {
    if (r.state.kind !== 'idle' || r.state.activity.floor !== r.state.floor) continue;
    const people = present.get(r.state.floor) ?? []; people.push(r); present.set(r.state.floor, people);
  }
  for (const [level, people] of present) {
    const floor = floors[level]; if (!floor) continue;
    people.sort((a, b) => a.id.localeCompare(b.id));
    const workers = people.filter((r) => r.state.kind === 'idle' && r.state.activity.kind === 'work' && r.jobTowerId === towerId && r.jobFloor === level);
    if (floor.type === 'restaurant') {
      const counterService = floor.subtype === 'coffee' || floor.subtype === 'bar';
      const chef = workers.find((r) => r.jobTier === 1);
      // A real promoted Chef leads the kitchen. An entry-level worker can cover
      // cooking, but never gains the senior uniform or title from list order.
      const lead = counterService ? workers.find((r) => r !== chef) ?? chef : chef ?? workers[0];
      let support = 0;
      workers.forEach((r) => {
        const counter = counterService && r === lead;
        const cooking = !counterService && r === lead;
        poses.set(r.id, { action: counter ? 'barista' : cooking ? r.jobTier === 1 ? 'chef' : 'cook' : 'server',
          chef: r.jobTier === 1,
          x: counter ? ROOM_LIFE.coffee.staffX : cooking ? 4.9 : (counterService ? 4.9 : 5.6) + Math.min(support++, 3) * 0.7,
          z: counter ? ROOM_LIFE.coffee.staffZ : ROOM_LIFE.kitchen.staffZ, facing: counter ? 0 : Math.PI });
      });
      let collecting = 0, seated = 0;
      for (const r of people) {
        const state = r.state;
        if (state.kind !== 'idle' || state.activity.kind !== 'eat') continue;
        const coffee = floor.subtype === 'coffee';
        const elapsed = state.startedAt === undefined ? Infinity : Math.max(0, now - state.startedAt);
        if (coffee && elapsed < 8) {
          const index = collecting++;
          poses.set(r.id, { action: 'collect-coffee', x: 2.6 + index % 6 * 0.72, z: 2.5 - Math.min(5, Math.floor(index / 6)) * 0.55, facing: -Math.PI / 2 });
        } else {
          const index = seated++, table = Math.floor(index / 2) % 3, side = index % 2 === 0 ? -1 : 1;
          poses.set(r.id, { action: coffee ? 'drink-coffee' : 'dine',
            x: diningTableX(level, table) + side * 0.78,
            z: 0.1 + Math.min(4, Math.floor(index / 6)) * 0.65, facing: -side * Math.PI / 2, seated: index < 6 });
        }
      }
    } else if (floor.type === 'shop') {
      workers.forEach((r, index) => {
        const cashier = index === 0;
        poses.set(r.id, cashier ? { action: 'cashier', x: ROOM_LIFE.checkout.x, z: ROOM_LIFE.checkout.staffZ, facing: 0 } :
          floor.subtype === 'boutique' ? { action: 'folding', x: 2.6, z: -0.4, facing: 0 } :
          floor.subtype === 'electronics' ? { action: 'demonstrating', x: 4.2, z: -0.6, facing: 0 } :
          { action: 'stocking', x: 1.4 + roomJitter(level, 0), z: -0.65, facing: Math.PI });
      });
      let browsing = 0, checkingOut = 0;
      for (const r of people) {
        const state = r.state;
        if (state.kind !== 'idle' || state.activity.kind !== 'shop') continue;
        // This depicts the existing visit, not another purchase or service queue.
        // Old saves without startedAt stay browsing, rather than replaying a checkout.
        const duration = state.startedAt === undefined ? Infinity : state.until - state.startedAt;
        const progress = duration > 0 && Number.isFinite(duration) ? (now - state.startedAt!) / duration : 0;
        if (progress >= 0.7 && workers.length > 0) {
          const index = checkingOut++;
          poses.set(r.id, { action: 'checkout', x: ROOM_LIFE.checkout.x + index % 3 * 0.7,
            z: ROOM_LIFE.checkout.customerZ + Math.min(3, Math.floor(index / 3)) * 0.65, facing: Math.PI });
        } else {
          const index = browsing++, station = index % 3;
          poses.set(r.id, { action: floor.subtype === 'boutique' ? 'browse-clothes' : floor.subtype === 'electronics' ? 'try-device' : 'browse-grocery',
            x: index < 3 ? (floor.subtype === 'electronics' ? ROOM_LIFE.deviceDisplayX[station] : ROOM_LIFE.displayX[station]) : 4.6 + station * 0.7,
            z: index < 3 ? ROOM_LIFE.workstationZ : 1.3 + Math.min(2, Math.floor((index - 3) / 3)) * 0.65,
            facing: floor.subtype === 'grocery' ? Math.PI : Math.PI / 4 });
        }
      }
    } else if (floor.type === 'factory') {
      let station = 0;
      workers.forEach((r) => {
        if (r.jobTier > 0) {
          poses.set(r.id, { action: 'supervising', x: 5.3, z: 1.3, facing: -Math.PI / 2 });
        } else {
          poses.set(r.id, { action: floor.subtype === 'foodproc' ? 'food-control' : floor.subtype === 'electronics-fab' ? 'fabricating' : 'assembling',
            x: ROOM_LIFE.factoryX[station++ % 3], z: ROOM_LIFE.workstationZ, facing: Math.PI });
        }
      });
    } else if (floor.type === 'office') {
      const time = now % 1440;
      const meeting = workers.length >= 2 && (time >= 600 && time < 625 || time >= 900 && time < 925);
      workers.forEach((r, index) => {
        if (meeting && index < 2) {
          const side = index === 0 ? -1 : 1;
          poses.set(r.id, { action: 'meeting', x: ROOM_LIFE.meeting.x + side * ROOM_LIFE.meeting.radius,
            z: ROOM_LIFE.meeting.z, facing: -side * Math.PI / 2, seated: true });
        } else {
          const workstation = index - (meeting ? 2 : 0), desk = workstation % 3;
          poses.set(r.id, { action: 'typing', x: workstation < 3 ? officeDeskX(level, desk) : ROOM_LIFE.standingDesk.x,
            z: workstation < 3 ? -0.6 : ROOM_LIFE.standingDesk.z, facing: Math.PI, seated: workstation < 3 });
        }
      });
    } else if (floor.type === 'landmark') {
      const visitors = people.filter((r) => r.state.kind === 'idle' && r.state.activity.kind === 'leisure');
      visitors.forEach((r, index) => {
        if (floor.landmark === 'conservatory' && index < 4) {
          poses.set(r.id, { action: 'reading', x: -3.2 + index * 2.8, z: 0.8, facing: 0, seated: true });
        } else if (floor.landmark === 'observatory' && index < 2) {
          poses.set(r.id, { action: 'stargazing', x: index === 0 ? -3.2 : 4.2, z: 0.5, facing: 0 });
        } else {
          poses.set(r.id, { action: 'admiring', x: -4.7 + index % 6 * 2, z: -0.5 + Math.min(3, Math.floor(index / 6)) * 0.6, facing: Math.PI });
        }
      });
    } else if (floor.type === 'residential') {
      // Include household members who are currently away, so the people still
      // at home don't shuffle seats/beds every time someone commutes.
      const household = [...new Set(households.filter(r => r.homeTowerId === towerId && r.homeFloor === level).map(r => r.id))].sort((a, b) => a.localeCompare(b));
      for (const r of people) {
        if (r.state.kind !== 'idle' || r.state.activity.kind !== 'home' || r.homeTowerId !== towerId || r.homeFloor !== level) continue;
        const index = household.indexOf(r.id);
        if (index < 0 || index >= ROOM_LIFE.homeSeats.length) continue;
        const resting = homeResting(r, now);
        poses.set(r.id, resting
          ? { action: 'resting', x: ROOM_LIFE.homeBedX[index] + 0.72, z: ROOM_LIFE.homeBedZ, facing: 0 }
          : { action: 'reading', ...ROOM_LIFE.homeSeats[index], facing: 0, seated: true });
      }
    }
  }
  return poses;
}
