import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from '../core/town';
import { isSocialDialogOpen, openSocialPanel, showGiftAccept } from './social';

const created: Element[] = [];
class Element extends EventTarget {
  className = ''; textContent = ''; id = ''; tabIndex = 0; autofocus = false;
  type = ''; value = ''; placeholder = ''; maxLength = 0; readOnly = false; rows = 0; disabled = false;
  open = false; isConnected = true; children: Element[] = []; parent: Element | null = null;
  attributes = new Map<string, string>(); focus = vi.fn(); select = vi.fn();
  constructor(readonly tag: string) { super(); created.push(this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: Element[]) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child: Element) { this.children.push(child); child.parent = this; return child; }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  set innerHTML(_value: string) { this.children = []; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  click() { this.dispatchEvent(new Event('click')); }
  getBoundingClientRect() { return { left: 10, top: 10, right: 390, bottom: 700 }; }
  all(): Element[] { return [this, ...this.children.flatMap((child) => child.all())]; }
}
function setup() {
  const body = new Element('body'), opener = new Element('button'), canvas = new Element('canvas');
  vi.stubGlobal('document', { body, activeElement: opener, createElement: (tag: string) => new Element(tag), getElementById: () => canvas });
  const data = new Map<string, string>();
  const storage: Storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(), key: () => null, get length() { return data.size; } };
  return { body, opener, canvas, storage, town: new Town(), dialog: () => body.children.find((node) => node.tag === 'dialog')! };
}
afterEach(() => { for (const element of created) if (element.tag === 'dialog' && element.open) element.close(); created.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('calm, keyboard-accessible sharing windows', () => {
  it('opens a named native dialog, focuses its heading, and exposes a pause signal until close', () => {
    const s = setup(); openSocialPanel(s.town, vi.fn(), true, s.storage);
    const dialog = s.dialog(), heading = dialog.all().find((node) => node.tag === 'h2')!;
    expect(dialog.open).toBe(true); expect(isSocialDialogOpen()).toBe(true);
    expect(dialog.attributes.get('aria-labelledby')).toBe(heading.id); expect(heading.focus).toHaveBeenCalledOnce();
    expect(dialog.all().some((node) => node.textContent.includes('town is paused'))).toBe(true);
    expect(dialog.all().find((node) => node.attributes.get('aria-label') === 'Gift code to redeem')).toBeDefined();
    dialog.all().find((node) => node.attributes.get('aria-label') === 'Close Friends')!.click();
    expect(isSocialDialogOpen()).toBe(false); expect(s.body.children).toHaveLength(0);
    expect(s.opener.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('restores canvas focus if the original opener no longer exists', () => {
    const s = setup(); openSocialPanel(s.town, vi.fn(), false); s.opener.isConnected = false;
    s.dialog().close(); expect(s.canvas.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('keeps preview/protected sharing free of gift actions and player-storage reads', () => {
    const s = setup(), get = vi.spyOn(s.storage, 'getItem'), set = vi.spyOn(s.storage, 'setItem');
    openSocialPanel(s.town, vi.fn(), false, s.storage);
    const nodes = s.dialog().all();
    expect(nodes.some((node) => node.textContent === '🎁 Redeem' || node.textContent === '250')).toBe(false);
    expect(nodes.some((node) => node.textContent.includes('protect your saved town'))).toBe(true);
    expect(get).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });
  it('keeps a failed invitation open and closes only after a successful retry', () => {
    const s = setup(), done = vi.fn(), saved = vi.fn(), before = s.town.economy.coins;
    const write = vi.spyOn(s.storage, 'setItem').mockImplementation(() => { throw new Error('Full'); });
    showGiftAccept(s.town, { kind: 'coins', amount: 250, nonce: 'test-invitation' }, done, s.storage, saved);
    const dialog = s.dialog(), accept = dialog.all().find((node) => node.textContent === 'Accept 250 coins')!;
    accept.click(); expect(dialog.open).toBe(true); expect(isSocialDialogOpen()).toBe(true);
    expect(done).not.toHaveBeenCalled(); expect(saved).toHaveBeenLastCalledWith(false); expect(s.town.economy.coins).toBe(before);
    write.mockRestore(); accept.click();
    expect(isSocialDialogOpen()).toBe(false); expect(done).toHaveBeenCalledOnce(); expect(saved).toHaveBeenLastCalledWith(true);
    expect(s.town.economy.coins).toBe(before + 250); expect(s.opener.focus).toHaveBeenCalledOnce();
  });
  it('treats native dismissal as cancellation without redeeming a gift', () => {
    const s = setup(), done = vi.fn(), before = s.town.economy.coins;
    showGiftAccept(s.town, { kind: 'coins', amount: 250, nonce: 'cancelled-invitation' }, done, s.storage);
    const dialog = s.dialog(), event = new Event('cancel', { cancelable: true }); dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); dialog.close(); // The native default Escape action.
    expect(done).not.toHaveBeenCalled(); expect(s.town.economy.coins).toBe(before); expect(s.town.gifts.redeemed).toEqual([]);
    expect(isSocialDialogOpen()).toBe(false);
  });
  it('cleans up a failed dialog opening without leaving the town paused', () => {
    const s = setup(); vi.spyOn(Element.prototype, 'showModal').mockImplementation(() => { throw new Error('No modal'); });
    expect(() => openSocialPanel(s.town, vi.fn(), false)).toThrow('No modal');
    expect(isSocialDialogOpen()).toBe(false); expect(s.body.children).toHaveLength(0);
  });
});
