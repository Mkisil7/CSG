import { Town } from '../core/town';
import { saveGame } from '../core/save';
import {
  Gift,
  decodeGift,
  encodeGift,
  encodeTown,
  applyGift,
  getPlayerName,
  isGiftRedeemed,
  makeCoinGift,
  markGiftRedeemed,
  setPlayerName,
} from '../core/share';

/**
 * "Friends" UI: self-contained async multiplayer. Share your town as a link,
 * visit a friend's town (read-only) by opening theirs, and send/redeem coin
 * gifts — all via shareable codes, no server involved.
 */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function linkFor(param: 'visit' | 'gift', code: string): string {
  return `${location.origin}${location.pathname}?${param}=${code}`;
}

/** Accept a raw code or a full link containing ?param=code. */
function extractCode(input: string, param: 'visit' | 'gift'): string {
  const s = input.trim();
  const m = s.match(new RegExp(`[?&]${param}=([^&\\s]+)`));
  return m ? decodeURIComponent(m[1]) : s;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function openModal(title: string): { card: HTMLElement; body: HTMLElement; close: () => void } {
  const overlay = el('div', 'social-overlay');
  const card = el('div', 'social-card');
  const close = () => overlay.remove();
  const x = el('button', 'insp-close', '×');
  x.addEventListener('click', close);
  card.append(x, el('div', 'social-title', title));
  const body = el('div', 'social-body');
  card.appendChild(body);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  return { card, body, close };
}

function copyRow(label: string, value: string): HTMLElement {
  const wrap = el('div', 'social-codeblock');
  wrap.appendChild(el('div', 'social-label', label));
  const ta = el('textarea', 'social-textarea');
  ta.value = value;
  ta.readOnly = true;
  ta.rows = 3;
  const btn = el('button', 'build-btn', '📋 Copy');
  btn.addEventListener('click', async () => {
    const ok = await copyToClipboard(value);
    btn.textContent = ok ? 'Copied ✓' : 'Select all & copy';
    if (!ok) {
      ta.focus();
      ta.select();
    }
  });
  wrap.append(ta, btn);
  return wrap;
}

/** The main "Friends" panel for the player's own town. */
export function openSocialPanel(town: Town, onToast: (m: string) => void): void {
  const { body, close } = openModal('🌐 Friends');

  // --- your name ---
  const nameSec = el('div', 'social-row');
  nameSec.appendChild(el('div', 'social-label', 'Your name (shown on gifts you send)'));
  const nameInput = el('input', 'social-input');
  nameInput.value = getPlayerName();
  nameInput.placeholder = 'Anonymous';
  nameInput.maxLength = 24;
  nameInput.addEventListener('change', () => setPlayerName(nameInput.value));
  nameSec.appendChild(nameInput);
  body.appendChild(nameSec);

  // --- share my town ---
  body.appendChild(el('div', 'social-section', 'Share your town'));
  const shareOut = el('div', 'social-out');
  const shareBtn = el('button', 'build-btn social-action', '🔗 Create a visit link');
  shareBtn.addEventListener('click', async () => {
    shareBtn.disabled = true;
    shareBtn.textContent = 'Encoding…';
    const code = await encodeTown(town);
    shareOut.innerHTML = '';
    shareOut.appendChild(
      copyRow('Send this link — friends open it to walk through your town', linkFor('visit', code)),
    );
    shareBtn.disabled = false;
    shareBtn.textContent = '🔗 Create a visit link';
  });
  body.append(shareBtn, shareOut);

  // --- visit a friend ---
  body.appendChild(el('div', 'social-section', 'Visit a friend’s town'));
  const visitInput = el('textarea', 'social-textarea');
  visitInput.rows = 2;
  visitInput.placeholder = 'Paste a friend’s visit link or code…';
  const visitBtn = el('button', 'build-btn social-action', '👣 Visit');
  visitBtn.addEventListener('click', () => {
    const code = extractCode(visitInput.value, 'visit');
    if (!code) return;
    location.href = linkFor('visit', code);
  });
  body.append(visitInput, visitBtn);

  // --- send a gift ---
  body.appendChild(el('div', 'social-section', 'Send a coin gift'));
  const giftOut = el('div', 'social-out');
  const amtRow = el('div', 'social-amounts');
  for (const amt of [250, 1000, 5000]) {
    const b = el('button', 'build-btn', `${amt}`);
    b.addEventListener('click', () => {
      if (!town.economy.spend(amt)) {
        onToast('Not enough coins to gift that');
        return;
      }
      saveGame(town);
      const gift = makeCoinGift(amt, getPlayerName() || undefined);
      giftOut.innerHTML = '';
      giftOut.appendChild(
        copyRow(`Gift of ${amt} coins — send this link to a friend`, linkFor('gift', encodeGift(gift))),
      );
      onToast(`Gift of ${amt} coins created (deducted from your treasury)`);
    });
    amtRow.appendChild(b);
  }
  body.append(amtRow, giftOut);

  // --- redeem a gift ---
  body.appendChild(el('div', 'social-section', 'Redeem a gift'));
  const redeemInput = el('textarea', 'social-textarea');
  redeemInput.rows = 2;
  redeemInput.placeholder = 'Paste a gift link or code…';
  const redeemBtn = el('button', 'build-btn social-action', '🎁 Redeem');
  redeemBtn.addEventListener('click', () => {
    const gift = decodeGift(extractCode(redeemInput.value, 'gift'));
    if (!gift) {
      onToast('That gift code isn’t valid');
      return;
    }
    if (isGiftRedeemed(gift.nonce)) {
      onToast('That gift was already redeemed');
      return;
    }
    const desc = applyGift(town, gift);
    markGiftRedeemed(gift.nonce);
    saveGame(town);
    onToast(`Received ${desc}${gift.from ? ` from ${gift.from}` : ''}!`);
    close();
  });
  body.append(redeemInput, redeemBtn);
}

/** Top banner shown while visiting a friend's town (read-only). */
export function showVisitingBanner(onReturn: () => void): void {
  const banner = el('div', 'visiting-banner');
  banner.appendChild(el('span', undefined, '👋 Visiting a shared town — read-only'));
  const back = el('button', 'build-btn', '← My town');
  back.addEventListener('click', onReturn);
  banner.appendChild(back);
  document.body.appendChild(banner);
}

/** Modal offered when the page is opened via a ?gift= link. */
export function showGiftAccept(town: Town, gift: Gift, onDone: () => void): void {
  const { body, close } = openModal('🎁 A gift for your town!');
  body.appendChild(
    el(
      'div',
      'social-row',
      `${gift.from ? `${gift.from} sent you` : 'You’ve been sent'} ${gift.amount} coins.`,
    ),
  );
  const accept = el('button', 'build-btn social-action', `Accept ${gift.amount} coins`);
  accept.addEventListener('click', () => {
    if (!isGiftRedeemed(gift.nonce)) {
      applyGift(town, gift);
      markGiftRedeemed(gift.nonce);
      saveGame(town);
    }
    close();
    onDone();
  });
  body.appendChild(accept);
}
