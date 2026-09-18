import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { Economy } from '../core/economy';
import { transitPanel } from './transitPanel';

describe('honest congestion feedback', () => {
  it('separates an old poor result from an empty current queue, then flags a genuine new delay', () => {
    const game = new Game('t0', new Economy(10000));
    for (let i = 0; i < 20; i++) game.transit.record(i, 50, false, false);
    game.transit.beginImprovement('Lift upgrade');
    for (let i = 0; i < 20; i++) game.transit.record(30 + i, 30, false, false);
    let html = transitPanel(game, 100, false);
    expect(html).toContain('No one is waiting right now'); expect(html).not.toContain('transit-strained');
    expect(html).toContain('50.0 min → 30.0 min');
    game.elevator.request('r1', 0, 1, 70);
    html = transitPanel(game, 100, false);
    expect(html).toContain('transit-strained'); expect(html).toContain('Current queues still need attention');
  });
  it('waits for ten observations and reports a worse result without celebrating it', () => {
    const game = new Game('t0', new Economy(10000));
    for (let i = 0; i < 20; i++) game.transit.record(i, 5, false, false);
    game.transit.beginImprovement('Lift upgrade');
    for (let i = 0; i < 9; i++) game.transit.record(30 + i, 12, false, false);
    expect(transitPanel(game, 40, false)).toContain('9/10');
    game.transit.record(40, 12, false, false);
    const html = transitPanel(game, 40, false);
    expect(html).toContain('5.0 min → 12.0 min'); expect(html).not.toContain('% shorter');
    expect(html).toContain('Early estimate · 10/20 trips');
    expect(html).toContain('spread homes and workplaces');
  });
  it('distinguishes missing baseline evidence and hides spending controls for visitors', () => {
    const game = new Game('t0', new Economy(10000));
    game.transit.beginImprovement('New shaft');
    for (let i = 0; i < 10; i++) game.transit.record(i, 8, false, false);
    const html = transitPanel(game, 10, true);
    expect(html).toContain('No earlier sample → 8.0 min'); expect(html).not.toContain('% shorter');
    expect(html).not.toContain('id="insp-lift-speed"'); expect(html).not.toContain('id="insp-lift-shaft"');
  });
});
