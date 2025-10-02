// Конфигурация приложения
const CONFIG = {
    JSON_URL: 'https://raw.githubusercontent.com/svidovichss-droid/ProgressSAP.github.io/main/data.json',
    CACHE_KEY: 'products_cache',
    ETAG_KEY: 'products_etag',
    CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 часа в миллисекундах
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
            "Штрихкод упаковки": "9876543210987",
            "Производитель": "Другой производитель",
            "Название стандарта": "ТУ 45678-2021"
        }
    ]
};

// Функции для голосового озвучивания
const voiceUtils = {
    // Проверка поддержки синтеза речи
    isSupported: () => {
        return 'speechSynthesis' in window;
    },
    
    // Получить любой доступный русский голос
    getAvailableVoice: () => {
        const voices = speechSynthesis.getVoices();
        
        // Сначала ищем любой русский голос
        const russianVoice = voices.find(voice => 
            voice.lang.includes('ru') || voice.lang.includes('RU')
        );
        
        if (russianVoice) {
            console.log('✅ Используем голос:', russianVoice.name);
            return russianVoice;
        }
        
        // Если нет русского, используем первый доступный
        if (voices.length > 0) {
            console.log('⚠ Русский голос не найден, используем:', voices[0].name);
            return voices[0];
        }
        
        console.log('❌ Голоса не найдены');
        return null;
    },
    
    // Озвучить текст (увеличена скорость)
    speak: (text, rate = 1.8, pitch = 1.0, volume = 0.8) => {
        if (!voiceUtils.isSupported()) {
            console.log('Синтез речи не поддерживается браузером');
            return;
        }
        
        // Останавливаем текущее воспроизведение
        speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        utterance.rate = rate;        // УВЕЛИЧЕНА СКОРОСТЬ ДО 2.8
        utterance.pitch = pitch;
        utterance.volume = volume;
        
        // Устанавливаем доступный голос
        const availableVoice = voiceUtils.getAvailableVoice();
        if (availableVoice) {
            utterance.voice = availableVoice;
        } else {
            console.log('❌ Нет доступных голосов');
            return;
        }
        
        utterance.onstart = () => {
            console.log('🔊 Начато озвучивание:', text);
        };
        
        utterance.onerror = (event) => {
            console.error('Ошибка синтеза речи:', event);
        };
        
        utterance.onend = () => {
            console.log('✅ Озвучивание завершено');
        };
        
        speechSynthesis.speak(utterance);
    },
    
    // Озвучить уведомление
    speakNotification: (message, type) => {
        if (!voiceUtils.isSupported()) return;
        
        let prefix = '';
        switch(type) {
            case 'success':
                prefix = '';
                break;
            case 'warning':
                prefix = 'Внимание: ';
                break;
            case 'error':
                prefix = 'Ошибка: ';
                break;
            default:
                prefix = '';
        }
        
        voiceUtils.speak(prefix + message, 1.8); // Быстрая скорость для уведомлений
    },
    
    // Озвучить системные события
    speakSystemEvent: (message) => {
        if (!voiceUtils.isSupported()) return;
        voiceUtils.speak(message, 1.8); // Быстрая скорость для системных событий
    },
    
    // Озвучить события загрузки данных
    speakDataEvent: (message) => {
        if (!voiceUtils.isSupported()) return;
        voiceUtils.speak(message, 1.8); // Быстрая скорость для событий данных
    },
    
    // Показать доступные голоса
    showAvailableVoices: () => {
        if (!voiceUtils.isSupported()) {
            console.log('❌ Синтез речи не поддерживается');
            return;
        }
        
        const voices = speechSynthesis.getVoices();
        console.log('🎵 Доступные голоса:');
        voices.forEach(voice => {
            console.log(`- ${voice.name} (${voice.lang}) ${voice.default ? '[по умолчанию]' : ''}`);
        });
        
        if (voices.length === 0) {
            console.log('❌ Голосов не найдено. Проверьте настройки браузера.');
        }
    }
};

// Глобальные переменные
let products = {};
let warningMessageAdded = false;
let isOnline = true;

// DOM elements
const productSearch = document.getElementById('productSearch');
const searchResults = document.getElementById('searchResults');
const standardNotificationContainer = document.getElementById('standardNotificationContainer');
const dataStatus = document.getElementById('dataStatus');
const offlineStatus = document.getElementById('offlineStatus');
const calculateButton = document.getElementById('calculateButton');

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

// Утилиты для работы с кэшем
const cacheUtils = {
    // Сохранить данные в кэш
    saveToCache: (data, etag = null) => {
        try {
            const cacheData = {
                timestamp: Date.now(),
                data: data,
                etag: etag
            };
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cacheData));
            console.log('Данные сохранены в кэш');
            
            if (etag) {
                localStorage.setItem(CONFIG.ETAG_KEY, etag);
            }
        } catch (error) {
            console.error('Ошибка сохранения в кэш:', error);
        }
    },

    // Получить данные из кэша
    getFromCache: () => {
        try {
            const cached = localStorage.getItem(CONFIG.CACHE_KEY);
            if (!cached) return null;

            const cacheData = JSON.parse(cached);
            const isExpired = Date.now() - cacheData.timestamp > CONFIG.CACHE_EXPIRY;

            return {
                data: cacheData.data,
                etag: cacheData.etag,
                isExpired: isExpired
            };
        } catch (error) {
            console.error('Ошибка чтения из кэша:', error);
            return null;
        }
    },

    // Получить ETag из localStorage
    getEtag: () => {
        try {
            return localStorage.getItem(CONFIG.ETAG_KEY);
        } catch (error) {
            console.error('Ошибка чтения ETag:', error);
            return null;
        }
    },

    // Очистить кэш
    clearCache: () => {
        try {
            localStorage.removeItem(CONFIG.CACHE_KEY);
            localStorage.removeItem(CONFIG.ETAG_KEY);
            console.log('Кэш очищен');
        } catch (error) {
            console.error('Ошибка очистки кэша:', error);
        }
    },

    // Сохранить fallback данные
    saveFallbackData: () => {
        try {
            const cacheData = {
                timestamp: Date.now(),
                data: CONFIG.FALLBACK_DATA,
                etag: 'fallback'
            };
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cacheData));
            console.log('Fallback данные сохранены в кэш');
        } catch (error) {
            console.error('Ошибка сохранения fallback данных:', error);
        }
    }
};

// Проверка обновлений на сервере
async function checkForUpdates(cachedEtag) {
    try {
        // Если оффлайн, не проверяем обновления
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
            return false; // Нет обновлений
        }

        if (response.status === 200) {
            const newEtag = response.headers.get('ETag');
            if (newEtag && newEtag !== cachedEtag) {
                console.log('Обнаружены обновления на сервере');
                return true; // Есть обновлений
            }
        }

        return false;
    } catch (error) {
        console.error('Ошибка проверки обновлений:', error);
        return false; // При ошибке считаем, что обновлений нет
    }
}

// Загрузка данных о продуктах
async function loadProductsData() {
    try {
        // Показываем индикатор загрузки
        if (dataStatus) dataStatus.classList.remove('hidden');
        
        // Проверяем онлайн статус
        checkOnlineStatus();
        
        // Проверяем кэш
        const cached = cacheUtils.getFromCache();
        const cachedEtag = cacheUtils.getEtag();
        
        let shouldUseCache = false;
        let shouldUpdateCache = false;

        if (cached && !cached.isExpired) {
            // Кэш актуален, проверяем обновления на сервере (только если онлайн)
            if (isOnline) {
                const hasUpdates = await checkForUpdates(cachedEtag);
                
                if (!hasUpdates) {
                    console.log('Используем актуальные данные из кэша');
                    processProductsData(cached.data);
                    shouldUseCache = true;
                    
                    // ОЗВУЧИВАЕМ использование кэшированных данных
                    voiceUtils.speakDataEvent('Данные загружены из кэша');
                } else {
                    console.log('Обнаружены обновления, загружаем новые данные');
                    shouldUpdateCache = true;
                }
            } else {
                // Оффлайн режим - используем кэш
                console.log('Оффлайн режим, используем данные из кэша');
                processProductsData(cached.data);
                shouldUseCache = true;
            }
        } else if (cached) {
            // Кэш просрочен, но данные есть
            if (isOnline) {
                console.log('Кэш просрочен, проверяем обновления');
                const hasUpdates = await checkForUpdates(cachedEtag);
                
                if (!hasUpdates) {
                    console.log('Обновлений нет, обновляем timestamp кэша');
                    cacheUtils.saveToCache(cached.data, cachedEtag);
                    processProductsData(cached.data);
                    shouldUseCache = true;
                } else {
                    console.log('Обнаружены обновления, загружаем новые данные');
                    shouldUpdateCache = true;
                }
            } else {
                // Оффлайн режим - используем просроченный кэш
                console.log('Оффлайн режим, используем просроченные данные из кэша');
                processProductsData(cached.data);
                shouldUseCache = true;
            }
        } else {
            // Нет кэша
            if (isOnline) {
                console.log('Кэш отсутствует, загружаем данные с сервера');
                shouldUpdateCache = true;
            } else {
                // Оффлайн и нет кэша - используем fallback данные
                console.log('Оффлайн режим и нет кэша, используем fallback данные');
                cacheUtils.saveFallbackData();
                processProductsData(CONFIG.FALLBACK_DATA);
                showNotification('Работаем в автономном режиме с тестовыми данными', 'warning');
                shouldUseCache = true;
            }
        }

        // Загружаем новые данные если нужно
        if (shouldUpdateCache) {
            // ОЗВУЧИВАЕМ начало загрузки
            voiceUtils.speakDataEvent('Загружаем актуальные данные');
            
            const response = await fetch(CONFIG.JSON_URL, {
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const productsData = await response.json();
            const newEtag = response.headers.get('ETag');
            
            // Сохраняем в кэш
            cacheUtils.saveToCache(productsData, newEtag);
            
            // Обрабатываем данные
            processProductsData(productsData);
            
            // ОЗВУЧИВАЕМ успешную загрузку данных
            voiceUtils.speakDataEvent('Данные успешно обновлены');
            
            // Показываем уведомление об успешной загрузке
            if (cached) {
                showNotification('Данные успешно обновлены', 'success');
            }
        }

    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        
        // ОЗВУЧИВАЕМ ошибку загрузки
        voiceUtils.speakNotification('Не удалось загрузить данные', 'error');
        
        // Пытаемся использовать кэш, даже если он просрочен
        const cached = cacheUtils.getFromCache();
        if (cached) {
            console.log('Используем данные из кэша из-за ошибки сети');
            processProductsData(cached.data);
            showNotification('Не удалось загрузить актуальные данные. Используются кэшированные данные.', 'warning');
        } else {
            // Нет кэша и не удалось загрузить данные - используем fallback
            console.log('Нет кэша, используем fallback данные');
            cacheUtils.saveFallbackData();
            processProductsData(CONFIG.FALLBACK_DATA);
            showNotification('Не удалось загрузить данные. Используются тестовые данные.', 'error');
        }
    } finally {
        // Скрываем индикатор загрузки
        if (dataStatus) {
            dataStatus.classList.add('hidden');
        }
    }
}

// Обработка данных о продуктах
function processProductsData(productsData) {
    products = {}; // Очищаем предыдущие данные
    
    // Преобразуем массив в объект для быстрого поиска по коду
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
    
    // Активируем поля ввода
    activateInputFields();
}

// Активация полей ввода
function activateInputFields() {
    if (productSearch) productSearch.disabled = false;
    if (calculateButton) calculateButton.disabled = false;
}

// Принудительное обновление данных
async function forceRefreshData() {
    console.log('Принудительное обновление данных');
    if (!checkOnlineStatus()) {
        showNotification('Нет подключения к интернету. Обновление невозможно.', 'error');
        return;
    }
    
    // ОЗВУЧИВАЕМ начало принудительного обновления
    voiceUtils.speakDataEvent('Обновляем данные');
    
    cacheUtils.clearCache();
    await loadProductsData();
}

// Поиск продуктов
if (productSearch) {
    productSearch.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        if (searchResults) searchResults.innerHTML = '';
        if (standardNotificationContainer) standardNotificationContainer.innerHTML = '';
        
        if (searchTerm.length < 2) {
            if (searchResults) searchResults.classList.add('hidden');
            clearFields();
            return;
        }

        let resultsFound = false;

        for (const code in products) {
            const product = products[code];
            if (code.includes(searchTerm) ||
                product["Полное наименование (русское)"].toLowerCase().includes(searchTerm)) {

                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-blue-50 cursor-pointer flex items-center border-b border-gray-100 last:border-0';
                div.setAttribute('role', 'option');
                div.innerHTML = `
                <div class="bg-blue-100 p-2 rounded-lg mr-3">
                  <i class="fas fa-box text-blue-600"></i>
                </div>
                <div>
                  <div class="font-medium text-blue-800">${product["Полное наименование (русское)"]}</div>
                  <div class="text-sm text-gray-500">Код: <span class="product-code">${code}</span> | Срок: <span class="shelf-life">${product["Срок годности"]} дней</span></div>
                </div>
                `;
                div.onclick = function() {
                    selectProduct(code);
                };
                if (searchResults) searchResults.appendChild(div);
                resultsFound = true;
            }
        }

        if (searchResults) {
            if (resultsFound) {
                searchResults.classList.remove('hidden');
            } else {
                const noResults = document.createElement('div');
                noResults.className = 'p-3 text-gray-500 text-center';
                noResults.textContent = 'Ничего не найдено';
                noResults.setAttribute('role', 'option');
                searchResults.appendChild(noResults);
                searchResults.classList.remove('hidden');
            }
        }
    });
}

// Очистка полей
function clearFields() {
    const fields = [
        'productCode', 'productName', 'shelfLife', 
        'quantityPerPack', 'groupBarcode', 'manufacturerBarcode'
    ];
    
    fields.forEach(field => {
        const element = document.getElementById(field);
        if (element) element.value = '';
    });
    
    const warningMsg = document.getElementById('warningMessage');
    if (warningMsg) {
        warningMsg.remove();
        warningMessageAdded = false;
    }
}

// Закрытие результатов поиска при клике вне области
document.addEventListener('click', function(e) {
    if (productSearch && searchResults) {
        if (!productSearch.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    }
});

// Выбор продукта из результатов поиска
function selectProduct(code) {
    const product = products[code];
    
    const productCodeElem = document.getElementById('productCode');
    const productNameElem = document.getElementById('productName');
    const shelfLifeElem = document.getElementById('shelfLife');
    const quantityPerPackElem = document.getElementById('quantityPerPack');
    const groupBarcodeElem = document.getElementById('groupBarcode');
    const manufacturerBarcodeElem = document.getElementById('manufacturerBarcode');
    
    if (productCodeElem) productCodeElem.value = code;
    if (productNameElem) productNameElem.value = product["Полное наименование (русское)"];
    if (shelfLifeElem) shelfLifeElem.value = product["Срок годности"];
    if (quantityPerPackElem) quantityPerPackElem.value = product["Штук в упаковке"] || "";
    if (groupBarcodeElem) groupBarcodeElem.value = product["Штрихкод упаковки"] || "";
    if (manufacturerBarcodeElem) manufacturerBarcodeElem.value = product["Производитель"] || "";

    if (productSearch) productSearch.value = '';
    if (searchResults) searchResults.classList.add('hidden');

    if (product["Название стандарта"] && standardNotificationContainer) {
        showStandardNotification("Статус: " + product["Название стандарта"]);
    }
    
    if (!warningMessageAdded) {
        const warningMessage = document.createElement('div');
        warningMessage.id = 'warningMessage';
        warningMessage.className = 'mt-4 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700';
        warningMessage.textContent = 'Важно! Для завершения процесса нажмите кнопку "Рассчитать срок годности".';
        
        const calculateButton = document.querySelector('button[onclick="calculateExpiry()"]');
        if (calculateButton) {
            calculateButton.parentNode.insertBefore(warningMessage, calculateButton);
            warningMessageAdded = true;
        }
    }
}

// Показать стандартное уведомление
function showStandardNotification(standard) {
    if (!standardNotificationContainer) return;
    
    standardNotificationContainer.innerHTML = '';
    
    if (!standard || standard === 'Не указано') return;
    
    const notification = document.createElement('div');
    notification.className = 'p-3 rounded-lg shadow-md bg-blue-100 border border-blue-300 text-blue-800 slide-in';
    notification.setAttribute('aria-live', 'polite');
    notification.innerHTML = `
        <div class="flex items-start">
            <div class="flex-grow break-words">${standard}</div>
        </div>
    `;
    standardNotificationContainer.appendChild(notification);
}

// Расчет срока годности
function calculateExpiry() {
    const shelfLifeElem = document.getElementById('shelfLife');
    const productionDateElem = document.getElementById('productionDate');
    const expiryDateElem = document.getElementById('expiryDate');
    const resultDiv = document.getElementById('result');
    
    if (!shelfLifeElem || !productionDateElem || !expiryDateElem || !resultDiv) return;
    
    const shelfLife = parseInt(shelfLifeElem.value);
    const productionDate = productionDateElem.value;

    if (!shelfLife || !productionDate) {
        showNotification('Пожалуйста, выберите продукт и укажите дату производства', 'error');
        return;
    }

    const production = new Date(productionDate);
    const expiryDate = new Date(production);
    expiryDate.setDate(production.getDate() + shelfLife);

    const options = { year: 'numeric', month: 'numeric', day: 'numeric' };
    const formattedDate = expiryDate.toLocaleDateString('ru-RU', options);

    expiryDateElem.textContent = formattedDate;

    resultDiv.classList.remove('hidden');
    resultDiv.classList.add('fade-in');

    const warningMsg = document.getElementById('warningMessage');
    if (warningMsg) {
        warningMsg.remove();
        warningMessageAdded = false;
    }

    setTimeout(() => {
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// Показать уведомление
function showNotification(message, type) {
    // ОЗВУЧИВАЕМ уведомление
    voiceUtils.speakNotification(message, type);
    
    const existingNotifications = document.querySelectorAll('.notification-message');
    existingNotifications.forEach(notification => notification.remove());

    const notification = document.createElement('div');
    notification.className = `notification-message fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 transition-all duration-300 transform translate-x-0 opacity-100 ${
        type === 'success' ? 'bg-green-500' : 
        type === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
    }`;
    notification.setAttribute('aria-live', 'assertive');
    notification.innerHTML = `
    <div class="flex items-center">
      <i class="fas ${
          type === 'success' ? 'fa-check-circle' : 
          type === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle'
      } mr-2"></i>
      ${message}
    </div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем голоса
    if (voiceUtils.isSupported()) {
        // Ждем загрузки голосов
        const initVoices = () => {
            const voices = speechSynthesis.getVoices();
            if (voices.length > 0) {
                console.log('🔊 Инициализация голосового синтеза:');
                voiceUtils.showAvailableVoices();
                
                // УБРАНА ТЕСТОВАЯ ФРАЗА
            } else {
                setTimeout(initVoices, 100);
            }
        };
        
        // Запускаем инициализацию голосов
        initVoices();
        
        // Некоторые браузеры загружают голоса асинхронно
        speechSynthesis.addEventListener('voiceschanged', initVoices);
    } else {
        console.log('❌ Браузер не поддерживает синтез речи');
    }
    
    const productionDateElem = document.getElementById('productionDate');
    if (productionDateElem) {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();

        productionDateElem.value = `${year}-${month}-${day}`;
    }
    
    // Слушатели событий онлайн/оффлайн
    window.addEventListener('online', () => {
        console.log('Онлайн статус: онлайн');
        checkOnlineStatus();
        showNotification('Подключение к интернету восстановлено', 'success');
        
        // ОЗВУЧИВАЕМ восстановление связи
        voiceUtils.speakSystemEvent('Подключение восстановлено');
    });
    
    window.addEventListener('offline', () => {
        console.log('Онлайн статус: оффлайн');
        checkOnlineStatus();
        showNotification('Потеряно подключение к интернету. Работаем автономно.', 'warning');
        
        // ОЗВУЧИВАЕМ потерю связи
        voiceUtils.speakSystemEvent('Работаем автономно');
    });
    
    // Загружаем данные о продуктах
    loadProductsData();
});

// Экспортируем функции для глобального использования
window.calculateExpiry = calculateExpiry;
window.forceRefreshData = forceRefreshData;
