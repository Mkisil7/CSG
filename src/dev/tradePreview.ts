import { Town } from '../core/town';
import { createResident } from '../core/residents';
import type { BusinessSubtype } from '../core/types';

/** A save-isolated shop/workshop study. Every visible actor is an actual resident. */
export function createPreviewTown(): Town {
  const town = new Town(); town.identity.name = 'Market & makers'; town.economy.coins = 15000;
  const game = town.towers()[0]; game.rename('Market House');
  for (let i = 0; i < 3; i++) game.tower.addFloor('residential');
  game.tower.addFloor('shop', 'grocery'); game.tower.addFloor('factory', 'assembly');
  for (let i = 0; i < 12; i++) {
    const r = createResident(1 + Math.floor(i / 4), game.id);
    r.name = ['Maya', 'Noah', 'Juno', 'Otis', 'Pia', 'Fern', 'Gus', 'Hana', 'Iris', 'Bo', 'Cleo', 'Dex'][i];
    r.jobTowerId = i < 6 ? game.id : null; r.jobFloor = i < 2 ? 4 : i < 6 ? 5 : null;
    r.jobTier = i === 5 ? 1 : 0; r.workStart = 480; r.workEnd = 1200;
    game.residents.push(r);
  }
  game.restoreLifts(2, true); replay(town, false); return town;
}

function replay(town: Town, checkout: boolean, minute = 610): void {
  town.time = 1440 * 10 + minute;
  town.towers()[0].residents.forEach((r, i) => {
    const floor = i < 2 || i >= 6 ? 4 : 5;
    r.pendingActivity = undefined;
    r.state = { kind: 'idle', floor, activity: { kind: i < 6 ? 'work' : 'shop', floor },
      startedAt: town.time - (checkout && i >= 6 ? 16 : 0), until: town.time + (checkout && i >= 6 ? 4 : 20) };
  });
  town.weather.update(town.time); town.tick(0);
}

export function mountPreview(town: Town, focusRoom?: (level: number) => void): void {
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development trade study</summary><p>Disposable town · no autosave</p>
    <label>Room <select aria-label="Trade room"><option value="grocery">Grocery Store</option><option value="boutique">Clothing Boutique</option><option value="electronics">Electronics Shop</option><option value="assembly">Assembly Plant</option><option value="foodproc">Food Processing</option><option value="electronics-fab">Electronics Fab</option></select></label>
    <label>Visit <select aria-label="Shop visit phase"><option value="browse">Browse</option><option value="checkout">Checkout</option></select></label>
    <label>Light <select aria-label="Shop lighting"><option value="610">Day</option><option value="1110">Dusk</option><option value="1260">Night</option></select></label>
    <button type="button">Replay trade activities</button><p>Pause to inspect; resume to watch the work.</p>`;
  const room = panel.querySelector<HTMLSelectElement>('select[aria-label="Trade room"]')!;
  const phase = panel.querySelector<HTMLSelectElement>('select[aria-label="Shop visit phase"]')!;
  const lighting = panel.querySelector<HTMLSelectElement>('select[aria-label="Shop lighting"]')!;
  const apply = () => {
    const game = town.towers()[0], subtype = room.value as BusinessSubtype;
    const level = ['assembly', 'foodproc', 'electronics-fab'].includes(subtype) ? 5 : 4;
    game.tower.floors[level].subtype = subtype;
    game.tower.floors[level].name = room.selectedOptions[0].textContent ?? 'Market House';
    replay(town, phase.value === 'checkout', Number(lighting.value)); focusRoom?.(level);
  };
  room.addEventListener('change', apply); phase.addEventListener('change', apply); lighting.addEventListener('change', apply);
  panel.querySelector('button')!.addEventListener('click', apply);
  document.body.appendChild(panel);
}
