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
import { IS_COARSE_POINTER } from '../render/scene';
import { Toaster } from './hud';

type BuildableType = Exclude<FloorType, 'lobby'>;

const BUILD_ORDER: BuildableType[] = ['residential', 'shop', 'restaurant', 'office', 'factory'];

/**
 * Bottom build bar. On desktop it's a flat row of buttons. On touch / narrow
 * screens it collapses into a compact bar — [🏗 Build] [⚙ Manage] [View] — where
 * Build and Manage open a sheet above the bar, so the controls no longer eat
 * half the screen. Floor and lift actions apply to the currently focused tower;
 * business floor types open a subtype picker before building.
 */
export class BuildMenu {
  private buttons = new Map<BuildableType, HTMLButtonElement>();
  private speedButton: HTMLButtonElement;
  private shaftButton: HTMLButtonElement;
  private viewButton: HTMLButtonElement;
  private missionsButton: HTMLButtonElement;
  private activityButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  private popover: HTMLDivElement;
  private popoverType: JobFloorType | null = null;

  // Mobile grouping.
  private readonly mobile = IS_COARSE_POINTER;
  private sheet: HTMLDivElement | null = null;
  private buildToggle: HTMLButtonElement | null = null;
  private manageToggle: HTMLButtonElement | null = null;
  private openGroup: 'build' | 'manage' | null = null;

  constructor(
    root: HTMLElement,
    private readonly getGame: () => Game | null,
    private readonly toaster: Toaster,
    private readonly onChange: () => void,
    onToggleView: () => void,
    onShowMissions: () => void,
    onShowActivity: () => void,
    onReset: () => void,
  ) {
    this.popover = document.createElement('div');
    this.popover.className = 'subtype-popover';
    this.popover.style.display = 'none';

    for (const type of BUILD_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.addEventListener('click', () => {
        const game = this.getGame();
        if (!game) return;
        if (type === 'residential') {
          const check = game.canBuild(type);
          if (!check.ok) {
            this.toaster.show(check.reason ?? 'Cannot build');
            return;
          }
          game.buildFloor(type);
          this.toaster.show(`Built ${FLOOR_CONFIG[type].label}!`);
          this.afterBuild();
          return;
        }
        this.togglePopover(type);
      });
      this.buttons.set(type, btn);
    }

    this.speedButton = document.createElement('button');
    this.speedButton.className = 'build-btn';
    this.speedButton.addEventListener('click', () => {
      const game = this.getGame();
      if (!game) return;
      const check = game.canUpgradeSpeed();
      if (!check.ok) {
        this.toaster.show(check.reason ?? 'Cannot upgrade');
        return;
      }
      game.upgradeSpeed();
      this.toaster.show('Lift upgraded — faster and roomier!');
      this.afterBuild();
    });

    this.shaftButton = document.createElement('button');
    this.shaftButton.className = 'build-btn';
    this.shaftButton.addEventListener('click', () => {
      const game = this.getGame();
      if (!game) return;
      const check = game.canUnlockSecondShaft();
      if (!check.ok) {
        this.toaster.show(check.reason ?? 'Cannot build');
        return;
      }
      game.unlockSecondShaft();
      this.toaster.show('Second lift shaft installed!');
      this.afterBuild();
    });

    this.viewButton = document.createElement('button');
    this.viewButton.className = 'build-btn view-btn';
    this.viewButton.addEventListener('click', () => {
      this.hidePopover();
      this.closeSheet();
      onToggleView();
    });

    this.missionsButton = document.createElement('button');
    this.missionsButton.className = 'build-btn';
    this.missionsButton.addEventListener('click', () => {
      this.closeSheet();
      onShowMissions();
    });

    this.activityButton = document.createElement('button');
    this.activityButton.className = 'build-btn';
    this.activityButton.textContent = '📜 Activity';
    this.activityButton.addEventListener('click', () => {
      this.closeSheet();
      onShowActivity();
    });

    this.resetButton = document.createElement('button');
    this.resetButton.className = 'build-btn danger';
    this.resetButton.textContent = 'New town';
    this.resetButton.addEventListener('click', () => {
      if (confirm('Start over? Your whole town will be lost.')) onReset();
    });

    if (this.mobile) this.layoutMobile(root);
    else this.layoutDesktop(root);
  }

  // ---- layouts ---------------------------------------------------------

  private layoutDesktop(root: HTMLElement): void {
    root.appendChild(this.popover);
    for (const type of BUILD_ORDER) root.appendChild(this.buttons.get(type)!);
    root.appendChild(this.speedButton);
    root.appendChild(this.shaftButton);
    root.appendChild(this.viewButton);
    root.appendChild(this.missionsButton);
    root.appendChild(this.activityButton);
    root.appendChild(this.resetButton);
  }

  private layoutMobile(root: HTMLElement): void {
    this.sheet = document.createElement('div');
    this.sheet.className = 'build-sheet';
    this.sheet.style.display = 'none';
    this.sheet.appendChild(this.popover);
    root.appendChild(this.sheet);

    this.buildToggle = document.createElement('button');
    this.buildToggle.className = 'build-btn';
    this.buildToggle.textContent = '🏗 Build';
    this.buildToggle.addEventListener('click', () => this.toggleGroup('build'));

    this.manageToggle = document.createElement('button');
    this.manageToggle.className = 'build-btn';
    this.manageToggle.textContent = '⚙ Manage';
    this.manageToggle.addEventListener('click', () => this.toggleGroup('manage'));

    root.appendChild(this.buildToggle);
    root.appendChild(this.manageToggle);
    root.appendChild(this.viewButton);
  }

  private toggleGroup(group: 'build' | 'manage'): void {
    if (this.openGroup === group) {
      this.closeSheet();
      return;
    }
    this.hidePopover();
    this.openGroup = group;
    this.populateSheet(group);
  }

  private populateSheet(group: 'build' | 'manage'): void {
    if (!this.sheet) return;
    // Keep the (hidden) popover node in the sheet; clear the rest.
    for (const child of [...this.sheet.children]) {
      if (child !== this.popover) this.sheet.removeChild(child);
    }
    if (group === 'build') {
      for (const type of BUILD_ORDER) this.sheet.appendChild(this.buttons.get(type)!);
    } else {
      this.sheet.appendChild(this.speedButton);
      this.sheet.appendChild(this.shaftButton);
      this.sheet.appendChild(this.missionsButton);
      this.sheet.appendChild(this.activityButton);
      this.sheet.appendChild(this.resetButton);
    }
    this.sheet.style.display = 'flex';
    this.buildToggle?.classList.toggle('active', group === 'build');
    this.manageToggle?.classList.toggle('active', group === 'manage');
  }

  private closeSheet(): void {
    this.hidePopover();
    this.openGroup = null;
    if (this.sheet) this.sheet.style.display = 'none';
    this.buildToggle?.classList.remove('active');
    this.manageToggle?.classList.remove('active');
  }

  /** After a successful build: refresh state; on mobile also fold the sheet away. */
  private afterBuild(): void {
    this.onChange();
    if (this.mobile) this.closeSheet();
  }

  // ---- subtype picker --------------------------------------------------

  private togglePopover(type: JobFloorType): void {
    if (this.popoverType === type) {
      this.hidePopover();
      return;
    }
    const game = this.getGame();
    if (!game) return;
    const gate = game.canBuild(type);
    // Zone gates and population gates are shown on the button; surface the
    // reason on tap rather than opening an empty subtype picker.
    if (!gate.ok && gate.reason && !gate.reason.startsWith('Not enough coins')) {
      this.toaster.show(gate.reason);
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
      this.hidePopover();
      this.afterBuild();
    } else {
      this.toaster.show('Not enough coins');
      this.hidePopover();
    }
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
      const gate = game.canBuild(type);
      const locked = game.homePopulation < cfg.unlockPop;
      // Permanent zoning takes priority over the temporary population gate.
      if (gate.reason && gate.reason.startsWith('Not zoned')) {
        btn.innerHTML = `${cfg.label}<span class="cost">🚫 ${gate.reason.replace('Not zoned for this — ', '')}</span>`;
        btn.disabled = true;
        continue;
      }
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

    // Mobile: Build toggle needs a focused tower; Manage stays available for
    // the town-wide actions (missions, activity) even in town view.
    if (this.mobile && this.buildToggle) {
      this.buildToggle.disabled = disabledAll;
      if (disabledAll && this.openGroup === 'build') this.closeSheet();
    }
  }
}
