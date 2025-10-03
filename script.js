// Конфигурация приложения
const CONFIG = {
    JSON_URL: 'https://raw.githubusercontent.com/svidovichss-droid/ProgressSAP.github.io/main/data.json',
    CACHE_KEY: 'products_cache_v2',
    ETAG_KEY: 'products_etag',
    DATA_SCHEMA_VERSION: '2.0',
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BACKGROUND_SYNC_INTERVAL: 30 * 60 * 1000,
    CHUNK_SIZE: 1000,
    MAX_JSON_SIZE: 10 * 1024 * 1024,
    FALLBACK_DATA: [
        {
            "Код продукции": "000001",
            "Полное наименование (русское)": "Тестовый продукт 1",
            "Срок годности": 365,
            "Штук в упаковке": 10,
            "Штрихкод упаковки": "1234567890123",
            "Производитель": "Тестовый производитель",
            "Название стандарта": "ГОСТ 12345-2020"
        },
        {
            "Код продукции": "000002", 
            "Полное наименование (русское)": "Тестовый продукт 2",
            "Срок годности": 180,
            "Штук в упаковке": 5,
            "Штрихкод упаковки": "1234567890124",
            "Производитель": "Тестовый производитель 2",
            "Название стандарта": "ГОСТ 12346-2020"
        }
    ]
};

// Глобальные переменные
let products = {};
let productsArray = [];
let warningMessageAdded = false;
let isOnline = true;
let backgroundSyncTimer = null;
let searchWorker = null;

// DOM elements
const productSearch = document.getElementById('productSearch');
const searchResults = document.getElementById('searchResults');
const standardNotificationContainer = document.getElementById('standardNotificationContainer');
const dataStatus = document.getElementById('dataStatus');
const offlineStatus = document.getElementById('offlineStatus');
const calculateButton = document.getElementById('calculateButton');

// Web Worker для обработки больших данных
function initSearchWorker() {
    if (window.Worker) {
        try {
            searchWorker = new Worker(URL.createObjectURL(new Blob([`
                let productsData = [];
                
                self.addEventListener('message', function(e) {
                    const { type, data } = e.data;
                    
                    if (type === 'SET_DATA') {
                        productsData = data;
                        self.postMessage({ type: 'DATA_READY' });
                    }
                    
                    if (type === 'SEARCH') {
                        const { searchTerm, maxResults = 50 } = data;
                        const results = [];
                        
                        for (let i = 0; i < Math.min(productsData.length, 10000); i++) {
                            const product = productsData[i];
                            if (product.code.includes(searchTerm) ||
                                product.name.toLowerCase().includes(searchTerm)) {
                                results.push({
                                    code: product.code,
                                    name: product.name,
                                    shelfLife: product.shelfLife
                                });
                                
                                if (results.length >= maxResults) break;
                            }
                        }
                        
                        self.postMessage({ 
                            type: 'SEARCH_RESULTS', 
                            data: results 
                        });
                    }
                });
            `], { type: 'application/javascript' })));

            // Обработчик сообщений от Worker
            searchWorker.addEventListener('message', function(e) {
                const { type, data } = e.data;
                
                if (type === 'SEARCH_RESULTS') {
                    handleSearchResults(data);
                }
                
                if (type === 'DATA_READY') {
                    console.log('Worker готов к поиску');
                }
            });

            searchWorker.addEventListener('error', function(error) {
                console.error('Ошибка в Worker:', error);
            });
        } catch (error) {
            console.error('Не удалось инициализировать Worker:', error);
        }
    }
}

// Обработка результатов поиска из Worker
function handleSearchResults(results) {
    if (!searchResults) return;
    
    searchResults.innerHTML = '';
    
    if (results.length === 0) {
        showNoResults();
        return;
    }
    
    results.forEach(result => {
        addSearchResult(result.code, {
            "Полное наименование (русское)": result.name,
            "Срок годности": result.shelfLife
        });
    });
    
    searchResults.classList.remove('hidden');
}

// Проверка онлайн статуса
function checkOnlineStatus() {
    isOnline = navigator.onLine;
    if (!isOnline && offlineStatus) {
        offlineStatus.classList.remove('hidden');
    } else if (offlineStatus) {
        offlineStatus.classList.add('hidden');
    }
    return isOnline;
}

// Валидация структуры данных
const dataValidator = {
    requiredFields: ['Код продукции', 'Полное наименование (русское)', 'Срок годности'],
    
    validateProduct: (product) => {
        for (const field of dataValidator.requiredFields) {
            if (!(field in product)) {
                console.warn(`Отсутствует обязательное поле: ${field}`, product);
                return false;
            }
        }
        
        if (typeof product["Код продукции"] !== 'string') {
            console.warn('Неверный тип для Код продукции', product);
            return false;
        }
        
        const shelfLife = parseInt(product["Срок годности"]);
        if (isNaN(shelfLife) || shelfLife <= 0) {
            console.warn('Неверный срок годности', product);
            return false;
        }
        
        return true;
    },
    
    validateSchema: (data) => {
        if (!Array.isArray(data)) {
            throw new Error('Данные должны быть массивом');
        }
        
        if (data.length === 0) {
            throw new Error('Массив данных пуст');
        }
        
        const validProducts = [];
        let invalidCount = 0;
        
        for (const product of data) {
            if (dataValidator.validateProduct(product)) {
                validProducts.push(product);
            } else {
                invalidCount++;
            }
        }
        
        if (invalidCount > 0) {
            console.warn(`Найдено ${invalidCount} некорректных записей`);
        }
        
        if (validProducts.length === 0) {
            throw new Error('Нет валидных данных');
        }
        
        return validProducts;
    }
};

// Утилиты для работы с кэшем
const cacheUtils = {
    saveToCache: (data, etag = null) => {
        try {
            const cacheData = {
                timestamp: Date.now(),
                data: data,
                etag: etag,
                schemaVersion: CONFIG.DATA_SCHEMA_VERSION,
                dataHash: cacheUtils.generateDataHash(data)
            };
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cacheData));
            console.log('Данные сохранены в кэш');
            
            if (etag) {
                localStorage.setItem(CONFIG.ETAG_KEY, etag);
            }
            
            if (searchWorker) {
                const workerData = data.map(product => ({
                    code: product["Код продукции"],
                    name: product["Полное наименование (русское)"],
                    shelfLife: product["Срок годности"]
                }));
                searchWorker.postMessage({ 
                    type: 'SET_DATA', 
                    data: workerData 
                });
            }
        } catch (error) {
            console.error('Ошибка сохранения в кэш:', error);
            if (error.name === 'QuotaExceededError') {
                cacheUtils.clearOldCache();
                cacheUtils.saveToCache(data, etag);
            }
        }
    },

    generateDataHash: (data) => {
        const jsonString = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < jsonString.length; i++) {
            const char = jsonString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    },

    getFromCache: () => {
        try {
            const cached = localStorage.getItem(CONFIG.CACHE_KEY);
            if (!cached) return null;

            const cacheData = JSON.parse(cached);
            
            if (cacheData.schemaVersion !== CONFIG.DATA_SCHEMA_VERSION) {
                console.log('Инвалидация кэша: изменилась версия схемы');
                cacheUtils.clearCache();
                return null;
            }
            
            const currentHash = cacheUtils.generateDataHash(cacheData.data);
            if (cacheData.dataHash !== currentHash) {
                console.log('Инвалидация кэша: данные повреждены');
                cacheUtils.clearCache();
                return null;
            }

            const isExpired = Date.now() - cacheData.timestamp > CONFIG.CACHE_EXPIRY;

            return {
                data: cacheData.data,
                etag: cacheData.etag,
                isExpired: isExpired,
                timestamp: cacheData.timestamp
            };
        } catch (error) {
            console.error('Ошибка чтения из кэша:', error);
            cacheUtils.clearCache();
            return null;
        }
    },

    clearOldCache: () => {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('products_cache')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => {
                if (key !== CONFIG.CACHE_KEY) {
                    localStorage.removeItem(key);
                }
            });
            console.log('Очищены старые версии кэша');
        } catch (error) {
            console.error('Ошибка очистки старых кэшей:', error);
        }
    },

    getEtag: () => {
        try {
            return localStorage.getItem(CONFIG.ETAG_KEY);
        } catch (error) {
            console.error('Ошибка чтения ETag:', error);
            return null;
        }
    },

    clearCache: () => {
        try {
            localStorage.removeItem(CONFIG.CACHE_KEY);
            localStorage.removeItem(CONFIG.ETAG_KEY);
            console.log('Кэш очищен');
        } catch (error) {
            console.error('Ошибка очистки кэша:', error);
        }
    },

    saveFallbackData: () => {
        try {
            cacheUtils.saveToCache(CONFIG.FALLBACK_DATA, 'fallback');
        } catch (error) {
            console.error('Ошибка сохранения fallback данных:', error);
        }
    }
};

// Стратегия фонового обновления
const backgroundSync = {
    timer: null,
    
    start: function() {
        if (!checkOnlineStatus()) return;
        
        this.stop();
        
        this.timer = setInterval(() => {
            if (checkOnlineStatus()) {
                console.log('Фоновая синхронизация данных...');
                backgroundSync.checkAndUpdate();
            }
        }, CONFIG.BACKGROUND_SYNC_INTERVAL);
        
        console.log('Фоновая синхронизация запущена');
    },
    
    stop: function() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },
    
    checkAndUpdate: async function() {
        try {
            const cached = cacheUtils.getFromCache();
            const cachedEtag = cacheUtils.getEtag();
            
            if (!cached) return;
            
            const hasUpdates = await checkForUpdates(cachedEtag);
            if (hasUpdates) {
                console.log('Фоновое обновление: обнаружены новые данные');
                await loadProductsData(true);
                showNotification('Данные обновлены в фоновом режиме', 'success');
            }
        } catch (error) {
            console.error('Ошибка фоновой синхронизации:', error);
        }
    }
};

// Потоковая обработка больших JSON
const streamProcessor = {
    processLargeJSON: async (response) => {
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > CONFIG.MAX_JSON_SIZE) {
            throw new Error(`Файл слишком большой: ${contentLength} bytes`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunks = [];
        let totalSize = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                totalSize += value.length;
                if (totalSize > CONFIG.MAX_JSON_SIZE) {
                    throw new Error('Превышен максимальный размер файла');
                }
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const chunk = JSON.parse(line);
                            chunks.push(chunk);
                        } catch (e) {
                            // Игнорируем неполные JSON строки
                        }
                    }
                }
            }

            if (buffer.trim()) {
                try {
                    const finalData = JSON.parse(buffer);
                    if (Array.isArray(finalData)) {
                        chunks = chunks.concat(finalData);
                    } else {
                        chunks.push(finalData);
                    }
                } catch (e) {
                    console.error('Ошибка парсинга финального блока:', e);
                }
            }

            return chunks;
        } finally {
            reader.releaseLock();
        }
    },

    processInChunks: (data, chunkSize = CONFIG.CHUNK_SIZE, processCallback) => {
        const results = [];
        
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            
            if (i > 0 && i % (chunkSize * 10) === 0) {
                setTimeout(() => {
                    processChunk(chunk, i);
                }, 0);
            } else {
                const processedChunk = processCallback(chunk);
                results.push(...processedChunk);
            }
        }
        
        return results;
        
        function processChunk(chunk, index) {
            try {
                const processedChunk = processCallback(chunk);
                results.push(...processedChunk);
            } catch (error) {
                console.error(`Ошибка обработки чанка ${index}:`, error);
            }
        }
    }
};

// Проверка обновлений на сервере
async function checkForUpdates(cachedEtag) {
    try {
        if (!checkOnlineStatus()) {
            console.log('Оффлайн режим, пропускаем проверку обновлений');
            return false;
        }

        const response = await fetch(CONFIG.JSON_URL, {
            method: 'HEAD',
            headers: cachedEtag ? { 'If-None-Match': cachedEtag } : {},
            cache: 'no-cache'
        });

        if (response.status === 304) {
            console.log('Данные не изменились на сервере');
            return false;
        }

        if (response.status === 200) {
            const newEtag = response.headers.get('ETag');
            if (newEtag && newEtag !== cachedEtag) {
                console.log('Обнаружены обновления на сервере');
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Ошибка проверки обновлений:', error);
        return false;
    }
}

// Загрузка данных о продуктах
async function loadProductsData(isBackgroundSync = false) {
    try {
        if (!isBackgroundSync && dataStatus) {
            dataStatus.classList.remove('hidden');
        }
        
        checkOnlineStatus();
        
        const cached = cacheUtils.getFromCache();
        const cachedEtag = cacheUtils.getEtag();
        
        let shouldUseCache = false;
        let shouldUpdateCache = false;

        if (cached && !cached.isExpired) {
            if (isOnline) {
                const hasUpdates = await checkForUpdates(cachedEtag);
                
                if (!hasUpdates) {
                    console.log('Используем актуальные данные из кэша');
                    processProductsData(cached.data);
                    shouldUseCache = true;
                } else {
                    shouldUpdateCache = true;
                }
            } else {
                console.log('Оффлайн режим, используем данные из кэша');
                processProductsData(cached.data);
                shouldUseCache = true;
            }
        } else if (cached) {
            if (isOnline) {
                const hasUpdates = await checkForUpdates(cachedEtag);
                
                if (!hasUpdates) {
                    console.log('Обновлений нет, обновляем timestamp кэша');
                    cacheUtils.saveToCache(cached.data, cachedEtag);
                    processProductsData(cached.data);
                    shouldUseCache = true;
                } else {
                    shouldUpdateCache = true;
                }
            } else {
                console.log('Оффлайн режим, используем просроченные данные из кэша');
                processProductsData(cached.data);
                shouldUseCache = true;
            }
        } else {
            if (isOnline) {
                shouldUpdateCache = true;
            } else {
                console.log('Оффлайн режим и нет кэша, используем fallback данные');
                cacheUtils.saveFallbackData();
                processProductsData(CONFIG.FALLBACK_DATA);
                if (!isBackgroundSync) {
                    showNotification('Работаем в автономном режиме с тестовыми данными', 'warning');
                }
                shouldUseCache = true;
            }
        }

        if (shouldUpdateCache) {
            console.log('Загрузка новых данных с сервера...');
            const response = await fetch(CONFIG.JSON_URL, {
                cache: 'no-cache',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            let productsData;
            
            try {
                productsData = await streamProcessor.processLargeJSON(response);
                if (!productsData || productsData.length === 0) {
                    throw new Error('Потоковая обработка не дала результатов');
                }
            } catch (streamError) {
                console.log('Потоковая обработка не удалась, используем стандартный метод:', streamError);
                productsData = await response.json();
            }
            
            const validatedData = dataValidator.validateSchema(productsData);
            
            const newEtag = response.headers.get('ETag');
            
            if (validatedData.length > CONFIG.CHUNK_SIZE) {
                console.log(`Обработка больших данных: ${validatedData.length} записей`);
                const processedData = streamProcessor.processInChunks(
                    validatedData, 
                    CONFIG.CHUNK_SIZE,
                    (chunk) => dataValidator.validateSchema(chunk)
                );
                cacheUtils.saveToCache(processedData, newEtag);
                processProductsData(processedData);
            } else {
                cacheUtils.saveToCache(validatedData, newEtag);
                processProductsData(validatedData);
            }
            
            if (!isBackgroundSync && cached) {
                showNotification('Данные успешно обновлены', 'success');
            }
        }

    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        
        const cached = cacheUtils.getFromCache();
        if (cached) {
            console.log('Используем данные из кэша из-за ошибки сети');
            processProductsData(cached.data);
            if (!isBackgroundSync) {
                showNotification('Не удалось загрузить актуальные данные. Используются кэшированные данные.', 'warning');
            }
        } else {
            console.log('Нет кэша, используем fallback данные');
            cacheUtils.saveFallbackData();
            processProductsData(CONFIG.FALLBACK_DATA);
            if (!isBackgroundSync) {
                showNotification('Не удалось загрузить данные. Используются тестовые данные.', 'error');
            }
        }
    } finally {
        if (!isBackgroundSync && dataStatus) {
            dataStatus.classList.add('hidden');
        }
        
        if (!isBackgroundSync) {
            backgroundSync.start();
        }
    }
}

// Обработка данных о продуктах
function processProductsData(productsData) {
    products = {};
    productsArray = productsData;
    
    if (productsData.length > CONFIG.CHUNK_SIZE) {
        streamProcessor.processInChunks(productsData, CONFIG.CHUNK_SIZE, (chunk) => {
            chunk.forEach(product => {
                products[product["Код продукции"]] = {
                    "Полное наименование (русское)": product["Полное наименование (русское)"],
                    "Срок годности": product["Срок годности"],
                    "Штук в упаковке": product["Штук в упаковке"],
                    "Штрихкод упаковки": product["Штрихкод упаковки"],
                    "Производитель": product["Производитель"],
                    "Название стандарта": product["Название стандарта"]
                };
            });
            return chunk;
        });
    } else {
        productsData.forEach(product => {
            products[product["Код продукции"]] = {
                "Полное наименование (русское)": product["Полное наименование (русское)"],
                "Срок годности": product["Срок годности"],
                "Штук в упаковке": product["Штук в упаковке"],
                "Штрихкод упаковки": product["Штрихкод упаковки"],
                "Производитель": product["Производитель"],
                "Название стандарта": product["Название стандарта"]
            };
        });
    }
    
    activateInputFields();
}

// Активация полей ввода после загрузки данных
function activateInputFields() {
    if (productSearch) {
        productSearch.disabled = false;
        productSearch.placeholder = "Введите код или название продукта...";
    }
    
    if (calculateButton) {
        calculateButton.disabled = false;
        calculateButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    console.log(`Загружено ${Object.keys(products).length} продуктов`);
}

// Оптимизированный поиск с дебаунсом
const searchUtils = {
    timeout: null,
    
    search: function(searchTerm) {
        if (searchResults) searchResults.innerHTML = '';
        if (standardNotificationContainer) standardNotificationContainer.innerHTML = '';
        
        if (searchTerm.length < 2) {
            if (searchResults) searchResults.classList.add('hidden');
            clearFields();
            return;
        }

        if (searchWorker && productsArray.length > 1000) {
            searchWorker.postMessage({ 
                type: 'SEARCH', 
                data: { 
                    searchTerm: searchTerm.toLowerCase(),
                    maxResults: 50
                } 
            });
        } else {
            this.performSearch(searchTerm);
        }
    },
    
    performSearch: function(searchTerm) {
        const term = searchTerm.toLowerCase();
        let resultsFound = false;
        let resultsCount = 0;

        for (const code in products) {
            if (resultsCount >= 50) break;
            
            const product = products[code];
            if (code.includes(term) ||
                product["Полное наименование (русское)"].toLowerCase().includes(term)) {

                this.addSearchResult(code, product);
                resultsFound = true;
                resultsCount++;
            }
        }

        if (searchResults) {
            if (resultsFound) {
                searchResults.classList.remove('hidden');
            } else {
                this.showNoResults();
            }
        }
    },
    
    addSearchResult: function(code, product) {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.setAttribute('role', 'option');
        div.innerHTML = `
            <div class="flex items-center">
                <div class="bg-blue-100 p-2 rounded-lg mr-3">
                    <i class="fas fa-box text-blue-600"></i>
                </div>
                <div class="flex-grow">
                    <div class="search-result-name">${this.escapeHtml(product["Полное наименование (русское)"])}</div>
                    <div class="text-sm text-gray-500 mt-1">
                        <span class="search-result-code">Код: ${code}</span> | 
                        <span class="search-result-shelf-life">Срок: ${product["Срок годности"]} дней</span>
                    </div>
                </div>
            </div>
        `;
        div.onclick = () => selectProduct(code);
        if (searchResults) searchResults.appendChild(div);
    },
    
    showNoResults: function() {
        const noResults = document.createElement('div');
        noResults.className = 'p-4 text-gray-500 text-center';
        noResults.innerHTML = `
            <i class="fas fa-search text-gray-300 text-2xl mb-2"></i>
            <p>Ничего не найдено</p>
            <p class="text-sm mt-1">Попробуйте изменить запрос</p>
        `;
        noResults.setAttribute('role', 'option');
        if (searchResults) searchResults.appendChild(noResults);
        if (searchResults) searchResults.classList.remove('hidden');
    },
    
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Показать отсутствие результатов
function showNoResults() {
    const noResults = document.createElement('div');
    noResults.className = 'p-4 text-gray-500 text-center';
    noResults.innerHTML = `
        <i class="fas fa-search text-gray-300 text-2xl mb-2"></i>
        <p>Ничего не найдено</p>
        <p class="text-sm mt-1">Попробуйте изменить запрос</p>
    `;
    noResults.setAttribute('role', 'option');
    if (searchResults) searchResults.appendChild(noResults);
    if (searchResults) searchResults.classList.remove('hidden');
}

// Добавить результат поиска
function addSearchResult(code, product) {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.setAttribute('role', 'option');
    div.innerHTML = `
        <div class="flex items-center">
            <div class="bg-blue-100 p-2 rounded-lg mr-3">
                <i class="fas fa-box text-blue-600"></i>
            </div>
            <div class="flex-grow">
                <div class="search-result-name">${escapeHtml(product["Полное наименование (русское)"])}</div>
                <div class="text-sm text-gray-500 mt-1">
                    <span class="search-result-code">Код: ${code}</span> | 
                    <span class="search-result-shelf-life">Срок: ${product["Срок годности"]} дней</span>
                </div>
            </div>
        </div>
    `;
    div.onclick = () => selectProduct(code);
    if (searchResults) searchResults.appendChild(div);
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Выбор продукта
function selectProduct(productCode) {
    const product = products[productCode];
    if (product) {
        document.getElementById('productCode').value = productCode;
        document.getElementById('productName').value = product["Полное наименование (русское)"];
        document.getElementById('shelfLife').value = product["Срок годности"];
        document.getElementById('quantityPerPack').value = product["Штук в упаковке"] || '';
        document.getElementById('groupBarcode').value = product["Штрихкод упаковки"] || '';
        document.getElementById('manufacturerBarcode').value = product["Производитель"] || '';
        
        if (product["Название стандарта"] && standardNotificationContainer) {
            standardNotificationContainer.innerHTML = `
                <div class="standard-notification standard-notification-success">
                    <div class="flex items-center">
                        <i class="fas fa-file-contract text-green-500 mr-2"></i>
                        <div>
                            <p class="font-medium">Стандарт качества</p>
                            <p class="text-sm">${product["Название стандарта"]}</p>
                        </div>
                    </div>
                </div>
            `;
        }
        
        if (searchResults) searchResults.classList.add('hidden');
        if (productSearch) productSearch.value = '';
        
        showNotification(`Продукт "${product["Полное наименование (русское)"]}" выбран`, 'success');
    }
}

// Очистка полей
function clearFields() {
    document.getElementById('productCode').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('shelfLife').value = '';
    document.getElementById('quantityPerPack').value = '';
    document.getElementById('groupBarcode').value = '';
    document.getElementById('manufacturerBarcode').value = '';
    
    if (standardNotificationContainer) {
        standardNotificationContainer.innerHTML = '';
    }
    
    const resultElement = document.getElementById('result');
    if (resultElement) {
        resultElement.classList.add('hidden');
    }
}

// Расчет срока годности
function calculateExpiry() {
    const productionDateInput = document.getElementById('productionDate');
    const shelfLifeInput = document.getElementById('shelfLife');
    const resultElement = document.getElementById('result');
    const expiryDateElement = document.getElementById('expiryDate');
    
    if (!productionDateInput || !shelfLifeInput || !resultElement || !expiryDateElement) {
        showNotification('Ошибка: не найдены необходимые элементы', 'error');
        return;
    }
    
    const productionDate = productionDateInput.value;
    const shelfLife = parseInt(shelfLifeInput.value);
    
    if (!productionDate) {
        showNotification('Пожалуйста, укажите дату производства', 'error');
        return;
    }
    
    if (isNaN(shelfLife) || shelfLife <= 0) {
        showNotification('Пожалуйста, выберите продукт для расчета срока годности', 'error');
        return;
    }
    
    try {
        const productionDateObj = new Date(productionDate);
        if (isNaN(productionDateObj.getTime())) {
            throw new Error('Неверный формат даты');
        }
        
        const expiryDate = new Date(productionDateObj);
        expiryDate.setDate(expiryDate.getDate() + shelfLife);
        
        const formattedDate = expiryDate.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        
        expiryDateElement.textContent = formattedDate;
        resultElement.classList.remove('hidden');
        
        showNotification(`Срок годности рассчитан: ${formattedDate}`, 'success');
        
    } catch (error) {
        console.error('Ошибка расчета срока годности:', error);
        showNotification('Ошибка при расчете срока годности', 'error');
    }
}

// Показать уведомление
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification-message notification-${type} slide-in`;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${getNotificationIcon(type)} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Получить иконку для уведомления
function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'error': return 'fa-times-circle';
        case 'info': 
        default: return 'fa-info-circle';
    }
}

// Принудительное обновление данных
function forceRefreshData() {
    cacheUtils.clearCache();
    showNotification('Кэш очищен, загружаем свежие данные...', 'info');
    loadProductsData();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initSearchWorker();
    
    const productionDateElem = document.getElementById('productionDate');
    if (productionDateElem) {
        const today = new Date();
        productionDateElem.value = today.toISOString().split('T')[0];
    }
    
    if (productSearch) {
        productSearch.addEventListener('input', function() {
            clearTimeout(searchUtils.timeout);
            searchUtils.timeout = setTimeout(() => {
                searchUtils.search(this.value);
            }, 300);
        });
        
        productSearch.addEventListener('focus', function() {
            if (this.value.length >= 2) {
                searchUtils.search(this.value);
            }
        });
    }
    
    document.addEventListener('click', (event) => {
        if (searchResults && !searchResults.contains(event.target) && 
            productSearch && !productSearch.contains(event.target)) {
            searchResults.classList.add('hidden');
        }
    });
    
    window.addEventListener('online', () => {
        console.log('Онлайн статус: онлайн');
        checkOnlineStatus();
        backgroundSync.start();
        showNotification('Подключение к интернету восстановлено', 'success');
    });
    
    window.addEventListener('offline', () => {
        console.log('Онлайн статус: оффлайн');
        checkOnlineStatus();
        backgroundSync.stop();
        showNotification('Потеряно подключение к интернету. Работаем автономно.', 'warning');
    });
    
    loadProductsData();
});

// Очистка при выгрузке страницы
window.addEventListener('beforeunload', () => {
    backgroundSync.stop();
    if (searchWorker) {
        searchWorker.terminate();
    }
});

// Глобальный экспорт функций
window.calculateExpiry = calculateExpiry;
window.selectProduct = selectProduct;
window.clearFields = clearFields;
window.showNotification = showNotification;
window.forceRefreshData = forceRefreshData;
window.backgroundSync = backgroundSync;
