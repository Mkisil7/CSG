import type { Floor } from '../core/types';
import { FLOOR_HEIGHT } from '../render/layout';

const ROOM_HELP = 'Drag to explore · arrow keys move · Esc resets';

export function roomCaption(floors: readonly Floor[], centerY: number, towerName: string): string {
  if (!floors.length || !Number.isFinite(centerY)) return '';
  if (centerY >= floors.length * FLOOR_HEIGHT) return `Rooftop · ${towerName}`;
  const floor = floors[Math.max(0, Math.floor(centerY / FLOOR_HEIGHT))];
  return floor ? `Floor ${floor.level} · ${floor.name}` : '';
}

/** Explicit controls complement dragging: usable on touch, mouse and keyboard. */
export class RoomControls {
  readonly root = document.createElement('section');
  private minus: HTMLButtonElement;
  private plus: HTMLButtonElement;
  private caption: HTMLElement;

  constructor(canvas: HTMLCanvasElement, private readonly actions: {
    state: () => { active: boolean; zoom: number; label?: string };
    pan: (delta: number) => void;
    zoom: (delta: number) => void;
    reset: () => void;
    key: (key: string) => boolean;
  }) {
    this.root.className = 'room-controls'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Explore the room');
    this.root.setAttribute('aria-description', ROOM_HELP);
    this.root.innerHTML = `<div class="room-control-row">
      <button type="button" data-pan="-2" aria-label="Pan room left">←</button>
      <button type="button" data-zoom="-0.3" aria-label="Zoom room out">−</button>
      <button type="button" data-reset>Full tower</button>
      <button type="button" data-zoom="0.3" aria-label="Zoom room in">+</button>
      <button type="button" data-pan="2" aria-label="Pan room right">→</button>
      </div><p data-room-caption>${ROOM_HELP}</p>`;
    this.minus = this.root.querySelector('[data-zoom="-0.3"]')!;
    this.plus = this.root.querySelector('[data-zoom="0.3"]')!;
    this.caption = this.root.querySelector('[data-room-caption]')!;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-pan]')) {
      button.addEventListener('click', () => actions.pan(Number(button.dataset.pan)));
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
      button.addEventListener('click', () => { actions.zoom(Number(button.dataset.zoom)); this.update(); });
    }
    this.root.querySelector('[data-reset]')!.addEventListener('click', () => { actions.reset(); this.update(); canvas.focus({ preventScroll: true }); });
    this.root.addEventListener('keydown', (event) => {
      if (!actions.key(event.key)) return;
      event.preventDefault(); this.update();
      if (!actions.state().active) canvas.focus({ preventScroll: true });
    });
    document.getElementById('app')!.append(this.root);
  }

  update(covered = false): void {
    const state = this.actions.state();
    const hidden = !state.active || covered, minimum = state.zoom <= 1.50001, maximum = state.zoom >= 2.99999;
    if (this.root.hidden !== hidden) this.root.hidden = hidden;
    if (this.minus.disabled !== minimum) this.minus.disabled = minimum;
    if (this.plus.disabled !== maximum) this.plus.disabled = maximum;
    const label = state.label || ROOM_HELP;
    if (this.caption.textContent !== label) {
      this.caption.textContent = label;
      this.caption.title = state.label ? `${label} · ${ROOM_HELP}` : ROOM_HELP;
    }
  }
}
