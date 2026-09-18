import type { Game } from '../core/game';
import { liftPressure } from '../core/transit';
import { SECOND_SHAFT } from '../core/types';
import { escapeHtml } from './storyViews';

export function transitPanel(game: Game, now: number, readOnly: boolean): string {
  const t = liftPressure(game, now);
  const crowded = t.urgent;
  const report = t.improvement;
  const comparison = report ? `<div class="transit-comparison"><small>AFTER ${escapeHtml(report.label.toUpperCase())}</small>
    ${report.afterWait === null ? `<p>Measuring the first 10 trips · ${report.observedTrips}/10</p>` :
      `<strong>${report.beforeWait === null ? 'No earlier sample' : `${report.beforeWait.toFixed(1)} min`} → ${report.afterWait.toFixed(1)} min</strong>
      <p>${report.observedTrips < 20 ? `Early estimate · ${report.observedTrips}/20 trips. Later riders and abandonments can change this.` : 'Measured across the first 20 trips, including abandonments.'}</p>
      <p>${report.beforeWait !== null && report.afterWait < report.beforeWait ? `${Math.round((1 - report.afterWait / report.beforeWait) * 100)}% shorter sampled waits than before.` : 'If waits remain high, spread homes and workplaces across towers.'}</p>
      ${crowded ? '<p>Current queues still need attention. Check waiting neighbors and missed visits before calling the problem solved.</p>' : ''}`}</div>` : '';
  const speed = game.canUpgradeSpeed();
  const shaft = game.canUnlockSecondShaft();
  return `<div class="insp-section">Getting around</div>
    <div class="transit-status ${crowded ? 'transit-strained' : ''}"><strong>${crowded ? 'The lifts need breathing room' : t.waiting === 0 ? 'No one is waiting right now' : 'Keep the neighborhood moving'}</strong>
      <div class="transit-grid"><span><b>${t.waiting}</b>waiting now</span><span><b>${t.longest.toFixed(0)} min</b>longest queue wait</span><span><b>${t.stairsToday}</b>gave up today</span><span><b>${t.missedToday}</b>missed visits today</span></div></div>
    <p class="journal-empty">Customers who run out of patience cancel their visit. Workers and returning neighbors take the stairs. Shorter queues protect both time and takings.</p>
    ${comparison}
    ${readOnly ? '' : `<div class="insp-actions">
      <button class="build-btn insp-act" id="insp-lift-speed" ${speed.ok ? '' : 'disabled'}>Upgrade lift<span class="cost">${speed.ok ? `${game.nextSpeedTierCost()} coins` : escapeHtml(speed.reason ?? '')}</span></button>
      <button class="build-btn insp-act" id="insp-lift-shaft" ${shaft.ok ? '' : 'disabled'}>Second shaft<span class="cost">${shaft.ok ? `${SECOND_SHAFT.cost} coins` : escapeHtml(shaft.reason ?? '')}</span></button>
    </div>`}`;
}
