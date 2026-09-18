import { GAME_MINUTES_PER_SECOND, OFFLINE } from './types';
import { Town } from './town';
import type { ResidentStory } from './stories';

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
  /** Detached recent memories created during this catch-up, never older stories. */
  highlights: ResidentStory[];
  townName: string;
}

/** Game minutes to simulate for a given away time, capped. */
export function offlineGameMinutes(awayRealSeconds: number): number {
  const capped = Math.min(Number.isFinite(awayRealSeconds) ? Math.max(0, awayRealSeconds) : 0, OFFLINE.maxRealHours * 3600);
  return Math.floor(capped * GAME_MINUTES_PER_SECOND);
}

/**
 * Fast-forward the town with transport-safe steps,
 * aggregating what happened into a one-time "while you were away" report.
 */
export function runOfflineCatchup(
  town: Town,
  gameMinutes: number,
  awayRealSeconds: number,
): OfflineReport {
  const work = catchupSteps(town, gameMinutes, awayRealSeconds);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}

export interface CatchupProgress { completedMinutes: number; totalMinutes: number }
export interface CatchupOptions {
  onProgress?: (progress: CatchupProgress) => void;
  /** Stop after the current batch, retaining only actually simulated progress. */
  signal?: AbortSignal;
  /** Injectable event-loop yield for deterministic tests; no simulation work here. */
  yieldControl?: () => Promise<void>;
}

/** Same simulation as the synchronous path, with bounded event-loop slices. */
export async function runOfflineCatchupAsync(town: Town, gameMinutes: number,
  awayRealSeconds: number, options: CatchupOptions = {}): Promise<OfflineReport> {
  const work = catchupSteps(town, gameMinutes, awayRealSeconds, () => options.signal?.aborted ?? false);
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  options.onProgress?.({ completedMinutes: 0, totalMinutes: boundedMinutes(gameMinutes) });
  await yieldControl(); // Let the loading state paint before doing any work.
  let sliceStart = performance.now(), batches = 0, next = work.next();
  while (!next.done) {
    if (++batches >= 8 || performance.now() - sliceStart >= 8) {
      options.onProgress?.(next.value);
      await yieldControl();
      sliceStart = performance.now(); batches = 0;
    }
    next = work.next();
  }
  options.onProgress?.({ completedMinutes: next.value.simulatedGameMinutes, totalMinutes: boundedMinutes(gameMinutes) });
  return next.value;
}

function boundedMinutes(minutes: number): number {
  return Number.isFinite(minutes) ? Math.max(0, Math.min(minutes,
    OFFLINE.maxRealHours * 3600 * GAME_MINUTES_PER_SECOND)) : 0;
}

/** Yield boundaries never alter simulation dt, order, random draws or rewards. */
function* catchupSteps(town: Town, gameMinutes: number, awayRealSeconds: number,
  stopped: () => boolean = () => false): Generator<CatchupProgress, OfflineReport> {
  const coinsBefore = town.economy.coins;
  const lastStoryId = Math.max(0, ...town.stories.journal.map((story) => story.id));
  const minutes = boundedMinutes(gameMinutes);
  let moveIns = 0;
  let moveOuts = 0;
  let promotions = 0;
  let missionsCompleted = 0;
  let peakWait = 0;

  let remaining = minutes;
  let sinceSample = 0;
  let ticks = 0;
  while (remaining > 0 && !stopped()) {
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
    if (++ticks % 32 === 0) yield { completedMinutes: minutes - remaining, totalMinutes: minutes };
  }
  for (const g of town.towers()) peakWait = Math.max(peakWait, g.averageWait());

  return {
    awayRealSeconds: Number.isFinite(awayRealSeconds) ? Math.max(0, awayRealSeconds) : 0,
    simulatedGameMinutes: minutes - remaining,
    coinsEarned: Math.round(town.economy.coins - coinsBefore),
    moveIns,
    moveOuts,
    promotions,
    missionsCompleted,
    peakAverageWaitMinutes: Math.round(peakWait * 10) / 10,
    highlights: town.stories.journal.filter((story) => story.id > lastStoryId).slice(-3)
      .map((story) => ({ ...story, residentIds: [...story.residentIds] })),
    townName: town.identity.name,
  };
}
