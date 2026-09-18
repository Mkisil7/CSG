import { Town } from '../core/town';
import { Game } from '../core/game';
import { createResident } from '../core/residents';
import { MISSION_DEFS } from '../core/missions';
import { encodeTown } from '../core/share';
import { TownWeather } from '../core/weather';

/** Disposable eligible town. Build through the real landmark controls. */
export function createPreviewTown(): Town {
  const town = new Town(); town.identity.name = 'Landmark study'; town.economy.coins = 30000; town.time = 1440 * 10 + 1080;
  // Repeatable lighting for renderer A/B studies; normal forecasts still run.
  town.weather = new TownWeather(42);
  for (let i = 0; i < 3; i++) {
    const game = i === 0 ? town.towers()[0] : new Game(`t${i}`, town.economy);
    game.rename(['Willow House', 'The Artists’ House', 'Starlight Tower'][i]);
    town.slots[i] = { id: game.id, unlocked: true, zone: 'mixed', game };
    for (let f = 0; f < (i === 2 ? 7 : 3); f++) game.tower.addFloor('residential');
    for (let r = 0; r < (i === 2 ? 8 : 12); r++) {
      const resident = createResident(1 + Math.floor(r / 4), game.id);
      resident.didDinner = resident.didShop = resident.didNightlife = true;
      resident.needs.entertainment = 45;
      resident.state = { kind: 'idle', floor: resident.homeFloor, activity: { kind: 'home', floor: resident.homeFloor }, until: town.time + r * 0.4 };
      game.residents.push(resident);
    }
    game.restoreLifts(2, true);
  }
  town.slots[3] = { id: 't3', unlocked: true, zone: 'park', game: null };
  town.missions.completed = new Set(MISSION_DEFS.slice(0, 12).map((m) => m.id));
  town.identity.update(town); town.tick(0); return town;
}

export function mountPreview(town: Town): void {
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development landmark study</summary><p>Disposable eligible town · milestones and population staged · no autosave. Build with normal controls, then pause to inspect real lift arrivals.</p>
    <button type="button" data-step="5">Advance 5 evening minutes</button>
    <button type="button" data-step="90">Advance 90 evening minutes</button>
    <button type="button" data-report>Refresh visit readout</button>
    <output data-visits style="display:block;white-space:pre-line" aria-live="polite"></output>
    <button type="button" data-share>Prepare read-only shared town</button>
    <a data-shared hidden>Open saved landmark town</a>`;
  const report = () => { panel.querySelector('[data-visits]')!.textContent = landmarkVisitReport(town); };
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-step]')) {
    button.addEventListener('click', () => {
      for (let i = 0; i < Number(button.dataset.step) * 4; i++) town.tick(0.25);
      report();
    });
  }
  panel.querySelector('[data-report]')!.addEventListener('click', report);
  const share = panel.querySelector<HTMLButtonElement>('[data-share]')!;
  share.addEventListener('click', async () => {
    share.disabled = true;
    const link = panel.querySelector<HTMLAnchorElement>('[data-shared]')!; link.hidden = true;
    try {
      const code = await encodeTown(town);
      const url = new URL(location.pathname, location.origin); url.searchParams.set('visit', code);
      link.href = url.href; link.hidden = false;
    } catch {
      panel.querySelector('[data-visits]')!.textContent = 'Could not prepare the shared town. Try again.';
    } finally { share.disabled = false; }
  });
  report();
  document.body.appendChild(panel);
}

/** Read-only evidence from the simulation, never staged visitors or visit counts. */
export function landmarkVisitReport(town: Town): string {
  return town.towers().flatMap((game) => game.tower.floors.filter((floor) => floor.type === 'landmark').map((floor) => {
    const people = game.residents.filter((r) => r.state.kind === 'idle' && r.state.floor === floor.level && r.state.activity.kind === 'leisure');
    return `${game.name} · ${floor.name}: ${floor.visitsToday} today / ${floor.landmarkVisits ?? 0} lifetime / ${floor.missedVisitsToday ?? 0} missed. Here: ${people.map((r) => `${r.name} (entertainment ${Math.round(r.needs.entertainment)})`).join(', ') || 'nobody'}.`;
  })).join('\n') || 'No public landmarks built yet.';
}
