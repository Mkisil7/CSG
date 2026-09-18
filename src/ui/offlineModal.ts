import { OfflineReport, type CatchupProgress } from '../core/offline';
import { GAME_MINUTES_PER_SECOND } from '../core/types';
import { escapeHtml, storyRow } from './storyViews';

function formatAway(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes === 0) return `${Math.floor(seconds)} seconds`;
  return `${minutes} minutes`;
}

/** Pure rendering also makes return summaries testable without changing saves. */
export function offlineSummary(report: OfflineReport): string {
  const lines: string[] = [];
  const change = report.coinsEarned;
  lines.push(change >= 0 ? `Your balance grew by <b>${change}</b> coins.` :
    `Your balance fell by <b>${Math.abs(change)}</b> coins after income and upkeep.`);
  if (report.moveIns > 0) lines.push(`${report.moveIns} new resident${report.moveIns === 1 ? '' : 's'} moved in.`);
  if (report.moveOuts > 0) lines.push(`${report.moveOuts} resident${report.moveOuts === 1 ? '' : 's'} moved out.`);
  if (report.promotions > 0) lines.push(`${report.promotions} resident${report.promotions === 1 ? '' : 's'} got promoted.`);
  if (report.missionsCompleted > 0) lines.push(`${report.missionsCompleted} mission${report.missionsCompleted === 1 ? '' : 's'} completed. Rewards are already in your balance.`);
  if (report.peakAverageWaitMinutes > 0) {
    lines.push(`Highest sampled average lift wait: ${report.peakAverageWaitMinutes} min.`);
  }

  const simulatedSeconds = report.simulatedGameMinutes / GAME_MINUTES_PER_SECOND;
  const capped = report.awayRealSeconds - simulatedSeconds > 1 / GAME_MINUTES_PER_SECOND;
  return `<dialog class="offline-card" aria-labelledby="offline-title" aria-describedby="offline-time">
      <div class="offline-eyebrow">${escapeHtml(report.townName)}</div>
      <h2 id="offline-title" class="offline-title" tabindex="-1" autofocus>Welcome back to your neighborhood</h2>
      <p id="offline-time" class="offline-sub">Away for ${formatAway(report.awayRealSeconds)}${capped ? ` · Simulated ${formatAway(simulatedSeconds)} at 1×; the rest of your time away was not simulated.` : ' · Progress simulated at 1×.'}</p>
      ${lines.map((l) => `<div class="offline-line">${l}</div>`).join('')}
      ${report.highlights.length ? `<h3 class="offline-stories-title">A few moments you missed</h3>${report.highlights.map((story) => storyRow(story, new Set())).join('')}` : ''}
      <p class="offline-note">Your town is paused while you read. These are completed changes, not rewards to claim.</p>
      <div class="offline-actions"><button type="button" class="build-btn" data-return-journal>Read town journal</button>
      <button type="button" class="build-btn" data-return-dismiss>Back to town</button></div>
    </dialog>`;
}

/** No saves or rewards happen in this view. Escape and Return now request an
 * early finish; the runner reports/persists only the work actually completed. */
export function showCatchupProgress(root: HTMLElement): {
  signal: AbortSignal; update: (progress: CatchupProgress) => void; finish: () => void;
} {
  root.innerHTML = `<dialog class="offline-card" aria-labelledby="catchup-title">
    <h2 id="catchup-title" class="offline-title" tabindex="-1" autofocus>Your neighborhood is waking up</h2>
    <p class="offline-note">Following the trips, workdays and little stories you missed.</p>
    <progress class="catchup-progress" aria-label="Time away processed" max="100" value="0"></progress>
    <p class="offline-line" data-catchup-status>Preparing your town…</p>
    <p class="offline-note">You can return early with progress processed so far. Any remaining time away will not be simulated.</p>
    <div class="offline-actions"><button class="build-btn" type="button" data-catchup-stop>Return now</button></div>
  </dialog>`;
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const stop = dialog.querySelector<HTMLButtonElement>('[data-catchup-stop]')!;
  const bar = dialog.querySelector<HTMLProgressElement>('progress')!;
  const status = dialog.querySelector<HTMLElement>('[data-catchup-status]')!;
  const abort = new AbortController();
  const requestStop = () => { abort.abort(); stop.disabled = true; stop.textContent = 'Opening town…'; };
  stop.addEventListener('click', requestStop);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); requestStop(); });
  dialog.showModal();
  return {
    signal: abort.signal,
    update: ({ completedMinutes, totalMinutes }) => {
      const percent = totalMinutes > 0 ? Math.min(100, Math.floor(completedMinutes / totalMinutes * 100)) : 100;
      bar.value = percent;
      status.textContent = `${percent}% of capped time processed`;
    },
    finish: () => { dialog.close(); root.innerHTML = ''; },
  };
}

/** Native modal keeps keyboard focus inside and makes the scene inert. */
export function showOfflineModal(root: HTMLElement, report: OfflineReport,
  onDismiss: (openJournal: boolean) => void = () => {}): HTMLDialogElement {
  root.innerHTML = offlineSummary(report);
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  dialog.querySelector('[data-return-dismiss]')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-return-journal]')!.addEventListener('click', () => dialog.close('journal'));
  dialog.addEventListener('close', () => {
    const openJournal = dialog.returnValue === 'journal';
    root.innerHTML = '';
    onDismiss(openJournal);
  }, { once: true });
  dialog.showModal();
  return dialog;
}
