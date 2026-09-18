import { Town } from '../core/town';
import { Game } from '../core/game';
import { createResident } from '../core/residents';
import { TownWeather } from '../core/weather';

/** Populated, isolated event fixture. Invitations use the real eligibility checks. */
export function createPreviewTown(): Town {
  const town = new Town(); town.identity.name = 'Lantern Quarter'; town.time = 6 * 1440 + 1080;
  town.economy.coins = 20000; town.weather = new TownWeather(42);
  const home = town.towers()[0]; home.rename('Willow House');
  home.tower.addFloor('residential'); home.tower.addFloor('residential');
  home.tower.addFloor('restaurant', 'coffee'); home.tower.floors[3].name = 'Raincheck Coffee';
  home.tower.addFloor('shop', 'boutique'); home.tower.addFloor('shop', 'grocery');
  const work = new Game('t1', town.economy); work.rename('Lantern Works'); work.architecture = 'modern';
  work.tower.addFloor('residential'); work.tower.addFloor('residential');
  work.tower.addFloor('office', 'tech'); work.tower.floors[3].name = 'Firefly Studio';
  work.tower.addFloor('office', 'law'); work.tower.floors[4].name = 'The spare studio';
  work.tower.addFloor('factory', 'assembly'); work.tower.addFloor('restaurant', 'fastfood');
  town.slots[1] = { id: 't1', unlocked: true, zone: 'mixed', game: work };
  town.slots[2] = { id: 't2', unlocked: true, zone: 'park', game: null };
  town.identity.unlocked = new Set(['heritage', 'modern', 'garden', 'canopy', 'roof-garden']);
  for (let i = 0; i < 16; i++) {
    const g = i < 8 ? home : work;
    const r = createResident(1 + i % 2, g.id); r.traits = ['social'];
    r.jobTowerId = i < 7 ? home.id : work.id;
    r.jobFloor = i < 3 ? 3 : i < 5 ? 4 : i < 7 ? 5 : i < 11 ? 3 : i < 15 ? 5 : 6;
    r.jobTier = i === 9 ? 1 : i === 10 ? 2 : 0; r.jobStartDay = 1;
    r.workStart = 540; r.workEnd = 1020;
    r.state = { kind: 'idle', floor: r.homeFloor, activity: { kind: 'home', floor: r.homeFloor }, until: town.time + 30 };
    g.residents.push(r);
  }
  home.tower.floors[3].quality = 78; home.tower.floors[3].visitsToday = 6;
  work.tower.floors[3].quality = 78;
  town.stories.update(town);
  const host = town.allResidents()[0]; host.name = 'Maya';
  town.stories.people[host.id].arrivalDay = 1;
  town.stories.people[host.id].friends = town.allResidents().slice(1, 3).map((r) => ({ residentId: r.id, daysTogether: 4, lastDay: town.day }));
  for (let i = 0; i < 3; i++) { town.neighborhood.discover(town); town.time += 1440; }
  for (const g of town.towers()) g.restoreLifts(2, true);
  town.weather.update(town.time); town.tick(0);
  return town;
}

export function mountPreview(town: Town): void {
  const panel = document.createElement('details'); panel.className = 'weather-study';
  panel.innerHTML = '<summary>Development neighborhood study</summary><p>Disposable town · no autosave</p><button type="button" data-advance="hour">Advance one evening hour</button><button type="button" data-advance="day">Next town evening</button>';
  panel.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.addEventListener('click', () => {
    const target = button.dataset.advance === 'hour' ? town.time + 60 : (Math.floor(town.time / 1440) + 1) * 1440 + 1080;
    // Exercise the same daily reviews, lift trips and event timing as normal play.
    while (town.time < target) town.tick(Math.min(1, target - town.time));
    panel.open = false;
  }));
  document.body.appendChild(panel);
}
