import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('offline startup with a separate game bundle', () => {
  async function install(manifestAvailable) {
    const add = vi.fn(async (_url) => {});
    let installHandler = () => {};
    runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
      caches: { open: async () => ({ add }) },
      self: {
        addEventListener: (type, handler) => { if (type === 'install') installHandler = handler; },
        skipWaiting: vi.fn(),
      },
      fetch: async (url) => {
        if (url.endsWith('manifest.json')) {
          if (!manifestAvailable) throw new Error('Manifest not available');
          return { json: async () => ({
            'index.html': { file: 'assets/boot-123.js', css: ['assets/style-123.css'] },
            'src/main.ts': { file: 'assets/game-456.js', assets: ['assets/window-789.png'] },
          }) };
        }
        return { text: async () => '<script src="./assets/boot-123.js"></script><link href="./assets/style-123.css">' };
      },
    });
    let complete = Promise.resolve();
    installHandler({ waitUntil: (work) => { complete = work; } });
    await complete;
    return add.mock.calls.map(([url]) => url);
  }

  it('precaches the game and its assets even though they are absent from the HTML', async () => {
    const urls = await install(true);
    expect(urls).toEqual(expect.arrayContaining([
      './assets/boot-123.js', './assets/style-123.css', './assets/game-456.js', './assets/window-789.png', './icon.svg',
    ]));
    expect(urls.filter((url) => url === './assets/boot-123.js')).toHaveLength(1);
  });

  it('still installs the available shell if manifest discovery fails', async () => {
    expect(await install(false)).toEqual(expect.arrayContaining(['./index.html', './assets/boot-123.js', './icon.svg']));
  });
});
