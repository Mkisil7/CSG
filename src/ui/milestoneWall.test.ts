import { describe, expect, it } from 'vitest';
import { Town } from '../core/town';
import { milestoneWallPanel } from './milestoneWall';
import { missionPanel } from './missionPanel';

describe('readable story-wall companion', () => {
  it('shows the actual count, known milestone names and a read-only route to the founding lobby', () => {
    const town = new Town(); town.missions.completed = new Set(['first-meal', 'lift-second', 'unknown']);
    const before = JSON.stringify([...town.missions.completed]);
    const html = milestoneWallPanel(town);
    expect(html).toContain('2/120 tiles'); expect(html).toContain('A Table for the Neighborhood'); expect(html).toContain('Double Shaft');
    expect(html).toContain('data-explore-room="0"'); expect(html).toContain('data-explore-tower="t0"');
    expect(html).not.toContain('unknown'); expect(html).not.toContain('First Neighbors');
    expect(JSON.stringify([...town.missions.completed])).toBe(before);
  });
  it('escapes town labels and explains an empty frame without implying a reward already earned', () => {
    const town = new Town(); town.towers()[0].name = '<Willow & Co>';
    const html = milestoneWallPanel(town);
    expect(html).toContain('&lt;Willow &amp; Co&gt;'); expect(html).not.toContain('<Willow & Co>');
    expect(html).toContain('0/120 tiles'); expect(html).toContain('ready for your first milestone');
    expect(html).not.toContain('<details>');
  });
  it('connects the ordinary Missions panel to the visible display without requiring another purchase', () => {
    const html = missionPanel(new Town(), 'first-meal');
    expect(html).toContain('See the story wall ↗'); expect(html).toContain('no extra charges or income');
    expect(html).toContain('YOUR SESSION GOAL');
  });

  it('uses a singular label for the first earned milestone', () => {
    const town = new Town(); town.missions.completed.add('first-meal');
    expect(milestoneWallPanel(town)).toContain('<summary>Read the recorded milestone</summary>');
  });
});
