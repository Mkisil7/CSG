import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from '../core/town';
import { createResident } from '../core/residents';
import { visibleGoals } from '../core/goals';
import { TownJournal } from './townJournal';

/** Only the DOM operations used by the journal; real layout is checked in-browser. */
class Element extends EventTarget {
  hidden = false; className = ''; textContent = ''; title = ''; html = '';
  dataset: Record<string, string> = {};
  controls = new Map<string, Element>(); children: Element[] = [];
  attributes = new Map<string, string>();
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key); }
  focus() { (document as unknown as { activeElement: Element }).activeElement = this; }
  scrollIntoView() {}
  contains(element: unknown): boolean { return element === this || this.children.some(child => child.contains(element)); }
  closest() { return this; }
  click() { this.dispatchEvent(new Event('click')); }
  querySelector(selector: string) { return this.controls.get(selector) ?? null; }
  querySelectorAll() { return this.children; }
  set innerHTML(value: string) {
    this.html = value; this.children = []; this.controls.clear();
    if (value.includes('journal-header')) {
      for (const selector of ['#journal-content', '.journal-toggle', '.journal-toggle-label', '.journal-goal-count', '.journal-spotlight', '.journal-alternative', '.journal-open', '.journal-skyline']) {
        const element = new Element(); this.controls.set(selector, element); this.children.push(element);
      }
      const strong = new Element(), spotlight = this.controls.get('.journal-spotlight')!;
      spotlight.controls.set('strong', strong); spotlight.children.push(strong);
    } else {
      for (const match of value.matchAll(/<button[^>]*data-goal="(\d+)" data-goal-id="([^"]+)"/g)) {
        const button = new Element(); button.dataset = { goal: match[1], goalId: match[2] }; this.children.push(button);
      }
      for (const match of value.matchAll(/<button[^>]*data-story-place="(\d+)" data-story-id="(\d+)"/g)) {
        const button = new Element(); button.dataset = { storyPlace: match[1], storyId: match[2] }; this.children.push(button);
      }
    }
  }
  get innerHTML() { return this.html; }
  clickChild(child: Element) {
    const event = new Event('click'); Object.defineProperty(event, 'target', { value: child }); this.dispatchEvent(event);
  }
}

function setup(width = 390, height = 844, navigate = vi.fn()) {
  const win = Object.assign(new EventTarget(), { innerWidth: width, innerHeight: height,
    matchMedia: (query: string) => ({ matches: query.includes('max-width') ? win.innerWidth < 1000 : win.innerWidth >= 1000 && win.innerHeight >= 650 }) });
  vi.stubGlobal('window', win); vi.stubGlobal('document', { activeElement: null });
  const root = new Element(), town = new Town(), onJournal = vi.fn(), onSkyline = vi.fn(), onLayout = vi.fn();
  const journal = new TownJournal(root as unknown as HTMLElement, navigate, onJournal, onSkyline, onLayout);
  journal.update(town);
  const content = root.querySelector('#journal-content')!, toggle = root.querySelector('.journal-toggle')!;
  const spotlight = root.querySelector('.journal-spotlight')!, count = root.querySelector('.journal-goal-count')!;
  return { win, root, town, journal, navigate, content, toggle, spotlight, count, onJournal, onSkyline, onLayout };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('an actionable compact town journal', () => {
  it('compares an affordable option on a phone without spending, and follows it through normal navigation', () => {
    const s = setup(), game = s.town.towers()[0]; game.restoreLifts(2, false); s.town.economy.coins = 500;
    const floor = game.tower.addFloor('shop'); floor.quality = 40;
    const resident = createResident(1, game.id); resident.jobTowerId = game.id; resident.jobFloor = floor.level; game.residents.push(resident);
    game.elevator.request('waiting', 1, 0, s.town.time - 26); s.journal.update(s.town);
    const compare = s.root.querySelector('.journal-alternative')!; expect(compare.hidden).toBe(false);
    expect(s.spotlight.title).toContain('Save'); compare.focus(); compare.click();
    expect(compare.hidden).toBe(true); expect(s.content.hidden).toBe(false);
    expect((document.activeElement as unknown as Element).dataset.goalId).toBe(`renovate-${game.id}-${floor.level}`);
    expect(s.town.economy.coins).toBe(500); expect(s.navigate).not.toHaveBeenCalled();
    s.content.clickChild(document.activeElement as unknown as Element);
    expect(s.navigate).toHaveBeenCalledWith({ kind: 'floor', towerId: game.id, level: floor.level });
    expect(s.content.hidden).toBe(true); expect(s.town.economy.coins).toBe(500);
    compare.focus(); floor.quality = 70; s.journal.update(s.town);
    expect(compare.hidden).toBe(true); expect(document.activeElement).toBe(s.toggle);
    expect(s.spotlight.title).toContain('Save');
  });
  it('opens an exact place memory, preserves its focus on refresh and collapses phone goals without spending', () => {
    const s = setup(), floor = s.town.towers()[0].tower.addFloor('restaurant');
    const target = { kind: 'floor' as const, towerId: 't0', level: floor.level };
    s.town.stories.record(1, 'place', [], 'First meal', 'A real arrival', target);
    s.toggle.click(); s.journal.update(s.town);
    const story = s.content.children.find(b => b.dataset.storyPlace)!; story.focus();
    s.town.economy.coins = 0; s.journal.update(s.town);
    const focused = document.activeElement as unknown as Element;
    expect(focused.dataset.storyId).toBe(story.dataset.storyId);
    s.content.clickChild(focused);
    expect(s.navigate).toHaveBeenCalledWith(target); expect(s.content.hidden).toBe(true);
    expect(s.town.economy.coins).toBe(0); expect(document.activeElement).toBe(s.toggle);
  });
  it('does not follow a place card after its destination disappears', () => {
    const s = setup(), game = s.town.towers()[0], floor = game.tower.addFloor('restaurant');
    s.town.stories.record(1, 'place', [], 'An opening', 'Memory', { kind: 'floor', towerId: game.id, level: floor.level });
    s.journal.update(s.town); const story = s.content.children.find(b => b.dataset.storyPlace)!;
    game.tower.floors.pop(); s.content.clickChild(story); expect(s.navigate).not.toHaveBeenCalled();
  });
  it('keeps a focused lift receipt stable as actual observations arrive and opens it without another charge', () => {
    const s = setup(1280, 900), game = s.town.towers()[0]; s.town.economy.coins = 1000;
    for (let i = 0; i < 5; i++) game.transit.record(s.town.time, 40, false, false);
    game.upgradeSpeed(); s.journal.update(s.town);
    const button = s.content.children.find(b => b.dataset.goalId.startsWith('lift-result-'))!;
    button.focus(); const coins = s.town.economy.coins;
    for (let i = 0; i < 10; i++) game.transit.record(s.town.time, 12, false, false);
    s.journal.update(s.town);
    expect(s.content.innerHTML).toContain('Lift waits: 40 → 12 min');
    expect((document.activeElement as unknown as Element).dataset.goalId).toBe(button.dataset.goalId);
    s.content.clickChild(document.activeElement as unknown as Element);
    expect(s.navigate).toHaveBeenCalledWith({ kind: 'transit', towerId: game.id });
    expect(s.town.economy.coins).toBe(coins);
  });
  it('shows the actual next goal and opens its destination without spending', () => {
    const s = setup(), goal = visibleGoals(s.town)[0], coins = s.town.economy.coins;
    expect(s.content.hidden).toBe(true); expect(s.spotlight.hidden).toBe(false);
    expect(s.spotlight.querySelector('strong')!.textContent).toBe(goal.title);
    expect(s.spotlight.title).toContain(goal.detail);
    expect(s.toggle.getAttribute('aria-label')).toBe(`Show all ${visibleGoals(s.town).length} goals`);
    s.spotlight.click(); expect(s.navigate).toHaveBeenCalledWith(goal.target);
    expect(s.town.economy.coins).toBe(coins);
  });
  it('switches between the compact action and all three horizons', () => {
    const s = setup(); s.toggle.click();
    expect(s.content.hidden).toBe(false); expect(s.spotlight.hidden).toBe(true); expect(s.count.hidden).toBe(true);
    expect(s.toggle.getAttribute('aria-expanded')).toBe('true');
    expect(s.content.innerHTML).toContain('Right now'); expect(s.content.innerHTML).toContain('This session');
    s.toggle.click(); expect(s.content.hidden).toBe(true); expect(s.count.hidden).toBe(false);
  });
  it('updates the compact destination without replacing its focused button', () => {
    const s = setup(); s.spotlight.focus(); const first = s.spotlight.title;
    s.town.towers()[0].tower.addFloor('residential'); s.journal.update(s.town);
    expect(s.spotlight.title).not.toBe(first); expect(document.activeElement).toBe(s.spotlight);
    s.spotlight.click(); expect(s.navigate).toHaveBeenLastCalledWith(visibleGoals(s.town)[0].target);
  });
  it('keeps expanded goal focus by identity across a live update', () => {
    const s = setup(1280, 900), button = s.content.children[1]; button.focus();
    s.town.economy.coins = 0; s.journal.update(s.town);
    expect(s.content.hidden).toBe(false); expect(s.spotlight.hidden).toBe(true);
    expect((document.activeElement as unknown as Element).dataset.goalId).toBe(button.dataset.goalId);
  });
  it('returns focus to the toggle when the focused goal disappears', () => {
    const s = setup(1280, 900); s.content.children[0].focus();
    const game = s.town.towers()[0]; game.tower.addFloor('residential');
    game.residents = Array.from({ length: 4 }, () => createResident(1, game.id));
    s.journal.update(s.town);
    expect(document.activeElement).toBe(s.toggle);
  });
  it.each([false, true])('collapses after following a phone card, preserving destination focus: %s', destinationFocused => {
    const destination = new Element(), navigate = vi.fn(() => { if (destinationFocused) destination.focus(); });
    const s = setup(390, 844, navigate); s.toggle.click(); const button = s.content.children[0]; button.focus();
    s.content.clickChild(button);
    expect(s.navigate).toHaveBeenCalledWith(visibleGoals(s.town)[0].target);
    expect(s.content.hidden).toBe(true); expect(document.activeElement).toBe(destinationFocused ? destination : s.toggle);
  });
  it('collapses on desktop-to-phone resize without stranding keyboard focus', () => {
    const s = setup(1280, 900); s.content.children[0].focus();
    s.win.innerWidth = 390; s.win.dispatchEvent(new Event('resize'));
    expect(s.content.hidden).toBe(true); expect(document.activeElement).toBe(s.toggle);
    expect(s.onLayout).toHaveBeenLastCalledWith(0);
  });
  it('retains separate journal and skyline navigation', () => {
    const s = setup(); s.root.querySelector('.journal-open')!.click(); s.root.querySelector('.journal-skyline')!.click();
    expect(s.onJournal).toHaveBeenCalledOnce(); expect(s.onSkyline).toHaveBeenCalledOnce(); expect(s.navigate).not.toHaveBeenCalled();
  });
});
