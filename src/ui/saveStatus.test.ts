import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from '../core/town';
import { SaveStatus, showLoadFailure } from './saveStatus';

class Element extends EventTarget {
  hidden = false; open = false; className = ''; type = ''; textContent = ''; href = ''; download = '';
  children: Element[] = []; controls = new Map<string, Element>(); removed = false; html = '';
  setAttribute = vi.fn(); focus = vi.fn();
  appendChild(child: Element) { this.children.push(child); return child; }
  remove() { this.removed = true; }
  click() { this.dispatchEvent(new Event('click')); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  set innerHTML(value: string) {
    this.html = value; this.controls.clear();
    if (value.includes('<dialog')) { const dialog = new Element(); dialog.innerHTML = value.replace('<dialog', '<section'); this.controls.set('dialog', dialog); }
    for (const match of value.matchAll(/data-([a-z-]+)(?:>|\s)/g)) this.controls.set(`[data-${match[1]}]`, new Element());
    if (value.includes('id="save-status-title"')) this.controls.set('#save-status-title', new Element());
  }
  get innerHTML() { return this.html; }
  querySelector(selector: string) { return this.controls.get(selector) ?? null; }
}
function setup(retry: (() => boolean) | null = () => false) {
  const root = new Element(), body = new Element(), made: Element[] = [];
  vi.stubGlobal('document', { body, createElement: () => { const e = new Element(); made.push(e); return e; } });
  const town = new Town(), status = new SaveStatus(root as unknown as HTMLElement, () => town, retry);
  return { root, body, town, status, warning: root.children[0], made };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('honest save recovery controls', () => {
  it('keeps failed writes visible until a confirmed success, including while the dialog is open', () => {
    const retry = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true), s = setup(retry);
    expect(s.warning.hidden).toBe(true); s.status.report(false); expect(s.warning.hidden).toBe(false);
    s.warning.click(); expect(s.status.isOpen).toBe(true); const dialog = s.root.children[1];
    dialog.querySelector('[data-save-retry]')!.click(); expect(s.warning.hidden).toBe(false);
    expect(dialog.querySelector('[data-save-result]')!.textContent).toContain('Still not saved');
    dialog.querySelector('[data-save-retry]')!.click(); expect(s.warning.hidden).toBe(true);
    expect(dialog.querySelector('#save-status-title')!.textContent).toBe('Your town is saved');
    dialog.querySelector('[data-save-close]')!.click(); expect(s.status.isOpen).toBe(false);
    expect(dialog.removed).toBe(true); expect(retry).toHaveBeenCalledTimes(2);
  });
  it('never offers a write in a protected temporary session', () => {
    const s = setup(null); expect(s.warning.hidden).toBe(false); s.status.report(true); expect(s.warning.hidden).toBe(false);
    s.warning.click(); const dialog = s.root.children[1];
    expect(dialog.querySelector('[data-save-retry]')).toBeNull(); expect(dialog.innerHTML).toContain('original stored town');
    dialog.close(); expect(s.warning.focus).toHaveBeenCalledOnce();
  });
  it.each(['retry', 'temporary'] as const)('requires an explicit %s load-recovery choice; Escape is not consent', async (choice) => {
    const root = new Element(), result = showLoadFailure(root as unknown as HTMLElement, 'invalid');
    const dialog = root.querySelector('dialog')!;
    const escape = new Event('cancel', { cancelable: true }); dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true); expect(dialog.open).toBe(true);
    dialog.querySelector(`[data-load-${choice}]`)!.click(); expect(await result).toBe(choice);
    expect(root.innerHTML).toBe('');
  });
  it('exports a detached JSON backup without claiming the browser completed its download', async () => {
    vi.useFakeTimers(); const s = setup(null); s.town.identity.name = 'A town worth keeping';
    const create = vi.fn(() => 'blob:backup'), revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const before = JSON.stringify(s.town.identity.snapshot()); s.warning.click();
    const dialog = s.root.children[1]; dialog.querySelector('[data-save-backup]')!.click();
    const snapshot = JSON.parse(await (create.mock.calls[0] as unknown as [Blob])[0].text());
    expect(snapshot.version).toBe(4); expect(snapshot.identity.name).toBe('A town worth keeping');
    expect(s.body.children[0].download).toBe('tower-town-backup.json'); expect(s.body.children[0].removed).toBe(true);
    expect(dialog.querySelector('[data-save-result]')!.textContent).toContain('download requested');
    expect(dialog.innerHTML).toContain('manual assistance'); expect(JSON.stringify(s.town.identity.snapshot())).toBe(before);
    vi.advanceTimersByTime(30000); expect(revoke).toHaveBeenCalledWith('blob:backup');
  });
});
