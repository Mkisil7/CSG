import { Town } from '../core/town';
import { Game } from '../core/game';
import { createResident } from '../core/residents';
import { TownWeather, type WeatherKind } from '../core/weather';
import { ElevatorSystem } from '../core/elevator';

/** Development-only, disposable scene. Never reads or writes the player's save. */
export function createPreviewTown(): Town {
  const town = new Town();
  town.identity.name = 'Weather study'; town.weather = new TownWeather(42);
  town.economy.coins = 15000;
  const home = town.towers()[0]; home.rename('Willow House'); home.architecture = 'heritage';
  home.tower.addFloor('residential'); home.tower.addFloor('residential'); home.tower.addFloor('residential');
  home.tower.addFloor('restaurant', 'coffee'); home.tower.floors[4].name = 'Raincheck Coffee';
  const work = new Game('t1', town.economy, 'office'); work.rename('Lantern Works'); work.architecture = 'modern';
  work.tower.addFloor('office', 'tech'); work.tower.addFloor('office', 'creative');
  town.slots[1] = { id: 't1', unlocked: true, zone: 'office', game: work };
  town.slots[2] = { id: 't2', unlocked: true, zone: 'park', game: null };
  town.identity.unlocked = new Set(['heritage', 'modern', 'garden', 'canopy', 'roof-garden']);
  for (let i = 0; i < 12; i++) {
    const r = createResident(1 + Math.floor(i / 4), 't0');
    r.jobTowerId = i < 3 ? 't0' : 't1'; r.jobFloor = i < 3 ? 4 : i < 8 ? 1 : 2;
    r.workStart = 540; r.workEnd = 1200; home.residents.push(r);
  }
  return town;
}

export function mountPreview(town: Town): void {
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development weather study</summary><p>Disposable town · no autosave</p>
    <label>Weather <select aria-label="Preview weather"><option value="rain">Rain</option><option value="snow">Snow</option><option value="clear">Clear</option></select></label>
    <label>Light <select aria-label="Preview daylight"><option value="morning">Morning</option><option value="golden">Golden hour</option><option value="sunset">Sunset</option><option value="evening">Dusk</option><option value="blue">Blue hour</option><option value="night">Night</option></select></label>
    <button type="button">Replay commute</button>`;
  document.body.appendChild(panel);
  const weather = panel.querySelector<HTMLSelectElement>('select[aria-label="Preview weather"]')!;
  const light = panel.querySelector<HTMLSelectElement>('select[aria-label="Preview daylight"]')!;
  function apply(): void {
    const kind = weather.value as WeatherKind;
    const hour = ({ morning: 9, golden: 17, sunset: 18, evening: 18.5, blue: 19, night: 21 } as Record<string, number>)[light.value] ?? 9;
    let time = hour * 60;
    for (let day = 1; day < 64; day++) {
      time = day * 1440 + hour * 60;
      if (town.weather.at(time) === kind) break;
    }
    town.time = time;
    town.weather.restore({ seed: 42, wetness: kind === 'rain' ? 1 : 0, snow: kind === 'snow' ? 0.8 : 0, observedAt: time }, time);
    town.cityEvents.active = [];
    const residents = town.allResidents();
    for (const g of town.towers()) { g.residents = []; g.elevator = new ElevatorSystem(1); g.restoreLifts(2, false); }
    for (const [i, r] of residents.entries()) {
      r.state = { kind: 'idle', floor: 0, activity: { kind: 'lobby', floor: 0 }, until: time + i * 1.5 };
      r.pendingActivity = undefined; r.didLunch = false; r.didDinner = false;
      r.workStart = hour * 60; r.workEnd = 23 * 60;
    }
    town.towers()[0].residents = residents;
    town.tick(0);
  }
  weather.addEventListener('change', apply); light.addEventListener('change', apply);
  panel.querySelector('button')!.addEventListener('click', apply); apply();
}
