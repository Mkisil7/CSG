import { SaveData, toSaveData, townFromSaveData } from './save';
import { Town } from './town';

/**
 * Self-contained "async multiplayer": towns and gifts are serialised into
 * shareable codes (no server involved). A town code round-trips a full save so
 * a friend can visit it read-only; a gift code carries a coin care-package that
 * a friend redeems into their own town.
 */

// ---- base64url of raw bytes ------------------------------------------------

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---- optional gzip (keeps town codes short where supported) ----------------

async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes as BufferSource).catch(() => {});
    writer.close().catch(() => {});
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes as BufferSource).catch(() => {});
    writer.close().catch(() => {});
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  } catch {
    return null;
  }
}

// ---- town codes ------------------------------------------------------------

/** Encode a town into a shareable code (gzip+base64url when available). */
export async function encodeTown(town: Town): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(toSaveData(town)));
  const gz = await gzip(bytes);
  return gz ? 'g' + bytesToBase64url(gz) : 'r' + bytesToBase64url(bytes);
}

/** Decode a town code back into a Town, or null if it's malformed. */
export async function decodeTown(code: string): Promise<Town | null> {
  try {
    const flag = code[0];
    const body = base64urlToBytes(code.slice(1));
    const raw = flag === 'g' ? await gunzip(body) : body;
    if (!raw) return null;
    const data = JSON.parse(new TextDecoder().decode(raw)) as SaveData;
    return townFromSaveData(data);
  } catch {
    return null;
  }
}

// ---- gift codes ------------------------------------------------------------

export interface Gift {
  kind: 'coins';
  amount: number;
  /** Sender's display name, if they set one. */
  from?: string;
  /** One-time id so a gift can't be redeemed twice on the same device. */
  nonce: string;
}

export function newNonce(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function makeCoinGift(amount: number, from?: string): Gift {
  return { kind: 'coins', amount: Math.max(0, Math.round(amount)), from, nonce: newNonce() };
}

/**
 * Compact, human-shareable gift code: `G<amount36>.<nonce>[.<name>]` — e.g.
 * `G3rs.k29fq1abc.QWxleA`. A gift carries almost no data, so there's no reason
 * to ship a big base64-JSON blob (or a full URL) for it. Amount is base-36, the
 * nonce is already URL-safe, and the optional sender name is base64url'd so it
 * can't collide with the `.` separators.
 */
export function encodeGift(gift: Gift): string {
  const parts = [Math.max(0, Math.round(gift.amount)).toString(36), gift.nonce];
  if (gift.from) parts.push(bytesToBase64url(new TextEncoder().encode(gift.from)));
  return 'G' + parts.join('.');
}

export function decodeGift(code: string): Gift | null {
  try {
    const s = code.trim();
    if (s[0] !== 'G') return null;
    const parts = s.slice(1).split('.');
    if (parts.length < 2 || parts.length > 3) return null;
    const amount = parseInt(parts[0], 36);
    const nonce = parts[1];
    if (!Number.isFinite(amount) || amount < 0 || !nonce) return null;
    const from =
      parts[2] !== undefined
        ? new TextDecoder().decode(base64urlToBytes(parts[2])) || undefined
        : undefined;
    return { kind: 'coins', amount, from, nonce };
  } catch {
    return null;
  }
}

/** Apply a gift to a town (mutates it). Returns a short description. */
export function applyGift(town: Town, gift: Gift): string {
  town.economy.earn(gift.amount);
  return `${gift.amount} coins`;
}

// ---- one-time redemption + player name (localStorage) ----------------------

const REDEEMED_KEY = 'tower-town-gifts-redeemed';
const NAME_KEY = 'tower-town-player-name';

export function isGiftRedeemed(nonce: string, storage: Storage = localStorage): boolean {
  try {
    return (storage.getItem(REDEEMED_KEY) ?? '').split(',').includes(nonce);
  } catch {
    return false;
  }
}

export function markGiftRedeemed(nonce: string, storage: Storage = localStorage): void {
  try {
    const list = (storage.getItem(REDEEMED_KEY) ?? '').split(',').filter(Boolean);
    if (!list.includes(nonce)) list.push(nonce);
    // Keep the list bounded.
    storage.setItem(REDEEMED_KEY, list.slice(-500).join(','));
  } catch {
    // ignore
  }
}

export function getPlayerName(storage: Storage = localStorage): string {
  try {
    return storage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setPlayerName(name: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(NAME_KEY, name.slice(0, 24));
  } catch {
    // ignore
  }
}
