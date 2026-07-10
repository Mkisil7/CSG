import { ELEVATOR } from './types';

export interface WaitingRider {
  residentId: string;
  from: number;
  to: number;
  enqueuedAt: number;
}

export type CarState = 'idle' | 'moving' | 'loading';

export interface Car {
  /** Current position in floor units (fractional while moving). */
  pos: number;
  state: CarState;
  /** Floor the car is heading to, when moving. */
  target: number | null;
  riders: WaitingRider[];
  /** Remaining door/load time when in 'loading' state, game minutes. */
  doorTimer: number;
}

export interface Arrival {
  residentId: string;
  floor: number;
}

export interface Boarding {
  residentId: string;
}

export interface ElevatorTickResult {
  arrivals: Arrival[];
  boardings: Boarding[];
}

/**
 * A single shaft with one or more cars. Riders queue per floor; idle cars are
 * dispatched to the longest-waiting rider, load everyone waiting there (up to
 * capacity), then serve rider destinations nearest-first.
 */
export class ElevatorSystem {
  cars: Car[] = [];
  /** floor level -> riders waiting there, oldest first */
  queues = new Map<number, WaitingRider[]>();

  /** Current travel speed, floors per game minute (upgradable via applyTier). */
  speed = ELEVATOR.speed;
  /** Current door/load time per stop, game minutes (upgradable via applyTier). */
  doorTime = ELEVATOR.doorTime;

  /** Rolling average wait, game minutes. */
  private waitSamples: number[] = [];

  constructor(carCount = 1) {
    for (let i = 0; i < carCount; i++) this.addCar();
  }

  /** Apply a purchased speed tier (affects travel speed and door time). */
  applyTier(tier: { speed: number; doorTime: number }): void {
    this.speed = tier.speed;
    this.doorTime = tier.doorTime;
  }

  addCar(): void {
    this.cars.push({ pos: 0, state: 'idle', target: null, riders: [], doorTimer: 0 });
  }

  get waitingCount(): number {
    let n = 0;
    for (const q of this.queues.values()) n += q.length;
    return n;
  }

  averageWait(): number {
    if (this.waitSamples.length === 0) return 0;
    return this.waitSamples.reduce((a, b) => a + b, 0) / this.waitSamples.length;
  }

  request(residentId: string, from: number, to: number, now: number): void {
    const q = this.queues.get(from) ?? [];
    q.push({ residentId, from, to, enqueuedAt: now });
    this.queues.set(from, q);
  }

  /** Remove a rider from queues (e.g. on game load). */
  clear(): void {
    this.queues.clear();
    for (const car of this.cars) {
      car.riders = [];
      car.state = 'idle';
      car.target = null;
    }
  }

  tick(dt: number, now: number): ElevatorTickResult {
    const result: ElevatorTickResult = { arrivals: [], boardings: [] };

    for (const car of this.cars) {
      switch (car.state) {
        case 'idle': {
          const target = this.pickDispatchTarget(car);
          if (target !== null) {
            car.target = target;
            car.state = 'moving';
          }
          break;
        }
        case 'moving': {
          if (car.target === null) {
            car.state = 'idle';
            break;
          }
          const dir = Math.sign(car.target - car.pos);
          car.pos += dir * this.speed * dt;
          const arrived =
            (dir >= 0 && car.pos >= car.target) || (dir < 0 && car.pos <= car.target);
          if (arrived) {
            car.pos = car.target;
            car.state = 'loading';
            car.doorTimer = this.doorTime;
          }
          break;
        }
        case 'loading': {
          car.doorTimer -= dt;
          if (car.doorTimer <= 0) {
            this.exchangeRiders(car, now, result);
            const next = this.pickNextTarget(car);
            if (next !== null) {
              car.target = next;
              car.state = 'moving';
            } else {
              car.target = null;
              car.state = 'idle';
            }
          }
          break;
        }
      }
    }

    return result;
  }

  /** Unload riders whose destination is this floor, then board waiting riders. */
  private exchangeRiders(car: Car, now: number, result: ElevatorTickResult): void {
    const floor = Math.round(car.pos);

    const staying: WaitingRider[] = [];
    for (const rider of car.riders) {
      if (rider.to === floor) {
        result.arrivals.push({ residentId: rider.residentId, floor });
      } else {
        staying.push(rider);
      }
    }
    car.riders = staying;

    const queue = this.queues.get(floor);
    if (queue) {
      while (queue.length > 0 && car.riders.length < ELEVATOR.capacity) {
        const rider = queue.shift()!;
        car.riders.push(rider);
        result.boardings.push({ residentId: rider.residentId });
        this.recordWait(now - rider.enqueuedAt);
      }
      if (queue.length === 0) this.queues.delete(floor);
    }
  }

  /** Idle car: go to the floor with the longest-waiting rider not already claimed. */
  private pickDispatchTarget(car: Car): number | null {
    const claimed = new Set<number>();
    for (const other of this.cars) {
      if (other !== car && other.target !== null) claimed.add(other.target);
    }
    let best: { floor: number; enqueuedAt: number } | null = null;
    for (const [floor, q] of this.queues) {
      if (q.length === 0 || claimed.has(floor)) continue;
      if (best === null || q[0].enqueuedAt < best.enqueuedAt) {
        best = { floor, enqueuedAt: q[0].enqueuedAt };
      }
    }
    if (best === null) return null;
    if (best.floor === Math.round(car.pos)) {
      // Already here: open doors immediately.
      car.state = 'loading';
      car.doorTimer = this.doorTime;
      return null;
    }
    return best.floor;
  }

  /** After loading: nearest rider destination, else nearest waiting floor. */
  private pickNextTarget(car: Car): number | null {
    const here = Math.round(car.pos);
    if (car.riders.length > 0) {
      let best: number | null = null;
      for (const rider of car.riders) {
        if (best === null || Math.abs(rider.to - here) < Math.abs(best - here)) {
          best = rider.to;
        }
      }
      return best;
    }
    return this.pickDispatchTarget(car);
  }

  private recordWait(wait: number): void {
    this.waitSamples.push(wait);
    if (this.waitSamples.length > 50) this.waitSamples.shift();
  }
}
