/* Traffic Commander — service worker (offline cache). Optional; the game also
   runs fully from file:// without it. Registered from game.js when on http(s). */
const CACHE = 'traffic-commander-v1';
const ASSETS = [
  'index.html', 'style.css', 'manifest.json',
  'audio.js', 'transcript.js', 'settings.js', 'intents.js',
  'traffic.js', 'sensors.js', 'renderer.js', 'quiz.js', 'flux.js', 'game.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
