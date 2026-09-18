import type { Town } from '../core/town';
import { MISSION_DEFS, type MissionDef } from '../core/missions';
import { escapeHtml } from './storyViews';
import { milestoneWallPanel } from './milestoneWall';

/** Following a chapter card puts that exact goal first, not deep in the ledger. */
export function missionPanel(town: Town, selectedId?: string): string {
  const ordered = [...MISSION_DEFS].sort((a, b) =>
    Number(b.id === selectedId) - Number(a.id === selectedId) ||
    Number(town.missions.completed.has(a.id)) - Number(town.missions.completed.has(b.id)));
  const row = (def: MissionDef) => {
    const done = town.missions.completed.has(def.id), selected = def.id === selectedId;
    return `<div class="insp-row ${done ? 'mission-done' : ''} ${selected ? 'mission-selected' : ''}">
        ${selected ? '<small class="journal-eyebrow">YOUR SESSION GOAL</small>' : ''}
        ${done ? '✅' : '⬜'} <b>${escapeHtml(def.label)}</b> · +${def.reward}
        <div class="mission-desc">${escapeHtml(def.description)}${!done && def.cadence === 'daily' ? ' · Checked at day’s end.' : ''}</div>
        ${selected && done ? '<small>Completed · reward already received</small>' : ''}
      </div>`;
  };
  const selected = ordered.find(def => def.id === selectedId);
  return `<button class="insp-close" id="insp-close" aria-label="Close missions">×</button>
    <div class="insp-title">Missions</div>
    <div class="insp-sub">${town.missions.completedCount}/${MISSION_DEFS.length} complete</div>
    ${selected ? row(selected) : ''}
    ${milestoneWallPanel(town)}
    ${ordered.filter(def => def !== selected).map(row).join('')}`;
}
