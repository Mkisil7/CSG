import { Town } from '../core/town';
import { sendCoinGift, redeemCoinGift, giftFailureMessage } from '../core/giftTransactions';
import {
  Gift,
  decodeGift,
  encodeGift,
  encodeTown,
  getPlayerName,
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
  try { return m ? decodeURIComponent(m[1]) : s; } catch { return ''; }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const socialDialogs = new Set<HTMLDialogElement>();
let nextDialogId = 0;
export function isSocialDialogOpen(): boolean { return [...socialDialogs].some((dialog) => dialog.open); }

function openModal(title: string, label: string): { card: HTMLElement; body: HTMLElement; close: () => void } {
  const returnFocus = document.activeElement as HTMLElement | null;
  const card = el('dialog', 'social-card');
  const id = ++nextDialogId;
  const close = () => card.close();
  const x = el('button', 'insp-close', '×');
  x.type = 'button'; x.setAttribute('aria-label', `Close ${label}`);
  x.addEventListener('click', close);
  const header = el('header', 'social-header');
  const heading = el('h2', 'social-title', title); heading.id = `social-title-${id}`;
  heading.tabIndex = -1; heading.autofocus = true;
  header.append(heading, x); card.appendChild(header);
  const body = el('div', 'social-body');
  const note = el('p', 'social-pause-note', 'Your town is paused while this window is open.');
  note.id = `social-note-${id}`; body.appendChild(note);
  card.setAttribute('aria-labelledby', heading.id); card.setAttribute('aria-describedby', note.id);
  card.appendChild(body);
  card.addEventListener('click', (event) => {
    const bounds = card.getBoundingClientRect();
    if (event.target === card && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) close();
  });
  card.addEventListener('close', () => {
    socialDialogs.delete(card); card.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else document.getElementById('game-canvas')?.focus({ preventScroll: true });
  }, { once: true });
  document.body.appendChild(card); socialDialogs.add(card);
  try { card.showModal(); heading.focus(); }
  catch (error) { socialDialogs.delete(card); card.remove(); throw error; }
  return { card, body, close };
}

function copyRow(label: string, value: string): HTMLElement {
  const wrap = el('div', 'social-codeblock');
  wrap.appendChild(el('div', 'social-label', label));
  const ta = el('textarea', 'social-textarea');
  ta.value = value;
  ta.readOnly = true;
  ta.setAttribute('aria-label', label);
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
export function openSocialPanel(town: Town, onToast: (m: string) => void, allowGifts = true,
  storage?: Storage, onSaveResult: (saved: boolean) => void = () => {}): void {
  const { body, close } = openModal('🌐 Friends', 'Friends');

  // --- your name ---
  const nameSec = el('div', 'social-row');
  nameSec.appendChild(el('div', 'social-label', 'Your name (shown on gifts you send)'));
  const nameInput = el('input', 'social-input');
  nameInput.setAttribute('aria-label', 'Your name for gifts');
  nameInput.value = allowGifts ? getPlayerName(storage) : '';
  nameInput.placeholder = 'Anonymous';
  nameInput.maxLength = 24;
  nameInput.addEventListener('change', () => setPlayerName(nameInput.value, storage));
  nameSec.appendChild(nameInput);
  if (allowGifts) body.appendChild(nameSec);

  // --- share my town ---
  body.appendChild(el('div', 'social-section', 'Share your town'));
  const shareOut = el('div', 'social-out');
  const shareBtn = el('button', 'build-btn social-action', '🔗 Create a visit code');
  shareBtn.addEventListener('click', async () => {
    shareBtn.disabled = true;
    shareBtn.textContent = 'Encoding…';
    const code = await encodeTown(town);
    shareOut.innerHTML = '';
    shareOut.appendChild(
      copyRow('Send this code — a friend pastes it under “Visit a friend” to walk your town', code),
    );
    shareBtn.disabled = false;
    shareBtn.textContent = '🔗 Create a visit code';
  });
  body.append(shareBtn, shareOut);

  // --- visit a friend ---
  body.appendChild(el('div', 'social-section', 'Visit a friend’s town'));
  const visitInput = el('textarea', 'social-textarea');
  visitInput.setAttribute('aria-label', 'Friend’s visit code');
  visitInput.rows = 2;
  visitInput.placeholder = 'Paste a friend’s visit code…';
  const visitBtn = el('button', 'build-btn social-action', '👣 Visit');
  visitBtn.addEventListener('click', () => {
    const code = extractCode(visitInput.value, 'visit');
    if (!code) return;
    location.href = linkFor('visit', code);
  });
  body.append(visitInput, visitBtn);

  // Disposable studies can share a snapshot, but must not touch player storage,
  // spend real gift codes or consume a redemption nonce on this device.
  if (!allowGifts) {
    body.appendChild(el('p', 'social-row', 'Unsaved or preview town: sharing is available; gifts and player settings are disabled to protect your saved town.'));
    return;
  }

  // --- send a gift ---
  body.appendChild(el('div', 'social-section', 'Send a coin gift'));
  const giftOut = el('div', 'social-out');
  const giftStatus = el('p', 'social-row'); giftStatus.setAttribute('role', 'status');
  const renderSent = () => {
    giftOut.innerHTML = '';
    if (town.gifts.sent.length) giftOut.appendChild(el('div', 'social-label', 'Recent sent gifts · last 20 · already deducted'));
    for (const gift of town.gifts.sent) giftOut.appendChild(copyRow(`Gift code for ${gift.amount} coins`, encodeGift(gift)));
  };
  renderSent();
  const amtRow = el('div', 'social-amounts');
  for (const amt of [250, 1000, 5000]) {
    const b = el('button', 'build-btn', `${amt}`);
    b.addEventListener('click', () => {
      const result = sendCoinGift(town, amt, getPlayerName(storage) || undefined, storage);
      if (result.status !== 'saved') {
        giftStatus.textContent = giftFailureMessage(result.status);
        if (result.status === 'unavailable') onSaveResult(false);
        return;
      }
      onSaveResult(true); renderSent();
      giftStatus.textContent = 'Gift saved. Copy its code below; reopening Friends also shows your recent sent codes.';
      onToast(`Gift of ${amt} coins created (deducted from your treasury)`);
    });
    amtRow.appendChild(b);
  }
  body.append(amtRow, giftStatus, giftOut);

  // --- redeem a gift ---
  body.appendChild(el('div', 'social-section', 'Redeem a gift'));
  const redeemInput = el('textarea', 'social-textarea');
  redeemInput.setAttribute('aria-label', 'Gift code to redeem');
  redeemInput.rows = 2;
  redeemInput.placeholder = 'Paste a gift code…';
  const redeemBtn = el('button', 'build-btn social-action', '🎁 Redeem');
  const redeemStatus = el('p', 'social-row'); redeemStatus.setAttribute('role', 'status');
  redeemBtn.addEventListener('click', () => {
    const gift = decodeGift(extractCode(redeemInput.value, 'gift'));
    if (!gift) {
      redeemStatus.textContent = 'That gift code isn’t valid';
      return;
    }
    const result = redeemCoinGift(town, gift, storage);
    if (result.status !== 'saved') {
      redeemStatus.textContent = giftFailureMessage(result.status);
      if (result.status === 'unavailable') onSaveResult(false);
      return;
    }
    onSaveResult(true);
    onToast(`Received ${gift.amount} coins${gift.from ? ` from ${gift.from}` : ''}!`);
    close();
  });
  body.append(redeemInput, redeemBtn, redeemStatus);
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
export function showGiftAccept(town: Town, gift: Gift, onDone: () => void,
  storage?: Storage, onSaveResult: (saved: boolean) => void = () => {}): void {
  const { body, close } = openModal('🎁 A gift for your town!', 'gift invitation');
  body.appendChild(
    el(
      'div',
      'social-row',
      `${gift.from ? `${gift.from} sent you` : 'You’ve been sent'} ${gift.amount} coins.`,
    ),
  );
  const accept = el('button', 'build-btn social-action', `Accept ${gift.amount} coins`);
  const status = el('p', 'social-row'); status.setAttribute('role', 'status');
  accept.addEventListener('click', () => {
    const result = redeemCoinGift(town, gift, storage);
    if (result.status !== 'saved') {
      status.textContent = giftFailureMessage(result.status);
      if (result.status === 'unavailable') onSaveResult(false);
      return;
    }
    onSaveResult(true);
    close();
    onDone();
  });
  body.append(accept, status);
}
