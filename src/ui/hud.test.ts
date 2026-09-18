import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hud } from './hud';
import { Town } from '../core/town';

afterEach(() => { vi.unstubAllGlobals(); });
function setup() {
  const chips: { innerHTML: string; title: string; attributes: Map<string, string>; click: () => void }[] = [];
  vi.stubGlobal('document', { createElement: () => {
    const chip = { innerHTML: '', title: '', className: '', classList: { add() {} }, attributes: new Map<string, string>(),
      click() {}, setAttribute(key: string, value: string) { chip.attributes.set(key, value); },
      addEventListener(_type: string, callback: () => void) { chip.click = callback; } };
    return chip;
  } });
  const town = new Town(), navigate = vi.fn(), root = { appendChild: (chip: typeof chips[number]) => chips.push(chip) };
  const hud = new Hud(root as unknown as HTMLElement, undefined, navigate);
  return { hud, town, game: town.towers()[0], chip: chips[5], navigate };
}

describe('clearly labelled lift HUD', () => {
  it('distinguishes missing samples from a measured zero and does not spend on navigation', () => {
    const s = setup(), coins = s.town.economy.coins; s.hud.update(s.town, s.game);
    expect(s.chip.innerHTML).toContain('<span>0 waiting</span><span>— avg</span>');
    expect(s.chip.attributes.get('aria-label')).toContain('no completed wait samples yet');
    s.chip.click(); expect(s.navigate).toHaveBeenCalledOnce(); expect(s.town.economy.coins).toBe(coins);
    s.game.elevator.request('r1', 0, 1, s.town.time);
    Object.assign(s.game.elevator.cars[0], { state: 'loading', doorTimer: 0 });
    s.game.elevator.tick(0, s.town.time); s.hud.update(s.town, s.game);
    expect(s.chip.innerHTML).toContain('0m avg'); expect(s.chip.title).toContain('historical average 0 game minutes');
  });
  it('separates current queue size from old averages and clears the label in town view', () => {
    const s = setup(); s.game.elevator.request('old', 0, 1, s.town.time - 45);
    Object.assign(s.game.elevator.cars[0], { state: 'loading', doorTimer: 0 });
    s.game.elevator.tick(0, s.town.time);
    s.game.elevator.request('new', 1, 0, s.town.time); s.hud.update(s.town, s.game);
    expect(s.chip.innerHTML).toContain('<span>1 waiting</span><span>45m avg</span>');
    expect(s.chip.attributes.get('aria-label')).toContain('1 waiting now; historical average 45 game minutes');
    s.hud.update(s.town, null); expect(s.chip.innerHTML).toContain('Towers');
    expect(s.chip.title).toBe(''); expect(s.chip.attributes.get('aria-label')).toBe('Towers: 1');
  });
});
