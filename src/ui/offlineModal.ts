import { OfflineReport } from '../core/offline';

function formatAway(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} minutes`;
}

/** One-time "while you were away" summary, shown after offline catch-up. */
export function showOfflineModal(root: HTMLElement, report: OfflineReport): void {
  const lines: string[] = [];
  lines.push(`Your town earned <b>${report.coinsEarned}</b> coins.`);
  if (report.moveIns > 0) lines.push(`${report.moveIns} new resident${report.moveIns === 1 ? '' : 's'} moved in.`);
  if (report.moveOuts > 0) lines.push(`${report.moveOuts} resident${report.moveOuts === 1 ? '' : 's'} moved out.`);
  if (report.promotions > 0) lines.push(`${report.promotions} resident${report.promotions === 1 ? '' : 's'} got promoted.`);
  if (report.missionsCompleted > 0) lines.push(`${report.missionsCompleted} mission${report.missionsCompleted === 1 ? '' : 's'} completed.`);
  if (report.peakAverageWaitMinutes > 0) {
    lines.push(`Average lift wait peaked at ${report.peakAverageWaitMinutes} min.`);
  }

  root.innerHTML = `
    <div class="offline-card">
      <div class="offline-title">While you were away</div>
      <div class="offline-sub">${formatAway(report.awayRealSeconds)}</div>
      ${lines.map((l) => `<div class="offline-line">${l}</div>`).join('')}
      <button class="build-btn offline-dismiss" id="offline-dismiss">Back to town</button>
    </div>`;
  root.style.display = 'flex';
  document.getElementById('offline-dismiss')?.addEventListener('click', () => {
    root.style.display = 'none';
    root.innerHTML = '';
  });
}
