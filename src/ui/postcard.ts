import type { Town } from '../core/town';
import { attractiveness, districts } from '../core/identity';

export function postcardFilename(name: string): string {
  return `${name.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'tower-town'}-postcard.png`;
}

/** Compose the actual rendered skyline with an editorial postcard frame. */
export function createPostcard(source: HTMLCanvasElement, town: Town): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1100;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Postcard canvas unavailable');
  ctx.fillStyle = '#f4f0e4'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(1504 / source.width, 730 / source.height);
  const width = source.width * scale, height = source.height * scale;
  ctx.fillStyle = '#253d37'; ctx.fillRect(48, 178, 1504, 730);
  ctx.drawImage(source, 48 + (1504 - width) / 2, 178 + (730 - height) / 2, width, height);
  ctx.fillStyle = '#526e60'; ctx.font = '18px sans-serif'; ctx.fillText('GREETINGS FROM', 52, 66);
  ctx.fillStyle = '#253d37'; ctx.font = '60px Georgia'; ctx.fillText(town.identity.name, 48, 135, 1420);
  ctx.font = '22px sans-serif';
  ctx.fillText(`${town.population} neighbors  ·  ${town.towers().length} towers  ·  Day ${town.day}  ·  ${attractiveness(town).score}/100 attractiveness`, 52, 960);
  ctx.fillStyle = '#6d776a'; ctx.font = 'italic 24px Georgia';
  ctx.fillText(districts(town).map((d) => d.name).join('  /  '), 52, 1012, 1450);
  ctx.font = '16px sans-serif'; ctx.fillText('TOWER TOWN  /  BUILT ONE STORY AT A TIME', 52, 1060);
  return canvas;
}

/** Preview the very same PNG that the download link saves. Native modal focus
 * handling keeps keyboard/touch users in the preview until they return to town.
 */
export function showPostcard(canvas: HTMLCanvasElement, townName: string): void {
  const returnFocusId = document.activeElement?.id;
  const url = canvas.toDataURL('image/png');
  const dialog = document.createElement('dialog');
  dialog.className = 'postcard-preview';
  dialog.setAttribute('aria-label', 'Skyline postcard');
  const heading = document.createElement('h2'); heading.textContent = 'A place you built';
  const image = document.createElement('img'); image.src = url;
  image.alt = `Postcard of ${townName}, with its skyline, neighborhood names and town statistics`;
  image.width = canvas.width; image.height = canvas.height;
  const note = document.createElement('p'); note.textContent = 'Your whole skyline, captured at this moment. 1600 × 1100 PNG · saved only on your device.';
  const actions = document.createElement('div'); actions.className = 'postcard-actions';
  const download = document.createElement('a'); download.className = 'build-btn';
  download.href = url; download.download = postcardFilename(townName); download.textContent = 'Download PNG';
  const close = document.createElement('button'); close.className = 'build-btn';
  close.textContent = 'Back to town'; close.addEventListener('click', () => dialog.close());
  actions.append(download, close); dialog.append(heading, image, note, actions);
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (returnFocusId) document.getElementById(returnFocusId)?.focus();
  }, { once: true });
  document.body.append(dialog); dialog.showModal(); close.focus();
}
