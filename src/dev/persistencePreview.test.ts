import { describe, expect, it } from 'vitest';
import { checkpointSummary, createPreviewTown, isPaused, studyStorage } from './persistencePreview';
import { readGame, SaveSession, toSaveData } from '../core/save';
import { createResident } from '../core/residents';
import { redeemCoinGift, sendCoinGift } from '../core/giftTransactions';

function memory() {
  const data = new Map<string, string>([['tower-town-save-v4', 'player town'], ['tower-town-gifts-redeemed', 'player-gift'], ['unrelated', 'untouched']]);
  const calls: string[] = [];
  const storage: Storage = {
    getItem: key => { calls.push(key); return data.get(key) ?? null; },
    setItem: (key, value) => { calls.push(key); data.set(key, value); },
    removeItem: key => { calls.push(key); data.delete(key); },
    clear: () => { throw new Error('Broad clear is forbidden'); },
    key: () => { throw new Error('Browser enumeration is forbidden'); },
    get length(): number { throw new Error('Browser enumeration is forbidden'); },
  };
  return { data, calls, storage };
}

describe('isolated real-browser persistence study', () => {
  it('starts a normal empty town and pauses between deliberate steps without granting progress', () => {
    const town = createPreviewTown();
    expect(town.population).toBe(0); expect(town.economy.coins).toBe(300);
    expect(town.missions.completedCount).toBe(0); expect(town.towers()[0].tower.height).toBe(1);
    expect(isPaused()).toBe(true);
  });

  it('round-trips the normal save session with actual milestones and leaves player keys untouched', () => {
    const m = memory(), storage = studyStorage(() => m.storage), town = createPreviewTown();
    expect(readGame(storage).status).toBe('empty');
    const game = town.towers()[0]; game.tower.addFloor('residential');
    game.residents.push(createResident(1, game.id)); town.missions.checkInstant(town);
    game.rename('The Copper House'); town.identity.name = 'Lantern Town';
    const session = new SaveSession(town, true, storage);
    expect(session.save()).toBe(true);
    const loaded = readGame(storage);
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') throw new Error('Expected loaded study');
    expect(checkpointSummary(loaded.result.town)).toBe(checkpointSummary(town));
    expect(loaded.result.town.missions.completed).toEqual(town.missions.completed);
    expect(m.data.get('tower-town-save-v4')).toBe('player town');
    expect(m.calls.every(key => key.startsWith('tower-town-development-persistence:'))).toBe(true);
  });

  it('scopes gift commits and reset redemptions, including old-save cleanup and unload suppression', () => {
    const m = memory(), storage = studyStorage(() => m.storage), town = createPreviewTown();
    const gift = { kind: 'coins' as const, amount: 50, nonce: 'study-neighbor' };
    expect(redeemCoinGift(town, gift, storage).status).toBe('saved');
    expect(sendCoinGift(town, 20, 'Study', storage).status).toBe('saved');
    const session = new SaveSession(town, true, storage);
    expect(session.reset()).toBe(true); expect(session.save()).toBe(null);
    expect(readGame(storage).status).toBe('empty');
    expect(redeemCoinGift(createPreviewTown(), gift, storage).status).toBe('already-redeemed');
    expect(m.data.get('tower-town-gifts-redeemed')).toBe('player-gift');
    expect(m.data.get('tower-town-save-v4')).toBe('player town');
    expect(m.calls.every(key => key.startsWith('tower-town-development-persistence:'))).toBe(true);
  });

  it('never enumerates or clears unrelated browser storage and rejects unrecognized keys', () => {
    const m = memory(), storage = studyStorage(() => m.storage);
    storage.setItem('tower-town-save-v4', 'test');
    expect(storage.length).toBe(1); expect(storage.key(0)).toBe('tower-town-save-v4'); expect(storage.key(1)).toBeNull();
    expect(() => storage.getItem('unrelated')).toThrow('Unknown');
    expect(() => storage.setItem('unrelated', 'bad')).toThrow('Unknown');
    expect(() => storage.removeItem('unrelated')).toThrow('Unknown');
    storage.clear(); expect(storage.length).toBe(0);
    expect([...m.data.values()]).toEqual(['player town', 'player-gift', 'untouched']);
  });

  it('handles denied browser storage lazily through normal read and save failures', () => {
    const storage = studyStorage(() => { throw new DOMException('Denied', 'SecurityError'); });
    expect(readGame(storage).status).toBe('unavailable');
    const town = createPreviewTown(), session = new SaveSession(town, true, storage);
    expect(session.save()).toBe(false); expect(session.reset()).toBe(false);
    expect(session.enabled).toBe(true);
  });

  it('preserves an invalid study save when the player chooses a temporary session', () => {
    const m = memory(), storage = studyStorage(() => m.storage);
    storage.setItem('tower-town-save-v4', 'broken-study');
    expect(readGame(storage).status).toBe('invalid');
    const session = new SaveSession(createPreviewTown(), false, storage);
    expect(session.save()).toBe(null); expect(session.reset()).toBe(false);
    expect(storage.getItem('tower-town-save-v4')).toBe('broken-study');
    expect(m.data.get('tower-town-save-v4')).toBe('player town');
  });

  it('reports only actual town state without mutating the running simulation', () => {
    const town = createPreviewTown(), before = toSaveData(town);
    expect(checkpointSummary(town)).toContain('0 residents · 300 coins · 1 floors · 0 milestones · 0 memories');
    expect({ ...toSaveData(town), savedAtWallClock: before.savedAtWallClock }).toEqual(before);
  });
});
