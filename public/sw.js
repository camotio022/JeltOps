// Static application-shell only; never cache Firestore or API monitoring responses.
const CACHE = 'jeltops-shell-v2';
const FALLBACK = '/offline.html';
const STATIC = [FALLBACK, '/jeltops-icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => {});
      }
      return response;
    }).catch(async () => (await caches.match('/')) || (await caches.match(FALLBACK)) || Response.error()));
    return;
  }
  if (STATIC.includes(url.pathname)) event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
