/**
 * Pause / 1x / 2x / 4x simulation speed. Session UI state, not persisted:
 * the frame loop multiplies its dt by `multiplier` (0 while paused), so the
 * whole simulation chain freezes while rendering stays live.
 */
export class SpeedControl {
  paused = false;
  multiplier = 1;

  private buttons: { el: HTMLButtonElement; value: number | 'pause' }[] = [];

  constructor(root: HTMLElement) {
    root.classList.add('speed-control');
    const options: { label: string; value: number | 'pause' }[] = [
      { label: '⏸', value: 'pause' },
      { label: '1×', value: 1 },
      { label: '2×', value: 2 },
      { label: '4×', value: 4 },
    ];
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'speed-btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => this.select(opt.value));
      root.appendChild(btn);
      this.buttons.push({ el: btn, value: opt.value });
    }
    this.select(1);
  }

  get effectiveMultiplier(): number {
    return this.paused ? 0 : this.multiplier;
  }

  private select(value: number | 'pause'): void {
    if (value === 'pause') {
      this.paused = !this.paused; // toggles; speed buttons always unpause
    } else {
      this.paused = false;
      this.multiplier = value;
    }
    for (const { el, value: v } of this.buttons) {
      const active = v === 'pause' ? this.paused : !this.paused && v === this.multiplier;
      el.classList.toggle('active', active);
    }
  }
}
