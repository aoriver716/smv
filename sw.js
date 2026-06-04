// Service worker for the Scottish Metrical Psalter web app.
// Strategy: stale-while-revalidate for own-origin GET requests. Bump VERSION on
// every meaningful asset change so old caches are flushed on activation.

const VERSION = 'smv-v4';
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './psalter.json',
    './manifest.webmanifest',
    './icon.svg',
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
        const cached = await cache.match(req, { ignoreSearch: false });
        const network = fetch(req).then(resp => {
            if (resp && resp.status === 200 && resp.type === 'basic') {
                cache.put(req, resp.clone());
            }
            return resp;
        }).catch(() => cached);
        return cached || network;
    })());
});
