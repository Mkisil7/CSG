import type { Town } from '../core/town';
import { earnedMilestoneTiles, MILESTONE_COLORS, MILESTONE_TILES } from '../core/milestoneWall';
import { escapeHtml } from './storyViews';

/** Readable companion to the miniature mural; no need to hit individual tiles. */
export function milestoneWallPanel(town: Town): string {
  const tiles = earnedMilestoneTiles(town.missions.completed), tower = town.towers()[0];
  if (!tower) return '';
  return `<section class="milestone-wall" aria-label="Town story wall">
    <h3 class="insp-section">Town story wall · ${tiles.length}/${MILESTONE_TILES.length} tiles</h3>
    <p class="journal-empty">Every completed mission adds one permanent enamel tile in ${escapeHtml(tower.name)}’s lobby. A record of your town, with no extra charges or income.</p>
    <button class="build-btn" data-explore-room="0" data-explore-tower="${escapeHtml(tower.id)}">See the story wall ↗</button>
    ${tiles.length ? `<details><summary>Read ${tiles.length === 1 ? 'the recorded milestone' : `the ${tiles.length} recorded milestones`}</summary>${Object.entries(MILESTONE_COLORS).map(([family, style]) => {
      const group = tiles.filter(tile => tile.family === family);
      return group.length ? `<h4>${style.label} · ${group.length}</h4><ul>${group.map(tile => `<li>${escapeHtml(tile.label)}</li>`).join('')}</ul>` : '';
    }).join('')}</details>` : '<p class="journal-empty">The empty frame is ready for your first milestone.</p>'}
  </section>`;
}
