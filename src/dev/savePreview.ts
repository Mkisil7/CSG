import { Town } from '../core/town';
import { readGame, saveGame } from '../core/save';
import { SaveStatus, showLoadFailure } from '../ui/saveStatus';
import { openSocialPanel, showGiftAccept } from '../ui/social';

let status: SaveStatus | undefined, loading = false;
export function isPaused(): boolean { return loading || !!status?.isOpen; }
export function createPreviewTown(): Town {
  const town = new Town(); town.identity.name = 'The saving study'; town.economy.coins = 3000;
  town.towers()[0].tower.addFloor('residential'); town.towers()[0].tower.addFloor('restaurant', 'coffee'); return town;
}

/** Exercises real persistence/UI against disposable memory, never browser storage. */
export function mountPreview(town: Town): void {
  const data = new Map<string, string>(); let blocked = false;
  const storage: Storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new DOMException('Study quota', 'QuotaExceededError'); data.set(key, value); },
    removeItem: (key) => { data.delete(key); }, clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null, get length() { return data.size; },
  };
  saveGame(town, storage);
  status = new SaveStatus(document.getElementById('save-status')!, () => town, () => saveGame(town, storage));
  const panel = document.createElement('details'); panel.className = 'weather-study'; panel.open = true;
  panel.innerHTML = `<summary>Development saving study</summary><p>Disposable memory only · player storage never accessed · reload starts fresh</p>
    <button data-fail>Simulate failed save</button><button data-allow>Allow writes again</button>
    <button data-read>Read saved snapshot</button><button data-load-fail>Simulate unreadable save</button>
    <button data-gifts>Open gift study</button><button data-gift-link>Open test gift invitation</button>
    <p>Gift codes in this study are test data; do not share them.</p><p data-result role="status">An initial snapshot is held in memory.</p>`;
  const result = panel.querySelector<HTMLElement>('[data-result]')!;
  panel.querySelector('[data-fail]')!.addEventListener('click', () => { blocked = true; status!.report(saveGame(town, storage)); result.textContent = 'Writes are blocked; the prior memory snapshot is intact.'; });
  panel.querySelector('[data-allow]')!.addEventListener('click', () => { blocked = false; result.textContent = 'Writes are allowed; use the warning’s retry button to save.'; });
  panel.querySelector('[data-read]')!.addEventListener('click', () => {
    const saved = readGame(storage);
    result.textContent = saved.status === 'loaded' ? `Saved snapshot: ${saved.result.town.population} residents · ${Math.floor(saved.result.town.economy.coins)} coins · ${saved.result.town.gifts.sent.length} sent gifts · ${saved.result.town.gifts.redeemed.length} redeemed gifts. Reading did not change the running town.` : saved.status;
  });
  panel.querySelector('[data-gifts]')!.addEventListener('click', () => openSocialPanel(town, (message) => { result.textContent = message; }, true, storage, (saved) => status!.report(saved)));
  panel.querySelector('[data-gift-link]')!.addEventListener('click', () => showGiftAccept(town,
    { kind: 'coins', amount: 250, nonce: 'saving-study-invitation', from: 'Study neighbor' },
    () => { result.textContent = 'Test gift invitation completed.'; }, storage, (saved) => status!.report(saved)));
  panel.querySelector('[data-load-fail]')!.addEventListener('click', async () => {
    const root = document.createElement('div'); root.id = 'save-load-study'; document.body.append(root); loading = true;
    const choice = await showLoadFailure(root, 'invalid');
    result.textContent = choice === 'temporary' ? 'Temporary-session choice observed. No stored town was changed.' : 'Retry choice observed. No stored town was changed.';
    root.remove(); loading = false;
  });
  document.body.appendChild(panel);
}
