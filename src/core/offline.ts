import { GAME_MINUTES_PER_SECOND, OFFLINE } from './types';
import { Town } from './town';

export interface OfflineReport {
  /** Real seconds the player was away (uncapped, for display). */
  awayRealSeconds: number;
  /** Game minutes actually simulated (capped). */
  simulatedGameMinutes: number;
  coinsEarned: number;
  moveIns: number;
  moveOuts: number;
  promotions: number;
  missionsCompleted: number;
  peakAverageWaitMinutes: number;
}

/** Game minutes to simulate for a given away time, capped. */
export function offlineGameMinutes(awayRealSeconds: number): number {
  const capped = Math.min(awayRealSeconds, OFFLINE.maxRealHours * 3600);
  return Math.floor(capped * GAME_MINUTES_PER_SECOND);
}

/**
 * Fast-forward the town by the given game minutes in coarse chunks,
 * aggregating what happened into a one-time "while you were away" report.
 */
export function runOfflineCatchup(
  town: Town,
  gameMinutes: number,
  awayRealSeconds: number,
): OfflineReport {
  const coinsBefore = town.economy.coins;
  let moveIns = 0;
  let moveOuts = 0;
  let promotions = 0;
  let missionsCompleted = 0;
  let peakWait = 0;

  let remaining = gameMinutes;
  let sinceSample = 0;
  while (remaining > 0) {
    const step = Math.min(OFFLINE.chunkGameMinutes, remaining);
    town.tick(step);
    remaining -= step;

    for (const e of town.events) {
      if (e.kind === 'move-in') moveIns++;
      else if (e.kind === 'move-out') moveOuts++;
      else if (e.kind === 'promotion') promotions++;
      else if (e.kind === 'mission') missionsCompleted++;
    }

    sinceSample += step;
    if (sinceSample >= 120) {
      sinceSample = 0;
      for (const g of town.towers()) peakWait = Math.max(peakWait, g.averageWait());
    }
  }
  for (const g of town.towers()) peakWait = Math.max(peakWait, g.averageWait());

  return {
    awayRealSeconds,
    simulatedGameMinutes: gameMinutes,
    coinsEarned: Math.round(town.economy.coins - coinsBefore),
    moveIns,
    moveOuts,
    promotions,
    missionsCompleted,
    peakAverageWaitMinutes: Math.round(peakWait * 10) / 10,
  };
}
