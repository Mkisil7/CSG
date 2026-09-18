import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { TownWeather } from '../core/weather';
import type { RestaurantSubtype, OfficeSubtype } from '../core/types';

/** An isolated room study; all actors are ordinary residents with real state. */
export function createPreviewTown(): Town {
  const town = new Town(); town.identity.name = 'The living dollhouse'; town.economy.coins = 15000;
  town.weather = new TownWeather(42);
  const game = town.towers()[0]; game.rename('Willow House');
  game.tower.addFloor('residential'); game.tower.addFloor('restaurant', 'coffee');
  game.tower.addFloor('restaurant', 'fine-dining'); game.tower.addFloor('office', 'tech');
  game.tower.addFloor('residential'); game.tower.addFloor('residential');
  game.tower.floors[2].name = 'Raincheck Coffee'; game.tower.floors[3].name = 'The Copper Pan';
  game.tower.floors[4].name = 'Firefly Studio';
  for (let i = 0; i < 12; i++) {
    const resident = createResident([1, 5, 6][Math.floor(i / 4)], game.id);
    resident.name = ['Maya', 'Noah', 'Juno', 'Otis', 'Pia', 'Fern', 'Gus', 'Hana', 'Iris', 'Bo', 'Cleo', 'Dex'][i];
    resident.jobFloor = [2, 3, 4, 4, 4, 2, 2, 3, 3, 4, null, null][i];
    resident.jobTowerId = resident.jobFloor === null ? null : game.id;
    resident.jobTier = i === 4 || i === 6 || i === 8 ? 1 : i === 9 ? 2 : 0;
    resident.workStart = 480; resident.workEnd = 1260;
    resident.nocturnal = i % 4 === 3;
    game.residents.push(resident);
  }
  game.restoreLifts(3, true);
  town.identity.unlocked = new Set(['heritage', 'canopy', 'roof-garden']);
  replay(town); return town;
}

function replay(town: Town, minute = 610): void {
  town.time = 1440 * 10 + minute;
  const game = town.towers()[0];
  game.residents.forEach((resident, i) => {
    const officeWorker = resident.jobFloor === 4 && resident.jobTowerId === game.id;
    const floor = officeWorker ? 4 : i < 5 ? resident.jobFloor! : i < 7 ? 2 : i === 7 ? 3 : resident.homeFloor;
    const kind = officeWorker || i < 5 ? 'work' : i < 8 ? 'eat' : 'home';
    resident.pendingActivity = undefined;
    resident.state = { kind: 'idle', floor, activity: { kind, floor }, startedAt: town.time - (i === 6 ? 15 : 0), until: town.time + 180 };
  });
  town.weather.update(town.time); town.tick(0);
}

/** A whole existing household for checking four seats/beds and a night owl.
 * No arrivals, job changes, extra capacity or economic rewards are invented. */
export function stageHousehold(town: Town, level: number): void {
  const game = town.towers()[0];
  for (const resident of town.homeResidentsOf(game.id)) if (resident.homeFloor === level) {
    resident.pendingActivity = undefined;
    resident.state = { kind: 'idle', floor: level, activity: { kind: 'home', floor: level }, startedAt: town.time, until: town.time + 180 };
  }
}

/** Stage tenure and presence only. The actual promotion uses the ordinary
 * inspector's eligibility check, coin deduction and persistent story path. */
export function preparePromotionStudy(town: Town): void {
  const game = town.towers()[0], floor = game.tower.floors[2];
  floor.subtype = 'fine-dining'; floor.name = 'Juniper Table';
  const [maya, fern] = [game.residents[0], game.residents[5]];
  for (const resident of game.residents) {
    if (resident.jobFloor === 2 && resident.jobTowerId === game.id && resident !== maya && resident !== fern) {
      resident.jobFloor = null; resident.jobTowerId = null; resident.jobTier = 0;
      resident.state = { kind: 'idle', floor: resident.homeFloor, activity: { kind: 'home', floor: resident.homeFloor }, until: town.time + 180 };
    }
  }
  for (const resident of [maya, fern]) {
    resident.jobFloor = 2; resident.jobTowerId = game.id; resident.jobTier = 0;
    resident.jobStartDay = town.day - (resident === fern ? 2 : 0);
    resident.pendingActivity = undefined;
    resident.state = { kind: 'idle', floor: 2, activity: { kind: 'work', floor: 2 }, startedAt: town.time, until: town.time + 180 };
  }
  // This is a disposable staged baseline, not a fabricated promotion history.
  town.stories.restore(town.stories.snapshot(), town.allResidents());
}

export function mountPreview(town: Town, focusRoom?: (level: number) => void): void {
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development room study</summary><p>Disposable town · no autosave</p>
    <label>Room <select aria-label="Room to inspect"><option value="2">Coffee shop</option><option value="3">Kitchen</option><option value="4">Office meeting</option><option value="1">Cat at home</option><option value="6">Reading at home</option></select></label>
    <label>Restaurant <select aria-label="Restaurant style"><option value="coffee">Coffee house</option><option value="fastfood">Corner diner</option><option value="fine-dining">Fine dining</option><option value="bar">Evening lounge</option></select></label>
    <label>Office <select aria-label="Office style"><option value="tech">Tech studio</option><option value="law">Law practice</option><option value="creative">Creative studio</option></select></label>
    <label>Startup display <select aria-label="Office reward study"><option value="">Standard office</option><option value="founders-studio">Founders archive</option><option value="innovation-hub">Innovation hub</option></select></label>
    <label>Light <select aria-label="Room lighting"><option value="610">Day</option><option value="1080">Sunset</option><option value="1110">Dusk</option><option value="1260">Night</option><option value="1380">Late evening</option><option value="180">After midnight</option></select></label>
    <button type="button">Replay room activities</button>
    <button type="button" data-promotion>Prepare promotion study</button>
    <p data-promotion-note>After switching, resume briefly so people reach their new positions; pause to inspect.</p>`;
  const room = panel.querySelector<HTMLSelectElement>('select')!;
  const lighting = panel.querySelector<HTMLSelectElement>('select[aria-label="Room lighting"]')!;
  const restaurant = panel.querySelector<HTMLSelectElement>('select[aria-label="Restaurant style"]')!;
  const office = panel.querySelector<HTMLSelectElement>('select[aria-label="Office style"]')!;
  const reward = panel.querySelector<HTMLSelectElement>('select[aria-label="Office reward study"]')!;
  const apply = () => {
    replay(town, Number(lighting.value));
    const level = Number(room.value);
    if (town.towers()[0].tower.floors[level]?.type === 'residential') stageHousehold(town, level);
    focusRoom?.(level);
  };
  room.addEventListener('change', apply);
  lighting.addEventListener('change', apply);
  restaurant.addEventListener('change', () => {
    const floor = town.towers()[0].tower.floors[2]; floor.subtype = restaurant.value as RestaurantSubtype;
    floor.name = { coffee: 'Raincheck Coffee', fastfood: 'The Corner Diner', 'fine-dining': 'Juniper Table', bar: 'Velvet Hour' }[restaurant.value as RestaurantSubtype];
    room.value = '2'; apply();
  });
  const applyOffice = () => {
    const floor = town.towers()[0].tower.floors[4]; floor.subtype = office.value as OfficeSubtype;
    floor.name = { tech: 'Firefly Studio', law: 'Juniper & Finch', creative: 'Paper Kite Studio' }[office.value as OfficeSubtype];
    floor.variant = reward.value === 'founders-studio' || reward.value === 'innovation-hub' ? reward.value : undefined;
    room.value = '4'; apply();
  };
  office.addEventListener('change', () => { reward.value = ''; applyOffice(); });
  reward.addEventListener('change', () => { office.value = 'tech'; applyOffice(); });
  panel.querySelector('button')!.addEventListener('click', apply);
  panel.querySelector('[data-promotion]')!.addEventListener('click', () => {
    preparePromotionStudy(town); restaurant.value = 'fine-dining'; room.value = '2'; focusRoom?.(2);
    panel.querySelector('[data-promotion-note]')!.textContent = 'Staged: Maya and Fern are Servers; only Fern has earned the tenure. Open Juniper Table and use its normal Promote button. Resume to see the kitchen handover.';
  });
  document.body.appendChild(panel);
}
