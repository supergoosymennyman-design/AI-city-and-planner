// sw.js — service-worker kill-switch for the buddy-kit origin.
//
// The buddy-kit client NEVER registers a service worker. This file exists so a
// browser that has a STALE/ORPHANED service worker registered on this origin
// (e.g. from a different app previously served on this port — we once saw a
// leftover "traffic-commander-v1" cache breaking every page load) can heal
// itself: the browser's next visit fetches /sw.js, installs THIS script, and
// this script immediately unregisters the registration and clears every cache.
//
// It never intercepts requests (no fetch handler) and never serves anything —
// it is a one-shot demolition tool. After it runs, the origin is SW-free and
// every request goes straight to the network.

self.addEventListener('install', () => {
  // Install over the stale worker right away; do not wait for old tabs.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete every cache this origin ever created (they belong to dead apps).
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    // Unregister ourselves — the origin is SW-free from this point on.
    await self.registration.unregister();
    // Take control of open tabs so the very next reload is SW-free too.
    await self.clients.claim();
  })());
});

// Deliberately NO fetch handler: never intercept, always hit the network.
