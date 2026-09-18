import type { Town } from '../core/town';
import { LANDMARK_KINDS, LANDMARKS, landmarkOffer } from '../core/landmarks';
import { escapeHtml } from './storyViews';

export function landmarkPanel(town: Town, towerId: string, readOnly: boolean): string {
  const game = town.towerById(towerId);
  if (!game) return '';
  const existing = game.tower.floors.find((f) => f.type === 'landmark');
  return `<button class="insp-close" id="insp-close" aria-label="Close landmarks">×</button>
    <div class="journal-eyebrow">A PLACE WORTH BUILDING TOWARD</div><div class="insp-title">${escapeHtml(game.name)} · Landmarks</div>
    <p class="resident-description">One permanent public landmark per tower. Adds a new floor without replacing homes or jobs. Free visits restore entertainment and can grow friendships; visitors use your real lifts.</p>
    <p class="journal-empty">+3 to the parks & public places attractiveness category, up to its 20-point cap. No rent, jobs, admission income or upkeep.</p>
    ${existing ? `<button class="build-btn" data-landmark-floor="${existing.level}" data-landmark-tower="${escapeHtml(towerId)}">Visit ${escapeHtml(existing.name)} ↗</button>` : ''}
    ${LANDMARK_KINDS.map((kind) => {
      const def = LANDMARKS[kind], offer = landmarkOffer(town, towerId, kind);
      return `<section class="district-card"><strong>◇ ${def.label}</strong><p>${def.description}</p>
        <small>Earned by: ${def.requirement}${kind === 'observatory' ? ' · requires an 8-floor tower' : ''}</small>
        ${readOnly ? '' : `<button class="build-btn postcard-button" data-build-landmark="${kind}" data-landmark-tower="${escapeHtml(towerId)}" ${offer.ok ? '' : 'disabled'}>Build ${def.label}<span class="cost">${offer.cost} coins</span></button>`}
        <p class="journal-empty">${escapeHtml(offer.reason ?? 'Ready to build · adds a new floor at the top')}</p></section>`;
    }).join('')}`;
}
