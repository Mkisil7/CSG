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

type BuildableType = Exclude<FloorType, 'lobby' | 'landmark'>;

const BUILD_ORDER: BuildableType[] = ['residential', 'shop', 'restaurant', 'office', 'factory'];

/**
 * Bottom build bar. Desktop keeps one row of builds, Manage and View. On touch / narrow
 * screens it becomes a compact 3-button dock — [🏗 Build] [⚙ Manage] [View] —
 * that opens a tidy bottom-sheet above it (dimming the rest of the screen), so
 * the controls never overlap the game or each other. Business floor types open
 * a subtype picker before building (a drill-in inside the sheet on mobile, a
 * floating popover on desktop).
 */
export class BuildMenu {
  private buttons = new Map<BuildableType, HTMLButtonElement>();
  private speedButton: HTMLButtonElement;
  private shaftButton: HTMLButtonElement;
  private viewButton: HTMLButtonElement;
  private missionsButton: HTMLButtonElement;
  private activityButton: HTMLButtonElement;
  private friendsButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  private landmarkButton: HTMLButtonElement;
  private popover: HTMLDivElement;
  private popoverType: JobFloorType | null = null;

  // Shared action sheet; desktop groups secondary management actions only.
  private mobile = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  private sheet: HTMLDivElement | null = null;
  private backdrop: HTMLDivElement | null = null;
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
    onShowSocial: () => void,
    onReset: () => void,
    onLandmarks: () => void = () => {},
  ) {
    this.popover = document.createElement('div');
    this.popover.className = 'subtype-popover';
    this.popover.id = 'build-subtypes';
    this.popover.setAttribute('role', 'region');
    this.popover.style.display = 'none';
    this.landmarkButton = document.createElement('button');
    this.landmarkButton.className = 'build-btn';
    this.landmarkButton.textContent = '◇ Landmarks';
    this.landmarkButton.addEventListener('click', () => { this.closeSheet(); onLandmarks(); });

    for (const type of BUILD_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      if (type !== 'residential') {
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'build-subtypes');
      }
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
        if (this.mobile) this.showSubtypeSheet(type);
        else this.togglePopover(type);
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

    this.friendsButton = document.createElement('button');
    this.friendsButton.className = 'build-btn';
    this.friendsButton.textContent = '🌐 Friends';
    this.friendsButton.addEventListener('click', () => {
      this.closeSheet();
      onShowSocial();
    });

    this.resetButton = document.createElement('button');
    this.resetButton.className = 'build-btn danger';
    this.resetButton.textContent = 'New town';
    this.resetButton.addEventListener('click', () => {
      if (confirm('Start over? Your whole town will be lost.')) onReset();
    });

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || (!this.openGroup && !this.popoverType)) return;
      event.preventDefault(); event.stopPropagation(); this.closeSheet();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!root.contains(event.target as Node)) this.closeSheet(false);
    });
    document.addEventListener('focusin', (event) => {
      if (!root.contains(event.target as Node)) this.closeSheet(false);
    });
    if (this.mobile) this.layoutMobile(root);
    else this.layoutDesktop(root);
    window.matchMedia('(max-width: 900px), (pointer: coarse)').addEventListener('change', (event) => {
      if (this.mobile === event.matches) return;
      const hadFocus = root.contains(document.activeElement);
      this.closeSheet();
      this.mobile = event.matches;
      root.replaceChildren();
      this.sheet = null; this.backdrop = null; this.buildToggle = null; this.manageToggle = null;
      this.viewButton.classList.remove('dock-btn');
      if (this.mobile) this.layoutMobile(root);
      else this.layoutDesktop(root);
      if (hadFocus) this.viewButton.focus({ preventScroll: true });
    });
  }

  // ---- layouts ---------------------------------------------------------

  private layoutDesktop(root: HTMLElement): void {
    this.createSheet(root);
    root.appendChild(this.popover);
    for (const type of BUILD_ORDER) {
      if (type !== 'residential') this.buttons.get(type)!.setAttribute('aria-controls', this.popover.id);
      root.appendChild(this.buttons.get(type)!);
    }
    root.appendChild(this.landmarkButton);
    root.appendChild(this.manageToggle!);
    root.appendChild(this.viewButton);
  }

  private createSheet(root: HTMLElement): void {
    // A dimming backdrop that closes the sheet when tapped.
    if (this.mobile) {
      this.backdrop = document.createElement('div');
      this.backdrop.className = 'menu-backdrop';
      this.backdrop.style.display = 'none';
      this.backdrop.addEventListener('click', () => this.closeSheet());
      root.appendChild(this.backdrop);
    }

    this.sheet = document.createElement('div');
    this.sheet.className = `build-sheet${this.mobile ? '' : ' desktop-manage-sheet'}`;
    this.sheet.id = 'build-actions';
    this.sheet.setAttribute('role', 'region');
    this.sheet.style.display = 'none';
    root.appendChild(this.sheet);

    this.manageToggle = document.createElement('button');
    this.manageToggle.className = `build-btn${this.mobile ? ' dock-btn' : ''}`;
    this.manageToggle.textContent = this.mobile ? 'Manage' : '⚙ Manage';
    this.manageToggle.setAttribute('aria-expanded', 'false');
    this.manageToggle.setAttribute('aria-controls', this.sheet.id);
    this.manageToggle.addEventListener('click', () => this.toggleGroup('manage'));
  }

  private layoutMobile(root: HTMLElement): void {
    this.createSheet(root);
    for (const [type, button] of this.buttons) if (type !== 'residential') button.setAttribute('aria-controls', this.sheet!.id);
    this.buildToggle = document.createElement('button');
    this.buildToggle.className = 'build-btn dock-btn';
    this.buildToggle.textContent = '+ Build';
    this.buildToggle.setAttribute('aria-expanded', 'false');
    this.buildToggle.setAttribute('aria-controls', this.sheet!.id);
    this.buildToggle.addEventListener('click', () => this.toggleGroup('build'));

    this.viewButton.classList.add('dock-btn');

    root.appendChild(this.buildToggle);
    root.appendChild(this.manageToggle!);
    root.appendChild(this.viewButton);
  }

  /** Goal navigation only: the player still chooses and confirms a paid build. */
  showBuildOptions(type: BuildableType): void {
    if (!this.getGame()) return;
    if (this.mobile) {
      if (type === 'residential') this.populateSheet('build');
      else this.showSubtypeSheet(type);
    } else if (type !== 'residential') {
      this.hidePopover();
      this.togglePopover(type);
    }
    if (type === 'residential') this.buttons.get(type)?.focus();
    else (this.mobile ? this.sheet : this.popover)?.querySelector<HTMLButtonElement>('.subtype-btn:not(:disabled)')?.focus();
  }

  private toggleGroup(group: 'build' | 'manage'): void {
    if (this.openGroup === group) {
      this.closeSheet();
      return;
    }
    this.populateSheet(group);
  }

  private populateSheet(group: 'build' | 'manage'): void {
    if (!this.sheet) return;
    this.hidePopover(false);
    this.openGroup = group;
    this.sheet.setAttribute('aria-label', group === 'build' ? 'Build choices' : 'Manage actions');
    this.sheet.innerHTML = '';
    this.sheet.appendChild(this.sheetHeader(group === 'build' ? 'Build' : 'Manage'));
    if (group === 'build') {
      for (const type of BUILD_ORDER) this.sheet.appendChild(this.buttons.get(type)!);
      this.sheet.appendChild(this.landmarkButton);
    } else {
      this.sheet.appendChild(this.speedButton);
      this.sheet.appendChild(this.shaftButton);
      this.sheet.appendChild(this.missionsButton);
      this.sheet.appendChild(this.activityButton);
      this.sheet.appendChild(this.friendsButton);
      this.sheet.appendChild(this.resetButton);
    }
    this.showSheet();
    this.buildToggle?.classList.toggle('active', group === 'build');
    this.manageToggle?.classList.toggle('active', group === 'manage');
    this.buildToggle?.setAttribute('aria-expanded', String(group === 'build'));
    this.manageToggle?.setAttribute('aria-expanded', String(group === 'manage'));
  }

  /** Mobile drill-in: replace the Build list with a subtype picker + Back. */
  private showSubtypeSheet(type: JobFloorType): void {
    const game = this.getGame();
    if (!game || !this.sheet) return;
    const gate = game.canBuild(type);
    if (!gate.ok && gate.reason && !gate.reason.startsWith('Not enough coins')) {
      this.toaster.show(gate.reason);
      return;
    }
    this.openGroup = 'build';
    this.sheet.setAttribute('aria-label', `${FLOOR_CONFIG[type].label} choices`);
    this.buildToggle?.setAttribute('aria-expanded', 'true');
    this.manageToggle?.setAttribute('aria-expanded', 'false');
    this.sheet.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'build-btn sheet-back';
    back.innerHTML = '‹ Build';
    back.addEventListener('click', () => this.populateSheet('build'));
    this.sheet.appendChild(back);
    this.sheet.appendChild(this.sheetHeader(FLOOR_CONFIG[type].label));
    for (const profile of BUSINESS_SUBTYPES[type]) {
      const cost = game.tower.nextFloorCost(type, profile.subtype);
      const btn = document.createElement('button');
      btn.className = 'build-btn subtype-btn';
      btn.innerHTML = `${profile.label}<span class="cost">${cost} coins</span>`;
      btn.disabled = game.economy.coins < cost;
      btn.addEventListener('click', () => this.buildSubtype(type, profile.subtype));
      this.sheet.appendChild(btn);
    }
    this.showSheet();
  }

  private sheetHeader(label: string): HTMLDivElement {
    const h = document.createElement('div');
    h.className = 'sheet-header';
    h.textContent = label;
    const close = document.createElement('button');
    close.className = 'sheet-close'; close.type = 'button'; close.textContent = '×';
    close.setAttribute('aria-label', `Close ${label}`);
    close.addEventListener('click', () => this.closeSheet());
    h.appendChild(close);
    return h;
  }

  private showSheet(): void {
    if (!this.sheet) return;
    this.sheet.style.display = 'flex';
    if (this.backdrop) this.backdrop.style.display = 'block';
    document.body.classList.add('menu-sheet-open');
    this.sheet.querySelector<HTMLButtonElement>('.build-btn:not(:disabled)')?.focus({ preventScroll: true });
  }

  private closeSheet(restoreFocus = true): void {
    const trigger = this.openGroup === 'build' ? this.buildToggle : this.manageToggle;
    const hadSheet = this.openGroup !== null;
    this.hidePopover(restoreFocus);
    this.openGroup = null;
    if (this.sheet) this.sheet.style.display = 'none';
    if (this.backdrop) this.backdrop.style.display = 'none';
    document.body.classList.remove('menu-sheet-open');
    this.buildToggle?.classList.remove('active');
    this.manageToggle?.classList.remove('active');
    this.buildToggle?.setAttribute('aria-expanded', 'false');
    this.manageToggle?.setAttribute('aria-expanded', 'false');
    if (hadSheet && restoreFocus) trigger?.focus({ preventScroll: true });
  }

  /** Fold choices away so a successful build/upgrade is immediately visible. */
  private afterBuild(): void {
    this.closeSheet();
    this.onChange();
  }

  // ---- desktop subtype popover ----------------------------------------

  private togglePopover(type: JobFloorType): void {
    if (this.popoverType === type) {
      this.hidePopover();
      return;
    }
    const game = this.getGame();
    if (!game) return;
    const gate = game.canBuild(type);
    // Zone/population gates are shown on the button; surface the reason on tap
    // rather than opening an empty subtype picker.
    if (!gate.ok && gate.reason && !gate.reason.startsWith('Not enough coins')) {
      this.toaster.show(gate.reason);
      return;
    }
    this.closeSheet(false);
    this.popoverType = type;
    this.buttons.get(type)?.setAttribute('aria-expanded', 'true');
    this.popover.setAttribute('aria-label', `${FLOOR_CONFIG[type].label} choices`);
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
    document.body.classList.add('subtype-picker-open');
    this.popover.querySelector<HTMLButtonElement>('.subtype-btn:not(:disabled)')?.focus({ preventScroll: true });
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

  hidePopover(restoreFocus = true): void {
    const trigger = this.popoverType ? this.buttons.get(this.popoverType) : null;
    const hadFocus = this.popover.contains(document.activeElement);
    this.popover.style.display = 'none';
    this.popoverType = null;
    document.body.classList.remove('subtype-picker-open');
    trigger?.setAttribute('aria-expanded', 'false');
    if (hadFocus && restoreFocus && trigger && !trigger.disabled) trigger.focus({ preventScroll: true });
  }

  update(inTowerView: boolean, completedMissions: number, totalMissions: number): void {
    const game = this.getGame();
    const disabledAll = !game || !inTowerView;
    this.landmarkButton.disabled = disabledAll;
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
      const locked = game.townPopulation < cfg.unlockPop;
      // Permanent zoning takes priority over the temporary population gate.
      if (gate.reason && gate.reason.startsWith('Not zoned')) {
        btn.innerHTML = `${cfg.label}<span class="cost">🚫 ${gate.reason.replace('Not zoned for this — ', '')}</span>`;
        btn.disabled = true;
        continue;
      }
      btn.innerHTML = locked
        ? `${cfg.label}<span class="cost">🔒 ${cfg.unlockPop} in town</span>`
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
        const gated = game.townPopulation < SECOND_SHAFT.unlockPop;
        this.shaftButton.innerHTML = gated
          ? `2nd lift<span class="cost">🔒 ${SECOND_SHAFT.unlockPop} residents</span>`
          : `2nd lift<span class="cost">${SECOND_SHAFT.cost} coins</span>`;
        this.shaftButton.disabled = !check.ok;
      }
    }

    // The View toggle stays short on mobile so three buttons fit one row.
    if (this.mobile) {
      this.viewButton.textContent = inTowerView ? 'Town' : 'Tower';
    } else {
      this.viewButton.textContent = inTowerView ? '🏙 Town view' : '🏢 Tower view';
    }
    this.missionsButton.innerHTML = `🎯 Missions<span class="cost">${completedMissions}/${totalMissions}</span>`;
    if (!this.mobile && this.manageToggle) {
      this.manageToggle.innerHTML = `⚙ Manage<span class="cost">${completedMissions}/${totalMissions} missions</span>`;
    }

    // Mobile: Build needs a focused tower; Manage stays available for the
    // town-wide actions (missions, activity) even in town view.
    if (this.mobile && this.buildToggle) {
      this.buildToggle.disabled = disabledAll;
      if (disabledAll && this.openGroup === 'build') this.closeSheet();
    }
  }
}
