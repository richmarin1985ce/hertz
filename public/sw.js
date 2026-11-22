const CACHE_NAME = 'hertz-v1';
const scope = self.registration.scope;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([
    scope, new URL('index.html', scope).href,
    new URL('audio-engine.js', scope).href,
    new URL('manifest.webmanifest', scope).href,
    new URL('icon.svg', scope).href,
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.href.startsWith(scope)) return;
  event.respondWith(caches.match(event.request).then((cached) => {
    const network = fetch(event.request).then(response => {
      if (response.ok) { const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)); }
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
