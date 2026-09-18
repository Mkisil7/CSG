import type { Town } from '../core/town';
import { attractiveness, districts, SKYLINE_REWARDS } from '../core/identity';
import { escapeHtml } from './storyViews';

export function skylinePanel(town: Town, readOnly: boolean): string {
  const beauty = attractiveness(town);
  return `<button class="insp-close" id="insp-close" aria-label="Close skyline">×</button>
    <div class="journal-eyebrow">A PLACE OF YOUR OWN</div>
    <div class="insp-title">${escapeHtml(town.identity.name)}</div>
    <div class="skyline-score"><b>${beauty.score}</b><span>Town attractiveness<small>out of 100 · shaped by how people live</small></span></div>
    <p class="journal-empty">Variety ${Math.round(beauty.diversity)}/25 · Quality ${Math.round(beauty.quality)}/20 · Wellbeing ${Math.round(beauty.wellbeing)}/25 · Parks & public places ${Math.round(beauty.greenery)}/20 · Movement ${Math.round(beauty.movement)}/10</p>
    ${readOnly ? '' : `<label class="identity-label">Town name<input id="town-name" maxlength="32" value="${escapeHtml(town.identity.name)}" /></label>`}
    <button class="build-btn postcard-button" id="skyline-postcard">Save a skyline postcard</button>
    <div class="insp-section">Public landmark floors</div>
    ${town.towers().map((g) => `<button class="district-tower" data-landmarks-open="${escapeHtml(g.id)}">${escapeHtml(g.name)}<span>Explore landmarks ↗</span></button>`).join('')}
    <div class="insp-section">Your neighborhoods</div>
    ${districts(town).map((district) => `<div class="district-card">
      ${readOnly ? `<strong>${escapeHtml(district.name)}</strong>` : `<label class="identity-label">District ${district.index + 1}<input data-district="${district.index}" maxlength="32" value="${escapeHtml(district.name)}" /></label>`}
      <small>${escapeHtml(district.theme)} · ${district.population} neighbors</small><p>${escapeHtml(district.detail)}</p>
      ${district.slots.map((s) => s.game ? `<button class="district-tower" data-tower="${s.id}">${escapeHtml(s.game.name)}<span>${s.game.tower.floors.length} floors ↗</span></button>` : '<p>Public park · a little breathing room</p>').join('')}
    </div>`).join('')}
    <div class="insp-section">A skyline that tells your story</div>
    ${SKYLINE_REWARDS.map((reward) => `<div class="skyline-reward ${town.identity.unlocked.has(reward.id) ? 'earned' : ''}"><strong>${town.identity.unlocked.has(reward.id) ? '✓' : '◇'} ${escapeHtml(reward.label)}</strong><small>${escapeHtml(reward.description)}</small></div>`).join('')}`;
}
