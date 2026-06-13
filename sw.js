// Service worker — offline caching for the PWA.
// Bump CACHE version whenever you change app files so clients update.
const CACHE = 'ghar-kharcha-v63';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './sync-status.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Load the sync-status module into the app shell without editing index.html.
function injectSync(html) {
  if (html.indexOf('sync-status.js') !== -1) return html;
  return html.replace('</body>', '<script src="./sync-status.js"></script>\n</body>');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache Supabase/CDN/API reads. Only the local app shell belongs in
  // the offline cache; caching cloud GETs is what made device data go stale.
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(req));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) =>
        res.text().then((html) => {
          const body = injectSync(html);
          const headers = { 'Content-Type': 'text/html; charset=utf-8' };
          caches.open(CACHE).then((c) => c.put('./index.html', new Response(body, { headers })));
          return new Response(body, { headers });
        })
      ).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => cached))
  );
});
