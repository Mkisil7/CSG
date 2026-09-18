import { failLoading, finishLoading, loadingMessage, showLoadingRetry } from './ui/loading';

// Keep the welcome screen independent of the large 3D bundle, including errors
// while downloading that bundle or creating the WebGL renderer.
async function boot(): Promise<void> {
  const slowLoad = window.setTimeout(showLoadingRetry, 15000);
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const game = await import('./main');
    await game.start();
    finishLoading();
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      // Dynamic imports may finish after window.load has already fired.
      void navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch (error) {
    console.error('Tower Town startup failed', error);
    failLoading();
  } finally {
    window.clearTimeout(slowLoad);
  }
}

if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'loading') {
  // Local visual-review controls; excluded from the production build.
  const controls = document.createElement('div');
  controls.className = 'loading-preview-controls';
  for (const [label, action] of [
    ['Open town', () => { controls.remove(); void boot(); }],
    ['Show load error', failLoading],
  ] as const) {
    const button = document.createElement('button');
    button.textContent = label; button.onclick = action; controls.appendChild(button);
  }
  document.body.appendChild(controls);
  loadingMessage('Waking the neighbors…');
} else {
  void boot();
}
