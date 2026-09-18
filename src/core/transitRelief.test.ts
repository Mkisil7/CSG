import { describe, expect, it } from 'vitest';
import { createPreviewTown, advanceRush } from '../dev/transitPreview';

describe('real-rider congestion relief', () => {
  it('keeps passengers already riding in their original car and charges only once', () => {
    const town = createPreviewTown(), game = town.towers()[0];
    for (let i = 0; i < 70 && game.elevator.cars.every((car) => car.riders.length === 0); i++) advanceRush(town, 1);
    const car = game.elevator.cars.find((candidate) => candidate.riders.length > 0)!;
    expect(car).toBeDefined();
    const passengers = structuredClone(car.riders), pos = car.pos, state = car.state;
    const coins = town.economy.coins;
    expect(game.unlockSecondShaft()).toBe(true);
    expect(car.riders).toEqual(passengers); expect(car.pos).toBe(pos); expect(car.state).toBe(state);
    const queued = game.shafts().flatMap((shaft) => [...shaft.queues.values()].flat());
    expect(queued.every((rider) => !passengers.some((person) => person.residentId === rider.residentId))).toBe(true);
    expect(new Set(queued.map((rider) => rider.residentId)).size).toBe(queued.length);
    expect(game.unlockSecondShaft()).toBe(false); expect(town.economy.coins).toBe(coins - 1500);
  });
  it('makes a purchased second shaft immediately useful to neighbors already waiting', () => {
    const town = createPreviewTown(), game = town.towers()[0];
    const before = game.shafts().flatMap((shaft) => [...shaft.queues.values()].flat());
    const coins = town.economy.coins;
    expect(before).toHaveLength(30);
    expect(game.transit.today(town.time).missed).toBeGreaterThan(0);
    expect(game.unlockSecondShaft()).toBe(true);
    expect(town.economy.coins).toBe(coins - 1500);
    expect(game.secondElevator!.waitingCount).toBeGreaterThan(0);
    const after = game.shafts().flatMap((shaft) => [...shaft.queues.values()].flat());
    expect(after.sort((a, b) => a.residentId.localeCompare(b.residentId)))
      .toEqual(before.sort((a, b) => a.residentId.localeCompare(b.residentId)));
    advanceRush(town, 80);
    const report = game.transit.improvement!;
    expect(report.beforeWait).toBeGreaterThan(20);
    expect(report.observedTrips).toBe(20);
    expect(report.afterWait).not.toBeNull();
    expect(report.afterWait!).toBeLessThan(report.beforeWait!);
    expect(game.secondElevator!.recentWaits().length).toBeGreaterThan(0);
  });
});
