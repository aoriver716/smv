// Service worker for the Scottish Metrical Psalter web app.
// Strategy: network-first for own-origin GETs, with cache as offline fallback.
// We prefer fresh HTML/JS/CSS over instant-stale because stale assets cause
// real bugs (e.g. an old app.js that doesn't know about a new route renders
// "Not found"). Bump VERSION whenever the precache list changes.

const VERSION = 'smv-v28';
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './psalter.json',
    './manifest.webmanifest',
    './icon.svg',
    './js/constants.js',
    './js/dom.js',
    './js/router.js',
    './js/icons.js',
    './js/psalm/labels.js',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(VERSION)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(VERSION);
        try {
            const fresh = await fetch(req);
            if (fresh && fresh.status === 200 && fresh.type === 'basic') {
                cache.put(req, fresh.clone());
            }
            return fresh;
        } catch {
            const cached = await cache.match(req, { ignoreSearch: false });
            if (cached) return cached;
            throw new Error('Offline and no cached copy for ' + req.url);
        }
    })());
});
