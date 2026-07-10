import {
  BUSINESS_SUBTYPES,
  BusinessSubtype,
  ELEVATOR_TIERS,
  FLOOR_CONFIG,
  FloorType,
  JobFloorType,
  SECOND_SHAFT,
} from '../core/types';
import { Game } from '../core/game';
import { Toaster } from './hud';

type BuildableType = Exclude<FloorType, 'lobby'>;

const BUILD_ORDER: BuildableType[] = ['residential', 'shop', 'restaurant', 'office'];

/**
 * Bottom build bar. Floor and lift actions apply to the currently focused
 * tower; business floor types open a subtype picker before building.
 */
export class BuildMenu {
  private buttons = new Map<BuildableType, HTMLButtonElement>();
  private speedButton: HTMLButtonElement;
  private shaftButton: HTMLButtonElement;
  private viewButton: HTMLButtonElement;
  private missionsButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  private popover: HTMLDivElement;
  private popoverType: JobFloorType | null = null;

  constructor(
    root: HTMLElement,
    private readonly getGame: () => Game | null,
    private readonly toaster: Toaster,
    private readonly onChange: () => void,
    onToggleView: () => void,
    onShowMissions: () => void,
    onReset: () => void,
  ) {
    this.popover = document.createElement('div');
    this.popover.className = 'subtype-popover';
    this.popover.style.display = 'none';
    root.appendChild(this.popover);

    for (const type of BUILD_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.addEventListener('click', () => {
        const game = this.getGame();
        if (!game) return;
        if (type === 'residential') {
          const check = game.canBuild(type);
          if (!check.ok) {
            toaster.show(check.reason ?? 'Cannot build');
            return;
          }
          game.buildFloor(type);
          toaster.show(`Built ${FLOOR_CONFIG[type].label}!`);
          this.onChange();
          return;
        }
        this.togglePopover(type);
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
      this.onChange();
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
      this.onChange();
    });
    root.appendChild(this.shaftButton);

    this.viewButton = document.createElement('button');
    this.viewButton.className = 'build-btn view-btn';
    this.viewButton.addEventListener('click', () => {
      this.hidePopover();
      onToggleView();
    });
    root.appendChild(this.viewButton);

    this.missionsButton = document.createElement('button');
    this.missionsButton.className = 'build-btn';
    this.missionsButton.addEventListener('click', onShowMissions);
    root.appendChild(this.missionsButton);

    this.resetButton = document.createElement('button');
    this.resetButton.className = 'build-btn danger';
    this.resetButton.textContent = 'New town';
    this.resetButton.addEventListener('click', () => {
      if (confirm('Start over? Your whole town will be lost.')) onReset();
    });
    root.appendChild(this.resetButton);
  }

  private togglePopover(type: JobFloorType): void {
    if (this.popoverType === type) {
      this.hidePopover();
      return;
    }
    const game = this.getGame();
    if (!game) return;
    const gate = game.canBuild(type);
    if (game.homePopulation < FLOOR_CONFIG[type].unlockPop) {
      this.toaster.show(gate.reason ?? 'Locked');
      return;
    }
    this.popoverType = type;
    this.popover.innerHTML = '';
    for (const profile of BUSINESS_SUBTYPES[type]) {
      const cost = game.tower.nextFloorCost(type, profile.subtype);
      const btn = document.createElement('button');
      btn.className = 'build-btn subtype-btn';
      btn.innerHTML = `${profile.label}<span class="cost">${cost} coins</span>`;
      btn.disabled = game.economy.coins < cost;
      btn.addEventListener('click', () => this.buildSubtype(type, profile.subtype));
      this.popover.appendChild(btn);
    }
    this.popover.style.display = 'flex';
  }

  private buildSubtype(type: JobFloorType, subtype: BusinessSubtype): void {
    const game = this.getGame();
    if (!game) return;
    if (game.buildFloor(type, subtype)) {
      const label = BUSINESS_SUBTYPES[type].find((p) => p.subtype === subtype)?.label ?? type;
      this.toaster.show(`Built ${label}!`);
      this.onChange();
    } else {
      this.toaster.show('Not enough coins');
    }
    this.hidePopover();
  }

  hidePopover(): void {
    this.popover.style.display = 'none';
    this.popoverType = null;
  }

  update(inTowerView: boolean, completedMissions: number, totalMissions: number): void {
    const game = this.getGame();
    const disabledAll = !game || !inTowerView;
    if (disabledAll) this.hidePopover();

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
        : `${cfg.label}<span class="cost">${type === 'residential' ? `${cost} coins` : 'choose type…'}</span>`;
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
    this.missionsButton.innerHTML = `🎯 Missions<span class="cost">${completedMissions}/${totalMissions}</span>`;
  }
}
