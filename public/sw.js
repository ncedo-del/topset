// TOPSET service worker — caches the app SHELL only (this file, the HTML, the
// manifest, the icons). It deliberately does NOT cache anything from Firebase,
// Firestore, or Google Fonts/CDN origins — those are either live data (leaderboard
// entries, auth state) that must always hit the network, or cross-origin resources
// the browser already caches sensibly on its own. Caching Firestore responses here
// would risk showing someone a stale leaderboard or stale login state, which is
// worse than the loading flicker this worker is meant to prevent.
//
// BUMP THIS on every deploy that changes any file in SHELL_ASSETS (index.html,
// manifest.json, or the icons) — activate() below deletes any cache whose name
// doesn't match, so a bump is what actually clears out a previous version for
// everyone still holding it. JS/CSS files are never cached here at all (see the
// fetch handler below), so THEY don't need a bump to show up fresh.
const CACHE_NAME = 'topset-shell-2026-10-28';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        const results = await Promise.allSettled(
          SHELL_ASSETS.map(async (url) => {
            const res = await fetch(url);
            if (res.ok) await cache.put(url, res);
          })
        );
        return results;
      })
      .catch((err) => console.error('SW install/cache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up any cache from a previous version of this service worker —
  // bump CACHE_NAME above whenever the shell assets change, and this
  // automatically clears out the stale one on next load.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests — everything else (Firebase Auth,
  // Firestore, Google Fonts, gstatic) passes straight through untouched.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  // Only intercept requests for files actually listed in SHELL_ASSETS above.
  // This used to be missing — every same-origin GET matched here, which meant
  // /js/*.js and styles.css got pulled into this cache too, even though
  // install() only ever pre-cached the 5 shell files. Because the strategy
  // below is stale-while-revalidate (serve cached instantly, refresh in the
  // background for NEXT time), that meant the FIRST page load after every
  // deploy still served yesterday's JS — the network fetch to update the
  // cache happened, but only behind the scenes, so a fix never appeared
  // until a SECOND reload. That's the actual "I deployed and nothing
  // changed" bug. JS and CSS now pass straight through to the network/the
  // browser's normal HTTP cache instead, so a deploy is live on the very
  // next load, no double-reload needed.
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  // Stale-while-revalidate for the shell only: serve the cached copy instantly
  // for a fast load, then quietly fetch a fresh one in the background. If
  // there's no cached copy yet and the network fails (offline), this just
  // fails gracefully rather than crashing — there's nothing else to fall back to.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
