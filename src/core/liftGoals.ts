import type { Game } from './game';
import type { VisibleGoal } from './goals';
import { SECOND_SHAFT } from './types';

export function liftActionDetail(game: Game, population: number, coins: number): string {
  const speed = game.nextSpeedTierCost();
  const options = [
    ...(!game.secondElevator && population >= SECOND_SHAFT.unlockPop ? [{ label: 'A second shaft', cost: SECOND_SHAFT.cost }] : []),
    ...(speed !== null ? [{ label: 'Faster, roomier lifts', cost: speed }] : []),
  ];
  const available = options.find(o => coins >= o.cost);
  if (available) return `${available.label} available for ${available.cost} coins. Open lift controls to compare.`;
  const next = options.sort((a, b) => a.cost - b.cost)[0];
  if (next) return `Save ${Math.ceil(next.cost - coins)} more coins for ${next.label.toLowerCase()} (${next.cost} total).`;
  return !game.secondElevator ? `A second shaft unlocks at ${SECOND_SHAFT.unlockPop} residents. Consider spreading future homes across towers.` :
    'Both shafts are at top speed. Spread future homes and jobs across towers; inspect the busiest floors.';
}

/** A temporary, non-paying receipt makes the actual consequence of an upgrade
 * visible. Keep the first 20-trip result, then retire it after 20 more trips. */
export function liftResultGoal(game: Game): VisibleGoal | null {
  const report = game.transit.improvement;
  if (!report || (game.transit.trips[game.transit.trips.length - 1]?.sequence ?? report.atSequence) - report.atSequence > 40) return null;
  const before = report.beforeWait, after = report.afterWait;
  const comparison = before !== null && after !== null;
  const detail = after === null ? `${game.name}: ${report.observedTrips}/20 trips observed. An early estimate appears after 10 trips; no further purchase is needed to measure it.` :
    `${game.name}: ${report.observedTrips < 20 ? 'Early estimate' : 'Measured over 20 trips'}, including stair abandonments. ` +
    (before === null ? 'No reliable pre-upgrade baseline was available.' : after < before ? 'Waits improved in this sample.' : 'Waits have not improved in this sample.') +
    ' Open lift flow for current queues and the full report.';
  return { id: `lift-result-${game.id}-${report.atSequence}`, horizon: 'Watch the change',
    title: comparison ? `Lift waits: ${Number(before.toFixed(1))} → ${Number(after.toFixed(1))} min` :
      after !== null ? `Lift waits after your upgrade: ${Number(after.toFixed(1))} min` : 'Watch your lift improvement settle in',
    detail, current: Math.min(20, report.observedTrips), total: 20,
    target: { kind: 'transit', towerId: game.id } };
}
