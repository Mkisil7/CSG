const screen = document.getElementById('loading-screen');
const message = document.getElementById('loading-message');

export function loadingMessage(text: string): void {
  if (message) message.textContent = text;
}

export function finishLoading(): void {
  const app = document.getElementById('app');
  if (app) { app.inert = false; app.setAttribute('aria-busy', 'false'); }
  loadingMessage('Welcome home.');
  screen?.classList.add('is-ready');
  screen?.addEventListener('transitionend', () => screen.remove(), { once: true });
  // Also removes the screen when reduced motion disables transitions.
  window.setTimeout(() => screen?.remove(), 450);
}

export function failLoading(): void {
  screen?.classList.add('is-error');
  loadingMessage('Your town couldn’t open just yet.');
  const help = document.getElementById('loading-help');
  if (help) {
    help.hidden = false;
    help.textContent = 'Check your connection and try again. If this keeps happening, try another browser that supports 3D graphics.';
  }
  showLoadingRetry();
}

export function showLoadingRetry(): void {
  const retry = document.getElementById('loading-retry');
  if (retry) { retry.hidden = false; retry.onclick = () => location.reload(); }
}
