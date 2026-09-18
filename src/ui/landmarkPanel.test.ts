import { describe, expect, it } from 'vitest';
import { Town } from '../core/town';
import { landmarkPanel } from './landmarkPanel';

describe('public landmark choices', () => {
  it('explains all three earned choices, their cost and the one-per-tower decision', () => {
    const town = new Town(), html = landmarkPanel(town, 't0', false);
    expect(html).toContain('One permanent public landmark per tower');
    expect(html).toContain('data-build-landmark="conservatory"');
    expect(html).toContain('data-build-landmark="gallery"');
    expect(html).toContain('data-build-landmark="observatory"');
    expect(html).toContain('Complete 12 missions'); expect(html).toContain('1275 coins');
    expect(html).toContain('disabled');
  });
  it('keeps built-landmark navigation but removes spending controls when visiting a shared town', () => {
    const town = new Town(), game = town.towers()[0];
    const floor = game.tower.addFloor('landmark'); floor.landmark = 'gallery'; floor.name = '<b>Art</b>';
    const html = landmarkPanel(town, 't0', true);
    expect(html).not.toContain('data-build-landmark'); expect(html).toContain('data-landmark-floor="1"');
    expect(html).toContain('&lt;b&gt;Art&lt;/b&gt;'); expect(html).not.toContain('<b>Art</b>');
  });
});
