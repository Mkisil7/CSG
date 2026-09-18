import type { Town } from '../core/town';
import { EVENT_ACTIONS, EVENT_COSTS, type NeighborhoodEvent } from '../core/neighborhood';
import { escapeHtml } from './storyViews';

export function neighborhoodPanel(town: Town, readOnly: boolean): string {
  const events = [...town.neighborhood.pending(), ...town.neighborhood.events.filter((e) => e.status === 'completed').slice(-5).reverse()];
  return `<button class="insp-close" id="insp-close" aria-label="Close happenings">×</button>
    <div class="journal-eyebrow">A PLACE WITH ITS OWN STORIES</div><div class="insp-title">Neighborhood happenings</div>
    <p class="resident-description">Invitations wait for you. There is no penalty for saying “not now.” Visitors use the same lifts as your neighbors.</p>
    <button type="button" class="neighborhood-update" data-neighborhood-refresh disabled>Happenings up to date</button>
    ${events.length ? events.map((e) => {
      const options = e.kind === 'startup' ? town.neighborhood.studioOptions(town, e) : [];
      const check = town.neighborhood.canRespond(town, e.id, options[0]);
      return `<section class="neighborhood-card"><small>${escapeHtml(e.status === 'offered' ? 'An invitation' : e.status === 'active' ? 'Happening now' : 'A town memory')}</small>
        <h3>${escapeHtml(e.title)}</h3><p><b>Why here?</b> ${escapeHtml(e.reason)}</p>
        ${e.outcome ? `<p>${escapeHtml(e.outcome)}</p>` : `<p>${escapeHtml(eventPromise(e.kind))}</p>`}
        ${e.status === 'active' ? `<p class="event-counts" data-event-progress="${escapeHtml(e.id)}"></p>` : ''}
        <button class="insp-event-link" data-event-location="${escapeHtml(e.id)}">${e.kind === 'startup' ? 'Visit the original studio' : 'Visit the place'} ↗</button>
        ${e.kind === 'startup' && e.status === 'completed' && e.studio && town.towerById(e.studio.towerId)?.tower.floors[e.studio.level]?.variant === 'innovation-hub' ? `<button class="insp-event-link" data-event-location="${escapeHtml(e.id)}" data-event-studio="true">Visit the Innovation hub ↗</button>` : ''}
        ${e.status === 'offered' && !readOnly ? `${e.kind === 'startup' ? `<label class="identity-label">Second studio<select data-studio="${escapeHtml(e.id)}" aria-label="Second studio">${options.map((o) => `<option value="${escapeHtml(o.towerId)}:${o.level}">${escapeHtml(o.label)}</option>`).join('')}</select></label>` : ''}
        <button class="build-btn neighborhood-accept" data-event-accept="${escapeHtml(e.id)}" ${check.ok ? '' : 'disabled'}>${escapeHtml(EVENT_ACTIONS[e.kind])}<span class="cost">${EVENT_COSTS[e.kind]} coins</span></button>
        <p class="event-requirement" data-event-requirement="${escapeHtml(e.id)}">${escapeHtml(check.ok ? 'Ready when you are.' : check.reason ?? '')}</p>
        <button class="insp-event-link" data-event-decline="${escapeHtml(e.id)}">Not now · no penalty</button>` : ''}</section>`;
    }).join('') : '<p class="journal-empty">Run a thriving restaurant, nurture friendships, or open a park. Invitations grow from the neighborhood you build.</p>'}`;
}

/** Updated in place so arrivals/countdowns cannot detach a button mid-interaction. */
export function neighborhoodProgress(town: Town, event: NeighborhoodEvent): string {
  if (event.status === 'completed') return 'Finished · refresh for the town memory';
  const hours = Math.max(0, Math.ceil((event.endsAt - town.time - 1e-6) / 60));
  return `${event.kind === 'band' ? `${event.arrivals} listeners arrived` : `${event.served} served · ${event.missed} missed`} · ${hours} town hours left`;
}

function eventPromise(kind: string): string {
  switch (kind) {
    case 'critic': return 'Host Jules for a tasting. A served critic brings three-day publicity and permanent Critic’s choice status, with a framed award and dressed tables. A missed lift means another attempt, not a bad review.';
    case 'band': return 'Two days of evening concerts, a visible audience and up to +6 community mood for homes near the park.';
    case 'startup': return 'Choose an unstaffed office. Two teammates move into an Innovation hub with +20% working wages, and their first studio becomes a local landmark.';
    case 'character': return 'Dedicate a named, selectable welcome bench beside their home. This neighbor becomes a Neighborhood host. A home tower with hosts gains +2 community mood; multiple hosts do not stack this bonus.';
    default: return 'Two evenings of guests, busy lifts and fireworks. Serving twelve guests earns the host storefront a permanent Festival favorite upgrade. Guests pay only when they reach a business.';
  }
}
