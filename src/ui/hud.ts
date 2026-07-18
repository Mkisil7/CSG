import { Town } from '../core/town';
import { Game } from '../core/game';
import { averageHappiness } from '../core/happiness';

export class Hud {
  private readonly root: HTMLElement;
  private chips: Record<string, HTMLElement> = {};

  constructor(root: HTMLElement, onHappinessClick?: () => void) {
    this.root = root;
    for (const key of ['coins', 'population', 'happiness', 'clock', 'income', 'wait']) {
      const chip = document.createElement('div');
      chip.className = 'hud-chip';
      this.root.appendChild(chip);
      this.chips[key] = chip;
    }
    if (onHappinessClick) {
      const chip = this.chips.happiness;
      chip.classList.add('hud-chip-clickable');
      chip.addEventListener('click', onHappinessClick);
    }
  }

  update(town: Town, focused: Game | null): void {
    const tod = town.timeOfDay;
    const hh = String(Math.floor(tod / 60)).padStart(2, '0');
    const mm = String(Math.floor(tod % 60)).padStart(2, '0');
    const mood = Math.round(averageHappiness(town.allResidents()));
    const moodIcon = mood >= 70 ? '😊' : mood >= 40 ? '😐' : '😟';

    this.chips.coins.innerHTML = `<small>Coins</small>${Math.floor(town.economy.coins)}`;
    this.chips.population.innerHTML = `<small>Residents</small>${town.population}`;
    this.chips.happiness.innerHTML = `<small>Happiness</small>${moodIcon} ${mood}`;
    this.chips.clock.innerHTML = `<small>Day ${town.day}</small>${hh}:${mm}`;
    this.chips.income.innerHTML = `<small>Earned today</small>${Math.floor(town.economy.incomeToday)}`;
    this.chips.wait.innerHTML = focused
      ? `<small>Avg lift wait</small>${focused.averageWait().toFixed(1)} min`
      : `<small>Towers</small>${town.towers().length}`;
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
