import { Town } from '../core/town';
import { toSaveData } from '../core/save';

export function loadFailureMarkup(reason: 'invalid' | 'unavailable'): string {
  return `<dialog class="offline-card" aria-labelledby="save-load-title">
    <h2 id="save-load-title" tabindex="-1" autofocus>Your town could not be opened</h2>
    <p>${reason === 'invalid' ? 'The stored save could not be read as a supported town.' : 'This browser did not allow access to the stored save.'}</p>
    <p>Nothing has been overwritten. Retry after checking browser storage permissions, or play a temporary town without saving over the original.</p>
    <div class="offline-actions"><button type="button" class="build-btn" data-load-retry>Retry load</button>
    <button type="button" class="build-btn" data-load-temporary>Play without saving</button></div>
  </dialog>`;
}

/** A load error requires a choice; Escape never silently starts an autosaving town. */
export function showLoadFailure(root: HTMLElement, reason: 'invalid' | 'unavailable'): Promise<'retry' | 'temporary'> {
  root.innerHTML = loadFailureMarkup(reason);
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  return new Promise((resolve) => {
    const finish = (choice: 'retry' | 'temporary') => { dialog.close(); root.innerHTML = ''; resolve(choice); };
    dialog.querySelector('[data-load-retry]')!.addEventListener('click', () => finish('retry'));
    dialog.querySelector('[data-load-temporary]')!.addEventListener('click', () => finish('temporary'));
    dialog.addEventListener('cancel', (event) => event.preventDefault()); dialog.showModal();
  });
}

/** Warning stays discoverable until an actual successful write. No fake saved badge. */
export class SaveStatus {
  private readonly button: HTMLButtonElement;
  private dialog: HTMLDialogElement | null = null;
  private failed = false;
  get isOpen(): boolean { return !!this.dialog?.open; }

  constructor(private readonly root: HTMLElement, private readonly getTown: () => Town,
    private readonly retry: (() => boolean) | null) {
    this.button = document.createElement('button'); this.button.type = 'button';
    this.button.className = 'save-warning'; this.button.hidden = retry !== null;
    this.button.textContent = retry ? 'Progress not saved · options' : 'Unsaved session · options';
    this.button.addEventListener('click', () => this.open());
    root.setAttribute('aria-live', 'polite'); root.appendChild(this.button);
  }

  report(saved: boolean): void {
    if (!this.retry) return;
    this.failed = !saved; this.button.hidden = saved;
    const title = this.dialog?.querySelector<HTMLElement>('#save-status-title');
    if (title) title.textContent = saved ? 'Your town is saved' : 'Your latest progress is not saved';
    const result = this.dialog?.querySelector<HTMLElement>('[data-save-result]');
    if (result) result.textContent = saved ? 'Saved successfully in this browser.' : 'Still not saved. Keep this tab open or download a backup.';
  }

  private open(): void {
    if (this.isOpen) return;
    const dialog = document.createElement('dialog'); this.dialog = dialog;
    dialog.className = 'offline-card'; dialog.setAttribute('aria-labelledby', 'save-status-title');
    dialog.innerHTML = `<h2 id="save-status-title" tabindex="-1" autofocus>${this.retry ? 'Your latest progress is not saved' : 'This is an unsaved session'}</h2>
      <p>${this.retry ? 'Browser storage may be full or unavailable. Keep this tab open until saving succeeds, or download a copy of your town.' : 'Automatic saves and gifts are disabled to protect your original stored town. Reload to retry opening it. Download a copy if you want to keep this temporary town.'}</p>
      <p>A JSON backup preserves your town data. Restoring a backup currently requires manual assistance.</p>
      <p data-save-result role="status"></p><div class="offline-actions">
      ${this.retry ? '<button type="button" class="build-btn" data-save-retry>Try saving again</button>' : ''}
      <button type="button" class="build-btn" data-save-backup>Download town backup</button>
      <button type="button" class="build-btn" data-save-close>Back to town</button></div>`;
    const message = dialog.querySelector<HTMLElement>('[data-save-result]')!;
    dialog.querySelector('[data-save-retry]')?.addEventListener('click', () => {
      this.report(this.retry!());
      message.textContent = this.failed ? 'Still not saved. Keep this tab open or download a backup.' : 'Saved successfully in this browser.';
    });
    dialog.querySelector('[data-save-backup]')!.addEventListener('click', () => {
      try {
        const blob = new Blob([JSON.stringify(toSaveData(this.getTown()), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'tower-town-backup.json';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        message.textContent = 'Backup download requested. Check your downloads before closing this tab.';
      } catch { message.textContent = 'The backup could not be downloaded. Keep this tab open and retry.'; }
    });
    dialog.querySelector('[data-save-close]')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); this.dialog = null; if (!this.button.hidden) this.button.focus(); }, { once: true });
    this.root.appendChild(dialog); dialog.showModal();
  }
}
