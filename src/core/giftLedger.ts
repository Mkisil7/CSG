export interface Gift { kind: 'coins'; amount: number; from?: string; nonce: string }
export interface GiftData { redeemed: string[]; sent: Gift[] }
const KEY = 'tower-town-gifts-redeemed';
export const validNonce = (nonce: unknown): nonce is string => typeof nonce === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(nonce);
export function validGift(gift: unknown): gift is Gift {
  if (!gift || typeof gift !== 'object') return false;
  const g = gift as Gift;
  return g.kind === 'coins' && Number.isSafeInteger(g.amount) && g.amount > 0 && validNonce(g.nonce)
    && (g.from === undefined || typeof g.from === 'string' && g.from.length <= 100);
}
export function boundedNonces(nonces: unknown[]): string[] { return [...new Set(nonces.filter(validNonce))].slice(-500); }
export function restoreGiftData(data?: Partial<GiftData>): GiftData {
  return { redeemed: boundedNonces(Array.isArray(data?.redeemed) ? data.redeemed : []),
    sent: (Array.isArray(data?.sent) ? data.sent : []).filter(validGift).slice(0, 20).map((gift) => ({ ...gift })) };
}
/** null means inaccessible, never permission to redeem an unchecked code. */
export function readGiftLedger(storage?: Storage): string[] | null {
  try {
    const values = ((storage ?? localStorage).getItem(KEY) ?? '').split(',').filter(Boolean);
    return values.every(validNonce) ? boundedNonces(values) : null;
  } catch { return null; }
}
export function writeGiftLedger(nonces: string[], storage?: Storage): boolean {
  try { (storage ?? localStorage).setItem(KEY, boundedNonces(nonces).join(',')); return true; } catch { return false; }
}
