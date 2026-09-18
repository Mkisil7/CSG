import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from './town';
import { sendCoinGift, redeemCoinGift } from './giftTransactions';
import { clearSave, loadGame, saveGame, toSaveData, townFromSaveData } from './save';
import { decodeGift, decodeTown, encodeGift, encodeTown } from './share';
import { type Gift } from './giftLedger';

function setup() {
  const data = new Map<string, string>();
  const storage: Storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); }, clear: () => data.clear(), key: (index) => [...data.keys()][index] ?? null, get length() { return data.size; } };
  const town = new Town(); town.economy.coins = 5000; town.economy.incomeToday = 123;
  saveGame(town, storage);
  const gift: Gift = { kind: 'coins', amount: 250, nonce: 'a-test-gift', from: 'A neighbor' };
  return { town, storage, data, gift };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('wallet and gift metadata commit together', () => {
  it('saves a deduction and recoverable outbox in exactly one write without changing earned income', () => {
    const s = setup(), write = vi.spyOn(s.storage, 'setItem');
    const sent = sendCoinGift(s.town, 1000, 'Ada', s.storage);
    expect(sent.status).toBe('saved'); expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe('tower-town-save-v4');
    const loaded = loadGame(s.storage)!.town;
    expect(loaded.economy.coins).toBe(4000); expect(loaded.economy.incomeToday).toBe(123);
    expect(loaded.gifts.sent).toEqual(s.town.gifts.sent);
    if (sent.status === 'saved') expect(decodeGift(encodeGift(loaded.gifts.sent[0]))).toEqual(sent.gift);
  });
  it('rolls back a failed send, leaves the old save untouched and returns no gift code', () => {
    const s = setup(), before = s.data.get('tower-town-save-v4'), gifts = s.town.gifts;
    const write = vi.spyOn(s.storage, 'setItem').mockImplementation(() => { throw new Error('Full'); });
    expect(sendCoinGift(s.town, 1000, 'Ada', s.storage)).toEqual({ status: 'unavailable' });
    expect(s.town.economy.coins).toBe(5000); expect(s.town.economy.incomeToday).toBe(123); expect(s.town.gifts).toBe(gifts);
    expect(s.data.get('tower-town-save-v4')).toBe(before);
    write.mockRestore(); expect(sendCoinGift(s.town, 1000, 'Ada', s.storage).status).toBe('saved');
    expect(s.town.economy.coins).toBe(4000); expect(s.town.gifts.sent).toHaveLength(1);
  });
  it('credits the wallet and nonce in one write and rejects replay before and after reload', () => {
    const s = setup(), write = vi.spyOn(s.storage, 'setItem');
    expect(redeemCoinGift(s.town, s.gift, s.storage).status).toBe('saved');
    expect(write).toHaveBeenCalledTimes(1); expect(write.mock.calls[0][0]).toBe('tower-town-save-v4');
    expect(s.town.economy.coins).toBe(5250); expect(s.town.economy.incomeToday).toBe(373);
    expect(redeemCoinGift(s.town, s.gift, s.storage).status).toBe('already-redeemed');
    const loaded = loadGame(s.storage)!.town;
    expect(loaded.gifts.redeemed).toContain(s.gift.nonce);
    expect(redeemCoinGift(loaded, s.gift, s.storage).status).toBe('already-redeemed');
    expect(write).toHaveBeenCalledTimes(1); expect(loaded.economy.coins).toBe(5250);
  });
  it('does not consume a nonce or income when the redemption save fails, allowing retry', () => {
    const s = setup(), before = s.data.get('tower-town-save-v4');
    const write = vi.spyOn(s.storage, 'setItem').mockImplementation(() => { throw new Error('Denied'); });
    expect(redeemCoinGift(s.town, s.gift, s.storage).status).toBe('unavailable');
    expect(s.town.economy.coins).toBe(5000); expect(s.town.economy.incomeToday).toBe(123);
    expect(s.town.gifts.redeemed).toEqual([]); expect(s.data.get('tower-town-save-v4')).toBe(before);
    expect(s.data.has('tower-town-gifts-redeemed')).toBe(false);
    write.mockRestore(); expect(redeemCoinGift(s.town, s.gift, s.storage).status).toBe('saved');
    expect(s.town.economy.coins).toBe(5250);
  });
  it.each(['unreadable', 'malformed'])('refuses redemption when the legacy ledger is %s', (mode) => {
    const s = setup(), before = s.town.economy.coins;
    if (mode === 'malformed') s.data.set('tower-town-gifts-redeemed', 'bad nonce with spaces');
    else vi.spyOn(s.storage, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    const write = vi.spyOn(s.storage, 'setItem');
    expect(redeemCoinGift(s.town, s.gift, s.storage).status).toBe('unavailable');
    expect(write).not.toHaveBeenCalled(); expect(s.town.economy.coins).toBe(before);
  });
  it('honors old device redemptions and preserves new ones across a town reset', () => {
    const s = setup(); s.data.set('tower-town-gifts-redeemed', 'legacy-gift');
    expect(redeemCoinGift(s.town, { ...s.gift, nonce: 'legacy-gift' }, s.storage).status).toBe('already-redeemed');
    expect(redeemCoinGift(s.town, s.gift, s.storage).status).toBe('saved');
    expect(clearSave(s.storage)).toBe(true); expect(loadGame(s.storage)).toBeNull();
    expect(s.data.get('tower-town-gifts-redeemed')).toBe('legacy-gift,a-test-gift');
    expect(redeemCoinGift(new Town(), s.gift, s.storage).status).toBe('already-redeemed');
  });
  it('aborts reset if committed redemptions cannot be preserved', () => {
    const s = setup(); redeemCoinGift(s.town, s.gift, s.storage);
    const before = s.data.get('tower-town-save-v4');
    vi.spyOn(s.storage, 'setItem').mockImplementation(() => { throw new Error('Full'); });
    expect(clearSave(s.storage)).toBe(false); expect(s.data.get('tower-town-save-v4')).toBe(before);
    expect(loadGame(s.storage)!.town.economy.coins).toBe(5250);
  });
  it('retains only twenty sent codes and excludes private gift data from visit codes', async () => {
    const s = setup(); for (let i = 0; i < 22; i++) expect(sendCoinGift(s.town, 1, `Sender ${i}`, s.storage).status).toBe('saved');
    redeemCoinGift(s.town, s.gift, s.storage);
    expect(s.town.gifts.sent).toHaveLength(20); expect(s.town.gifts.sent[0].from).toBe('Sender 21');
    const snapshot = toSaveData(s.town); snapshot.gifts!.sent[0].amount = 99;
    expect(s.town.gifts.sent[0].amount).toBe(1);
    const visited = await decodeTown(await encodeTown(s.town)); expect(visited!.gifts).toEqual({ sent: [], redeemed: [] });
    expect(visited!.economy.coins).toBe(s.town.economy.coins);
  });
  it('defaults old saves and bounds malformed gift metadata', () => {
    const s = setup(), old = toSaveData(s.town); delete old.gifts;
    expect(townFromSaveData(old)!.gifts).toEqual({ redeemed: [], sent: [] });
    old.gifts = { redeemed: [...Array.from({ length: 510 }, (_, i) => `gift-${i}`), 'bad nonce'], sent: [{ ...s.gift, amount: -10 }, s.gift] };
    const loaded = townFromSaveData(old)!; expect(loaded.gifts.redeemed).toHaveLength(500); expect(loaded.gifts.sent).toEqual([s.gift]);
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid send amount %s without writing', (amount) => {
    const s = setup(), write = vi.spyOn(s.storage, 'setItem');
    expect(sendCoinGift(s.town, amount, undefined, s.storage).status).toBe('invalid'); expect(write).not.toHaveBeenCalled();
  });
  it('rejects partial amount parsing and malformed nonces', () => {
    for (const code of ['G1!.good', 'G-1.good', 'G0.good', 'G10.bad nonce', `Gzzzzzzzzzzzzzzz.good`]) expect(decodeGift(code)).toBeNull();
  });
  it('leaves an unaffordable send and denied global storage unchanged', () => {
    const s = setup(), write = vi.spyOn(s.storage, 'setItem');
    expect(sendCoinGift(s.town, 6000, undefined, s.storage).status).toBe('insufficient'); expect(write).not.toHaveBeenCalled();
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Denied'); } });
    expect(sendCoinGift(s.town, 250).status).toBe('unavailable');
    expect(redeemCoinGift(s.town, s.gift).status).toBe('unavailable');
    expect(s.town.economy.coins).toBe(5000); expect(s.town.gifts).toEqual({ sent: [], redeemed: [] });
  });
});
