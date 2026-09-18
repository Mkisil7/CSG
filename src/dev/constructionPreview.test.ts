import { afterEach, expect, it, vi } from 'vitest';
import { Town } from '../core/town';
import { mountPreview, openingReducedMotion, revealDelta } from './constructionPreview';

afterEach(() => { vi.unstubAllGlobals(); });

it('keeps the study clock honest through pause, system handover and a subsequent build', () => {
  const system = { matches: true }, motion = { value: 'system' }, playback = { value: '0.35' };
  const status = { textContent: '' }, choice = { appendChild() {}, value: '0' };
  const button = { addEventListener() {} };
  const controls = new Map<string, object>([
    ['select[aria-label="Opening motion"]', motion], ['select[aria-label="Reveal playback"]', playback],
    ['select[aria-label="Opening floor"]', choice], ['[role="status"]', status],
    ['button', button], ['[data-workday]', button],
  ]);
  vi.stubGlobal('window', { matchMedia: () => system });
  vi.stubGlobal('document', { body: { appendChild() {} }, createElement: (tag: string) =>
    tag === 'details' ? { querySelector: (selector: string) => controls.get(selector) } : {} });
  const town = new Town(); mountPreview(town);
  expect(openingReducedMotion()).toBeUndefined();
  motion.value = 'full'; expect(openingReducedMotion()).toBe(false);
  town.towers()[0].tower.addFloor('residential');
  expect(revealDelta(0.1, false)).toBe(0.1);
  expect(status.textContent).toContain('0.10 / 2.20');
  expect(revealDelta(0.1, true)).toBe(0);
  expect(status.textContent).toContain('0.10 / 2.20 s · paused');
  motion.value = 'system'; revealDelta(0, true);
  expect(status.textContent).toContain('2.20 / 2.20 s · paused');
  expect(status.textContent).toContain('following system');
  motion.value = 'full'; revealDelta(0, true);
  expect(status.textContent).toContain('2.20 / 2.20');
  town.towers()[0].tower.addFloor('residential'); revealDelta(0.1, false);
  expect(status.textContent).toContain('0.10 / 2.20');
  system.matches = false; motion.value = 'reduced'; revealDelta(0, true);
  expect(openingReducedMotion()).toBe(true);
  expect(system.matches).toBe(false);
  expect(status.textContent).toContain('2.20 / 2.20');
  expect(status.textContent).toContain('study override only (system: full motion)');
});
