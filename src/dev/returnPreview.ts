import { Town } from '../core/town';
import { toSaveData, townFromSaveData } from '../core/save';

/** Staged buildings only; real move-ins/trips, detached restore and catch-up. */
export function createPreviewTown(): Town {
  const town = new Town(), game = town.towers()[0];
  town.identity.name = 'Willow & Lantern';
  game.tower.addFloor('residential'); game.tower.addFloor('residential');
  game.tower.addFloor('shop', 'grocery'); game.tower.addFloor('restaurant', 'coffee');
  game.tower.addFloor('office');
  for (let i = 0; i < 720; i++) town.tick(0.5);
  return townFromSaveData(toSaveData(town))!;
}

export function awayRealSeconds(): number {
  return new URLSearchParams(location.search).get('hours') === '10' ? 10 * 3600 : 240;
}

export function mountPreview(): void {
  const panel = document.createElement('details'); panel.className = 'weather-study';
  panel.innerHTML = '<summary>Development return study</summary><p>Staged buildings, real move-ins and trips. A detached save is restored through the normal asynchronous catch-up. Four minutes away by default. No player save access or autosave.</p><button type="button">Study ten-hour absence</button>';
  panel.querySelector('button')!.addEventListener('click', () => { location.search = '?preview=return&hours=10'; });
  document.body.append(panel);
}
