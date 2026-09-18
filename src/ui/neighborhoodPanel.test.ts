import { describe, expect, it } from 'vitest';
import { Town } from '../core/town';
import type { NeighborhoodEvent } from '../core/neighborhood';
import { neighborhoodPanel, neighborhoodProgress } from './neighborhoodPanel';

function fixture() {
  const town = new Town();
  const event: NeighborhoodEvent = { id: 'ne1', kind: 'band', title: '<script>untrusted</script>', reason: 'A <b>real</b> park',
    towerId: 't1', parkIndex: 1, status: 'offered', createdAt: town.time, startedAt: 0, endsAt: 0,
    nextVisitorAt: 0, served: 0, missed: 0, arrivals: 0, reviewPublished: false, outcome: '' };
  town.neighborhood.events.push(event);
  return { town, event };
}

describe('neighborhood panel', () => {
  it('links both earned studios in owned and shared towns, without guessing a destination in older memories', () => {
    const { town, event } = fixture(); const game = town.towers()[0];
    game.tower.addFloor('office', 'tech'); game.tower.addFloor('office', 'tech');
    game.tower.floors[2].variant = 'innovation-hub';
    Object.assign(event, { kind: 'startup', towerId: game.id, level: 1, status: 'completed', studio: { towerId: game.id, level: 2 } });
    for (const readOnly of [true, false]) {
      const html = neighborhoodPanel(town, readOnly);
      expect(html).toContain('Visit the original studio'); expect(html).toContain('Visit the Innovation hub');
      expect(html).not.toContain('data-event-accept');
    }
    delete event.studio;
    expect(neighborhoodPanel(town, false)).not.toContain('Visit the Innovation hub');
    event.studio = { towerId: game.id, level: 1 };
    expect(neighborhoodPanel(town, false)).not.toContain('Visit the Innovation hub');
  });
  it('keeps visit navigation but omits all spending/decline controls in a shared town', () => {
    const { town } = fixture();
    const own = neighborhoodPanel(town, false), visiting = neighborhoodPanel(town, true);
    expect(own).toContain('data-event-accept'); expect(own).toContain('data-event-decline');
    expect(visiting).toContain('data-event-location');
    expect(visiting).not.toContain('data-event-accept'); expect(visiting).not.toContain('data-event-decline');
    expect(visiting).toContain('&lt;script&gt;'); expect(visiting).not.toContain('<script>');
  });

  it('keeps the panel markup stable while audience and countdown values change', () => {
    const { town, event } = fixture(); event.status = 'active';
    event.endsAt = town.time + 48 * 60 + 1e-10;
    const before = neighborhoodPanel(town, false);
    expect(neighborhoodProgress(town, event)).toBe('0 listeners arrived · 48 town hours left');
    event.arrivals = 7; town.time += 60;
    expect(neighborhoodPanel(town, false)).toBe(before);
    expect(neighborhoodProgress(town, event)).toBe('7 listeners arrived · 47 town hours left');
    event.kind = 'festival'; event.served = 4; event.missed = 1;
    expect(neighborhoodProgress(town, event)).toBe('4 served · 1 missed · 47 town hours left');
  });
});
