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
import { assignedStaff, businessCustomerPhase, businessGrade, isJobFloorType, subtypeProfile } from '../core/business';
import { worstFactor, happinessBreakdown, residentTravelPressure } from '../core/happiness';
import { isToastWorthy, type GameEvent, type GameEventKind } from '../core/game';
import { missionPanel } from './missionPanel';
import { milestoneWallPanel } from './milestoneWall';
import { residentThought, residentConcern, traitDescription, findStoryPlace } from '../core/stories';
import { residentPortrait, storyRow } from './storyViews';
import { transitPanel } from './transitPanel';
import { skylinePanel } from './skylinePanel';
import { ARCHITECTURES, Architecture } from '../core/identity';
import { neighborhoodPanel, neighborhoodProgress } from './neighborhoodPanel';
import { VARIANT_LABELS } from '../core/neighborhood';
import { residentPet } from '../core/roomLife';
import { landmarkPanel } from './landmarkPanel';
import { buildLandmark, isLandmarkKind, LANDMARKS } from '../core/landmarks';

export type Selection =
  | { kind: 'floor'; towerId: string; level: number }
  | { kind: 'transit'; towerId: string }
  | { kind: 'resident'; residentId: string }
  | { kind: 'slot'; index: number }
  | { kind: 'missions'; missionId?: string }
  | { kind: 'activity' }
  | { kind: 'journal' }
  | { kind: 'town' }
  | { kind: 'neighborhood' }
  | { kind: 'landmarks'; towerId: string }
  | { kind: 'happiness' }
  | null;

/**
 * Click-to-inspect panel: floors (renamable, occupant list, business grade),
 * residents (job, happiness, traits), locked tower slots (purchase), and the
 * missions checklist.
 */
export class Inspector {
  private selection: Selection = null;
  private residentOrigin: { kind: 'floor'; towerId: string; level: number } | null = null;
  private helpContext: { town: Town; residentId: string; happiness: number; unhappyDays: number } | null = null;
  private lastRender = '';
  /** Zone the player has tentatively selected in the lot-purchase picker. */
  private zoneChoice: ZoneType = 'mixed';

  constructor(
    private readonly root: HTMLElement,
    private readonly getTown: () => Town,
    private readonly onChanged: () => void,
    /** When visiting a friend's town, hide all mutating controls. */
    private readonly readOnly = false,
    private readonly onPostcard: () => void = () => {},
    private readonly onFocusTower: (id: string, level?: number) => void = () => {},
    private readonly onExploreRoom: (id: string, level: number) => void = () => {},
  ) {
    root.classList.add('inspector');
  }

  select(selection: Selection, helping?: Resident): void {
    this.helpContext = helping ? { town: this.getTown(), residentId: helping.id,
      happiness: helping.happiness, unhappyDays: helping.unhappyDays } : null;
    if (selection?.kind !== 'resident') this.residentOrigin = null;
    this.selection = selection;
    this.root.scrollTop = 0;
    this.lastRender = '';
    if (selection?.kind === 'slot') this.zoneChoice = 'mixed';
    this.refresh(true);
    if (selection?.kind === 'transit' && this.selection) {
      this.root.tabIndex = -1; this.root.focus({ preventScroll: true });
    }
  }

  get current(): Selection {
    return this.selection;
  }

  /** Preserve focused controls and open neighborhood sessions during live updates. */
  refresh(force = false): void {
    if (!this.selection) {
      this.root.style.display = 'none';
      return;
    }
    this.updateNeighborhoodProgress();
    if (!force && this.selection.kind === 'neighborhood') {
      // The open panel is a stable reading/interaction session. New cards,
      // outcomes and studio choices are applied only on an explicit action.
      const notice = this.root.querySelector<HTMLButtonElement>('[data-neighborhood-refresh]');
      const changed = this.render() !== this.lastRender;
      if (notice) {
        notice.disabled = !changed;
        notice.textContent = changed ? 'Updated details · refresh' : 'Happenings up to date';
      }
      return;
    }
    if (!force && document.activeElement !== this.root && this.root.contains(document.activeElement)) return;

    let html = this.render();
    if (html === null) {
      this.select(null);
      return;
    }
    if (this.helpContext) {
      // Keep the sticky close control first: prepending the context would push
      // the exit below it, especially far down a phone's inspector sheet.
      const ribbon = this.helpRibbon();
      html = html.replace(/(<button[^>]*id="insp-close"[^>]*>×<\/button>)/,
        close => close + ribbon);
    }
    this.root.style.display = 'block';
    if (html !== this.lastRender) {
      const scrollTop = this.root.scrollTop;
      this.lastRender = html;
      this.root.innerHTML = html;
      this.bind();
      this.root.scrollTop = scrollTop;
      this.updateNeighborhoodProgress();
    }
  }

  /** A reading-session breadcrumb, never a saved reward or a promised recovery. */
  private helpRibbon(): string {
    const context = this.helpContext, town = this.getTown();
    if (!context || town !== context.town) { this.helpContext = null; return ''; }
    const resident = town.allResidents().find(r => r.id === context.residentId);
    if (!resident) return '<p class="resident-help-context">This neighbor is no longer in town. Their recorded chapter remains in the town journal.</p>';
    const oldMood = Math.round(context.happiness), mood = Math.round(resident.happiness);
    const change = oldMood === mood ? `Happiness ${mood}/100 · daily review` :
      `Happiness ${oldMood} → ${mood}/100 since opening this concern`;
    const recovery = context.unhappyDays > 0 && resident.unhappyDays === 0 && resident.happiness >= HAPPINESS.moveOutThreshold
      ? 'Their move-out countdown has cleared at the daily review.' :
      resident.unhappyDays > 0 ? `${Math.max(0, HAPPINESS.moveOutAfterDays - resident.unhappyDays)} more unhappy days before they may leave. Mood is reviewed at day’s end.` :
      'Changes to daily happiness are reviewed at day’s end, not when you buy an upgrade.';
    return `<section class="resident-help-context" aria-label="Helping ${escapeHtml(resident.name)}">
      <small>HELPING A NEIGHBOR</small><strong>${escapeHtml(resident.name)}</strong>
      <p>${change}. ${recovery}</p>
      <button type="button" class="build-btn" data-help-back="${escapeHtml(resident.id)}">← Back to ${escapeHtml(resident.name)}</button></section>`;
  }

  private updateNeighborhoodProgress(): void {
    if (this.selection?.kind !== 'neighborhood') return;
    const town = this.getTown();
    for (const line of this.root.querySelectorAll<HTMLElement>('[data-event-progress]')) {
      const event = town.neighborhood.events.find((e) => e.id === line.dataset.eventProgress);
      line.textContent = event ? neighborhoodProgress(town, event) : 'Archived · refresh for current happenings';
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-event-accept]')) {
      const id = button.dataset.eventAccept!;
      const select = [...this.root.querySelectorAll<HTMLSelectElement>('[data-studio]')].find((s) => s.dataset.studio === id);
      const value = select?.value.split(':');
      const check = town.neighborhood.canRespond(town, id, value ? { towerId: value[0], level: Number(value[1]) } : undefined);
      button.disabled = !check.ok;
      button.title = check.reason ?? '';
      const line = [...this.root.querySelectorAll<HTMLElement>('[data-event-requirement]')].find((p) => p.dataset.eventRequirement === id);
      if (line) { line.textContent = check.ok ? 'Ready when you are.' : check.reason ?? ''; line.title = line.textContent; }
    }
  }

  private render(): string | null {
    const town = this.getTown();
    const sel = this.selection;
    if (!sel) return null;
    if (sel.kind === 'town') return skylinePanel(town, this.readOnly);
    if (sel.kind === 'neighborhood') return neighborhoodPanel(town, this.readOnly);
    if (sel.kind === 'landmarks') return landmarkPanel(town, sel.towerId, this.readOnly);
    if (sel.kind === 'transit') {
      const game = town.towerById(sel.towerId);
      return game ? `<button class="insp-close" id="insp-close" aria-label="Close lift flow">×</button>
        <div class="insp-title">Lift flow</div><div class="insp-sub">${escapeHtml(game.name)}</div>
        ${transitPanel(game, town.time, this.readOnly)}` : null;
    }

    if (sel.kind === 'journal') {
      const residents = town.allResidents();
      const activeIds = new Set(residents.map((r) => r.id));
      const neighbors = [...residents].sort((a, b) => b.unhappyDays - a.unhappyDays || a.name.localeCompare(b.name));
      return `<button class="insp-close" id="insp-close" aria-label="Close journal">×</button>
        <div class="journal-eyebrow">THE PEOPLE MAKE THE PLACE</div>
        <div class="insp-title">Town journal</div><div class="insp-sub">${residents.length} neighbors · Day ${town.day}</div>
        <button class="build-btn" id="neighborhood-open">Neighborhood happenings · ${town.neighborhood.pending().length}</button>
        <div class="insp-section">Around the block</div>
        ${town.stories.journal.length ? town.stories.journal.slice(-20).reverse().map((s) => storyRow(s, activeIds, town)).join('') : '<p class="journal-empty">Every town begins with an empty room. Build apartments and watch the first stories unfold.</p>'}
        <div class="insp-section">Meet your neighbors</div>
        <div class="neighbor-directory">${neighbors.map((r) => `<button class="neighbor-card" data-resident="${escapeHtml(r.id)}">${residentPortrait(r)}<span><strong>${escapeHtml(r.name)}</strong><small>${r.unhappyDays > 0 ? 'Thinking of leaving' : escapeHtml(r.traits.join(' · '))}</small><small>${escapeHtml(town.towerById(r.homeTowerId)?.name ?? 'Home')} · Floor ${r.homeFloor}</small></span></button>`).join('')}</div>`;
    }

    if (sel.kind === 'missions') {
      return missionPanel(town, sel.missionId);
    }

    if (sel.kind === 'activity') {
      // Keep personal changes and milestones ahead of routine sales.
      const highlights = town.activityLog.filter(e => isToastWorthy(e.kind)).slice(-40).reverse();
      const routine = town.activityLog.filter(e => !isToastWorthy(e.kind)).slice(-20).reverse();
      const rows = (events: GameEvent[]) => events.map(e => {
        const icon = eventIcon(e.kind);
        return `<div class="insp-row">${e.message.startsWith(icon) ? '' : `${icon} `}${escapeHtml(e.message)}</div>`;
      }).join('');
      return `
        <button class="insp-close" id="insp-close" aria-label="Close activity">×</button>
        <div class="insp-title">Activity</div>
        <div class="insp-sub">Recent goings-on · this visit to your town. Earned milestones remain in Missions.</div>
        ${highlights.length ? `<div class="insp-section">Town highlights</div>${rows(highlights)}` : '<p class="insp-empty">No recent town highlights</p>'}
        ${routine.length ? `<details class="activity-routine"><summary>Daily life · ${routine.length} recent updates</summary>${rows(routine)}</details>` : ''}`;
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
        <p class="journal-empty">Happiness is reviewed at day’s end. Needs are the latest recorded values; travel pressures below use current queues and zoning.</p>
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
      if (floor.type === 'lobby') {
        const hosts = town.allResidents()
          .filter((r) => r.homeTowerId === game.id && r.townRole)
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        body = `${this.readOnly ? '' : `<label class="identity-label">Tower name<input id="tower-name" maxlength="32" value="${escapeHtml(game.name)}" /></label>
          <label class="identity-label">Architecture<select id="tower-style">${(Object.keys(ARCHITECTURES) as Architecture[]).map((style) => `<option value="${style}" ${game.architecture === style ? 'selected' : ''} ${town.identity.unlocked.has(style) ? '' : 'disabled'}>${ARCHITECTURES[style]}${town.identity.unlocked.has(style) ? '' : style === 'modern' ? ' · 20 residents' : ' · open a park'}</option>`).join('')}</select></label>`}
          ${game === town.towers()[0] ? milestoneWallPanel(town) : ''}
          <button class="build-btn" data-landmarks-open="${escapeHtml(game.id)}">◇ Plan a landmark</button>
          ${hosts.length ? `<section aria-label="Neighborhood hosts">
            <h3 class="insp-section">Meet your neighborhood hosts</h3>
            <p class="journal-empty">Their named benches welcome neighbors outside this tower. Together they provide +2 community mood while a host lives here; this bonus does not stack.</p>
            ${hosts.map((r) => `<button class="neighbor-card host-card" data-resident="${escapeHtml(r.id)}">
              ${residentPortrait(r)}<span><strong>${escapeHtml(r.name)}</strong><small>Neighborhood host · meet this neighbor</small></span>
            </button>`).join('')}
          </section>` : ''}
          ${transitPanel(game, town.time, this.readOnly)}`;
      } else if (floor.type === 'residential') {
        const homes = town
          .allResidents()
          .filter((r) => r.homeTowerId === sel.towerId && r.homeFloor === sel.level);
        body = residentRosterSection(
          `Residents (${homes.length}/${FLOOR_CONFIG.residential.homes})`,
          homes, (r) => `Lives here · ${statusLine(r)}`,
          'No one lives here yet',
        );
      } else if (floor.type === 'landmark') {
        const people = game.residents.filter((r) => r.state.kind === 'idle' && r.state.floor === floor.level && r.state.activity.kind === 'leisure');
        body = `<p class="resident-description">${LANDMARKS[floor.landmark ?? 'gallery'].description}</p>
          <div class="signature-label">◇ Public landmark · free admission</div>
          <p class="insp-row">${floor.visitsToday} visits today · ${floor.landmarkVisits ?? 0} lifetime visits · ${floor.missedVisitsToday ?? 0} lost to lift queues</p>
          <p class="journal-empty">A successful visit restores 25 entertainment and counts toward daily leisure. No admission income, jobs or upkeep. Neighbors living or working in this tower can visit after work.</p>
          ${residentRosterSection('Here now', people, () => 'Visiting this landmark', 'Waiting for the neighborhood to arrive')}`;
      } else if (isJobFloorType(floor.type)) {
        const staff = assignedStaff(town.allResidents(), sel.towerId, sel.level);
        const open = game.staffedLevels.has(sel.level);
        const { grade } = businessGrade(floor, staff.length);
        const profile = subtypeProfile(floor);
        const net = Math.round(floor.revenueToday - floor.expensesToday);
        const customersHere = game.residents.filter(r => businessCustomerPhase(r, floor) === 'here');
        const customersComing = game.residents.filter(r => businessCustomerPhase(r, floor) === 'on-way');
        const customerFlow = floor.type === 'shop' || floor.type === 'restaurant' ? `
          ${residentRosterSection(`Neighbors here (${customersHere.length})`, customersHere,
            () => floor.type === 'shop' ? 'Shopping here' : 'Dining here',
            open ? 'No neighbors visiting right now' : 'Customers need a staffed business', 6)}
          ${customersComing.length ? residentRosterSection(`On their way (${customersComing.length})`, customersComing,
            r => `${statusLine(r)} · not yet a visit`, '', 6) : ''}` : '';
        body = `
          <div class="insp-row">${open ? '🟢 Open' : '⚫ Closed — no staff'} · Grade <b class="grade-${grade}">${grade}</b></div>
          <div class="insp-row">${profile ? escapeHtml(profile.label) : ''} · Quality ${Math.round(floor.quality)}/100</div>
          ${floor.signature ? `<div class="signature-label">★ Signature business${floor.type === 'shop' || floor.type === 'restaurant' ? ' · +15% visitor takings' : ''}</div>` : ''}
          <div class="insp-row">Today: +${Math.round(floor.revenueToday)} / −${Math.round(floor.expensesToday)} (net ${net >= 0 ? '+' : ''}${net})</div>
          <div class="insp-row">${floor.visitsToday} ${floor.visitsToday === 1 ? 'visit' : 'visits'} · ${floor.missedVisitsToday ?? 0} lost to lift queues</div>
          ${customerFlow}
          ${residentRosterSection(
            `Staff (${staff.length}/${FLOOR_CONFIG[floor.type].jobs})`,
            staff, (r) => `${jobTitle(r, floor) ?? 'Worker'} · ${statusLine(r)}`,
            'No staff yet — closed',
          )}
          ${this.readOnly ? '' : this.businessActions(town, sel.towerId, sel.level)}`;
      }

      const rename =
        floor.type === 'lobby' || this.readOnly
          ? `<div class="insp-title">${escapeHtml(floor.type === 'lobby' ? game.name : floor.name)}</div>`
          : `<input id="insp-rename" maxlength="${MAX_FLOOR_NAME_LENGTH}" value="${escapeHtml(floor.name)}" />`;

      const zoneCfg = ZONE_CONFIGS[game.zone];
      const zoneNote = game.zone === 'mixed' ? '' : ` · ${zoneCfg.badge} ${zoneCfg.label}`;
      return `
        <button class="insp-close" id="insp-close">×</button>
        ${rename}
        <div class="insp-sub">${floorTypeLabel(floor.type)} · Floor ${sel.level}${zoneNote}</div>
        <button class="build-btn" data-explore-room="${sel.level}" data-explore-tower="${escapeHtml(game.id)}">Explore this room ↗</button>
        ${floor.variant ? `<p class="signature-label">${escapeHtml(VARIANT_LABELS[floor.variant] ?? '')}</p>` : ''}
        ${body}`;
    }

    if (sel.kind === 'resident') {
      const visitor = town.towers().flatMap((g) => g.visitors).find((v) => v.id === sel.residentId);
      if (visitor) return `<button class="insp-close" id="insp-close">×</button><div class="journal-eyebrow">A GUEST IN TOWN</div>
        <div class="resident-heading">${residentPortrait(visitor)}<div class="insp-title">${escapeHtml(visitor.name)}</div></div>
        <p class="resident-description">${escapeHtml(statusLine(visitor))}. ${visitor.visit.credited ? 'Their visit has been counted. They are heading home after their stop.' : 'They will spend only when they reach an open business.'}</p>
        <button class="build-btn" id="neighborhood-open">Neighborhood happenings</button>`;
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
      const pet = residentPet(resident);
      const concern = residentConcern(town, resident);
      const travel = residentTravelPressure(resident, homeGame ?? undefined, jobGame ?? undefined);
      const moodIcon = mood >= 70 ? '😊' : mood >= 40 ? '😐' : '😟';
      const origin = this.residentOrigin;
      const originFloor = origin && town.towerById(origin.towerId)?.tower.floors[origin.level];

      return `
        <button class="insp-close" id="insp-close">×</button>
        ${originFloor ? `<button class="build-btn resident-back" data-resident-back="true">← Back to ${escapeHtml(originFloor.name)}</button>` : ''}
        <div class="resident-heading">${residentPortrait(resident)}<div><div class="journal-eyebrow">YOUR NEIGHBOR</div><div class="insp-title">${escapeHtml(resident.name)}</div></div></div>
        <div class="insp-sub">${statusLine(resident)}</div>
        ${resident.townRole ? `<div class="signature-label">${escapeHtml(resident.townRole)} · shared +2 community mood for their home tower (does not stack)</div>
          <button class="build-btn" data-tower="${escapeHtml(resident.homeTowerId)}">Meet the hosts of ${escapeHtml(homeGame?.name ?? 'this tower')}</button>` : ''}
        <p class="resident-description">${escapeHtml(traitDescription(resident))}</p>
        <blockquote class="resident-thought">“${escapeHtml(residentThought(town, resident))}”</blockquote>
        ${concern ? `<button class="build-btn" data-resident-help="${escapeHtml(resident.id)}">${escapeHtml(concern.label)} ↗</button>` : ''}
        ${concern?.detail ? `<p class="journal-empty">${escapeHtml(concern.detail)}</p>` : ''}
        <div class="insp-row">${moodIcon} Happiness ${mood}/100 · daily review${mood < 70 ? ` · strongest current pressure: ${worstFactor(resident, travel.waitPenalty, travel.commutePenalty)}` : ''}</div>
        <section aria-label="${escapeHtml(resident.name)}’s individual needs"><h3 class="insp-section">Their needs · out of 100</h3>
          ${(['housing', 'employment', 'food', 'entertainment'] as const).map(key => bar(key[0].toUpperCase() + key.slice(1), resident.needs[key], resident.needs[key] >= 60 ? '#6fae3d' : resident.needs[key] >= 35 ? '#c9a227' : '#c94f4f')).join('')}
          <p class="journal-empty">These are this neighbor’s recorded needs, not town averages. Daily reviews update needs and mood; a completed landmark visit can restore leisure sooner.</p></section>
        <div class="insp-row">✨ ${resident.traits.map(escapeHtml).join(', ') || 'no particular tastes'}</div>
        <div class="insp-row">🏠 ${escapeHtml(homeFloor?.name ?? 'Homeless')}</div>
        ${pet ? `<div class="insp-row">🐈 Lives with ${escapeHtml(pet.name)}, their cat. Look for them on the apartment windowsill.</div>` : ''}
        <div class="insp-row">${
          title && jobFloor
            ? `💼 ${escapeHtml(title)} at ${escapeHtml(jobFloor.name)} · day ${tenure}${commutes ? ' · commutes 🚶' : ''}`
            : '💼 Looking for work'
        }</div>
        ${this.residentLife(town, resident)}`;
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
  private residentLife(town: Town, resident: Resident): string {
    const life = town.stories.people[resident.id];
    if (!life) return '';
    const residents = town.allResidents();
    const friends = life.friends.filter((f) => f.daysTogether >= 3)
      .map((f) => residents.find((r) => r.id === f.residentId)).filter((r): r is Resident => !!r);
    return `${life.arrivalDay !== null ? `<div class="insp-row">Made this town home on day ${life.arrivalDay}</div>` : ''}
      <div class="insp-section">Familiar faces</div>
      ${friends.length ? friends.map((r) => `<button class="neighbor-card" data-resident="${escapeHtml(r.id)}">${residentPortrait(r)}<span><strong>${escapeHtml(r.name)}</strong><small>Friend · shared days around town</small></span></button>`).join('') : '<p class="journal-empty">Friendships grow after meeting at work, meals or shops on three different days.</p>'}
      <div class="insp-section">Their story so far</div>
      ${life.memories.length ? life.memories.slice().reverse().map((s) => storyRow(s, new Set(), town)).join('') : '<p class="journal-empty">Their next chapter is still being written.</p>'}`;
  }

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
    const storySelection = this.selection, storyTown = this.getTown();
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-story-place]')) button.addEventListener('click', () => {
      if (this.selection !== storySelection || this.getTown() !== storyTown) return;
      const target = findStoryPlace(storyTown, Number(button.dataset.storyPlace));
      if (!target) { this.refresh(true); return; }
      if (target.kind === 'floor') this.onFocusTower(target.towerId, target.level);
      else this.onFocusTower(storyTown.slots[target.index].id);
      this.select(target);
      this.root.tabIndex = -1; this.root.focus({ preventScroll: true });
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-resident-help]')) button.addEventListener('click', () => {
      if (this.selection !== storySelection || this.getTown() !== storyTown) return;
      const town = this.getTown(), resident = town.allResidents().find((r) => r.id === button.dataset.residentHelp);
      const concern = resident && residentConcern(town, resident);
      // Needs, jobs and the resident themselves may have changed since rendering.
      if (!concern) { this.refresh(true); return; }
      if (concern.target.kind === 'floor') this.onFocusTower(concern.target.towerId, concern.target.level);
      else if (concern.target.kind === 'transit') this.onFocusTower(concern.target.towerId, 0);
      this.select(concern.target, resident);
      this.root.tabIndex = -1; this.root.focus({ preventScroll: true });
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-help-back]')) button.addEventListener('click', () => {
      if (this.selection !== storySelection || this.getTown() !== storyTown || this.helpContext?.residentId !== button.dataset.helpBack) return;
      const resident = storyTown.allResidents().find(r => r.id === button.dataset.helpBack);
      if (!resident) { this.refresh(true); return; }
      this.select({ kind: 'resident', residentId: resident.id });
      this.root.tabIndex = -1; this.root.focus({ preventScroll: true });
    });
    this.root.querySelector('[data-neighborhood-refresh]')?.addEventListener('click', () => {
      this.root.scrollTop = 0;
      this.refresh(true);
      // Keep keyboard focus inside the freshly rendered panel.
      this.root.tabIndex = -1;
      this.root.focus({ preventScroll: true });
    });
    for (const select of this.root.querySelectorAll<HTMLSelectElement>('[data-studio]')) {
      select.addEventListener('change', () => this.updateNeighborhoodProgress());
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-landmarks-open]')) button.addEventListener('click', () => {
      this.select({ kind: 'landmarks', towerId: button.dataset.landmarksOpen! });
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-explore-room]')) button.addEventListener('click', () => {
      const id = button.dataset.exploreTower!, level = Number(button.dataset.exploreRoom);
      if (!this.getTown().towerById(id)?.tower.floors[level]) return;
      this.select(null); this.onExploreRoom(id, level);
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-landmark-floor]')) button.addEventListener('click', () => {
      const id = button.dataset.landmarkTower!, level = Number(button.dataset.landmarkFloor);
      this.onFocusTower(id, level); this.select({ kind: 'floor', towerId: id, level });
    });
    if (!this.readOnly) for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-build-landmark]')) button.addEventListener('click', () => {
      const kind = button.dataset.buildLandmark, id = button.dataset.landmarkTower!;
      if (isLandmarkKind(kind) && buildLandmark(this.getTown(), id, kind)) {
        const level = this.getTown().towerById(id)!.tower.height - 1;
        this.onChanged(); this.onFocusTower(id, level); this.select({ kind: 'floor', towerId: id, level });
      } else this.refresh(true);
    });
    this.root.querySelector('#neighborhood-open')?.addEventListener('click', () => this.select({ kind: 'neighborhood' }));
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-event-location]')) button.addEventListener('click', () => {
      const event = this.getTown().neighborhood.events.find((e) => e.id === button.dataset.eventLocation);
      if (!event) return;
      if (button.dataset.eventStudio && event.studio) {
        const { towerId, level } = event.studio;
        if (this.getTown().towerById(towerId)?.tower.floors[level]?.variant !== 'innovation-hub') return;
        this.onFocusTower(towerId, level);
        this.select({ kind: 'floor', towerId, level });
        return;
      }
      this.onFocusTower(event.towerId, event.level);
      this.select(event.parkIndex !== undefined && event.kind === 'band' ? { kind: 'slot', index: event.parkIndex } : event.residentId ? { kind: 'resident', residentId: event.residentId } : { kind: 'floor', towerId: event.towerId, level: event.level ?? 0 });
    });
    if (!this.readOnly) {
      for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-event-accept]')) button.addEventListener('click', () => {
        const id = button.dataset.eventAccept!;
        const select = [...this.root.querySelectorAll<HTMLSelectElement>('[data-studio]')].find((s) => s.dataset.studio === id);
        const value = select?.value.split(':');
        const studio = value ? { towerId: value[0], level: Number(value[1]) } : undefined;
        if (this.getTown().neighborhood.respond(this.getTown(), id, studio)) this.onChanged();
        this.refresh(true);
      });
      for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-event-decline]')) button.addEventListener('click', () => {
        if (this.getTown().neighborhood.decline(this.getTown(), button.dataset.eventDecline!)) this.onChanged();
        this.refresh(true);
      });
    }
    document.getElementById('insp-close')?.addEventListener('click', () => this.select(null));
    document.getElementById('skyline-postcard')?.addEventListener('click', this.onPostcard);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-tower]')) {
      button.addEventListener('click', () => {
        this.onFocusTower(button.dataset.tower!);
        this.select({ kind: 'floor', towerId: button.dataset.tower!, level: 0 });
        this.root.tabIndex = -1;
        this.root.focus({ preventScroll: true });
      });
    }
    if (!this.readOnly) {
      const townName = this.root.querySelector<HTMLInputElement>('#town-name');
      townName?.addEventListener('change', () => { this.getTown().identity.rename(townName.value); this.onChanged(); this.refresh(true); });
      for (const input of this.root.querySelectorAll<HTMLInputElement>('[data-district]')) {
        input.addEventListener('change', () => { this.getTown().identity.renameDistrict(Number(input.dataset.district), input.value); this.onChanged(); this.refresh(true); });
      }
    }
    const rosterOrigin = this.selection?.kind === 'floor' ? this.selection : null;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-floor-resident]')) {
      button.addEventListener('click', () => {
        if (!rosterOrigin || this.selection !== rosterOrigin) return;
        const town = this.getTown(), game = town.towerById(rosterOrigin.towerId);
        const floor = game?.tower.floors[rosterOrigin.level];
        const resident = town.allResidents().find((r) => r.id === button.dataset.floorResident);
        const stillOnRoster = floor && resident && (floor.type === 'residential'
          ? resident.homeTowerId === rosterOrigin.towerId && resident.homeFloor === rosterOrigin.level
          : isJobFloorType(floor.type)
            ? (resident.jobTowerId === rosterOrigin.towerId && resident.jobFloor === rosterOrigin.level) ||
              (game!.residents.includes(resident) && businessCustomerPhase(resident, floor) !== null)
            : floor.type === 'landmark' && game!.residents.includes(resident) && resident.state.kind === 'idle'
              && resident.state.floor === floor.level && resident.state.activity.kind === 'leisure');
        if (!stillOnRoster) { this.refresh(true); return; }
        this.residentOrigin = rosterOrigin;
        // Keep the workplace/household context, including for cross-town commuters.
        this.select({ kind: 'resident', residentId: resident.id });
        this.root.tabIndex = -1; this.root.focus({ preventScroll: true });
      });
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-resident-back]')) {
      button.addEventListener('click', () => {
        const origin = this.residentOrigin;
        if (!origin) return;
        this.select(origin);
        if (!this.selection) return;
        this.onFocusTower(origin.towerId, origin.level);
        this.root.tabIndex = -1; this.root.focus({ preventScroll: true });
      });
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-resident]')) {
      button.addEventListener('click', () => {
        const resident = this.getTown().allResidents().find((r) => r.id === button.dataset.resident);
        // A neighbor can move out between rendering this card and selecting it.
        if (!resident) { this.refresh(true); return; }
        this.onFocusTower(resident.homeTowerId);
        this.select({ kind: 'resident', residentId: button.dataset.resident! });
        this.root.scrollTop = 0;
        this.root.tabIndex = -1;
        this.root.focus({ preventScroll: true });
      });
    }

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

    if (!this.readOnly && (this.selection?.kind === 'floor' || this.selection?.kind === 'transit')) {
      const sel = this.selection;
      const purchase = (kind: 'speed' | 'shaft') => {
        // Revalidate a live destination and funds; detached or stale controls
        // cannot upgrade a tower after the user has left its panel.
        if (this.selection !== sel) return;
        const game = this.getTown().towerById(sel.towerId);
        if (kind === 'speed' ? game?.upgradeSpeed() : game?.unlockSecondShaft()) this.onChanged();
        this.refresh(true);
        if (this.selection) { this.root.tabIndex = -1; this.root.focus({ preventScroll: true }); }
      };
      this.root.querySelector('#insp-lift-speed')?.addEventListener('click', () => purchase('speed'));
      this.root.querySelector('#insp-lift-shaft')?.addEventListener('click', () => purchase('shaft'));
    }

    if (this.selection?.kind === 'floor') {
      const sel = this.selection;
      if (!this.readOnly) {
        const name = this.root.querySelector<HTMLInputElement>('#tower-name');
        name?.addEventListener('change', () => { this.getTown().towerById(sel.towerId)?.rename(name.value); this.onChanged(); this.refresh(true); });
        const style = this.root.querySelector<HTMLSelectElement>('#tower-style');
        style?.addEventListener('change', () => {
          const game = this.getTown().towerById(sel.towerId);
          if (game && this.getTown().identity.unlocked.has(style.value) && Object.prototype.hasOwnProperty.call(ARCHITECTURES, style.value)) {
            game.architecture = style.value as Architecture; this.onChanged();
          }
        });
      }
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
    case 'stairs':
      return 'Taking the stairs after a long wait';
    case 'idle':
      switch (r.state.activity.kind) {
        case 'work':
          return 'At work';
        case 'eat':
          return 'Out for a meal';
        case 'shop':
          return 'Shopping';
        case 'leisure':
          return 'Enjoying a public landmark';
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

function residentRosterSection(title: string, residents: Resident[], detail: (resident: Resident) => string, empty: string, limit = Infinity): string {
  const rows = [...residents].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((r) => `<button type="button" class="neighbor-card floor-resident-card" data-floor-resident="${escapeHtml(r.id)}" aria-label="Inspect ${escapeHtml(r.name)} — ${escapeHtml(detail(r))}">
      ${residentPortrait(r)}<span><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(detail(r))}</small></span><b aria-hidden="true">↗</b>
    </button>`).join('');
  return `<section aria-label="${escapeHtml(title)}"><h3 class="insp-section">${escapeHtml(title)}</h3>${rows || `<div class="insp-row insp-empty">${escapeHtml(empty)}</div>`}${residents.length > limit ? `<p class="journal-empty">${residents.length - limit} more neighbors · explore the room to see the crowd</p>` : ''}</section>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A labelled horizontal meter, value 0-100. */
function bar(label: string, value: number, color: string): string {
  const pct = Math.max(0, Math.min(100, value));
  return `<div class="insp-bar-row">
      <span class="insp-bar-label">${escapeHtml(label)}</span>
      <span class="insp-bar-track" role="meter" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span class="insp-bar-fill" style="width:${pct}%;background:${color}"></span></span>
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
      return 'shared homes reduce housing comfort. Nearby parks and thriving local businesses can improve overall mood; new apartments welcome new neighbors, but do not relocate existing households';
    case 'Employment':
      return 'people lack good jobs; add shops, offices, or factories';
    case 'Food':
      return 'meals are being missed. Check restaurant staffing and lift access before adding another restaurant';
    case 'Entertainment':
      return 'neighbors need outings. Check access to shops, bars and public landmarks in their home or work tower';
    case 'Lift queues':
      return 'compare queue history and missed visits, then consider a second shaft or lift upgrade. If congestion remains, spread future growth across towers; Transit-Oriented zoning provides larger lifts';
    case 'Long commutes':
      return 'jobs are too far from homes; build workplaces closer, or zone a lot Transit-Oriented for a gentler commute';
    default:
      return 'invest here to lift the town’s mood';
  }
}
