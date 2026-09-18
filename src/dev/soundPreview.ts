import { BUSINESS_SUBTYPES } from '../core/types';
import type { OpeningFloor } from '../audio/design';
import type { Soundscape } from '../audio/soundscape';

/** Adds repeatable listening controls to the isolated weather study, never to a save. */
export function mountSoundPreview(sound: Soundscape): void {
  const panel = document.querySelector<HTMLDetailsElement>('.weather-study')!;
  panel.querySelector('summary')!.textContent = 'Development sound study';
  const options: { label: string; floor: OpeningFloor }[] = [
    { label: 'Apartments', floor: { type: 'residential' } },
    ...Object.entries(BUSINESS_SUBTYPES).flatMap(([type, profiles]) => profiles.map((profile) => ({
      label: profile.label, floor: { type: type as OpeningFloor['type'], subtype: profile.subtype },
    }))),
    { label: 'Sky Conservatory', floor: { type: 'landmark', landmark: 'conservatory' } },
    { label: 'Neighborhood Gallery', floor: { type: 'landmark', landmark: 'gallery' } },
    { label: 'Skyline Observatory', floor: { type: 'landmark', landmark: 'observatory' } },
  ];
  const label = document.createElement('label'); label.textContent = 'Opening ';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Opening sound');
  options.forEach((option, i) => { const el = document.createElement('option'); el.value = String(i); el.textContent = option.label; select.appendChild(el); });
  label.appendChild(select); panel.appendChild(label);
  const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Play opening cue'; panel.appendChild(play);
  const lastCue = document.createElement('p'); lastCue.setAttribute('role', 'status'); lastCue.setAttribute('aria-label', 'Last opening cue'); panel.appendChild(lastCue);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-label', 'Sound preview status'); panel.appendChild(status);
  const update = () => {
    const state = sound.status;
    const text = state.enabled ? `Audio ${state.state} · ${state.voices} active tones` : 'Sound is off. Use Sound on to listen.';
    if (status.textContent !== text) status.textContent = text;
  };
  play.addEventListener('click', () => {
    const option = options[Number(select.value)], before = sound.status.voices;
    sound.opening(option.floor);
    const scheduled = sound.status.voices - before;
    lastCue.textContent = scheduled > 0 ? `${option.label} · ${scheduled} tones scheduled` : 'No cue played · enable sound or wait for the current cue.';
    update();
  });
  update();
  const timer = window.setInterval(update, 250);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
}
