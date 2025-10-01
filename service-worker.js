const CACHE_NAME = 'progress-calculator-v2.3';
const CACHE_URLS = [
    '/',
    '/index.html',
    '/script.js',
    '/styles.css',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://raw.githubusercontent.com/svidovichss-droid/ProgressSAP.github.io/main/data.json'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker: Установка');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Кэширование файлов');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Активация');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Очистка старого кэша');
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
    // Игнорируем запросы к Google Analytics и другим внешним сервисам
    if (event.request.url.includes('google-analytics') || 
        event.request.url.includes('gtag')) {
        return;
    }

    // Для JSON данных используем стратегию "Сначала сеть, потом кэш"
    if (event.request.url.includes('data.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Клонируем ответ, так как он может быть использован только один раз
                    const responseClone = response.clone();
                    
                    // Сохраняем свежие данные в кэш
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    
                    return response;
                })
                .catch(() => {
                    // Если сеть недоступна, используем кэшированные данные
                    return caches.match(event.request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Если нет кэшированных данных, возвращаем fallback
                            return new Response(JSON.stringify([
                                {
                                    "Код продукции": "000001",
                                    "Полное наименование (русское)": "Тестовый продукт 1",
                                    "Срок годности": 365,
                                    "Штук в упаковке": 10,
                                    "Штрихкод упаковки": "1234567890123",
                                    "Производитель": "Тестовый производитель",
                                    "Название стандарта": "ГОСТ 12345-2020"
                                }
                            ]), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        });
                })
        );
        return;
    }

    // Для остальных файлов используем стратегию "Сначала кэш, потом сеть"
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Возвращаем кэшированную версию или делаем запрос к сети
                return response || fetch(event.request);
            })
    );
});

// Фоновая синхронизация
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync') {
        console.log('Service Worker: Фоновая синхронизация');
        // Здесь можно добавить логику для фоновой синхронизации данных
    }
});

// Периодическая синхронизация (если поддерживается)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'periodic-data-update') {
        console.log('Service Worker: Периодическое обновление данных');
        // Обновление данных в фоновом режиме
    }
});