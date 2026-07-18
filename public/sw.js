/*
 * Tower Town service worker — makes the game fully playable offline.
 *
 * The whole game is static files with no backend (saves live in localStorage,
 * fonts are system fonts), so once the app shell and its hashed assets are
 * cached, everything runs with no network at all.
 *
 * Strategy:
 *  - Navigations: network-first (so an online visit always gets the freshest
 *    index.html), falling back to the cached page when offline.
 *  - Same-origin assets (content-hashed JS/CSS, icons, models): cache-first,
 *    populated on first fetch. New deploys ship new hashed filenames, so fresh
 *    assets are fetched-and-cached automatically the next time you're online.
 */
const CACHE = 'tower-town-v4';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

/*
 * On first visit the page isn't controlled by this worker yet, so its own
 * requests for the hashed JS/CSS bundles aren't intercepted. To guarantee a
 * fully offline app, install fetches index.html and precaches every asset it
 * references (whose filenames are content-hashed and unknowable ahead of time).
 */
async function precache() {
  const cache = await caches.open(CACHE);
  const urls = new Set(APP_SHELL);
  try {
    const res = await fetch('./index.html', { cache: 'no-cache' });
    const html = await res.text();
    const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const u = m[1];
      if (/\.(js|css|svg|png|woff2?|glb|json|webmanifest)$/i.test(u) || u.includes('/assets/')) {
        urls.add(u);
      }
    }
  } catch {
    // Offline at install time — fall back to just the static shell list.
  }
  // Best-effort per URL so one 404 can't fail the whole install.
  await Promise.allSettled([...urls].map((url) => cache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin requests alone

  // Page navigations: try the network, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./index.html'))),
    );
    return;
  }

  // Everything else: serve from cache if we have it, otherwise fetch and store.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
