import { ELEVATOR_TIERS, FLOOR_CONFIG, FloorType, SECOND_SHAFT } from '../core/types';
import { Game } from '../core/game';
import { Toaster } from './hud';

type BuildableType = Exclude<FloorType, 'lobby'>;

const BUILD_ORDER: BuildableType[] = ['residential', 'shop', 'restaurant', 'office'];

/**
 * Bottom build bar. Floor and lift actions apply to the currently focused
 * tower; the view toggle switches between town and tower framing.
 */
export class BuildMenu {
  private buttons = new Map<BuildableType, HTMLButtonElement>();
  private speedButton: HTMLButtonElement;
  private shaftButton: HTMLButtonElement;
  private viewButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private readonly getGame: () => Game | null,
    toaster: Toaster,
    onChange: () => void,
    onToggleView: () => void,
    onReset: () => void,
  ) {
    for (const type of BUILD_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.addEventListener('click', () => {
        const game = this.getGame();
        if (!game) return;
        const check = game.canBuild(type);
        if (!check.ok) {
          toaster.show(check.reason ?? 'Cannot build');
          return;
        }
        game.buildFloor(type);
        toaster.show(`Built ${FLOOR_CONFIG[type].label}!`);
        onChange();
      });
      root.appendChild(btn);
      this.buttons.set(type, btn);
    }

    this.speedButton = document.createElement('button');
    this.speedButton.className = 'build-btn';
    this.speedButton.addEventListener('click', () => {
      const game = this.getGame();
      if (!game) return;
      const check = game.canUpgradeSpeed();
      if (!check.ok) {
        toaster.show(check.reason ?? 'Cannot upgrade');
        return;
      }
      game.upgradeSpeed();
      toaster.show('Lift upgraded — zoom zoom!');
      onChange();
    });
    root.appendChild(this.speedButton);

    this.shaftButton = document.createElement('button');
    this.shaftButton.className = 'build-btn';
    this.shaftButton.addEventListener('click', () => {
      const game = this.getGame();
      if (!game) return;
      const check = game.canUnlockSecondShaft();
      if (!check.ok) {
        toaster.show(check.reason ?? 'Cannot build');
        return;
      }
      game.unlockSecondShaft();
      toaster.show('Second lift shaft installed!');
      onChange();
    });
    root.appendChild(this.shaftButton);

    this.viewButton = document.createElement('button');
    this.viewButton.className = 'build-btn view-btn';
    this.viewButton.addEventListener('click', onToggleView);
    root.appendChild(this.viewButton);

    this.resetButton = document.createElement('button');
    this.resetButton.className = 'build-btn danger';
    this.resetButton.textContent = 'New town';
    this.resetButton.addEventListener('click', () => {
      if (confirm('Start over? Your whole town will be lost.')) onReset();
    });
    root.appendChild(this.resetButton);
  }

  update(inTowerView: boolean): void {
    const game = this.getGame();
    const disabledAll = !game || !inTowerView;

    for (const [type, btn] of this.buttons) {
      const cfg = FLOOR_CONFIG[type];
      if (disabledAll) {
        btn.innerHTML = `${cfg.label}<span class="cost">Select a tower</span>`;
        btn.disabled = true;
        continue;
      }
      const cost = game.tower.nextFloorCost(type);
      const locked = game.homePopulation < cfg.unlockPop;
      btn.innerHTML = locked
        ? `${cfg.label}<span class="cost">🔒 ${cfg.unlockPop} residents</span>`
        : `${cfg.label}<span class="cost">${cost} coins</span>`;
      btn.disabled = locked || game.economy.coins < cost;
    }

    if (disabledAll) {
      this.speedButton.innerHTML = `Lift speed<span class="cost">Select a tower</span>`;
      this.speedButton.disabled = true;
      this.shaftButton.innerHTML = `2nd lift<span class="cost">Select a tower</span>`;
      this.shaftButton.disabled = true;
    } else {
      const cost = game.nextSpeedTierCost();
      this.speedButton.innerHTML =
        cost === null
          ? `Lift speed<span class="cost">Max (tier ${game.elevatorTier + 1}/${ELEVATOR_TIERS.length})</span>`
          : `Lift speed ${game.elevatorTier + 1}→${game.elevatorTier + 2}<span class="cost">${cost} coins</span>`;
      this.speedButton.disabled = !game.canUpgradeSpeed().ok;

      if (game.secondElevator) {
        this.shaftButton.innerHTML = `2nd lift<span class="cost">Built ✓</span>`;
        this.shaftButton.disabled = true;
      } else {
        const check = game.canUnlockSecondShaft();
        const gated = game.homePopulation < SECOND_SHAFT.unlockPop;
        this.shaftButton.innerHTML = gated
          ? `2nd lift<span class="cost">🔒 ${SECOND_SHAFT.unlockPop} residents</span>`
          : `2nd lift<span class="cost">${SECOND_SHAFT.cost} coins</span>`;
        this.shaftButton.disabled = !check.ok;
      }
    }

    this.viewButton.textContent = inTowerView ? '🏙 Town view' : '🏢 Tower view';
  }
}
