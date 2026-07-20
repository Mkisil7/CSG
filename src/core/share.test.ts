import { describe, expect, it } from 'vitest';
import { Town } from './town';
import { createResident } from './residents';
import {
  applyGift,
  decodeGift,
  decodeTown,
  encodeGift,
  encodeTown,
  isGiftRedeemed,
  makeCoinGift,
  markGiftRedeemed,
} from './share';

function mockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('town sharing codes', () => {
  it('round-trips a town through a share code', async () => {
    const town = new Town();
    town.economy.coins = 4321;
    town.time = 5000;
    const t0 = town.slots[0].game!;
    t0.tower.addFloor('residential');
    t0.tower.addFloor('shop', 'boutique');
    t0.residents.push(createResident(1, 't0'));

    const code = await encodeTown(town);
    expect(code.length).toBeGreaterThan(0);

    const decoded = await decodeTown(code);
    expect(decoded).not.toBeNull();
    expect(Math.round(decoded!.economy.coins)).toBe(4321);
    const dt0 = decoded!.slots[0].game!;
    expect(dt0.tower.floors.length).toBe(t0.tower.floors.length);
    expect(dt0.tower.floors[2].subtype).toBe('boutique');
    expect(dt0.residents.length).toBe(1);
  });

  it('returns null for a malformed code', async () => {
    expect(await decodeTown('not-a-real-code!!')).toBeNull();
    expect(await decodeTown('gZZZZ')).toBeNull();
  });
});

describe('gift codes', () => {
  it('encodes/decodes a coin gift and applies it', () => {
    const gift = makeCoinGift(500, 'Ada');
    const back = decodeGift(encodeGift(gift));
    expect(back).not.toBeNull();
    expect(back!.amount).toBe(500);
    expect(back!.from).toBe('Ada');

    const town = new Town();
    const before = town.economy.coins;
    applyGift(town, back!);
    expect(town.economy.coins).toBe(before + 500);
  });

  it('tracks one-time redemption', () => {
    const storage = mockStorage();
    const gift = makeCoinGift(1000);
    expect(isGiftRedeemed(gift.nonce, storage)).toBe(false);
    markGiftRedeemed(gift.nonce, storage);
    expect(isGiftRedeemed(gift.nonce, storage)).toBe(true);
  });

  it('rejects malformed / non-gift codes', () => {
    expect(decodeGift('nope')).toBeNull();
    expect(decodeGift('Gnotbase64json')).toBeNull();
  });
});
