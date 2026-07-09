import { Game } from '../core/game';

export class Hud {
  private readonly root: HTMLElement;
  private chips: Record<string, HTMLElement> = {};

  constructor(root: HTMLElement) {
    this.root = root;
    for (const key of ['coins', 'population', 'clock', 'income', 'wait']) {
      const chip = document.createElement('div');
      chip.className = 'hud-chip';
      this.root.appendChild(chip);
      this.chips[key] = chip;
    }
  }

  update(game: Game): void {
    const tod = game.timeOfDay;
    const hh = String(Math.floor(tod / 60)).padStart(2, '0');
    const mm = String(Math.floor(tod % 60)).padStart(2, '0');
    const wait = game.elevator.averageWait();

    this.chips.coins.innerHTML = `<small>Coins</small>${Math.floor(game.economy.coins)}`;
    this.chips.population.innerHTML = `<small>Residents</small>${game.population}`;
    this.chips.clock.innerHTML = `<small>Day ${game.day}</small>${hh}:${mm}`;
    this.chips.income.innerHTML = `<small>Earned today</small>${Math.floor(game.economy.incomeToday)}`;
    this.chips.wait.innerHTML = `<small>Avg elevator wait</small>${wait.toFixed(1)} min`;
  }
}

export class Toaster {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(message: string): void {
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = message;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 3000);
    while (this.root.children.length > 4) this.root.firstChild?.remove();
  }
}
