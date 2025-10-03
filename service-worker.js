const CACHE_NAME = 'progress-calculator-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/deepseek_css_20251002_f47ae2.css',
    '/deepseek_javascript_20251002_cc11c3.js'
];

// Установка Service Worker
self.addEventListener('install', function(event) {
    console.log('Service Worker: Установка');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Service Worker: Кэширование файлов');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Активация Service Worker
self.addEventListener('activate', function(event) {
    console.log('Service Worker: Активация');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Удаление старого кэша', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Перехват запросов
self.addEventListener('fetch', function(event) {
    // Для данных используем стратегию "Сначала сеть, потом кэш"
    if (event.request.url.includes('data.json')) {
        event.respondWith(
            fetch(event.request)
                .then(function(response) {
                    // Сохраняем в кэш
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(function(cache) {
                            cache.put(event.request, responseClone);
                        });
                    return response;
                })
                .catch(function() {
                    // Если сеть недоступна, используем кэш
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Для остальных файлов используем стратегию "Сначала кэш, потом сеть"
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                return response || fetch(event.request);
            })
    );
});
