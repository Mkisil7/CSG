import { Town } from './town';
import { saveGame } from './save';
import { encodeGift, makeCoinGift } from './share';
import { boundedNonces, readGiftLedger, validGift, type Gift } from './giftLedger';

export type GiftResult = { status: 'saved'; gift: Gift; code: string }
  | { status: 'invalid' | 'insufficient' | 'already-redeemed' | 'unavailable' };

/** Synchronous wallet+gift metadata commit; no mutation can be observed by a
 * simulation tick between applying the gift and saving/rolling back. */
export function sendCoinGift(town: Town, amount: number, from?: string, storage?: Storage): GiftResult {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { status: 'invalid' };
  if (town.economy.coins < amount) return { status: 'insufficient' };
  const gift = makeCoinGift(amount, from?.slice(0, 24)), code = encodeGift(gift);
  const coins = town.economy.coins, previous = town.gifts;
  town.economy.coins -= amount;
  town.gifts = { redeemed: [...previous.redeemed], sent: [gift, ...previous.sent].slice(0, 20) };
  if (!saveGame(town, storage)) { town.economy.coins = coins; town.gifts = previous; return { status: 'unavailable' }; }
  return { status: 'saved', gift, code };
}

export function redeemCoinGift(town: Town, gift: Gift, storage?: Storage): GiftResult {
  if (!validGift(gift) || !Number.isFinite(town.economy.coins + gift.amount)) return { status: 'invalid' };
  if (town.gifts.redeemed.includes(gift.nonce)) return { status: 'already-redeemed' };
  const legacy = readGiftLedger(storage);
  if (legacy === null) return { status: 'unavailable' };
  if (legacy.includes(gift.nonce)) return { status: 'already-redeemed' };
  const coins = town.economy.coins, income = town.economy.incomeToday, previous = town.gifts;
  town.economy.earn(gift.amount);
  town.gifts = { redeemed: boundedNonces([...legacy, ...previous.redeemed, gift.nonce]), sent: [...previous.sent] };
  if (!saveGame(town, storage)) {
    town.economy.coins = coins; town.economy.incomeToday = income; town.gifts = previous;
    return { status: 'unavailable' };
  }
  return { status: 'saved', gift, code: encodeGift(gift) };
}

export function giftFailureMessage(status: Exclude<GiftResult['status'], 'saved'>): string {
  return status === 'insufficient' ? 'Not enough coins to send that gift.' : status === 'already-redeemed' ? 'That gift was already redeemed.' :
    status === 'invalid' ? 'That gift code or amount is not valid.' : 'Gift not completed: browser storage is unavailable or full. Your coins and gift code are unchanged; retry when saving works.';
}
