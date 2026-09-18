import { isToastWorthy, type GameEvent } from '../core/game';

/** Counts, not a second event/reward ledger. The full records stay in Activity,
 * resident stories and the saved mission wall. Space stays bounded while held. */
interface EventSummary {
  count: number;
  missions: number;
  receipts: number;
  coins: number;
  first: GameEvent;
}
function addEvents(summary: EventSummary | null, events: readonly GameEvent[]): EventSummary | null {
  for (const event of events) {
    if (!isToastWorthy(event.kind)) continue;
    summary ??= { count: 0, missions: 0, receipts: 0, coins: 0, first: event };
    summary.count++;
    if (event.kind === 'mission') {
      summary.missions++;
      if (event.milestone) { summary.receipts++; summary.coins += event.milestone.reward; }
    }
  }
  return summary;
}
function merge(a: EventSummary | null, b: EventSummary): EventSummary {
  if (!a) return { ...b };
  return { count: a.count + b.count, missions: a.missions + b.missions,
    receipts: a.receipts + b.receipts, coins: a.coins + b.coins, first: a.first };
}

const READING_MS = 6000;
export class Toaster {
  private readonly card = document.createElement('div');
  private readonly title = document.createElement('strong');
  private readonly detail = document.createElement('span');
  private readonly open = document.createElement('button');
  private readonly close = document.createElement('button');
  private current: EventSummary | null = null;
  private pending: EventSummary | null = null;
  private showing = false;
  private hovered = false;
  private focused = false;
  private returnFocus: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remaining = READING_MS;
  private started = 0;

  constructor(private readonly root: HTMLElement,
    private readonly onOpen: (destination: 'missions' | 'activity') => void = () => {},
    private readonly onReturnFocus: () => void = () => {}) {
    this.card.className = 'toast-msg';
    const copy = document.createElement('div'); copy.className = 'toast-copy';
    copy.setAttribute('role', 'status'); copy.setAttribute('aria-live', 'polite'); copy.setAttribute('aria-atomic', 'true');
    this.title.className = 'toast-title'; this.detail.className = 'toast-detail';
    copy.append(this.title, this.detail);
    this.open.type = this.close.type = 'button';
    this.open.className = this.close.className = 'toast-action';
    this.open.textContent = '↗'; this.close.textContent = '×';
    this.close.setAttribute('aria-label', 'Dismiss notification'); this.close.title = 'Dismiss notification';
    this.card.append(copy, this.open, this.close);
    this.open.addEventListener('click', () => {
      if (!this.current) return;
      const destination = this.current.missions === this.current.count ? 'missions' : 'activity';
      // Pending events are already in those read-only panels; don't cover them.
      this.pending = null; this.hide(false); this.onOpen(destination);
    });
    this.close.addEventListener('click', () => this.hide(true));
    this.card.addEventListener('pointerenter', () => { this.hovered = true; this.updateTimer(); });
    this.card.addEventListener('pointerleave', () => { this.hovered = false; this.updateTimer(); });
    this.card.addEventListener('focusin', (event) => {
      if (!this.card.contains(event.relatedTarget as Node | null)) {
        this.returnFocus = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
      }
      this.focused = true; this.updateTimer();
    });
    this.card.addEventListener('focusout', (event) => {
      this.focused = this.card.contains(event.relatedTarget as Node | null); this.updateTimer();
    });
  }

  /** Feedback from a deliberate player action takes priority over ambient news. */
  show(message: string): void {
    if (this.current) this.pending = merge(this.pending, this.current);
    this.current = null;
    this.title.textContent = message; this.detail.textContent = ''; this.detail.hidden = true;
    this.open.hidden = true;
    this.start();
  }

  showEvents(events: readonly GameEvent[]): void {
    if (!events.some(event => isToastWorthy(event.kind))) return;
    if (this.showing && (!this.current || this.hovered || this.focused)) {
      this.pending = addEvents(this.pending, events); return;
    }
    this.current = addEvents(this.current, events);
    if (!this.current) return;
    this.renderEvents();
    // More news updates this card, but cannot extend it indefinitely.
    if (!this.showing) this.start();
  }

  private renderEvents(): void {
    const s = this.current!;
    const reward = s.receipts === s.missions ? ` · +${s.coins} coins` : '';
    this.title.textContent = s.missions ? s.missions === 1 && s.count === 1 && s.first.milestone ?
      `${s.first.milestone.label}${reward}` : `${s.missions} milestone${s.missions === 1 ? '' : 's'} earned${reward}` :
      s.count === 1 ? s.first.message : `${s.count} town updates`;
    const other = s.count - s.missions;
    this.detail.textContent = s.missions ? `${s.missions === 1 ? 'A new tile' : `${s.missions} new tiles`} on your story wall${other ? ` · ${other} other update${other === 1 ? '' : 's'}` : ''}` :
      s.count === 1 ? 'Read more in Activity' : 'People, places and progress · read Activity';
    this.detail.hidden = false; this.open.hidden = false;
    const label = s.missions === s.count ? 'View milestones' : 'View activity';
    this.open.setAttribute('aria-label', label); this.open.title = label;
  }

  private start(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.remaining = READING_MS;
    if (!this.showing) { this.root.append(this.card); this.showing = true; }
    this.updateTimer();
  }

  private updateTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer); this.timer = undefined;
      this.remaining = Math.max(0, this.remaining - (Date.now() - this.started));
    }
    if (!this.showing || this.hovered || this.focused) return;
    this.started = Date.now();
    this.timer = setTimeout(() => { this.timer = undefined; this.hide(false); }, this.remaining);
  }

  private hide(restoreFocus: boolean): void {
    const hadFocus = this.card.contains(document.activeElement);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.showing = false; this.current = null;
    this.hovered = this.focused = false; this.card.remove();
    if (restoreFocus && hadFocus) {
      if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
      else this.onReturnFocus();
    }
    this.returnFocus = null;
    if (this.pending) { this.current = this.pending; this.pending = null; this.renderEvents(); this.start(); }
  }
}
