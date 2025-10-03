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
let isOnline = true;
let backgroundSyncTimer = null;
let searchWorker = null;

// DOM elements
const elements = {
    productSearch: document.getElementById('productSearch'),
    searchResults: document.getElementById('searchResults'),
    standardNotificationContainer: document.getElementById('standardNotificationContainer'),
    dataStatus: document.getElementById('dataStatus'),
    offlineStatus: document.getElementById('offlineStatus'),
    calculateButton: document.getElementById('calculateButton'),
    productCode: document.getElementById('productCode'),
    productName: document.getElementById('productName'),
    shelfLife: document.getElementById('shelfLife'),
    quantityPerPack: document.getElementById('quantityPerPack'),
    groupBarcode: document.getElementById('groupBarcode'),
    manufacturerBarcode: document.getElementById('manufacturerBarcode'),
    productionDate: document.getElementById('productionDate'),
    result: document.getElementById('result'),
    expiryDate: document.getElementById('expiryDate')
};

// Инициализация приложения
function initApp() {
    console.log('Инициализация приложения...');
    
    // Установка текущей даты по умолчанию
    if (elements.productionDate) {
        const today = new Date();
        elements.productionDate.value = today.toISOString().split('T')[0];
    }
    
    // Инициализация поиска
    initSearch();
    
    // Загрузка данных
    loadProductsData();
    
    // Настройка слушателей событий
    setupEventListeners();
}

// Инициализация поиска
function initSearch() {
    if (elements.productSearch) {
        elements.productSearch.addEventListener('input', function(e) {
            const searchTerm = e.target.value.trim();
            if (searchTerm.length >= 2) {
                performSearch(searchTerm);
            } else {
                clearSearchResults();
                clearProductFields();
            }
        });
        
        // Закрытие результатов поиска при клике вне области
        document.addEventListener('click', function(e) {
            if (elements.searchResults && 
                !elements.productSearch.contains(e.target) && 
                !elements.searchResults.contains(e.target)) {
                elements.searchResults.classList.add('hidden');
            }
        });
    }
}

// Выполнение поиска
function performSearch(searchTerm) {
    if (!elements.searchResults) return;
    
    clearSearchResults();
    
    const results = [];
    const term = searchTerm.toLowerCase();
    
    // Поиск по коду и названию
    for (const code in products) {
        const product = products[code];
        if (code.toLowerCase().includes(term) || 
            product["Полное наименование (русское)"].toLowerCase().includes(term)) {
            results.push({ code, product });
            
            if (results.length >= 20) break; // Ограничиваем количество результатов
        }
    }
    
    if (results.length > 0) {
        results.forEach(({ code, product }) => {
            addSearchResult(code, product);
        });
        elements.searchResults.classList.remove('hidden');
    } else {
        showNoResults();
    }
}

// Добавление результата поиска
function addSearchResult(code, product) {
    if (!elements.searchResults) return;
    
    const div = document.createElement('div');
    div.className = 'p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0';
    div.innerHTML = `
        <div class="flex items-start">
            <div class="bg-blue-100 p-2 rounded-lg mr-3 mt-1">
                <i class="fas fa-box text-blue-600 text-sm"></i>
            </div>
            <div class="flex-1">
                <div class="font-medium text-gray-900 text-sm mb-1">${escapeHtml(product["Полное наименование (русское)"])}</div>
                <div class="text-xs text-gray-600">
                    <span class="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">Код: ${code}</span>
                    <span class="inline-block bg-green-100 text-green-800 px-2 py-1 rounded">Срок: ${product["Срок годности"]} дн.</span>
                </div>
            </div>
        </div>
    `;
    
    div.addEventListener('click', () => {
        selectProduct(code);
        elements.searchResults.classList.add('hidden');
    });
    
    elements.searchResults.appendChild(div);
}

// Показать сообщение "нет результатов"
function showNoResults() {
    if (!elements.searchResults) return;
    
    const div = document.createElement('div');
    div.className = 'p-4 text-center text-gray-500';
    div.innerHTML = `
        <i class="fas fa-search text-gray-300 text-2xl mb-2 block"></i>
        <p>Продукты не найдены</p>
        <p class="text-sm mt-1">Попробуйте изменить запрос</p>
    `;
    elements.searchResults.appendChild(div);
    elements.searchResults.classList.remove('hidden');
}

// Очистка результатов поиска
function clearSearchResults() {
    if (elements.searchResults) {
        elements.searchResults.innerHTML = '';
    }
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
    if (!product) return;
    
    // Заполнение полей
    if (elements.productCode) elements.productCode.value = productCode;
    if (elements.productName) elements.productName.value = product["Полное наименование (русское)"];
    if (elements.shelfLife) elements.shelfLife.value = product["Срок годности"];
    if (elements.quantityPerPack) elements.quantityPerPack.value = product["Штук в упаковке"] || '';
    if (elements.groupBarcode) elements.groupBarcode.value = product["Штрихкод упаковки"] || '';
    if (elements.manufacturerBarcode) elements.manufacturerBarcode.value = product["Производитель"] || '';
    
    // Показать стандарт если есть
    if (elements.standardNotificationContainer && product["Название стандарта"]) {
        elements.standardNotificationContainer.innerHTML = `
            <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div class="flex items-center">
                    <i class="fas fa-file-contract text-green-600 mr-2"></i>
                    <div>
                        <p class="font-medium text-green-800 text-sm">Стандарт качества</p>
                        <p class="text-green-700 text-xs">${product["Название стандарта"]}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Очистка поля поиска
    if (elements.productSearch) {
        elements.productSearch.value = '';
    }
    
    showNotification(`Выбран продукт: ${product["Полное наименование (русское)"]}`, 'success');
}

// Очистка полей продукта
function clearProductFields() {
    if (elements.productCode) elements.productCode.value = '';
    if (elements.productName) elements.productName.value = '';
    if (elements.shelfLife) elements.shelfLife.value = '';
    if (elements.quantityPerPack) elements.quantityPerPack.value = '';
    if (elements.groupBarcode) elements.groupBarcode.value = '';
    if (elements.manufacturerBarcode) elements.manufacturerBarcode.value = '';
    
    if (elements.standardNotificationContainer) {
        elements.standardNotificationContainer.innerHTML = '';
    }
    
    if (elements.result) {
        elements.result.classList.add('hidden');
    }
}

// Расчет срока годности
function calculateExpiry() {
    // Проверка обязательных полей
    if (!elements.productionDate || !elements.productionDate.value) {
        showNotification('Пожалуйста, укажите дату производства', 'error');
        return;
    }
    
    if (!elements.shelfLife || !elements.shelfLife.value) {
        showNotification('Пожалуйста, выберите продукт для расчета', 'error');
        return;
    }
    
    const productionDate = new Date(elements.productionDate.value);
    const shelfLifeDays = parseInt(elements.shelfLife.value);
    
    if (isNaN(productionDate.getTime())) {
        showNotification('Неверный формат даты производства', 'error');
        return;
    }
    
    if (isNaN(shelfLifeDays) || shelfLifeDays <= 0) {
        showNotification('Неверный срок годности', 'error');
        return;
    }
    
    // Расчет даты окончания срока годности
    const expiryDate = new Date(productionDate);
    expiryDate.setDate(expiryDate.getDate() + shelfLifeDays);
    
    // Форматирование даты
    const formattedDate = expiryDate.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
    
    // Показ результата
    if (elements.expiryDate) {
        elements.expiryDate.textContent = formattedDate;
    }
    
    if (elements.result) {
        elements.result.classList.remove('hidden');
    }
    
    showNotification(`Срок годности истекает: ${formattedDate}`, 'success');
}

// Показать уведомление
function showNotification(message, type = 'info') {
    // Создание элемента уведомления
    const notification = document.createElement('div');
    const typeClass = {
        'success': 'notification-success',
        'error': 'notification-error',
        'warning': 'notification-warning',
        'info': 'notification-info'
    }[type] || 'notification-info';
    
    const icon = {
        'success': 'fa-check-circle',
        'error': 'fa-times-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    }[type] || 'fa-info-circle';
    
    notification.className = `notification-message ${typeClass} slide-in`;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${icon} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Добавление в DOM
    document.body.appendChild(notification);
    
    // Автоматическое удаление через 5 секунд
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

// Настройка слушателей событий
function setupEventListeners() {
    // События онлайн/оффлайн
    window.addEventListener('online', () => {
        isOnline = true;
        if (elements.offlineStatus) {
            elements.offlineStatus.classList.add('hidden');
        }
        showNotification('Подключение к интернету восстановлено', 'success');
        loadProductsData(); // Перезагружаем данные при появлении сети
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        if (elements.offlineStatus) {
            elements.offlineStatus.classList.remove('hidden');
        }
        showNotification('Работаем в автономном режиме', 'warning');
    });
}

// Активация полей ввода после загрузки данных
function activateInputFields() {
    if (elements.productSearch) {
        elements.productSearch.disabled = false;
        elements.productSearch.placeholder = "Введите код или название продукта...";
    }
    
    if (elements.calculateButton) {
        elements.calculateButton.disabled = false;
    }
    
    console.log(`Загружено ${Object.keys(products).length} продуктов`);
    showNotification('Данные о продуктах успешно загружены', 'success');
}

// Простая загрузка данных (упрощенная версия)
async function loadProductsData() {
    try {
        console.log('Начало загрузки данных...');
        
        // Показываем статус загрузки
        if (elements.dataStatus) {
            elements.dataStatus.classList.remove('hidden');
        }
        
        let productsData;
        
        // Пробуем загрузить с сервера
        if (isOnline) {
            try {
                const response = await fetch(CONFIG.JSON_URL);
                if (response.ok) {
                    productsData = await response.json();
                    console.log('Данные загружены с сервера:', productsData.length, 'записей');
                } else {
                    throw new Error(`HTTP error: ${response.status}`);
                }
            } catch (error) {
                console.warn('Ошибка загрузки с сервера:', error);
                // Используем fallback данные
                productsData = CONFIG.FALLBACK_DATA;
                console.log('Используем fallback данные');
            }
        } else {
            // Оффлайн режим - используем fallback
            productsData = CONFIG.FALLBACK_DATA;
            console.log('Оффлайн режим, используем fallback данные');
        }
        
        // Обработка данных
        processProductsData(productsData);
        
    } catch (error) {
        console.error('Критическая ошибка загрузки данных:', error);
        // Используем fallback данные в случае ошибки
        processProductsData(CONFIG.FALLBACK_DATA);
        showNotification('Ошибка загрузки данных. Используются тестовые данные.', 'error');
    } finally {
        // Скрываем статус загрузки
        if (elements.dataStatus) {
            elements.dataStatus.classList.add('hidden');
        }
    }
}

// Обработка данных о продуктах
function processProductsData(productsData) {
    products = {};
    
    productsData.forEach(product => {
        if (product["Код продукции"] && product["Полное наименование (русское)"]) {
            products[product["Код продукции"]] = {
                "Полное наименование (русское)": product["Полное наименование (русское)"],
                "Срок годности": product["Срок годности"] || 0,
                "Штук в упаковке": product["Штук в упаковке"] || '',
                "Штрихкод упаковки": product["Штрихкод упаковки"] || '',
                "Производитель": product["Производитель"] || '',
                "Название стандарта": product["Название стандарта"] || ''
            };
        }
    });
    
    productsArray = Object.values(products);
    activateInputFields();
}

// Принудительное обновление данных
function forceRefreshData() {
    showNotification('Обновление данных...', 'info');
    loadProductsData();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initApp);

// Глобальный экспорт функций
window.calculateExpiry = calculateExpiry;
window.selectProduct = selectProduct;
window.forceRefreshData = forceRefreshData;
