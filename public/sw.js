const CACHE_NAME = 'westar-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/login.html',
    '/assets/images/logows.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // Optional: Cache files immediately
                // return cache.addAll(urlsToCache);
                return Promise.resolve();
            })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    // Simple pass-through or offline fallback
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});
