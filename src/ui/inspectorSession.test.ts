import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inspector } from './inspector';
import { Town } from '../core/town';
import type { NeighborhoodEvent } from '../core/neighborhood';

afterEach(() => { vi.unstubAllGlobals(); });

// A small DOM boundary double: count destructive writes and retain the actual
// listener callbacks. Runtime browser checks cover real layout/click targeting.
function node(dataset: Record<string, string> = {}) {
  const listeners = new Map<string, () => void>();
  return { dataset, textContent: '', title: '', disabled: false, value: '',
    addEventListener: (type: string, callback: () => void) => listeners.set(type, callback),
    fire: (type: string) => listeners.get(type)?.() };
}
function setup(active = false) {
  const town = new Town(); town.economy.coins = 1000;
  town.slots[1] = { id: 't1', game: null, zone: 'park', unlocked: true };
  const event: NeighborhoodEvent = { id: 'ne1', kind: 'band', title: 'First concert', reason: 'Neighbors have a park',
    towerId: 't1', parkIndex: 1, status: active ? 'active' : 'offered', createdAt: town.time,
    startedAt: town.time, endsAt: town.time + 2880, nextVisitorAt: 0, served: 0, missed: 0, arrivals: 0,
    reviewPublished: false, outcome: '' };
  town.neighborhood.events.push(event);
  const notice = node(), accept = node({ eventAccept: 'ne1' }), requirement = node({ eventRequirement: 'ne1' });
  const progress = node({ eventProgress: 'ne1' }), select = node({ studio: 'ne1' });
  const elements = new Map<string, ReturnType<typeof node>[]>([
    ['[data-event-accept]', active ? [] : [accept]], ['[data-event-requirement]', [requirement]],
    ['[data-event-progress]', active ? [progress] : []], ['[data-studio]', []],
  ]);
  let html = '', writes = 0, focused = false;
  const root = { classList: { add() {} }, style: { display: '' }, scrollTop: 0, tabIndex: 0,
    contains: () => focused, focus: () => { focused = true; },
    get innerHTML() { return html; }, set innerHTML(value: string) { html = value; writes++; },
    querySelector: (selector: string) => selector === '[data-neighborhood-refresh]' ? notice : null,
    querySelectorAll: (selector: string) => elements.get(selector) ?? [],
  };
  vi.stubGlobal('document', { activeElement: null, getElementById: () => null });
  const inspector = new Inspector(root as unknown as HTMLElement, () => town, () => {});
  inspector.select({ kind: 'neighborhood' });
  return { town, event, root, inspector, notice, accept, requirement, progress, select, elements, writes: () => writes };
}

describe('stable neighborhood reading session', () => {
  it('does not replace buttons or move scroll when another invitation arrives; refresh is explicit', () => {
    const s = setup(); const initial = s.root.innerHTML, writes = s.writes(); s.root.scrollTop = 417;
    s.town.neighborhood.events.push({ ...s.event, id: 'ne2', title: 'A new invitation' });
    s.inspector.refresh();
    expect(s.writes()).toBe(writes); expect(s.root.innerHTML).toBe(initial); expect(s.root.scrollTop).toBe(417);
    expect(s.notice.disabled).toBe(false); expect(s.notice.textContent).toBe('Updated details · refresh');
    s.notice.fire('click');
    expect(s.writes()).toBe(writes + 1); expect(s.root.innerHTML).toContain('A new invitation');
    expect(s.root.scrollTop).toBe(0); expect(s.root.contains()).toBe(true);
    s.inspector.refresh(); expect(s.notice.disabled).toBe(true);
  });

  it('updates affordability and stale-action guards even while a control has focus, without replacing it', () => {
    const s = setup(); s.root.focus(); const writes = s.writes();
    s.town.economy.coins = 0; s.inspector.refresh();
    expect(s.accept.disabled).toBe(true); expect(s.requirement.textContent).toBe('Needs 80 coins.');
    s.town.economy.coins = 100; s.inspector.refresh();
    expect(s.accept.disabled).toBe(false); expect(s.requirement.textContent).toBe('Ready when you are.');
    s.event.status = 'completed'; s.inspector.refresh();
    expect(s.accept.disabled).toBe(true); expect(s.writes()).toBe(writes);
    const coins = s.town.economy.coins; s.accept.fire('click');
    expect(s.town.economy.coins).toBe(coins);
  });

  it('updates real attendance and expiry in place instead of replacing a finished concert with another card', () => {
    const s = setup(true), writes = s.writes(); s.root.focus();
    s.event.arrivals = 7; s.town.time += 60; s.inspector.refresh();
    expect(s.progress.textContent).toBe('7 listeners arrived · 47 town hours left');
    s.event.status = 'completed'; s.inspector.refresh();
    expect(s.progress.textContent).toBe('Finished · refresh for the town memory');
    expect(s.writes()).toBe(writes); expect(s.notice.disabled).toBe(false);
    s.town.neighborhood.events = []; s.inspector.refresh();
    expect(s.progress.textContent).toBe('Archived · refresh for current happenings');
    expect(s.writes()).toBe(writes);
  });

  it('rechecks the player’s selected studio without resetting their selection', () => {
    const s = setup(); s.select.value = 't0:7'; s.elements.set('[data-studio]', [s.select]);
    const check = vi.spyOn(s.town.neighborhood, 'canRespond').mockImplementation((_town, _id, studio) =>
      ({ ok: studio?.level === 7, reason: studio?.level === 7 ? undefined : 'Studio occupied.' }));
    s.inspector.refresh(true); s.root.focus(); const writes = s.writes();
    s.inspector.refresh(); expect(s.accept.disabled).toBe(false); expect(s.select.value).toBe('t0:7');
    s.select.value = 't0:8'; s.select.fire('change');
    expect(check).toHaveBeenLastCalledWith(s.town, 'ne1', { towerId: 't0', level: 8 });
    expect(s.accept.disabled).toBe(true); expect(s.writes()).toBe(writes);
  });
});
