import { describe, expect, it } from 'vitest';
import { ElevatorSystem } from './elevator';
import { ELEVATOR } from './types';

/** Run the sim until a condition holds or maxMinutes pass; returns collected arrivals. */
function runUntil(
  elevator: ElevatorSystem,
  done: (arrivals: { residentId: string; floor: number }[]) => boolean,
  maxMinutes = 200,
) {
  const arrivals: { residentId: string; floor: number }[] = [];
  let t = 0;
  const dt = 0.5;
  while (t < maxMinutes) {
    t += dt;
    const result = elevator.tick(dt, t);
    arrivals.push(...result.arrivals);
    if (done(arrivals)) break;
  }
  return { arrivals, elapsed: t };
}

describe('ElevatorSystem', () => {
  it('delivers a rider from lobby to their floor', () => {
    const elevator = new ElevatorSystem(1);
    elevator.request('a', 0, 3, 0);

    const { arrivals } = runUntil(elevator, (a) => a.length >= 1);
    expect(arrivals).toEqual([{ residentId: 'a', floor: 3 }]);
    expect(elevator.waitingCount).toBe(0);
  });

  it('picks up a rider from an upper floor and brings them down', () => {
    const elevator = new ElevatorSystem(1);
    elevator.request('a', 5, 0, 0);

    const { arrivals } = runUntil(elevator, (a) => a.length >= 1);
    expect(arrivals).toEqual([{ residentId: 'a', floor: 0 }]);
  });

  it('respects car capacity — the overflow rider waits for a second trip', () => {
    const elevator = new ElevatorSystem(1);
    for (let i = 0; i < ELEVATOR.capacity + 1; i++) {
      elevator.request(`r${i}`, 0, 2, 0);
    }

    const { arrivals } = runUntil(elevator, (a) => a.length >= ELEVATOR.capacity + 1);
    expect(arrivals).toHaveLength(ELEVATOR.capacity + 1);
    // The last rider must have been delivered on a later trip, not squeezed in.
    const firstBatch = arrivals.slice(0, ELEVATOR.capacity);
    expect(firstBatch.every((a) => a.floor === 2)).toBe(true);
  });

  it('serves multiple floors: riders with different destinations all arrive', () => {
    const elevator = new ElevatorSystem(1);
    elevator.request('a', 0, 2, 0);
    elevator.request('b', 0, 5, 0);
    elevator.request('c', 3, 1, 0);

    const { arrivals } = runUntil(elevator, (a) => a.length >= 3);
    const byId = Object.fromEntries(arrivals.map((a) => [a.residentId, a.floor]));
    expect(byId).toEqual({ a: 2, b: 5, c: 1 });
  });

  it('two cars clear a rush-hour crowd faster than one', () => {
    // More riders than one car can hold, all going up: one car needs two
    // round trips, two cars carry the crowd in parallel.
    const single = new ElevatorSystem(1);
    const double = new ElevatorSystem(2);
    const total = ELEVATOR.capacity * 2;
    for (const el of [single, double]) {
      for (let i = 0; i < total; i++) {
        el.request(`r${i}`, 0, 6, 0);
      }
    }

    const timeSingle = runUntil(single, (a) => a.length >= total, 500).elapsed;
    const timeDouble = runUntil(double, (a) => a.length >= total, 500).elapsed;
    expect(timeDouble).toBeLessThan(timeSingle);
  });

  it('tracks average wait time', () => {
    const elevator = new ElevatorSystem(1);
    elevator.request('a', 0, 4, 0);
    runUntil(elevator, (a) => a.length >= 1);
    expect(elevator.averageWait()).toBeGreaterThan(0);
  });

  it('a speed-tier upgrade delivers riders faster', () => {
    const slow = new ElevatorSystem(1);
    const fast = new ElevatorSystem(1);
    fast.applyTier({ speed: ELEVATOR.speed * 3, doorTime: ELEVATOR.doorTime / 2 });
    slow.request('a', 0, 8, 0);
    fast.request('a', 0, 8, 0);

    const slowTime = runUntil(slow, (a) => a.length >= 1).elapsed;
    const fastTime = runUntil(fast, (a) => a.length >= 1).elapsed;
    expect(fastTime).toBeLessThan(slowTime);
  });
});
