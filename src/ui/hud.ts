import { Town } from '../core/town';
import { Game } from '../core/game';
import { averageHappiness } from '../core/happiness';
import { WEATHER_LABELS, weatherTravelMultiplier } from '../core/weather';

export class Hud {
  private readonly root: HTMLElement;
  private chips: Record<string, HTMLElement> = {};

  constructor(root: HTMLElement, onHappinessClick?: () => void, onTransitClick?: () => void) {
    this.root = root;
    for (const key of ['coins', 'population', 'happiness', 'clock', 'income', 'wait']) {
      const chip = document.createElement(key === 'happiness' || key === 'wait' ? 'button' : 'div');
      chip.className = 'hud-chip';
      this.root.appendChild(chip);
      this.chips[key] = chip;
    }
    if (onTransitClick) {
      this.chips.wait.classList.add('hud-chip-clickable');
      this.chips.wait.addEventListener('click', onTransitClick);
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
    if (focused) {
      const waiting = focused.shafts().reduce((n, s) => n + s.waitingCount, 0);
      const sampled = focused.shafts().some(s => s.recentWaits().length > 0);
      const average = focused.averageWait().toFixed(0);
      this.chips.wait.innerHTML = `<small>Lift flow ↗</small><span class="hud-lift-data"><span>${waiting} waiting</span><span>${sampled ? `${average}m avg` : '— avg'}</span></span>`;
      const label = `Lift flow: ${waiting} waiting now; ${sampled ? `historical average ${average} game minutes` : 'no completed wait samples yet'}. Open current queues and the upgrade report.`;
      this.chips.wait.title = label; this.chips.wait.setAttribute('aria-label', label);
    } else {
      this.chips.wait.innerHTML = `<small>Towers</small>${town.towers().length}`;
      this.chips.wait.title = ''; this.chips.wait.setAttribute('aria-label', `Towers: ${town.towers().length}`);
    }
  }
}

/**
 * Forecast and contextual invitations stay discoverable even with a collapsed
 * journal. Any remaining old-save bonuses are labelled separately.
 */
export class EventTicker {
  private readonly root: HTMLElement;
  private lastKey = '';

  constructor(root: HTMLElement, private readonly onNeighborhood: () => void = () => {}) {
    this.root = root;
  }

  update(town: Town): void {
    const active = town.cityEvents.active;
    const invitations = town.neighborhood.pending();
    const kind = town.weather.kind;
    const nextAt = town.weather.nextChangeAt(town.time);
    const sheltered = town.identity.unlocked.has('canopy');
    const key = `${kind}:${nextAt}:${sheltered}|` + active.map((e) => `${e.id}:${Math.max(0, e.endsDay - town.day)}`).join('|') +
      '|' + invitations.map((e) => `${e.id}:${e.status}:${e.title}`).join('|');
    if (key === this.lastKey) return; // avoid rebuilding the DOM every frame
    this.lastKey = key;

    const forecastOpen = this.root.querySelector('details')?.open ?? false;
    const eventsOpen = this.root.querySelector<HTMLDetailsElement>('.events-list')?.open ?? false;
    this.root.innerHTML = '';
    const weather = document.createElement('details');
    weather.className = 'weather-chip'; weather.open = forecastOpen;
    const penalty = Math.round((weatherTravelMultiplier(kind, sheltered ? 2 : 0) - 1) * 100);
    const nextLabel = nextAt % (24 * 60) === 0 ? 'Tomorrow morning' : 'This afternoon';
    weather.innerHTML = `<summary>${kind === 'rain' ? '☂' : kind === 'snow' ? '❄' : '☀'} ${town.weather.seasonAt(town.time)} · ${WEATHER_LABELS[kind]}</summary>` +
      `<div class="weather-forecast"><b>${nextLabel}: ${WEATHER_LABELS[town.weather.at(nextAt)]}</b>` +
      `<p>${kind === 'clear' ? 'Dry walks. Puddles dry and snow melts gradually.' : `Street journeys take about ${penalty}% longer${sheltered ? ' with your entrance canopies' : ' without shelter'}. Coffee visits earn 15% more.`}</p>` +
      `<p>Entrance canopies (8 neighbors) and transit-zoned entrances reduce weather delays. Seasons change every 8 town days.</p></div>`;
    this.root.appendChild(weather);
    const happenings = document.createElement('details');
    happenings.className = 'weather-chip events-list'; happenings.open = eventsOpen;
    const summary = document.createElement('summary'); summary.textContent = invitations.length ?
      `${invitations.length} neighborhood happening${invitations.length === 1 ? '' : 's'}` : `${active.length} saved bonus${active.length === 1 ? '' : 'es'}`;
    const eventList = document.createElement('div'); eventList.className = 'event-list-content';
    happenings.append(summary, eventList);
    if (active.length || invitations.length) this.root.appendChild(happenings);
    for (const event of invitations) {
      const button = document.createElement('button'); button.className = 'event-chip event-good neighborhood-event';
      button.type = 'button'; button.title = event.reason;
      const title = document.createElement('b'); title.textContent = event.title;
      const status = document.createElement('small'); status.textContent = event.status === 'offered' ? 'Invitation · open when ready ↗' : 'Hosted · see how it is going ↗';
      button.append(title, status); button.addEventListener('click', this.onNeighborhood);
      eventList.append(button);
    }
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
      eventList.appendChild(chip);
    }
  }
}

export { Toaster } from './toasts';
