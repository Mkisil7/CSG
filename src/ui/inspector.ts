import { Town } from '../core/town';
import { Resident, FLOOR_CONFIG, TOWN } from '../core/types';
import { jobTitle } from '../core/careers';
import { MAX_FLOOR_NAME_LENGTH } from '../core/floorNames';
import { assignedStaff, businessGrade, isJobFloorType, subtypeProfile } from '../core/business';
import { worstFactor } from '../core/happiness';
import { MISSION_DEFS } from '../core/missions';

export type Selection =
  | { kind: 'floor'; towerId: string; level: number }
  | { kind: 'resident'; residentId: string }
  | { kind: 'slot'; index: number }
  | { kind: 'missions' }
  | null;

/**
 * Click-to-inspect panel: floors (renamable, occupant list, business grade),
 * residents (job, happiness, traits), locked tower slots (purchase), and the
 * missions checklist.
 */
export class Inspector {
  private selection: Selection = null;
  private lastRender = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly getTown: () => Town,
    private readonly onChanged: () => void,
  ) {
    root.classList.add('inspector');
  }

  select(selection: Selection): void {
    this.selection = selection;
    this.lastRender = '';
    this.refresh(true);
  }

  get current(): Selection {
    return this.selection;
  }

  /** Re-render content (skipped while the rename input has focus). */
  refresh(force = false): void {
    if (!this.selection) {
      this.root.style.display = 'none';
      return;
    }
    if (!force && this.root.contains(document.activeElement)) return;

    const html = this.render();
    if (html === null) {
      this.select(null);
      return;
    }
    this.root.style.display = 'block';
    if (html !== this.lastRender) {
      this.lastRender = html;
      this.root.innerHTML = html;
      this.bind();
    }
  }

  private render(): string | null {
    const town = this.getTown();
    const sel = this.selection;
    if (!sel) return null;

    if (sel.kind === 'missions') {
      const rows = MISSION_DEFS.map((def) => {
        const done = town.missions.completed.has(def.id);
        return `<div class="insp-row ${done ? 'mission-done' : ''}">
          ${done ? '✅' : '⬜'} <b>${def.label}</b> · +${def.reward}
          <div class="mission-desc">${def.description}</div>
        </div>`;
      }).join('');
      return `
        <button class="insp-close" id="insp-close">×</button>
        <div class="insp-title">Missions</div>
        <div class="insp-sub">${town.missions.completedCount}/${MISSION_DEFS.length} complete</div>
        ${rows}`;
    }

    if (sel.kind === 'floor') {
      const game = town.towerById(sel.towerId);
      const floor = game?.tower.floors[sel.level];
      if (!game || !floor) return null;

      let body = '';
      if (floor.type === 'residential') {
        const homes = town
          .allResidents()
          .filter((r) => r.homeTowerId === sel.towerId && r.homeFloor === sel.level);
        body = listSection(
          `Residents (${homes.length}/${FLOOR_CONFIG.residential.homes})`,
          homes.map((r) => escapeHtml(r.name)),
          'No one lives here yet',
        );
      } else if (isJobFloorType(floor.type)) {
        const staff = assignedStaff(town.allResidents(), sel.towerId, sel.level);
        const open = game.staffedLevels.has(sel.level);
        const { grade } = businessGrade(floor, staff.length);
        const profile = subtypeProfile(floor);
        const net = Math.round(floor.revenueToday - floor.expensesToday);
        body = `
          <div class="insp-row">${open ? '🟢 Open' : '⚫ Closed — no staff'} · Grade <b class="grade-${grade}">${grade}</b></div>
          <div class="insp-row">${profile ? escapeHtml(profile.label) : ''} · Quality ${Math.round(floor.quality)}/100</div>
          <div class="insp-row">Today: +${Math.round(floor.revenueToday)} / −${Math.round(floor.expensesToday)} (net ${net >= 0 ? '+' : ''}${net})</div>
          ${listSection(
            `Staff (${staff.length}/${FLOOR_CONFIG[floor.type].jobs})`,
            staff.map((r) => `${escapeHtml(r.name)} — ${jobTitle(r, floor) ?? 'Worker'}`),
            'No staff yet — closed',
          )}`;
      }

      const rename =
        floor.type === 'lobby'
          ? `<div class="insp-title">${escapeHtml(floor.name)}</div>`
          : `<input id="insp-rename" maxlength="${MAX_FLOOR_NAME_LENGTH}" value="${escapeHtml(floor.name)}" />`;

      return `
        <button class="insp-close" id="insp-close">×</button>
        ${rename}
        <div class="insp-sub">${floorTypeLabel(floor.type)} · Floor ${sel.level}</div>
        ${body}`;
    }

    if (sel.kind === 'resident') {
      const resident = town.allResidents().find((r) => r.id === sel.residentId);
      if (!resident) return null;
      const homeGame = town.towerById(resident.homeTowerId);
      const homeFloor = homeGame?.tower.floors[resident.homeFloor];
      const jobGame = resident.jobTowerId ? town.towerById(resident.jobTowerId) : null;
      const jobFloor =
        jobGame && resident.jobFloor !== null ? jobGame.tower.floors[resident.jobFloor] : undefined;
      const title = jobTitle(resident, jobFloor);
      const tenure =
        resident.jobStartDay !== null ? Math.max(0, town.day - resident.jobStartDay) : 0;
      const commutes = resident.jobTowerId !== null && resident.jobTowerId !== resident.homeTowerId;
      const mood = Math.round(resident.happiness);
      const moodIcon = mood >= 70 ? '😊' : mood >= 40 ? '😐' : '😟';

      return `
        <button class="insp-close" id="insp-close">×</button>
        <div class="insp-title">${escapeHtml(resident.name)}</div>
        <div class="insp-sub">${statusLine(resident)}</div>
        <div class="insp-row">${moodIcon} Happiness ${mood}/100${mood < 70 ? ` · worst: ${worstFactor(resident)}` : ''}</div>
        <div class="insp-row">✨ ${resident.traits.map(escapeHtml).join(', ') || 'no particular tastes'}</div>
        <div class="insp-row">🏠 ${escapeHtml(homeFloor?.name ?? 'Homeless')}</div>
        <div class="insp-row">${
          title && jobFloor
            ? `💼 ${escapeHtml(title)} at ${escapeHtml(jobFloor.name)} · day ${tenure}${commutes ? ' · commutes 🚶' : ''}`
            : '💼 Looking for work'
        }</div>`;
    }

    // Slot purchase panel.
    const slot = town.slots[sel.index];
    if (!slot || slot.unlocked) return null;
    const check = town.canUnlockSlot(sel.index);
    return `
      <button class="insp-close" id="insp-close">×</button>
      <div class="insp-title">Empty lot</div>
      <div class="insp-sub">A new tower could rise here</div>
      <div class="insp-row">Cost: ${TOWN.slotCosts[sel.index]} coins</div>
      <div class="insp-row">Requires ${TOWN.slotUnlockPop[sel.index]} town residents</div>
      <button class="build-btn insp-buy" id="insp-buy" ${check.ok ? '' : 'disabled'}>
        ${check.ok ? 'Break ground!' : (check.reason ?? 'Locked')}
      </button>`;
  }

  private bind(): void {
    document.getElementById('insp-close')?.addEventListener('click', () => this.select(null));

    const rename = document.getElementById('insp-rename') as HTMLInputElement | null;
    if (rename && this.selection?.kind === 'floor') {
      const sel = this.selection;
      const commit = () => {
        const game = this.getTown().towerById(sel.towerId);
        if (game?.tower.renameFloor(sel.level, rename.value)) this.onChanged();
        rename.blur();
        this.refresh(true);
      };
      rename.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
      });
      rename.addEventListener('blur', commit);
    }

    const buy = document.getElementById('insp-buy');
    if (buy && this.selection?.kind === 'slot') {
      const index = this.selection.index;
      buy.addEventListener('click', () => {
        if (this.getTown().unlockSlot(index)) {
          this.onChanged();
          this.select(null);
        }
      });
    }
  }
}

function statusLine(r: Resident): string {
  switch (r.state.kind) {
    case 'commuting':
      return 'Commuting between towers';
    case 'waiting':
      return 'Waiting for the lift';
    case 'riding':
      return 'Riding the lift';
    case 'idle':
      switch (r.state.activity.kind) {
        case 'work':
          return 'At work';
        case 'eat':
          return 'Out for a meal';
        case 'shop':
          return 'Shopping';
        case 'home':
          return 'At home';
        default:
          return 'In the lobby';
      }
  }
}

function floorTypeLabel(type: string): string {
  return type === 'lobby' ? 'Lobby' : FLOOR_CONFIG[type as keyof typeof FLOOR_CONFIG]?.label ?? type;
}

function listSection(title: string, items: string[], empty: string): string {
  const rows =
    items.length > 0
      ? items.map((i) => `<div class="insp-row">${i}</div>`).join('')
      : `<div class="insp-row insp-empty">${empty}</div>`;
  return `<div class="insp-section">${title}</div>${rows}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
