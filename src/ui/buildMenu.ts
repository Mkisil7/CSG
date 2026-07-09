import { FLOOR_CONFIG, FloorType } from '../core/types';
import { Game } from '../core/game';
import { Toaster } from './hud';

type BuildableType = Exclude<FloorType, 'lobby'>;

const BUILD_ORDER: BuildableType[] = ['residential', 'shop', 'restaurant', 'office'];

export class BuildMenu {
  private buttons = new Map<BuildableType, HTMLButtonElement>();
  private carButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private game: Game,
    toaster: Toaster,
    onChange: () => void,
    onReset: () => void,
  ) {
    for (const type of BUILD_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.addEventListener('click', () => {
        const check = this.game.canBuild(type);
        if (!check.ok) {
          toaster.show(check.reason ?? 'Cannot build');
          return;
        }
        this.game.buildFloor(type);
        toaster.show(`Built ${FLOOR_CONFIG[type].label}!`);
        onChange();
      });
      root.appendChild(btn);
      this.buttons.set(type, btn);
    }

    this.carButton = document.createElement('button');
    this.carButton.className = 'build-btn';
    this.carButton.addEventListener('click', () => {
      const check = this.game.canAddCar();
      if (!check.ok) {
        toaster.show(check.reason ?? 'Cannot add car');
        return;
      }
      this.game.addElevatorCar();
      toaster.show('Added an elevator car!');
      onChange();
    });
    root.appendChild(this.carButton);

    this.resetButton = document.createElement('button');
    this.resetButton.className = 'build-btn danger';
    this.resetButton.textContent = 'New tower';
    this.resetButton.addEventListener('click', () => {
      if (confirm('Start over? Your current tower will be lost.')) onReset();
    });
    root.appendChild(this.resetButton);
  }

  /** Swap in a fresh game (after reset/load). */
  setGame(game: Game): void {
    this.game = game;
  }

  update(): void {
    for (const [type, btn] of this.buttons) {
      const cfg = FLOOR_CONFIG[type];
      const cost = this.game.tower.nextFloorCost(type);
      const locked = this.game.population < cfg.unlockPop;
      btn.innerHTML = locked
        ? `${cfg.label}<span class="cost">🔒 ${cfg.unlockPop} residents</span>`
        : `${cfg.label}<span class="cost">${cost} coins</span>`;
      btn.disabled = locked || this.game.economy.coins < cost;
    }

    const canAdd = this.game.canAddCar();
    if (this.game.elevator.cars.length >= 4) {
      this.carButton.innerHTML = `Elevator car<span class="cost">Shaft full</span>`;
    } else {
      const carCost = this.game.economy.nextElevatorCarCost(this.game.elevator.cars.length);
      this.carButton.innerHTML = `Elevator car<span class="cost">${carCost} coins</span>`;
    }
    this.carButton.disabled = !canAdd.ok;
  }
}
