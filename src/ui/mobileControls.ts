import type { Town } from '../core/town';
import type { SpeedControl } from './speedControl';
import './mobileControls.css';

/** One status strip; the original live controls remain available in a drawer. */
export class MobileControls {
  private readonly summary = document.createElement('button');
  private readonly dialog = document.createElement('dialog');
  private readonly coins: HTMLElement;
  private readonly population: HTMLElement;
  private lastLabel = '';

  constructor() {
    const app = document.getElementById('app')!;
    this.summary.className = 'mobile-status-summary';
    this.summary.type = 'button';
    this.summary.setAttribute('aria-haspopup', 'dialog');
    this.summary.setAttribute('aria-controls', 'mobile-status');
    this.summary.innerHTML = '<span><b data-coins>0</b> coins</span><span><b data-population>0</b> neighbors</span><span class="mobile-status-caret" aria-hidden="true">⌄</span>';
    this.coins = this.summary.querySelector('[data-coins]')!;
    this.population = this.summary.querySelector('[data-population]')!;
    this.dialog.id = 'mobile-status';
    this.dialog.className = 'mobile-status';
    this.dialog.setAttribute('aria-labelledby', 'mobile-status-title');
    this.dialog.innerHTML = '<header><h2 id="mobile-status-title">Your town</h2><button type="button" aria-label="Close town status">✕</button></header><div class="mobile-status-body"></div>';
    const body = this.dialog.querySelector('.mobile-status-body')!;
    const controls = [
      ['hud', 'At a glance'], ['speed-control', 'Game speed'],
      ['sound-control', 'Sound'], ['event-ticker', 'Weather & happenings'],
    ].map(([id, title]) => {
      const root = document.getElementById(id)!;
      const section = document.createElement('section');
      const heading = document.createElement('h3'); heading.textContent = title;
      section.append(heading); body.append(section);
      return { root, section };
    });
    app.append(this.summary, this.dialog);
    this.summary.addEventListener('click', () => {
      const journal = document.querySelector<HTMLButtonElement>('.journal-toggle[aria-expanded="true"]');
      journal?.click();
      this.dialog.showModal();
    });
    this.dialog.querySelector('header button')!.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) {
        const box = this.dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.dialog.close();
      }
    });
    // Let inspector navigation leave the modal before its destination opens.
    this.dialog.addEventListener('click', (event) => {
      if ((event.target as Element).closest('#hud button, #event-ticker button')) this.dialog.close();
    }, true);
    const compact = window.matchMedia('(max-width: 900px)');
    const layout = () => {
      if (this.dialog.open) this.dialog.close();
      document.body.classList.toggle('mobile-chrome', compact.matches);
      for (const { root, section } of controls) (compact.matches ? section : app).append(root);
    };
    compact.addEventListener('change', layout);
    layout();
  }

  get isOpen(): boolean { return this.dialog.open; }

  update(town: Town, speed: SpeedControl): void {
    const coins = Math.floor(town.economy.coins);
    const format = (value: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    const label = `Town status: ${coins} coins, ${town.population} neighbors. ${speed.paused ? 'Paused' : `${speed.multiplier}× speed`}. Open stats, speed, sound and weather.`;
    if (label === this.lastLabel) return;
    this.lastLabel = label;
    this.coins.textContent = format(coins);
    this.population.textContent = format(town.population);
    this.summary.setAttribute('aria-label', label);
    this.summary.classList.toggle('is-paused', speed.paused);
    this.summary.querySelector('.mobile-status-caret')!.textContent = speed.paused ? 'Ⅱ' : '⌄';
  }
}
