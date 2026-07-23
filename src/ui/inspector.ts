import { Town } from '../core/town';
import {
  BUSINESS,
  HAPPINESS,
  Resident,
  FLOOR_CONFIG,
  TOWN,
  ZONE_CONFIGS,
  ZoneType,
  SELECTABLE_ZONES,
} from '../core/types';
import { jobTitle } from '../core/careers';
import { MAX_FLOOR_NAME_LENGTH } from '../core/floorNames';
import { assignedStaff, businessGrade, isJobFloorType, subtypeProfile } from '../core/business';
import { worstFactor, happinessBreakdown } from '../core/happiness';
import { GameEventKind } from '../core/game';
import { MISSION_DEFS } from '../core/missions';

export type Selection =
  | { kind: 'floor'; towerId: string; level: number }
  | { kind: 'resident'; residentId: string }
  | { kind: 'slot'; index: number }
  | { kind: 'missions' }
  | { kind: 'activity' }
  | { kind: 'happiness' }
  | null;

/**
 * Click-to-inspect panel: floors (renamable, occupant list, business grade),
 * residents (job, happiness, traits), locked tower slots (purchase), and the
 * missions checklist.
 */
export class Inspector {
  private selection: Selection = null;
  private lastRender = '';
  /** Zone the player has tentatively selected in the lot-purchase picker. */
  private zoneChoice: ZoneType = 'mixed';

  constructor(
    private readonly root: HTMLElement,
    private readonly getTown: () => Town,
    private readonly onChanged: () => void,
    /** When visiting a friend's town, hide all mutating controls. */
    private readonly readOnly = false,
  ) {
    root.classList.add('inspector');
  }

  select(selection: Selection): void {
    this.selection = selection;
    this.lastRender = '';
    if (selection?.kind === 'slot') this.zoneChoice = 'mixed';
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
      // Show the goals you're still chasing first; completed ones sink down.
      const ordered = [...MISSION_DEFS].sort(
        (a, b) =>
          Number(town.missions.completed.has(a.id)) - Number(town.missions.completed.has(b.id)),
      );
      const rows = ordered
        .map((def) => {
          const done = town.missions.completed.has(def.id);
          return `<div class="insp-row ${done ? 'mission-done' : ''}">
          ${done ? '✅' : '⬜'} <b>${escapeHtml(def.label)}</b> · +${def.reward}
          <div class="mission-desc">${escapeHtml(def.description)}</div>
        </div>`;
        })
        .join('');
      return `
        <button class="insp-close" id="insp-close">×</button>
        <div class="insp-title">Missions</div>
        <div class="insp-sub">${town.missions.completedCount}/${MISSION_DEFS.length} complete</div>
        ${rows}`;
    }

    if (sel.kind === 'activity') {
      const recent = town.activityLog.slice(-40).reverse();
      const rows =
        recent.length > 0
          ? recent
              .map(
                (e) =>
                  `<div class="insp-row">${eventIcon(e.kind)} ${escapeHtml(e.message)}</div>`,
              )
              .join('')
          : `<div class="insp-row insp-empty">Nothing has happened yet</div>`;
      return `
        <button class="insp-close" id="insp-close">×</button>
        <div class="insp-title">Activity</div>
        <div class="insp-sub">Recent goings-on around town</div>
        ${rows}`;
    }

    if (sel.kind === 'happiness') {
      const b = happinessBreakdown(town);
      if (b.residentCount === 0) {
        return `
          <button class="insp-close" id="insp-close">×</button>
          <div class="insp-title">Happiness</div>
          <div class="insp-sub">No residents yet</div>
          <div class="insp-row insp-empty">Build apartments to attract residents</div>`;
      }
      const needBars = b.needs
        .map((n) => bar(n.label, n.value, n.value >= 60 ? '#6fae3d' : n.value >= 35 ? '#c9a227' : '#c94f4f'))
        .join('');
      const penaltyRows = b.penalties
        .filter((p) => p.value > 0.05)
        .map(
          (p) =>
            `<div class="insp-row">⚠️ ${escapeHtml(p.label)}: <b class="grade-F">−${p.value.toFixed(0)}</b></div>`,
        )
        .join('');
      const vibrancyRow =
        Math.abs(b.vibrancy) >= 0.05
          ? `<div class="insp-row">${b.vibrancy >= 0 ? '✨' : '🥀'} Business vibrancy: <b class="${b.vibrancy >= 0 ? 'grade-A' : 'grade-F'}">${b.vibrancy >= 0 ? '+' : ''}${b.vibrancy.toFixed(0)}</b></div>`
          : '';
      const cityMoodRow =
        Math.abs(b.cityMood) >= 0.5
          ? `<div class="insp-row">${b.cityMood >= 0 ? '🎉' : '📉'} City events: <b class="${b.cityMood >= 0 ? 'grade-A' : 'grade-F'}">${b.cityMood >= 0 ? '+' : ''}${b.cityMood.toFixed(0)}</b></div>`
          : '';
      // Rank every drag — needs (weighted deficit) and environment penalties —
      // on the same "happiness points lost" scale, so the advice points at
      // whatever actually hurts most (e.g. lift queues, not a lowish need).
      const w = HAPPINESS.weights;
      const need = (label: string) => b.needs.find((n) => n.value !== undefined && n.label === label)?.value ?? 100;
      const pen = (label: string) => b.penalties.find((p) => p.label === label)?.value ?? 0;
      const drags = [
        { label: 'Housing', loss: w.housing * (100 - need('Housing')) },
        { label: 'Employment', loss: w.employment * (100 - need('Employment')) },
        { label: 'Food', loss: w.food * (100 - need('Food')) },
        { label: 'Entertainment', loss: w.entertainment * (100 - need('Entertainment')) },
        { label: 'Lift queues', loss: pen('Lift queues') },
        { label: 'Long commutes', loss: pen('Long commutes') },
      ];
      const worst = drags.reduce((a, c) => (c.loss > a.loss ? c : a));
      return `
        <button class="insp-close" id="insp-close">×</button>
        <div class="insp-title">Happiness ${Math.round(b.average)}/100</div>
        <div class="insp-sub">Averaged across ${b.residentCount} resident${b.residentCount === 1 ? '' : 's'}</div>
        <div class="insp-section">Needs (higher is better)</div>
        ${needBars}
        ${penaltyRows || vibrancyRow || cityMoodRow ? '<div class="insp-section">Environment</div>' : ''}
        ${vibrancyRow}
        ${cityMoodRow}
        ${penaltyRows || '<div class="insp-row insp-empty">No lift or commute strain</div>'}
        <div class="insp-section">Biggest drag</div>
        <div class="insp-row">${worst.loss < 4 ? '😊 Everyone is pretty content' : `<b>${escapeHtml(worst.label)}</b> — ${dragHint(worst.label)}`}</div>`;
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
          )}
          ${this.readOnly ? '' : this.businessActions(town, sel.towerId, sel.level)}`;
      }

      const rename =
        floor.type === 'lobby' || this.readOnly
          ? `<div class="insp-title">${escapeHtml(floor.name)}</div>`
          : `<input id="insp-rename" maxlength="${MAX_FLOOR_NAME_LENGTH}" value="${escapeHtml(floor.name)}" />`;

      const zoneCfg = ZONE_CONFIGS[game.zone];
      const zoneNote = game.zone === 'mixed' ? '' : ` · ${zoneCfg.badge} ${zoneCfg.label}`;
      return `
        <button class="insp-close" id="insp-close">×</button>
        ${rename}
        <div class="insp-sub">${floorTypeLabel(floor.type)} · Floor ${sel.level}${zoneNote}</div>
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

    // Slot panel: an unlocked park shows read-only info; a locked lot shows the
    // zone picker + purchase.
    const slot = town.slots[sel.index];
    if (!slot) return null;
    if (slot.unlocked) {
      if (slot.game) return null; // a real tower — focus handles it, not this panel
      const cfg = ZONE_CONFIGS[slot.zone];
      return `
        <button class="insp-close" id="insp-close">×</button>
        <div class="insp-title">${cfg.badge} ${escapeHtml(cfg.label)}</div>
        <div class="insp-sub">Open space</div>
        <div class="insp-row">${escapeHtml(cfg.description)}</div>
        <div class="insp-row">🌳 Lifts the mood of residents in nearby towers.</div>`;
    }

    // Visiting a friend's town: a locked lot is just empty land, no purchase.
    if (this.readOnly) {
      return `
        <button class="insp-close" id="insp-close">×</button>
        <div class="insp-title">Empty lot</div>
        <div class="insp-sub">Undeveloped land</div>`;
    }

    const chosen = ZONE_CONFIGS[this.zoneChoice];
    const zoneRows = SELECTABLE_ZONES.map((z) => {
      const zc = ZONE_CONFIGS[z];
      const cost = town.slotCost(sel.index, z);
      const active = z === this.zoneChoice;
      return `<button class="build-btn zone-opt${active ? ' active' : ''}" data-zone="${z}">
          ${zc.badge} ${escapeHtml(zc.label)}<span class="cost">${cost} coins</span>
        </button>`;
    }).join('');
    const check = town.canUnlockSlot(sel.index, this.zoneChoice);
    const cost = town.slotCost(sel.index, this.zoneChoice);
    return `
      <button class="insp-close" id="insp-close">×</button>
      <div class="insp-title">Empty lot</div>
      <div class="insp-sub">Zone it, then build to code</div>
      <div class="insp-row">Requires ${TOWN.slotUnlockPop[sel.index]} town residents</div>
      <div class="insp-section">Choose a zone</div>
      <div class="zone-list">${zoneRows}</div>
      <div class="insp-row insp-empty">${escapeHtml(chosen.description)}</div>
      <button class="build-btn insp-buy" id="insp-buy" ${check.ok ? '' : 'disabled'}>
        ${check.ok ? `${chosen.badge} Zone as ${escapeHtml(chosen.label)} · ${cost}` : (check.reason ?? 'Locked')}
      </button>`;
  }

  /** Renovate (quality) + Promote (career) actions for a business floor. */
  private businessActions(town: Town, towerId: string, level: number): string {
    const game = town.towerById(towerId);
    if (!game) return '';
    const rOk = game.canRenovate(level);
    const rCost = game.renovateCost(level);
    const pOk = town.canPromoteAt(towerId, level);
    const pCost = town.promoteCostAt(towerId, level);
    return `
      <div class="insp-section">Manage</div>
      <div class="insp-actions">
        <button class="build-btn insp-act" id="insp-renovate" ${rOk.ok ? '' : 'disabled'}>
          ✨ Renovate<span class="cost">${rOk.ok ? `+${BUSINESS.renovateBoost} qual · ${rCost}c` : escapeHtml(rOk.reason ?? '')}</span>
        </button>
        <button class="build-btn insp-act" id="insp-promote" ${pOk.ok ? '' : 'disabled'}>
          ⬆️ Promote<span class="cost">${pOk.ok ? `${pCost}c` : escapeHtml(pOk.reason ?? '')}</span>
        </button>
      </div>`;
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

    if (this.selection?.kind === 'floor') {
      const sel = this.selection;
      document.getElementById('insp-renovate')?.addEventListener('click', () => {
        if (this.getTown().towerById(sel.towerId)?.renovate(sel.level)) {
          this.onChanged();
          this.refresh(true);
        }
      });
      document.getElementById('insp-promote')?.addEventListener('click', () => {
        if (this.getTown().promoteAt(sel.towerId, sel.level)) {
          this.onChanged();
          this.refresh(true);
        }
      });
    }

    if (this.selection?.kind === 'slot') {
      const index = this.selection.index;
      for (const opt of Array.from(this.root.querySelectorAll('.zone-opt'))) {
        opt.addEventListener('click', () => {
          const zone = (opt as HTMLElement).dataset.zone as ZoneType | undefined;
          if (zone) {
            this.zoneChoice = zone;
            this.lastRender = '';
            this.refresh(true);
          }
        });
      }
      const buy = document.getElementById('insp-buy');
      buy?.addEventListener('click', () => {
        if (this.getTown().unlockSlot(index, this.zoneChoice)) {
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

/** A labelled horizontal meter, value 0-100. */
function bar(label: string, value: number, color: string): string {
  const pct = Math.max(0, Math.min(100, value));
  return `<div class="insp-bar-row">
      <span class="insp-bar-label">${escapeHtml(label)}</span>
      <span class="insp-bar-track"><span class="insp-bar-fill" style="width:${pct}%;background:${color}"></span></span>
      <span class="insp-bar-val">${Math.round(pct)}</span>
    </div>`;
}

function eventIcon(kind: GameEventKind): string {
  switch (kind) {
    case 'visit':
      return '🛍️';
    case 'move-in':
      return '🎉';
    case 'move-out':
      return '📦';
    case 'hire':
      return '🧑‍💼';
    case 'promotion':
      return '⬆️';
    case 'job-switch':
      return '🔀';
    case 'build':
      return '🏗️';
    case 'mission':
      return '🎯';
    case 'event':
      return '🎪';
  }
}

function dragHint(label: string): string {
  switch (label) {
    case 'Housing':
      return 'apartments are crowded; build more residential floors';
    case 'Employment':
      return 'people lack good jobs; add shops, offices, or factories';
    case 'Food':
      return 'not enough places to eat; build restaurants';
    case 'Entertainment':
      return 'nothing to do; add shops and bars';
    case 'Lift queues':
      return 'a tower can outgrow its lifts. Add a 2nd shaft and max lift speed first; if it’s still jammed the tower is simply too dense — spread residents across more towers, or zone a lot Transit-Oriented (its lifts carry far more people)';
    case 'Long commutes':
      return 'jobs are too far from homes; build workplaces closer, or zone a lot Transit-Oriented for a gentler commute';
    default:
      return 'invest here to lift the town’s mood';
  }
}
