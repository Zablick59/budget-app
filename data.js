// Money is stored in rubles for backup compatibility; all arithmetic uses integer kopecks.
const FinanceData = (() => {
    const KEY = 'budgetDataV2';
    const legacyKeys = ['transactions', 'categories', 'accounts', 'baseBalances', 'recentColors', 'visibility'];
    const defaultColors = ['hsl(0, 100%, 50%)', 'hsl(45, 100%, 50%)', 'hsl(120, 100%, 40%)', 'hsl(210, 100%, 50%)', 'hsl(280, 100%, 50%)'];
    let lastStored = null;
    let legacySnapshot = '';
    let loadError = '';
    let rawRecovery = {};
    const cents = value => Math.round(value * 100);
    const format = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
    const id = prefix => prefix + '_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
    const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function requireValue(ok, message) { if (!ok) throw new Error(message); }
    function parseMoney(value) {
        const text = String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
        if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;
        const amount = Number(text);
        return Number.isFinite(amount) && Math.abs(amount) <= 1e12 ? cents(amount) / 100 : null;
    }
    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [y, m, d] = value.split('-').map(Number);
        if (y < 1000 || y > 9999) return false;
        const date = new Date(y, m - 1, d);
        return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
    }
    function color(value) {
        return typeof value === 'string' && /^(?:#[\da-f]{3}|#[\da-f]{6}|hsla?\([\d\s.,%+-]+\)|rgba?\([\d\s.,%+-]+\))$/i.test(value) ? value : '#8e8e93';
    }
    function numeric(value, label, positive = false) {
        requireValue(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12, label + ': некорректная сумма.');
        const rounded = cents(value) / 100;
        requireValue(Math.abs(value - rounded) < 0.000001 && (!positive || rounded > 0), label + ': нужна положительная сумма с точностью до копейки.');
        return rounded;
    }
    function normalize(raw) {
        requireValue(isObject(raw), 'Файл должен содержать резервную копию приложения.');
        requireValue(raw.schemaVersion === undefined || raw.schemaVersion === 2, 'Эта версия резервной копии не поддерживается.');
        requireValue(Array.isArray(raw.transactions), 'В копии отсутствует список операций.');
        const cats = Array.isArray(raw.categories) ? { expense: raw.categories, income: [] } : raw.categories;
        requireValue(isObject(cats) && Array.isArray(cats.expense) && Array.isArray(cats.income), 'Некорректный список категорий.');
        let sourceAccounts = raw.accounts;
        if (sourceAccounts === undefined && isObject(raw.baseBalances)) {
            sourceAccounts = [['main', 'Основной'], ['savings', 'Накопительный'], ['grandma', 'Бабушкин']].map(([id, name]) => ({ id, name, baseBalance: raw.baseBalances[id] ?? 0 }));
        }
        requireValue(Array.isArray(sourceAccounts) && sourceAccounts.length > 0, 'В копии должен быть хотя бы один счёт.');
        const string = (v, label, empty = false) => {
            requireValue(typeof v === 'string' && (empty || v.trim().length > 0), label + ': некорректный текст.');
            return v;
        };
        const unique = (list, label) => {
            const ids = list.map(item => String(item.id));
            requireValue(new Set(ids).size === ids.length, label + ': повторяются идентификаторы.');
            return list;
        };
        const accounts = unique(sourceAccounts.map(a => {
            requireValue(isObject(a), 'Некорректный счёт.');
            return { id: string(a.id, 'Счёт'), name: string(a.name, 'Название счёта'), baseBalance: numeric(a.baseBalance ?? 0, 'Баланс') };
        }), 'Счета');
        const categories = {};
        for (const type of ['expense', 'income']) {
            categories[type] = cats[type].map(c => {
                requireValue(isObject(c), 'Некорректная категория.');
                requireValue(!['all', 'transfer'].includes(c.id), 'Недопустимый идентификатор категории.');
                return { id: string(c.id, 'Категория'), name: string(c.name, 'Название категории'), icon: string(c.icon ?? '📌', 'Эмодзи') , color: color(c.color) };
            });
        }
        unique([...categories.expense, ...categories.income], 'Категории');
        const transactions = unique(raw.transactions.map(t => {
            requireValue(isObject(t), 'Некорректная операция.');
            requireValue((typeof t.id === 'number' && Number.isSafeInteger(t.id)) || (typeof t.id === 'string' && t.id.length > 0), 'Некорректный идентификатор операции.');
            requireValue(['income', 'expense', 'transfer'].includes(t.type), 'Неизвестный тип операции.');
            requireValue(validDate(t.date), 'Операция содержит некорректную дату.');
            return { id: t.id, type: t.type, amount: numeric(t.amount, 'Операция', true), date: t.date,
                from: string(t.from, 'Счёт операции'), to: t.type === 'transfer' ? string(t.to, 'Счёт получателя') : null,
                categoryId: t.type === 'transfer' ? null : string(t.categoryId ?? '', 'Категория операции', true),
                comment: string(t.comment ?? '', 'Комментарий', true) };
        }), 'Операции');
        // Deleted accounts/categories are valid historical references; preserve their IDs.
        const magnitude = [...accounts.map(a => Math.abs(cents(a.baseBalance))), ...transactions.map(t => cents(t.amount))].reduce((a, b) => a + b, 0);
        requireValue(Number.isSafeInteger(magnitude), 'Общая сумма слишком велика для точного расчёта.');
        requireValue(raw.recentColors === undefined || Array.isArray(raw.recentColors), 'Некорректный список цветов.');
        requireValue(raw.visibility === undefined || isObject(raw.visibility), 'Некорректные настройки видимости.');
        const visibility = Object.create(null);
        for (const [key, value] of Object.entries(raw.visibility ?? {})) {
            requireValue(typeof value === 'boolean', 'Некорректные настройки видимости.');
            visibility[key] = value;
        }
        const sourceWish = raw.wishlist ?? { categories: [], items: [] };
        requireValue(isObject(sourceWish) && Array.isArray(sourceWish.categories) && Array.isArray(sourceWish.items), 'Некорректный виш-лист.');
        const wishText = (v, label, limit, empty = false) => {
            const text = string(v, label, empty);
            requireValue(text.length <= limit, label + ': слишком длинный текст.');
            return text;
        };
        const wishCategories = unique(sourceWish.categories.map(c => {
            requireValue(isObject(c), 'Некорректная категория виш-листа.');
            return { id: string(c.id, 'Категория виш-листа'), name: wishText(c.name, 'Название', 80),
                icon: wishText(c.icon ?? '', 'Эмодзи', 32, true), color: color(c.color),
                ...(c.sourceExpenseId === undefined ? {} : { sourceExpenseId: string(c.sourceExpenseId, 'Исходная категория расходов') }) };
        }), 'Категории виш-листа');
        const wishItems = unique(sourceWish.items.map(item => {
            requireValue(isObject(item), 'Некорректная покупка в виш-листе.');
            requireValue(['wish', 'candidate', 'planned'].includes(item.status), 'Неизвестный статус покупки.');
            requireValue(['unknown', 'exact', 'range'].includes(item.priceType), 'Неизвестный вид цены.');
            let priceMin = null, priceMax = null;
            if (item.priceType !== 'unknown') {
                priceMin = numeric(item.priceMin, 'Цена');
                priceMax = item.priceType === 'range' ? numeric(item.priceMax, 'Цена') : priceMin;
                requireValue(priceMin >= 0 && priceMax >= priceMin, 'Укажите цены от меньшей к большей.');
            }
            const link = wishText(item.link ?? '', 'Ссылка', 2048, true);
            requireValue(!link || /^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(link), 'Ссылка должна начинаться с https:// или http://.');
            const photo = item.photo ?? '';
            requireValue(typeof photo === 'string' && (!photo || (photo.length <= 260000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo))), 'Некорректное или слишком большое фото.');
            requireValue(item.categoryId === null || wishCategories.some(c => c.id === item.categoryId), 'Категория покупки не найдена.');
            return { id: string(item.id, 'Покупка'), name: wishText(item.name, 'Название покупки', 120),
                status: item.status, categoryId: item.categoryId, icon: wishText(item.icon ?? '', 'Эмодзи', 32, true),
                priceType: item.priceType, priceMin, priceMax, link, photo,
                note: wishText(item.note ?? '', 'Заметка', 1000, true) };
        }), 'Виш-лист');
        requireValue(sourceWish.recentColors === undefined || Array.isArray(sourceWish.recentColors), 'Некорректная палитра виш-листа.');
        return { schemaVersion: 2, accounts, categories, transactions, wishlist: { categories: wishCategories, items: wishItems,
            recentColors: (sourceWish.recentColors ?? defaultColors).map(color).slice(0, 5) },
            recentColors: (raw.recentColors ?? defaultColors).map(color).slice(0, 5), visibility };
    }
    function defaults() {
        return { transactions: [], accounts: [{ id: id('acc'), name: 'Основной', baseBalance: 0 }],
            categories: { expense: [
                { id: 'cat_e1', name: 'Еда', icon: '🍔', color: defaultColors[0] },
                { id: 'cat_e2', name: 'Транспорт', icon: '🚕', color: defaultColors[1] }
            ], income: [{ id: 'cat_i1', name: 'Зарплата', icon: '💰', color: defaultColors[2] }] },
            recentColors: [...defaultColors], visibility: {} };
    }
    const legacySignature = () => JSON.stringify(legacyKeys.map(k => localStorage.getItem(k)));
    function load() {
        try {
            lastStored = localStorage.getItem(KEY);
            rawRecovery = Object.fromEntries([KEY, ...legacyKeys].map(k => [k, localStorage.getItem(k)]));
            legacySnapshot = legacySignature();
            if (lastStored !== null) return normalize(JSON.parse(lastStored));
            const old = defaults();
            for (const key of legacyKeys) {
                if (rawRecovery[key] !== null) old[key] = JSON.parse(rawRecovery[key]);
            }
            if (rawRecovery.accounts === null && old.baseBalances) delete old.accounts;
            return normalize(old);
        } catch (error) {
            loadError = 'Не удалось прочитать сохранённые данные. Они не перезаписаны. Скачайте копию для восстановления или выберите исправный файл. ' + error.message;
            return normalize(defaults());
        }
    }
    function save(data, restoring = false) {
        if (loadError && !restoring) throw new Error(loadError);
        const normalized = normalize(data);
        if (localStorage.getItem(KEY) !== lastStored || (lastStored === null && legacySignature() !== legacySnapshot)) {
            throw new Error('Данные изменились в другой вкладке. Обновите страницу перед сохранением.');
        }
        const serialized = JSON.stringify(normalized);
        try { localStorage.setItem(KEY, serialized); }
        catch { throw new Error('Не удалось сохранить данные в браузере. Изменения не применены. Освободите место или скачайте резервную копию.'); }
        lastStored = serialized;
        loadError = '';
        return normalized;
    }
    return { load, save, normalize, cents, format, parseMoney, validDate, color, id,
        get error() { return loadError; }, get recovery() { return { recoveryOnly: true, rawStorage: rawRecovery }; } };
})();
