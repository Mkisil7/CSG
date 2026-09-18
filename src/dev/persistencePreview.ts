import { Town } from '../core/town';
import { readGame } from '../core/save';
import { GAME_MINUTES_PER_SECOND } from '../core/types';

const PREFIXES = {
  persistence: 'tower-town-development-persistence:',
  landmarks: 'tower-town-development-landmarks:',
};
const KEYS = ['tower-town-save-v4', 'tower-town-save-v3', 'tower-town-save-v2', 'tower-town-save-v1', 'tower-town-gifts-redeemed'];

/** Never enumerate or touch player keys, even during normal New town/reset.
 * Resolve browser storage lazily so denied access reaches the normal load UI. */
export function studyStorage(target: () => Storage, study: keyof typeof PREFIXES = 'persistence'): Storage {
  const prefix = PREFIXES[study];
  if (!Object.prototype.hasOwnProperty.call(PREFIXES, study)) throw new Error('Unknown persistence study');
  const scoped = (key: string) => {
    if (!KEYS.includes(key)) throw new Error('Unknown persistence-study key');
    return prefix + key;
  };
  const present = () => KEYS.filter(key => target().getItem(scoped(key)) !== null);
  return {
    getItem: key => target().getItem(scoped(key)),
    setItem: (key, value) => target().setItem(scoped(key), value),
    removeItem: key => target().removeItem(scoped(key)),
    clear: () => { for (const key of KEYS) target().removeItem(scoped(key)); },
    key: index => present()[index] ?? null,
    get length() { return present().length; },
  };
}

export const storage = studyStorage(() => localStorage);
export function createPreviewTown(): Town { return new Town(); }
// Freeze between deliberate ordinary simulation steps to compare snapshots.
export function isPaused(): boolean { return true; }

export function checkpointSummary(town: Town): string {
  return `${town.identity.name} · ${town.population} residents · ${Math.floor(town.economy.coins)} coins · ` +
    `${town.towers().reduce((n, game) => n + game.tower.height, 0)} floors · ${town.missions.completedCount} milestones · ` +
    `${town.stories.journal.length} memories · ${town.towers().map(game => game.name).join(', ')}`;
}

/** Real browser persistence through the same startup, autosave and unload path.
 * No staged population, rewards, snapshot editing, or player-storage access. */
export function mountPreview(town: Town, _focusRoom?: (level: number) => void, persist?: () => void): void {
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development persistence study</summary>
    <p>Isolated browser save · no player-save access · frozen between steps. Purchases, autosave, reload and catch-up use the normal game paths.</p>
    <button data-step>Advance 15 seconds at 1×</button><button data-save>Save checkpoint</button>
    <button data-read>Read stored checkpoint</button><button data-reload>Reload study</button>
    <p>New town resets only this study. Gift codes here are test data; do not share them.</p>
    <p data-result role="status"></p>`;
  const result = panel.querySelector<HTMLElement>('[data-result]')!;
  const read = () => {
    const saved = readGame(storage);
    result.textContent = saved.status === 'loaded' ? `Stored: ${checkpointSummary(saved.result.town)}` : `Stored checkpoint: ${saved.status}.`;
  };
  result.textContent = `Opened: ${checkpointSummary(town)}`;
  panel.querySelector('[data-step]')!.addEventListener('click', () => {
    for (let i = 0; i < 15 * GAME_MINUTES_PER_SECOND * 4; i++) town.tick(0.25);
    result.textContent = `Running: ${checkpointSummary(town)}`;
  });
  panel.querySelector('[data-save]')!.addEventListener('click', () => { persist?.(); read(); });
  panel.querySelector('[data-read]')!.addEventListener('click', read);
  panel.querySelector('[data-reload]')!.addEventListener('click', () => location.reload());
  document.body.appendChild(panel);
}
