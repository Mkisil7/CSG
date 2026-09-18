import type { Town } from '../core/town';
import { BUSINESS_SUBTYPES, type BusinessSubtype, type FloorType } from '../core/types';
import { OPENING_DURATION } from '../render/construction';
export { createPreviewTown } from './landmarkPreview';

let town: Town, playback: HTMLSelectElement, motionChoice: HTMLSelectElement, status: HTMLElement;
let elapsed = OPENING_DURATION, knownFloors = 0;

/** Explicit local study control; does not change the OS, saved settings or other effects. */
export function openingReducedMotion(): boolean | undefined {
  return motionChoice.value === 'full' ? false : motionChoice.value === 'reduced' ? true : undefined;
}

/** Holds the actual rendering clock at a named phase, without editing scene state. */
export function revealDelta(dt: number, paused: boolean): number {
  const count = town.towers()[0].tower.floors.length;
  if (count !== knownFloors) { knownFloors = count; elapsed = 0; }
  const limit = Number(playback.value);
  const advance = paused ? 0 : Math.max(0, Math.min(dt, limit - elapsed));
  elapsed += advance;
  const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduced = openingReducedMotion() ?? systemReduced;
  // Match the renderer's immediate completion, including returning to system
  // while paused. Switching back to full motion must not show an old phase.
  if (reduced) elapsed = OPENING_DURATION;
  const text = `Reveal ${Math.min(OPENING_DURATION, elapsed).toFixed(2)} / ${OPENING_DURATION.toFixed(2)} s${paused ? ' · paused' : elapsed >= limit && limit < OPENING_DURATION ? ' · held' : ''} · ${reduced ? 'Reduced opening: finished room shown immediately' : 'Full opening animation'} · ${motionChoice.value === 'system' ? 'following system' : 'study override only'} (system: ${systemReduced ? 'reduced' : 'full'} motion)`;
  if (status.textContent !== text) status.textContent = text;
  return advance;
}

export function mountPreview(value: Town, focusRoom?: (level: number) => void): void {
  town = value; knownFloors = town.towers()[0].tower.floors.length;
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development opening study</summary><p>Disposable town · no autosave</p>
    <label>Opening motion <select aria-label="Opening motion"><option value="system">Follow system</option><option value="full">Full animation (study only)</option><option value="reduced">Reduced motion (study only)</option></select></label>
    <p>This selector affects only construction in this disposable study. Other motion still follows your system. Reduced motion completes an active opening; switching back does not replay it.</p>
    <label>Playback <select aria-label="Reveal playback"><option value="1000000">Live</option><option value="0.35">Hold structure</option><option value="1">Hold furnishings</option><option value="1.7">Hold lit sign</option><option value="2.2">Complete</option></select></label>
    <label>New floor <select aria-label="Opening floor"></select></label>
    <button type="button">Build selected floor</button>
    <button type="button" data-workday>Advance to next workday</button>
    <p>Workday advance runs ordinary quarter-minute trips; it does not stage staff or customers.</p>
    <p role="status" aria-label="Opening preview status"></p>`;
  playback = panel.querySelector<HTMLSelectElement>('select[aria-label="Reveal playback"]')!;
  motionChoice = panel.querySelector<HTMLSelectElement>('select[aria-label="Opening motion"]')!;
  status = panel.querySelector('[role="status"]')!;
  const options: { label: string; type: Exclude<FloorType, 'lobby' | 'landmark'>; subtype?: BusinessSubtype }[] = [
    { label: 'Apartments', type: 'residential' },
    ...Object.entries(BUSINESS_SUBTYPES).flatMap(([type, profiles]) => profiles.map((profile) => ({
      label: profile.label, type: type as 'shop' | 'restaurant' | 'office' | 'factory', subtype: profile.subtype,
    }))),
  ];
  const choice = panel.querySelector<HTMLSelectElement>('select[aria-label="Opening floor"]')!;
  options.forEach((option, index) => { const el = document.createElement('option'); el.value = String(index); el.textContent = option.label; choice.appendChild(el); });
  panel.querySelector('button')!.addEventListener('click', () => {
    const option = options[Number(choice.value)], game = town.towers()[0];
    if (game.buildFloor(option.type, option.subtype)) focusRoom?.(game.tower.floors.length - 1);
  });
  panel.querySelector('[data-workday]')!.addEventListener('click', () => {
    const until = (Math.floor(town.time / 1440) + 1) * 1440 + 600;
    while (town.time < until) town.tick(Math.min(0.25, until - town.time));
  });
  document.body.appendChild(panel);
}
