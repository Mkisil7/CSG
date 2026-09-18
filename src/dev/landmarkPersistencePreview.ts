import type { Town } from '../core/town';
import { readGame } from '../core/save';
import { checkpointSummary, studyStorage } from './persistencePreview';
import { landmarkVisitReport } from './landmarkPreview';
export { createPreviewTown } from './landmarkPreview';

export const storage = studyStorage(() => localStorage, 'landmarks');
let frozen = true;
export function isPaused(): boolean { return frozen; }

/** Read-only receipt of actual purchased floors, permits, architecture and trips. */
export function landmarkCheckpointSummary(town: Town): string {
  return `${checkpointSummary(town)}\nPermits: ${[...town.identity.unlocked].filter(id => id.startsWith('landmark-')).sort().join(', ') || 'none'}\n` +
    town.towers().map(game => `${game.name} · ${game.architecture} · ${game.tower.height} floors: ` +
      game.tower.floors.filter(floor => floor.type === 'landmark').map(floor => `${floor.name} (${floor.landmark}, floor ${floor.level})`).join(', ')).join('\n') +
    `\n${landmarkVisitReport(town)}`;
}

/** Eligible starting fixture, but real purchases, simulation, browser storage
 * and reload. The ordinary disposable landmark/rendering study stays unsaved. */
export function mountPreview(town: Town, _focusRoom?: (level: number) => void, persist?: () => void): void {
  frozen = true;
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development landmark save study</summary>
    <p>Separate browser save · no player-save access. Starting funds, population and eligibility are staged; landmarks and visits are not.</p>
    <p>Frozen by default. Resume study for normal time and opening animations. Buy landmarks with the normal controls.</p>
    <button data-run>Resume study</button>
    <button data-step="5">Advance 5 evening minutes</button><button data-step="90">Advance 90 evening minutes</button>
    <button data-save>Save checkpoint</button><button data-read>Read stored checkpoint</button><button data-reload>Reload landmark study</button>
    <p>New town resets only this study. Gift codes here are test data; do not share them.</p>
    <output data-result style="display:block;white-space:pre-line" aria-live="polite"></output>`;
  const result = panel.querySelector<HTMLElement>('[data-result]')!;
  result.textContent = `Opened: ${landmarkCheckpointSummary(town)}`;
  const run = panel.querySelector<HTMLButtonElement>('[data-run]')!;
  run.addEventListener('click', () => { frozen = !frozen; run.textContent = frozen ? 'Resume study' : 'Freeze study'; });
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-step]')) button.addEventListener('click', () => {
    for (let i = 0; i < Number(button.dataset.step) * 4; i++) town.tick(0.25);
    result.textContent = `Running: ${landmarkCheckpointSummary(town)}`;
  });
  const read = () => {
    const saved = readGame(storage);
    result.textContent = saved.status === 'loaded' ? `Stored: ${landmarkCheckpointSummary(saved.result.town)}` : `Stored checkpoint: ${saved.status}.`;
  };
  panel.querySelector('[data-save]')!.addEventListener('click', () => { persist?.(); read(); });
  panel.querySelector('[data-read]')!.addEventListener('click', read);
  panel.querySelector('[data-reload]')!.addEventListener('click', () => location.reload());
  document.body.appendChild(panel);
}
