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

/**
 * A slim banner under the HUD that shows any live City Events (festival, boom,
 * recession…) with their remaining days and current effect, so the player
 * always knows what's swinging their economy and mood right now.
 */
export class EventTicker {
  private readonly root: HTMLElement;
  private lastKey = '';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  update(town: Town): void {
    const active = town.cityEvents.active;
    const key = active.map((e) => `${e.id}:${Math.max(0, e.endsDay - town.day)}`).join('|');
    if (key === this.lastKey) return; // avoid rebuilding the DOM every frame
    this.lastKey = key;

    this.root.innerHTML = '';
    for (const e of active) {
      const daysLeft = Math.max(1, e.endsDay - town.day);
      const pct = Math.round((e.incomeMultiplier - 1) * 100);
      const money = pct === 0 ? '' : pct > 0 ? ` · +${pct}% takings` : ` · ${pct}% takings`;
      const mood = e.moodBonus === 0 ? '' : e.moodBonus > 0 ? ` · +${e.moodBonus} mood` : ` · ${e.moodBonus} mood`;
      const chip = document.createElement('div');
      chip.className = `event-chip ${e.good ? 'event-good' : 'event-bad'}`;
      chip.innerHTML =
        `<span class="event-emoji">${e.emoji}</span>` +
        `<span class="event-text"><b>${e.title}</b>${money}${mood} ` +
        `<small>${daysLeft}d left</small></span>`;
      this.root.appendChild(chip);
    }
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
