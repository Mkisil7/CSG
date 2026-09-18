import type { Town } from '../core/town';
import { visibleGoals, GoalTarget } from '../core/goals';
import { escapeHtml, storyRow } from './storyViews';
import { findStoryPlace } from '../core/stories';

/** A quiet, collapsible planning rail. Keyboard focus survives live updates. */
export class TownJournal {
  private content: HTMLDivElement;
  private toggle: HTMLButtonElement;
  private toggleLabel: HTMLElement;
  private count: HTMLElement;
  private spotlight: HTMLButtonElement;
  private spotlightTitle: HTMLElement;
  private alternative: HTMLButtonElement;
  private alternativeId: string | null = null;
  private primaryTarget: GoalTarget | null = null;
  private goalCount = 0;
  private lastHtml = '';
  private targets: GoalTarget[] = [];
  private town: Town | null = null;

  constructor(private readonly root: HTMLElement, private readonly onSelect: (target: GoalTarget) => void,
    onJournal: () => void, onSkyline: () => void, onLayout: (inset: number) => void = () => {}) {
    root.className = 'town-journal';
    root.innerHTML = `<div class="journal-header"><button type="button" class="journal-spotlight" hidden>
      <small>RIGHT NOW <span aria-hidden="true">↗</span></small><strong></strong>
    </button><button type="button" class="journal-toggle" aria-expanded="false" aria-controls="journal-content">
      <span class="journal-toggle-label"><small>TOWER TOWN</small><strong>Your next chapter</strong></span>
      <span class="journal-goal-count" hidden></span><span class="journal-chevron" aria-hidden="true">⌄</span>
    </button></div><button type="button" class="journal-alternative" hidden>Compare an affordable option ↗</button><div id="journal-content" hidden></div><div class="journal-footer"><button class="journal-open">Town journal <span>↗</span></button><button class="journal-skyline">Our skyline ↗</button></div>`;
    this.content = root.querySelector<HTMLDivElement>('#journal-content')!;
    this.toggle = root.querySelector<HTMLButtonElement>('.journal-toggle')!;
    this.toggleLabel = root.querySelector<HTMLElement>('.journal-toggle-label')!;
    this.count = root.querySelector<HTMLElement>('.journal-goal-count')!;
    this.spotlight = root.querySelector<HTMLButtonElement>('.journal-spotlight')!;
    this.spotlightTitle = this.spotlight.querySelector('strong')!;
    this.alternative = root.querySelector<HTMLButtonElement>('.journal-alternative')!;
    const initiallyOpen = window.matchMedia('(min-width: 1000px) and (min-height: 650px)').matches;
    this.setExpanded(initiallyOpen);
    let roomy = initiallyOpen;
    const updateLayout = () => {
      const nextRoomy = window.matchMedia('(min-width: 1000px) and (min-height: 650px)').matches;
      // A desktop-open rail must not cover the town after rotating/resizing to a phone.
      if (roomy && !nextRoomy) {
        const focusWasInside = this.content.contains(document.activeElement);
        this.setExpanded(false);
        if (focusWasInside) this.toggle.focus({ preventScroll: true });
      }
      roomy = nextRoomy;
      onLayout(window.innerWidth >= 1000 ? 306 : 0);
    };
    updateLayout();
    window.addEventListener('resize', updateLayout);
    this.toggle.addEventListener('click', () => this.setExpanded(this.content.hidden));
    this.spotlight.addEventListener('click', () => { if (this.primaryTarget) this.onSelect(this.primaryTarget); });
    this.alternative.addEventListener('click', () => {
      if (!this.alternativeId) return;
      this.setExpanded(true);
      const choice = [...this.content.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.goalId === this.alternativeId);
      (choice ?? this.toggle).focus({ preventScroll: true });
      choice?.scrollIntoView({ block: 'nearest' });
    });
    const follow = (action: () => void) => {
      if (window.matchMedia('(max-width: 999px)').matches) {
        this.setExpanded(false);
        this.toggle.focus({ preventScroll: true });
      }
      action();
    };
    root.querySelector('.journal-open')!.addEventListener('click', () => follow(onJournal));
    root.querySelector('.journal-skyline')!.addEventListener('click', () => follow(onSkyline));
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.content.hidden) {
        event.stopPropagation();
        this.setExpanded(false);
        this.toggle.focus({ preventScroll: true });
      }
    });
    this.content.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.storyPlace !== undefined && this.town) {
        const target = findStoryPlace(this.town, Number(button.dataset.storyPlace));
        if (target) this.onSelect(target);
      } else if (button.dataset.resident) this.onSelect({ kind: 'resident', residentId: button.dataset.resident });
      else if (button.dataset.goal !== undefined) {
        const target = this.targets[Number(button.dataset.goal)];
        if (target) this.onSelect(target);
      }
      // Leave the scene visible when following a card on a phone.
      if (window.matchMedia('(max-width: 999px)').matches) {
        this.setExpanded(false);
        // Do not leave keyboard focus inside newly hidden goals. Preserve a
        // destination's focus when its navigation callback has already moved it.
        if (this.content.contains(document.activeElement)) this.toggle.focus({ preventScroll: true });
      }
    });
  }

  private setExpanded(expanded: boolean): void {
    this.root.setAttribute('data-expanded', String(expanded));
    this.content.hidden = !expanded;
    this.spotlight.hidden = expanded || !this.primaryTarget;
    this.toggleLabel.hidden = !expanded && !!this.primaryTarget;
    this.count.hidden = expanded || !this.primaryTarget;
    this.alternative.hidden = expanded || !this.alternativeId;
    this.toggle.setAttribute('aria-expanded', String(expanded));
    this.toggle.setAttribute('aria-label', expanded ? 'Hide goals' : `Show all ${this.goalCount} goals`);
  }

  update(town: Town): void {
    this.town = town;
    const focused = this.content.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).closest<HTMLButtonElement>('button') : null;
    const focusKey = focused?.dataset.goalId !== undefined ? ['goalId', focused.dataset.goalId] :
      focused?.dataset.storyId ? ['storyId', focused.dataset.storyId] :
      focused?.dataset.resident ? ['resident', focused.dataset.resident] : null;
    const goals = visibleGoals(town);
    this.targets = goals.map((g) => g.target);
    const primary = goals[0];
    const alternative = goals.find(g => g.horizon === 'Another option');
    this.alternativeId = alternative?.id ?? null;
    this.alternative.title = alternative?.detail ?? '';
    if (!alternative && document.activeElement === this.alternative) this.toggle.focus({ preventScroll: true });
    this.primaryTarget = primary?.target ?? null;
    this.goalCount = goals.length;
    this.count.textContent = `${goals.length} goals`;
    this.spotlightTitle.textContent = primary?.title ?? '';
    this.spotlight.title = primary ? `${primary.title}\n${primary.detail}` : '';
    this.spotlight.setAttribute('aria-label', primary ? `Right now: ${primary.title}. Open goal.` : 'Open current goal');
    this.setExpanded(!this.content.hidden);
    const latest = town.stories.journal[town.stories.journal.length - 1];
    const html = goals.map((g, i) => `<button class="chapter-goal" data-goal="${i}" data-goal-id="${escapeHtml(g.id)}">
      <small>${escapeHtml(g.horizon)}${g.reward ? `<span>+${g.reward} coins</span>` : ''}</small>
      <strong>${escapeHtml(g.title)}</strong><span>${escapeHtml(g.detail)}</span>
      ${g.total !== undefined && g.current !== undefined ? `<span class="chapter-progress"><progress max="${g.total}" value="${g.current}" aria-label="${escapeHtml(g.title)}"></progress><span>${g.current}/${g.total}</span></span>` : ''}
    </button>`).join('') + (latest ? `<div class="journal-latest"><small>AROUND THE BLOCK</small>${storyRow(latest, new Set(town.allResidents().map((r) => r.id)), town)}</div>` : '');
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.content.innerHTML = html;
      if (focusKey) {
        const replacement = [...this.content.querySelectorAll<HTMLButtonElement>('button')]
          .find((button) => button.dataset[focusKey[0]] === focusKey[1]);
        (replacement ?? this.toggle).focus({ preventScroll: true });
      }
    }
  }
}
