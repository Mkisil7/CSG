import { Town } from '../core/town';
import { GAME_MINUTES_PER_SECOND } from '../core/types';

/** The actual empty starting town, without reading or writing a player save. */
export function createPreviewTown(): Town { return new Town(); }

export function mountPreview(town: Town): void {
  const panel = document.createElement('details'); panel.className = 'weather-study';
  panel.innerHTML = `<summary>Development opening study</summary>
    <p>Normal starting coins, prices and move-ins. No staged residents, purchases or rewards. No autosave. Pause and advance to inspect early goals.</p>
    <button type="button">Advance 15 seconds at 1×</button>`;
  panel.querySelector('button')!.addEventListener('click', () => {
    for (let i = 0; i < 15 * GAME_MINUTES_PER_SECOND * 4; i++) town.tick(0.25);
  });
  document.body.append(panel);
}
