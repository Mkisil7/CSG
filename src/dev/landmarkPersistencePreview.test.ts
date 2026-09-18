import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreviewTown, isPaused, landmarkCheckpointSummary, mountPreview, storage } from './landmarkPersistencePreview';
import { studyStorage } from './persistencePreview';
import { readGame, SaveSession, toSaveData } from '../core/save';
import { buildLandmark, landmarkOffer } from '../core/landmarks';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function memory() {
  const data = new Map<string, string>([['tower-town-save-v4', 'player town'], ['tower-town-development-persistence:tower-town-save-v4', 'first study']]);
  const calls: string[] = [];
  const target: Storage = {
    getItem: key => { calls.push(key); return data.get(key) ?? null; },
    setItem: (key, value) => { calls.push(key); data.set(key, value); },
    removeItem: key => { calls.push(key); data.delete(key); },
    clear: () => { throw new Error('Broad clear forbidden'); },
    key: () => { throw new Error('Enumeration forbidden'); },
    get length(): number { throw new Error('Enumeration forbidden'); },
  };
  return { data, calls, target };
}

describe('separate landmark browser-save study', () => {
  it('stages eligibility, not purchased landmarks, visits or extra income from them', () => {
    const town = createPreviewTown();
    expect(town.population).toBe(32);
    expect(town.towers().flatMap(g => g.tower.floors).filter(f => f.type === 'landmark')).toEqual([]);
    expect(landmarkCheckpointSummary(town)).toContain('No public landmarks built yet.');
    expect(isPaused()).toBe(true);
    expect(landmarkOffer(town, 't0', 'conservatory').ok).toBe(true);
    expect(landmarkOffer(town, 't1', 'gallery').ok).toBe(true);
    expect(landmarkOffer(town, 't2', 'observatory').ok).toBe(true);
  });

  it('isolates all save/reset access from player progress and the previous persistence study', () => {
    const m = memory(), scoped = studyStorage(() => m.target, 'landmarks'), town = createPreviewTown();
    expect(readGame(scoped).status).toBe('empty');
    const session = new SaveSession(town, true, scoped);
    expect(session.save()).toBe(true); expect(readGame(scoped).status).toBe('loaded');
    expect(session.reset()).toBe(true); expect(readGame(scoped).status).toBe('empty');
    scoped.clear();
    expect(m.data.get('tower-town-save-v4')).toBe('player town');
    expect(m.data.get('tower-town-development-persistence:tower-town-save-v4')).toBe('first study');
    expect(m.calls.every(key => key.startsWith('tower-town-development-landmarks:'))).toBe(true);
    expect(() => studyStorage(() => m.target, '__proto__' as never)).toThrow('Unknown');
    expect(() => scoped.getItem('unrelated')).toThrow('Unknown');
  });

  it('round-trips all real purchases and actual evening visits with no double charge or visit credit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const m = memory(), scoped = studyStorage(() => m.target, 'landmarks'), town = createPreviewTown();
    const coins = town.economy.coins, counts = town.towers().map(g => g.tower.height);
    for (const [id, kind] of [['t0', 'conservatory'], ['t1', 'gallery'], ['t2', 'observatory']] as const) {
      expect(buildLandmark(town, id, kind)).toBe(true);
    }
    expect(town.economy.coins).toBe(coins - 5100);
    town.towers().forEach((g, i) => expect(g.tower.height).toBe(counts[i] + 1));
    town.towers()[1].architecture = 'garden'; town.towers()[2].architecture = 'modern';
    for (let i = 0; i < 360; i++) town.tick(0.25);
    const landmarks = town.towers().flatMap(g => g.tower.floors.filter(f => f.type === 'landmark'));
    expect(landmarks.every(f => (f.landmarkVisits ?? 0) > 0)).toBe(true);
    expect(landmarks.every(f => f.revenueToday === 0)).toBe(true);
    const session = new SaveSession(town, true, scoped); expect(session.save()).toBe(true);
    const result = readGame(scoped); if (result.status !== 'loaded') throw new Error('Expected saved landmarks');
    const restored = result.result.town;
    expect(landmarkCheckpointSummary(restored)).toBe(landmarkCheckpointSummary(town));
    const visits = landmarks.map(f => f.landmarkVisits), restoredCoins = restored.economy.coins;
    for (const game of restored.towers()) expect(buildLandmark(restored, game.id, 'gallery')).toBe(false);
    expect(restored.economy.coins).toBe(restoredCoins);
    restored.tick(0);
    expect(restored.towers().flatMap(g => g.tower.floors.filter(f => f.type === 'landmark')).map(f => f.landmarkVisits)).toEqual(visits);
  });

  it('reports actual state without mutating it and runs/saves/reloads only through explicit controls', () => {
    const m = memory(); vi.stubGlobal('localStorage', m.target);
    const button = () => ({ textContent: '', dataset: {} as Record<string, string>, addEventListener: (_: string, cb: () => void) => { controls.push(cb); } });
    const controls: (() => void)[] = [], result = { textContent: '' }, run = button();
    const steps = [Object.assign(button(), { dataset: { step: '5' } }), Object.assign(button(), { dataset: { step: '90' } })];
    const elements = new Map<string, object>([['[data-result]', result], ['[data-run]', run], ['[data-save]', button()], ['[data-read]', button()], ['[data-reload]', button()]]);
    vi.stubGlobal('document', { createElement: () => ({ querySelector: (key: string) => elements.get(key), querySelectorAll: () => steps }), body: { appendChild() {} } });
    const reload = vi.fn(); vi.stubGlobal('location', { reload });
    const town = createPreviewTown(), session = new SaveSession(town, true, storage), persist = vi.fn(() => session.save());
    const before = toSaveData(town); landmarkCheckpointSummary(town);
    expect({ ...toSaveData(town), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
    mountPreview(town, undefined, persist); expect(isPaused()).toBe(true); expect(m.calls).toEqual([]);
    controls[0](); expect(isPaused()).toBe(false); expect(run.textContent).toBe('Freeze study');
    controls[0](); expect(isPaused()).toBe(true); expect(run.textContent).toBe('Resume study');
    controls[1](); expect(town.time).toBe(before.time + 5); expect(result.textContent).toContain('Running:');
    controls[3](); expect(persist).toHaveBeenCalledOnce(); expect(result.textContent).toContain('Stored:');
    controls[5](); expect(reload).toHaveBeenCalledOnce();
    expect(m.calls.every(key => key.startsWith('tower-town-development-landmarks:'))).toBe(true);
  });
});
