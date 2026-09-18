import { describe, expect, it } from 'vitest';
import { Town } from '../core/town';
import { missionPanel } from './missionPanel';

describe('chapter-to-mission navigation', () => {
  it('shows the selected mission before unrelated unfinished milestones', () => {
    const html = missionPanel(new Town(), 'day-income-1000');
    expect(html.indexOf('Big Earner 1k')).toBeLessThan(html.indexOf('First Neighbors'));
    expect(html.indexOf('YOUR SESSION GOAL')).toBeLessThan(html.indexOf('aria-label="Town story wall"'));
    expect(html.match(/<b>Big Earner 1k<\/b>/g)).toHaveLength(1);
    expect(html).toContain('YOUR SESSION GOAL');
    expect(html).toContain('Checked at day’s end.');
    expect(html).toContain('aria-label="Close missions"');
  });
  it('retains a just-completed selection with an honest reward receipt', () => {
    const town = new Town(); town.missions.completed.add('day-income-1000');
    const html = missionPanel(town, 'day-income-1000');
    expect(html.indexOf('Big Earner 1k')).toBeLessThan(html.indexOf('First Neighbors'));
    expect(html).toContain('Completed · reward already received');
  });
  it('keeps the regular mission list and does not interpolate an unknown selection', () => {
    const html = missionPanel(new Town(), '<script>');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('YOUR SESSION GOAL');
    expect(html.indexOf('First Neighbors')).toBeLessThan(html.indexOf('Big Earner 1k'));
  });
});
