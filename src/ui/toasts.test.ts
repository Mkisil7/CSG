import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from './toasts';
import { Inspector } from './inspector';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import type { GameEvent } from '../core/game';

/** DOM/timer boundary only; actual layout and input are checked in-browser. */
class Element extends EventTarget {
  children: Element[] = []; parent: Element | null = null; mounted = false;
  hidden = false; className = ''; title = ''; type = ''; writes = 0; private text = '';
  attributes = new Map<string, string>();
  style = { display: '' }; classList = { add() {} }; scrollTop = 0; innerHTML = '';
  get isConnected(): boolean { return this.mounted || !!this.parent?.isConnected; }
  set textContent(value: string) { this.text = value; this.writes++; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(' '); }
  append(...children: Element[]) { for (const child of children) { child.remove(); child.parent = this; this.children.push(child); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() { (document as unknown as { activeElement: Element }).activeElement = this; }
  click() { this.dispatchEvent(new Event('click')); }
  send(name: string, relatedTarget: Element | null = null) {
    const event = new Event(name); Object.defineProperty(event, 'relatedTarget', { value: relatedTarget }); this.dispatchEvent(event);
  }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('document', { activeElement: null, createElement: () => new Element(), getElementById: () => null });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const root = new Element(); root.mounted = true;
  const open = vi.fn(), fallback = vi.fn();
  const toaster = new Toaster(root as unknown as HTMLElement, open, fallback);
  const controls = () => {
    const card = root.children[0], [copy, action, close] = card.children;
    return { card, copy, title: copy.children[0], detail: copy.children[1], action, close };
  };
  return { root, toaster, controls, open, fallback };
}
function mission(id: string, label: string, reward: number): GameEvent {
  return { kind: 'mission', message: `Completed ${label}`, milestone: { id, label, reward } };
}
const burst = [mission('one', 'Big Earner', 200), mission('two', 'Big Earner II', 310), mission('three', 'Smooth Operator', 400)];

describe('one compact, actionable town notice', () => {
  it('coalesces milestones with honest receipt totals and one live region', () => {
    const s = setup(); s.toaster.showEvents(burst);
    expect(s.root.children).toHaveLength(1); const c = s.controls();
    expect(c.title.textContent).toBe('3 milestones earned · +910 coins');
    expect(c.detail.textContent).toBe('3 new tiles on your story wall');
    expect(c.copy.getAttribute('role')).toBe('status'); expect(c.copy.getAttribute('aria-live')).toBe('polite');
    expect(c.action.getAttribute('aria-label')).toBe('View milestones');
    c.action.click(); expect(s.open).toHaveBeenCalledWith('missions'); expect(s.root.children).toHaveLength(0);
  });
  it('keeps an individual milestone personal, with singular tile wording', () => {
    const s = setup(); s.toaster.showEvents([mission('content', 'Content', 200)]);
    expect(s.controls().title.textContent).toBe('Content · +200 coins');
    expect(s.controls().detail.textContent).toBe('A new tile on your story wall');
  });
  it('adds later arrivals to the same card without extending the reading interval', () => {
    const s = setup(); s.toaster.showEvents(burst); const card = s.controls().card;
    vi.advanceTimersByTime(5000); s.toaster.showEvents([{ kind: 'move-in', message: 'Maya moved in!' }]);
    expect(s.controls().card).toBe(card); expect(s.root.children).toHaveLength(1);
    expect(s.controls().detail.textContent).toContain('1 other update');
    expect(s.controls().action.getAttribute('aria-label')).toBe('View activity');
    vi.advanceTimersByTime(1000); expect(s.root.children).toHaveLength(0);
  });
  it('keeps routine visits out of popups and avoids live-region writes on empty frames', () => {
    const s = setup(); s.toaster.showEvents([{ kind: 'visit', message: 'A sale' }]);
    expect(s.root.children).toHaveLength(0);
    s.toaster.showEvents(burst); const title = s.controls().title, writes = title.writes;
    for (let i = 0; i < 100; i++) s.toaster.showEvents([]);
    s.toaster.showEvents([{ kind: 'hire', message: 'A clerk was hired' }]); expect(title.writes).toBe(writes);
  });
  it('does not infer rewards from text or claim an incomplete coin total', () => {
    const s = setup(); s.toaster.showEvents([...burst, { kind: 'mission', message: 'Legacy mission (+9999 coins)' }]);
    expect(s.controls().title.textContent).toBe('4 milestones earned');
    expect(s.controls().detail.textContent).toBe('4 new tiles on your story wall');
  });
  it('keeps action feedback ahead of ambient news, then shows one pending summary', () => {
    const s = setup(); s.toaster.show('Not enough coins'); s.toaster.showEvents(burst);
    s.toaster.showEvents([{ kind: 'move-in', message: 'Ava moved in!' }]);
    expect(s.controls().title.textContent).toBe('Not enough coins'); expect(s.controls().action.hidden).toBe(true);
    vi.advanceTimersByTime(6000); expect(s.root.children).toHaveLength(1);
    expect(s.controls().title.textContent).toContain('3 milestones'); expect(s.controls().detail.textContent).toContain('1 other update');
    s.controls().action.click(); expect(s.open).toHaveBeenCalledWith('activity');
  });
  it('retains interrupted milestones without an old timer deleting new feedback', () => {
    const s = setup(); s.toaster.showEvents(burst); vi.advanceTimersByTime(5000);
    s.toaster.show('Lift upgraded'); vi.advanceTimersByTime(1000); expect(s.controls().title.textContent).toBe('Lift upgraded');
    vi.advanceTimersByTime(5000); expect(s.controls().title.textContent).toBe('3 milestones earned · +910 coins');
    vi.advanceTimersByTime(6000); expect(s.root.children).toHaveLength(0);
  });
  it('holds hovered content and destination steady while new updates accumulate separately', () => {
    const s = setup(); s.toaster.showEvents(burst); vi.advanceTimersByTime(2000);
    const c = s.controls(); c.card.send('pointerenter');
    s.toaster.showEvents([{ kind: 'move-out', message: 'Noah moved out' }]); vi.advanceTimersByTime(20000);
    expect(c.action.getAttribute('aria-label')).toBe('View milestones'); expect(s.root.children).toHaveLength(1);
    c.card.send('pointerleave'); vi.advanceTimersByTime(3999); expect(s.controls().card).toBe(c.card);
    vi.advanceTimersByTime(1); expect(s.controls().title.textContent).toBe('Noah moved out');
  });
  it('holds keyboard focus, restores its origin on dismissal and shows pending news in one card', () => {
    const s = setup(), origin = new Element(); origin.mounted = true;
    s.toaster.showEvents(burst); const c = s.controls(); c.close.focus(); c.card.send('focusin', origin);
    vi.advanceTimersByTime(60000); expect(document.activeElement).toBe(c.close);
    s.toaster.showEvents([{ kind: 'promotion', message: 'Maya became Chef' }]); c.close.click();
    expect(document.activeElement).toBe(origin); expect(s.root.children).toHaveLength(1);
    expect(s.controls().title.textContent).toBe('Maya became Chef'); expect(s.fallback).not.toHaveBeenCalled();
  });
  it('returns focus to the scene when the original control has disappeared', () => {
    const s = setup(), removed = new Element(); s.toaster.show('Built apartments');
    const c = s.controls(); c.close.focus(); c.card.send('focusin', removed); c.close.click();
    expect(s.fallback).toHaveBeenCalledOnce(); expect(s.root.children).toHaveLength(0);
  });
  it('uses text nodes instead of interpreting player names as markup', () => {
    const s = setup(), message = '<img src=x onerror=bad()> moved in';
    s.toaster.showEvents([{ kind: 'move-in', message }]);
    expect(s.controls().title.textContent).toBe(message); expect(s.controls().title.innerHTML).toBe('');
  });
  it('summarizes earned rewards without changing coins, completions or activity records', () => {
    const s = setup(), town = new Town(), game = town.towers()[0];
    game.tower.addFloor('residential'); game.residents.push(createResident(1, game.id));
    const before = town.economy.coins; town.tick(0);
    const earned = town.events.filter(e => e.kind === 'mission'); expect(earned.length).toBeGreaterThan(0);
    expect(town.economy.coins - before).toBe(earned.reduce((sum, e) => sum + e.milestone!.reward, 0));
    const snapshot = () => JSON.stringify({ coins: town.economy.coins, completed: [...town.missions.completed], log: town.activityLog });
    const after = snapshot(); s.toaster.showEvents(earned); s.controls().action.click();
    expect(snapshot()).toBe(after); expect(town.missions.checkInstant(town)).toEqual([]);
  });
  it.each([false, true])('keeps highlights ahead of busy routine sales (visiting=%s)', readOnly => {
    const town = new Town(), root = new Element();
    town.activityLog = [...burst, { kind: 'mission', message: '🎯 Completed an earned tile' }, { kind: 'move-in', message: '<Maya> moved in!' },
      ...Array.from({ length: 80 }, (_, i): GameEvent => ({ kind: 'visit', message: `Sale ${i}` }))];
    const before = JSON.stringify(town.activityLog), coins = town.economy.coins;
    new Inspector(root as unknown as HTMLElement, () => town, () => {}, readOnly).select({ kind: 'activity' });
    expect(root.innerHTML).toContain('Town highlights'); expect(root.innerHTML).toContain('Completed Smooth Operator');
    expect(root.innerHTML).not.toContain('🎯 🎯');
    expect(root.innerHTML).toContain('&lt;Maya&gt;'); expect(root.innerHTML).not.toContain('<Maya>');
    expect(root.innerHTML).toContain('Daily life · 20 recent updates');
    expect(root.innerHTML.indexOf('Completed Big Earner')).toBeLessThan(root.innerHTML.indexOf('Sale 79'));
    expect(root.innerHTML).not.toContain('Sale 59'); expect(JSON.stringify(town.activityLog)).toBe(before);
    expect(town.economy.coins).toBe(coins);
  });
});
