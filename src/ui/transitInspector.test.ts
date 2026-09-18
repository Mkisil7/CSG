import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inspector } from './inspector';
import { Town } from '../core/town';
import { Game } from '../core/game';
import { toSaveData } from '../core/save';

afterEach(() => { vi.unstubAllGlobals(); });

function setup(readOnly = false) {
  const town = new Town(); town.economy.coins = 5000;
  const other = new Game('t1', town.economy); other.rename('<Crossroads & Co>'); other.townPopulation = 32;
  town.slots[1] = { id: 't1', zone: 'mixed', unlocked: true, game: other };
  let html = '';
  type Button = { click: () => void; addEventListener: (type: string, cb: () => void) => void };
  const controls = new Map<string, Button>(), onChanged = vi.fn();
  const doc: { activeElement: unknown; getElementById: (id: string) => unknown } = {
    activeElement: null, getElementById: id => controls.get(id) ?? null,
  };
  const root = {
    classList: { add() {} }, style: { display: '' }, scrollTop: 0, tabIndex: 0,
    focus: vi.fn(() => { doc.activeElement = root; }),
    contains: (element: unknown): boolean => element === root || [...controls.values()].includes(element as Button),
    querySelectorAll: () => [], querySelector: (selector: string) => controls.get(selector.slice(1)) ?? null,
    get innerHTML() { return html; }, set innerHTML(value: string) {
      html = value; controls.clear();
      for (const match of value.matchAll(/<button[^>]*id="([^"]+)"/g)) {
        const button: Button = { click() {}, addEventListener(type, cb) { if (type === 'click') button.click = cb; } };
        controls.set(match[1], button);
      }
    },
  };
  vi.stubGlobal('document', doc);
  const inspector = new Inspector(root as unknown as HTMLElement, () => town, onChanged, readOnly);
  return { town, other, root, doc, controls, onChanged, inspector };
}

describe('direct lift inspector', () => {
  it.each([false, true])('opens the named tower directly without changing the town (visiting=%s)', visiting => {
    const s = setup(visiting), before = toSaveData(s.town);
    s.root.scrollTop = 400;
    s.inspector.select({ kind: 'transit', towerId: s.other.id });
    expect(s.root.innerHTML).toContain('Lift flow'); expect(s.root.innerHTML).toContain('&lt;Crossroads &amp; Co&gt;');
    expect(s.root.innerHTML).toContain('No one is waiting right now');
    expect(s.root.innerHTML).not.toContain('tower-name'); expect(s.root.innerHTML).not.toContain('Town story wall');
    expect(s.root.innerHTML.includes('insp-lift-speed')).toBe(!visiting);
    expect(s.root.innerHTML.includes('insp-lift-shaft')).toBe(!visiting);
    expect(s.root.scrollTop).toBe(0); expect(s.doc.activeElement).toBe(s.root);
    expect(s.onChanged).not.toHaveBeenCalled();
    expect({ ...toSaveData(s.town), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
  });

  it('charges a real upgrade to the selected tower only and keeps its measurement view open', () => {
    const s = setup();
    s.inspector.select({ kind: 'transit', towerId: s.other.id });
    s.controls.get('insp-lift-speed')!.click();
    expect(s.town.economy.coins).toBe(4700); expect(s.other.elevatorTier).toBe(1);
    expect(s.town.towers()[0].elevatorTier).toBe(0); expect(s.onChanged).toHaveBeenCalledOnce();
    expect(s.inspector.current).toEqual({ kind: 'transit', towerId: s.other.id });
    expect(s.root.innerHTML).toContain('0/10'); expect(s.doc.activeElement).toBe(s.root);
    s.controls.get('insp-lift-shaft')!.click();
    expect(s.town.economy.coins).toBe(3200); expect(s.other.secondElevator).not.toBeNull();
    expect(s.town.towers()[0].secondElevator).toBeNull(); expect(s.onChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps the existing lobby upgrade path functional', () => {
    const s = setup(); s.inspector.select({ kind: 'floor', towerId: s.other.id, level: 0 });
    s.controls.get('insp-lift-speed')!.click();
    expect(s.other.elevatorTier).toBe(1); expect(s.town.economy.coins).toBe(4700);
    expect(s.inspector.current).toEqual({ kind: 'floor', towerId: s.other.id, level: 0 });
  });

  it('rechecks funds and ignores a detached control after leaving that tower’s panel', () => {
    const s = setup(); s.inspector.select({ kind: 'transit', towerId: s.other.id });
    const speed = s.controls.get('insp-lift-speed')!;
    s.town.economy.coins = 0; speed.click();
    expect(s.other.elevatorTier).toBe(0); expect(s.onChanged).not.toHaveBeenCalled();
    expect(s.root.innerHTML).toContain('Not enough coins');
    s.town.economy.coins = 5000; s.inspector.select({ kind: 'transit', towerId: 't0' }); speed.click();
    expect(s.town.economy.coins).toBe(5000); expect(s.other.elevatorTier).toBe(0);
  });

  it('refreshes live observations with the panel focused but preserves a focused interactive control', () => {
    const s = setup(); s.inspector.select({ kind: 'transit', towerId: s.other.id });
    s.controls.get('insp-lift-speed')!.click();
    s.root.scrollTop = 70;
    for (let i = 0; i < 10; i++) s.other.transit.record(s.town.time, 12, false, false);
    s.inspector.refresh();
    expect(s.root.innerHTML).toContain('No earlier sample → 12.0 min');
    expect(s.doc.activeElement).toBe(s.root); expect(s.root.scrollTop).toBe(70);
    const button = s.controls.get('insp-lift-speed')!, before = s.root.innerHTML;
    s.doc.activeElement = button; s.other.elevator.request('r1', 0, 1, s.town.time - 30);
    s.inspector.refresh(); expect(s.root.innerHTML).toBe(before); expect(s.doc.activeElement).toBe(button);
    s.doc.activeElement = null; s.inspector.refresh(); expect(s.root.innerHTML).toContain('The lifts need breathing room');
  });

  it('closes cleanly when a tower no longer exists, without leaving live upgrade handlers', () => {
    const s = setup(); s.inspector.select({ kind: 'transit', towerId: s.other.id });
    const speed = s.controls.get('insp-lift-speed')!;
    s.town.slots[1].game = null; s.inspector.refresh(); speed.click();
    expect(s.inspector.current).toBeNull(); expect(s.root.style.display).toBe('none');
    expect(s.town.economy.coins).toBe(5000); expect(s.onChanged).not.toHaveBeenCalled();
    s.inspector.select({ kind: 'transit', towerId: 'missing' }); expect(s.inspector.current).toBeNull();
  });
});
