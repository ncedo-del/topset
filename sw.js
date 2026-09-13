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
//
// PATHS ARE RELATIVE (no leading "/"). Absolute paths like "/styles.css" resolve
// to the DOMAIN ROOT, which breaks on a GitHub Pages project site served from
// /<repo>/ (the file actually lives at /<repo>/styles.css). Relative paths work
// on Firebase Hosting at root AND on GitHub Pages under a subpath, with no
// per-deployment changes.
const CACHE_NAME = 'topset-shell-2026-09-12';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Precomputed set of absolute pathnames the shell assets resolve to, so the
// fetch handler can compare against url.pathname (which is always absolute,
// like "/topset/index.html" on GitHub Pages or "/index.html" on Firebase
// Hosting). Resolved relative to this SW file's own URL, so it works no
// matter what subpath the app is deployed under.
const SHELL_PATHS = new Set(
  SHELL_ASSETS.map(a => new URL(a, self.location.href).pathname)
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
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
  // Compare against the precomputed absolute pathname set — a raw string
  // `.includes(url.pathname)` would never match, since pathname is always
  // absolute ("/topset/index.html") while SHELL_ASSETS entries are relative
  // ("./index.html"). Without this, every same-origin GET falls straight
  // through to the network, and the offline shell caching silently never
  // works on the GitHub Pages deploy.
  if (!SHELL_PATHS.has(url.pathname)) return;

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
