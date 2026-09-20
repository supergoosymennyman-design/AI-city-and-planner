/* Recycling Vision Annotator — Service Worker v1.0 */
/* Cache all game files for offline play */

const CACHE_NAME = 'recycling-annotator-v1';
const ASSETS = [
  'index.html',
  'style.css',
  'items.js',
  'levels.js',
  'intents.js',
  'transcript.js',
  'settings.js',
  'annotator.js',
  'conversation.js',
  'game.js',
  'manifest.json'
];

// Install: cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache successful responses for future offline use
        if (response && response.status === 200) {
          const cacheClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheClone);
          });
        }
        return response;
      }).catch(() => {
        // Offline and not in cache — return a simple offline message
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
