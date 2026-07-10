import { describe, expect, it } from 'vitest';
import { chooseShaft, Game } from './game';
import { ElevatorSystem } from './elevator';
import { Economy } from './economy';

describe('chooseShaft (ETA-based)', () => {
  it('prefers the shaft whose car is closer to the rider', () => {
    const near = new ElevatorSystem(1);
    const far = new ElevatorSystem(1);
    near.cars[0].pos = 5;
    far.cars[0].pos = 0;
    expect(chooseShaft([far, near], 5)).toBe(near);
  });

  it('avoids a nearby shaft that already has a long queue', () => {
    const busy = new ElevatorSystem(1);
    const free = new ElevatorSystem(1);
    busy.cars[0].pos = 5; // right there…
    for (let i = 0; i < 8; i++) busy.request(`q${i}`, 5, 0, 0); // …but mobbed
    free.cars[0].pos = 3; // a short ride away, empty queue
    expect(chooseShaft([busy, free], 5)).toBe(free);
  });
});

describe('averageWait pooling', () => {
  it('an idle second shaft cannot dilute a congested first shaft', () => {
    const game = new Game('t0', new Economy());
    // Simulate recorded waits on the primary shaft only.
    const shaft = game.elevator as unknown as { waitSamples: number[] };
    shaft.waitSamples = [20, 20, 20];
    expect(game.averageWait()).toBeCloseTo(20, 5);

    game.secondElevator = new ElevatorSystem(1); // brand new, zero samples
    expect(game.averageWait()).toBeCloseTo(20, 5); // still 20, not halved
  });
});
