import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildMenu } from './buildMenu';
import { Town } from '../core/town';
import type { Toaster } from './hud';

/** DOM boundary only. Browser checks cover real layout, focus and input. */
class Element extends EventTarget {
  children: Element[] = []; parent: Element | null = null;
  tagName: string; className = ''; id = ''; type = ''; disabled = false;
  style = { display: '' }; attributes = new Map<string, string>(); private text = '';
  constructor(tag = 'div') { super(); this.tagName = tag; }
  classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    add: (name: string) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
    remove: (name: string) => { this.className = this.className.split(' ').filter(n => n !== name).join(' '); },
    toggle: (name: string, active: boolean) => active ? this.classList.add(name) : this.classList.remove(name),
  };
  get textContent(): string { return this.text + this.children.map(c => c.textContent).join(' '); }
  set textContent(value: string) { this.replaceChildren(); this.text = value; }
  set innerHTML(value: string) { this.replaceChildren(); this.text = value.replace(/<[^>]+>/g, ' '); }
  appendChild(child: Element) { child.remove(); child.parent = this; this.children.push(child); return child; }
  replaceChildren() { for (const child of this.children) child.parent = null; this.children = []; this.text = ''; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  contains(node: unknown): boolean { return node === this || this.children.some(c => c.contains(node)); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key); }
  all(): Element[] { return this.children.flatMap(c => [c, ...c.all()]); }
  querySelector(selector: string) {
    const cls = /^\.([\w-]+)/.exec(selector)?.[1];
    return this.all().find(e => (!cls || e.classList.contains(cls)) && (!selector.includes(':disabled') || !e.disabled)) ?? null;
  }
  focus() { (document as unknown as { activeElement: Element }).activeElement = this; }
  click() { if (!this.disabled) { this.focus(); this.dispatchEvent(new Event('click')); } }
}

function setup(mobile = false) {
  const root = new Element(), body = new Element(); body.appendChild(root);
  const doc = Object.assign(new EventTarget(), { body, activeElement: null as Element | null, createElement: (tag: string) => new Element(tag) });
  const media = Object.assign(new EventTarget(), { matches: mobile });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', { matchMedia: () => media }); vi.stubGlobal('confirm', vi.fn(() => false));
  const town = new Town(), game = town.towers()[0]; town.economy.coins = 10000;
  game.townPopulation = 30; game.homePopulation = 8; game.tower.addFloor('residential');
  const changed = vi.fn(), view = vi.fn(), missions = vi.fn(), activity = vi.fn(), social = vi.fn(), reset = vi.fn(), landmarks = vi.fn();
  const menu = new BuildMenu(root as unknown as HTMLElement, () => game, { show: vi.fn() } as unknown as Toaster,
    changed, view, missions, activity, social, reset, landmarks);
  const update = (tower = true) => menu.update(tower, 17, 120); update();
  const button = (text: string, parent = root) => parent.all().find(e => e.tagName === 'button' && e.textContent.startsWith(text))!;
  const sheet = () => root.children.find(e => e.id === 'build-actions')!;
  const escape = () => { const event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'key', { value: 'Escape' }); root.dispatchEvent(event); return event; };
  const resize = (value: boolean) => { media.matches = value; const event = new Event('change'); Object.defineProperty(event, 'matches', { value }); media.dispatchEvent(event); update(); };
  return { root, doc, body, game, menu, changed, view, missions, activity, social, reset, landmarks, button, sheet, escape, resize, update };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('compact build dock', () => {
  it('keeps eight desktop choices and puts secondary actions behind Manage without spending', () => {
    const s = setup(), coins = s.game.economy.coins;
    expect(s.root.children.filter(e => e.tagName === 'button')).toHaveLength(8);
    expect(s.button('Lift speed')).toBeUndefined(); expect(s.button('New town')).toBeUndefined();
    const manage = s.button('⚙ Manage'); expect(manage.textContent).toContain('17/120 missions');
    manage.click(); expect(s.sheet().style.display).toBe('flex');
    expect(s.sheet().getAttribute('aria-label')).toBe('Manage actions');
    expect(manage.getAttribute('aria-expanded')).toBe('true');
    expect(s.doc.activeElement).toBe(s.button('Lift speed'));
    expect(s.button('🎯 Missions').textContent).toContain('17/120');
    expect(s.escape().defaultPrevented).toBe(true);
    expect(s.sheet().style.display).toBe('none'); expect(manage.getAttribute('aria-expanded')).toBe('false');
    expect(s.doc.activeElement).toBe(manage); expect(s.game.economy.coins).toBe(coins); expect(s.changed).not.toHaveBeenCalled();
  });

  it('retains paid lift upgrades and closes Manage to reveal their result', () => {
    const s = setup(), tier = s.game.elevatorTier, coins = s.game.economy.coins, cost = s.game.nextSpeedTierCost()!;
    s.button('⚙ Manage').click(); s.button('Lift speed').click();
    expect(s.game.elevatorTier).toBe(tier + 1); expect(s.game.economy.coins).toBe(coins - cost);
    expect(s.sheet().style.display).toBe('none'); expect(s.changed).toHaveBeenCalledOnce();
    expect(s.doc.activeElement).toBe(s.button('⚙ Manage'));
  });

  it('switches from Manage to a subtype picker and builds exactly the chosen floor', () => {
    const s = setup(), coins = s.game.economy.coins, floors = s.game.tower.floors.length;
    s.button('⚙ Manage').click(); s.button('Office').click();
    expect(s.sheet().style.display).toBe('none'); expect(s.body.classList.contains('menu-sheet-open')).toBe(false);
    const popover = s.root.children.find(e => e.id === 'build-subtypes')!;
    expect(popover.style.display).toBe('flex'); expect(s.button('Office').getAttribute('aria-expanded')).toBe('true');
    expect(s.body.classList.contains('subtype-picker-open')).toBe(true);
    expect(s.game.economy.coins).toBe(coins);
    const cost = s.game.tower.nextFloorCost('office', 'tech');
    s.button('Technology Office', popover).click();
    expect(s.game.tower.floors).toHaveLength(floors + 1); expect(s.game.tower.floors[floors].subtype).toBe('tech');
    expect(s.game.economy.coins).toBe(coins - cost); expect(s.changed).toHaveBeenCalledOnce();
    expect(popover.style.display).toBe('none'); expect(s.doc.activeElement).toBe(s.button('Office'));
    expect(s.body.classList.contains('subtype-picker-open')).toBe(false);
  });

  it('keeps town-wide management available without a selected tower, and never skips reset confirmation', () => {
    const s = setup(); s.update(false); s.button('⚙ Manage').click();
    expect(s.button('Lift speed').disabled).toBe(true); expect(s.button('2nd lift').disabled).toBe(true);
    s.button('🎯 Missions').click(); expect(s.missions).toHaveBeenCalledOnce(); expect(s.sheet().style.display).toBe('none');
    s.button('⚙ Manage').click(); s.button('New town').click();
    expect(confirm).toHaveBeenCalledOnce(); expect(s.reset).not.toHaveBeenCalled();
  });

  it('retains the three-button mobile dock, goal drill-in, Back and Escape', () => {
    const s = setup(true), coins = s.game.economy.coins;
    expect(s.root.children.filter(e => e.tagName === 'button')).toHaveLength(3);
    s.menu.showBuildOptions('office'); expect(s.sheet().getAttribute('aria-label')).toBe('Office choices');
    expect(s.button('+ Build').getAttribute('aria-expanded')).toBe('true');
    s.button('‹ Build').click(); expect(s.sheet().getAttribute('aria-label')).toBe('Build choices');
    expect(s.button('Office').getAttribute('aria-controls')).toBe(s.sheet().id);
    s.escape(); expect(s.doc.activeElement).toBe(s.button('+ Build'));
    expect(s.game.economy.coins).toBe(coins); expect(s.changed).not.toHaveBeenCalled();
  });

  it('closes on outside input without taking focus back, and rebuilds cleanly across breakpoints', () => {
    const s = setup(), outside = new Element('button'); s.body.appendChild(outside);
    s.button('⚙ Manage').click(); outside.focus();
    const event = new Event('pointerdown'); Object.defineProperty(event, 'target', { value: outside }); s.doc.dispatchEvent(event);
    expect(s.sheet().style.display).toBe('none'); expect(s.doc.activeElement).toBe(outside);
    s.button('⚙ Manage').click(); s.resize(true);
    expect(s.root.children.filter(e => e.tagName === 'button')).toHaveLength(3);
    expect(s.body.classList.contains('menu-sheet-open')).toBe(false);
    expect(s.doc.activeElement).toBe(s.button('Town'));
    s.button('Manage').click(); s.resize(false);
    expect(s.root.children.filter(e => e.tagName === 'button')).toHaveLength(8);
    expect(s.root.all().filter(e => e.id === 'build-actions')).toHaveLength(1);
    expect(s.doc.activeElement).toBe(s.button('🏙 Town view'));
  });
});
