import { Town } from '../core/town';
import { chooseShaft } from '../core/game';
import { createResident } from '../core/residents';

/** Repeatable real-rider stress study. No fabricated wait samples or income. */
export function createPreviewTown(): Town {
  const town = new Town(), game = town.towers()[0];
  town.identity.name = 'The morning rush'; game.rename('Crossroads House');
  town.economy.coins = 12000; town.time = 480;
  for (let i = 0; i < 8; i++) game.tower.addFloor('residential');
  for (let i = 0; i < 4; i++) game.tower.addFloor('office', 'tech');
  game.tower.addFloor('shop', 'grocery');
  game.residents = Array.from({ length: 32 }, (_, index) => {
    const resident = createResident(1 + Math.floor(index / 4), game.id);
    resident.workStart = 480; resident.workEnd = 1200;
    resident.jobFloor = index < 16 ? 9 + Math.floor(index / 4) : index < 18 ? 13 : null;
    resident.jobTowerId = resident.jobFloor === null ? null : game.id;
    return resident;
  });
  town.tick(0);
  queueRush(town);
  advanceRush(town, 80); // actual boarding and abandonment history for the baseline
  queueRush(town);
  return town;
}

/** Stage the same 30 journeys again; keep real prices, tiers and wait history. */
export function queueRush(town: Town): void {
  const game = town.towers()[0];
  game.shafts().forEach((shaft) => shaft.clear());
  game.residents.forEach((resident, index) => {
    resident.pendingActivity = undefined;
    if (index === 16 || index === 17) {
      resident.state = { kind: 'idle', floor: 13, activity: { kind: 'work', floor: 13 }, until: town.time + 180 };
      return;
    }
    const target = index < 16 ? 9 + Math.floor(index / 4) : 13;
    const activity = { kind: index < 16 ? 'work' as const : 'shop' as const, floor: target };
    resident.didShop = index >= 18;
    resident.pendingActivity = { activity, duration: 180,
      beforeFlags: { day: Math.floor(town.time / 1440), didLunch: resident.didLunch,
        didDinner: resident.didDinner, didShop: false, didNightlife: resident.didNightlife } };
    resident.state = { kind: 'waiting', floor: 0, to: target };
    chooseShaft(game.shafts(), 0).request(resident.id, 0, target, town.time);
  });
}

export function advanceRush(town: Town, minutes: number): void {
  for (let i = 0; i < minutes * 4; i++) town.tick(0.25);
}

/** Stage only the budget/repair condition; congestion still comes from trips. */
export function studyTightBudget(town: Town): void {
  const game = town.towers()[0]; game.restoreLifts(0, false);
  queueRush(town); advanceRush(town, 26);
  town.economy.coins = 250;
  game.tower.floors[13].quality = 40;
}

export function mountPreview(town: Town, focusRoom?: (level: number) => void): void {
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development transit study</summary><p>Disposable town · no autosave. Baseline: 80 simulated minutes, not invented wait data.</p>
    <button type="button" data-rush>Prepare another rush</button>
    <button type="button" data-step>Advance 20 rush minutes</button>
    <button type="button" data-budget>Study a tight upgrade budget</button>
    <button type="button" data-stairs>Follow next stair departure</button>
    <button type="button" data-stair-step>Advance a quarter minute</button>
    <output data-follow aria-live="polite"></output>
    <p>Pause, inspect Lift flow, buy an upgrade with the normal controls, then advance time. Replayed journeys are staged for comparison.</p>`;
  panel.querySelector('[data-rush]')!.addEventListener('click', () => { queueRush(town); focusRoom?.(0); });
  panel.querySelector('[data-step]')!.addEventListener('click', () => advanceRush(town, 20));
  panel.querySelector('[data-budget]')!.addEventListener('click', () => {
    studyTightBudget(town); panel.open = false;
    panel.querySelector('[data-follow]')!.textContent = 'Staged: 250 coins, base lift, shop quality 40. Queue: 26 minutes of real journeys. Compare the goals; opening one does not buy it.';
  });
  const reportStairs = () => {
    const people = town.allResidents().filter((resident) => resident.state.kind === 'stairs');
    panel.querySelector('[data-follow]')!.textContent = people.length ? people.map((resident) => {
      const state = resident.state;
      return state.kind === 'stairs' ? `${resident.name}: floor ${state.from} → ${state.to}` : '';
    }).join(' · ') : 'No residents currently on the stairs.';
    return people;
  };
  panel.querySelector('[data-stairs]')!.addEventListener('click', () => {
    for (let i = 0; i < 360 && !town.allResidents().some((resident) => resident.state.kind === 'stairs'); i++) town.tick(0.25);
    const person = reportStairs()[0];
    if (person?.state.kind === 'stairs') focusRoom?.(person.state.from);
  });
  panel.querySelector('[data-stair-step]')!.addEventListener('click', () => { town.tick(0.25); reportStairs(); });
  document.body.append(panel);
}
