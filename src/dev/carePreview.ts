import { Town } from '../core/town';
import { createResident } from '../core/residents';

/** Only the initial concern and dinner journey are staged. All subsequent
 * arrivals, spending, needs and recovery use ordinary quarter-minute ticks. */
export function createPreviewTown(): Town {
  const town = new Town(), game = town.towers()[0];
  town.identity.name = 'A reason to stay'; town.time = 6 * 1440 + 1080; town.economy.coins = 3000;
  game.rename('Willow House');
  game.tower.addFloor('residential'); game.tower.addFloor('restaurant', 'coffee'); game.tower.addFloor('office');
  game.tower.floors[2].name = 'Raincheck Coffee'; game.tower.floors[2].quality = 60;
  for (const [index, name] of ['Maya', 'Noah', 'Fern'].entries()) {
    const r = createResident(1, game.id); r.name = name;
    r.jobFloor = index === 0 ? 3 : 2; r.jobTowerId = game.id; r.jobTier = index === 2 ? 1 : 0;
    r.jobStartDay = town.day; r.workStart = 540; r.workEnd = 1260; r.nocturnal = false;
    r.state = { kind: 'idle', floor: r.jobFloor, activity: { kind: 'work', floor: r.jobFloor }, until: town.time + 180 };
    game.residents.push(r);
  }
  const maya = game.residents[0]; maya.needs.food = 10; maya.happiness = 30;
  town.refreshStaffing(); town.stories.update(town);
  maya.unhappyDays = 2; town.time++; town.stories.update(town);
  maya.state = { kind: 'waiting', floor: 1, to: 2 };
  maya.pendingActivity = { activity: { kind: 'eat', floor: 2 }, duration: 40,
    beforeFlags: { day: Math.floor(town.time / 1440), didLunch: false, didDinner: false, didShop: false, didNightlife: false } };
  maya.didDinner = true; game.elevator.request(maya.id, 1, 2, town.time);
  return town;
}

export function advanceCare(town: Town, minutes: number): void {
  const end = town.time + minutes;
  while (town.time < end) town.tick(Math.min(0.25, end - town.time));
}

/** Advance only with the study buttons so a reading check cannot change the
 * staged journey. No metrics overlay is needed to keep this study still. */
export function isPaused(): boolean { return true; }

export function mountPreview(town: Town): void {
  const panel = document.createElement('details'); panel.className = 'weather-study';
  panel.innerHTML = `<summary>Development neighbor-care study</summary>
    <p>Disposable town · no autosave. Maya’s initial concern and dinner journey are staged; follow her goal and inspect the café.</p>
    <button type="button" data-care-trip>Advance 30 town minutes</button>
    <button type="button" data-care-review>Advance to daily review</button>
    <output aria-live="polite"></output>`;
  const report = () => {
    const maya = town.allResidents().find(r => r.name === 'Maya');
    panel.querySelector('output')!.textContent = maya ?
      `Maya: food ${Math.round(maya.needs.food)}/100 · happiness ${Math.round(maya.happiness)}/100 · ${maya.unhappyDays} unhappy days. Café visits today: ${town.towers()[0].tower.floors[2].visitsToday}.` : 'Maya has left town.';
  };
  panel.querySelector('[data-care-trip]')!.addEventListener('click', () => { advanceCare(town, 30); report(); });
  panel.querySelector('[data-care-review]')!.addEventListener('click', () => {
    advanceCare(town, 1440 - town.timeOfDay + 0.25); report();
  });
  report(); document.body.append(panel);
}
