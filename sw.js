/**
 * sw.js — Service Worker
 * Caches all static assets for offline use.
 * API requests (holiday data from external hosts) always go to the network.
 */

const CACHE = 'workcal-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/app.js',
  './js/color-service.js',
  './js/holiday-service.js',
  './js/log-repo.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  // Activate immediately without waiting for old clients to close
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Do not cache requests to external hosts (e.g., holiday API)
  if (url.hostname !== self.location.hostname) return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
