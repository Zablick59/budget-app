let { transactions, categories, accounts, recentColors, visibility, wishlist } = FinanceData.load();
const money = FinanceData.format;
const cents = FinanceData.cents;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function currentData() { return { transactions, categories, accounts, recentColors, visibility, wishlist }; }
function persistChanges(patch, restoring = false) {
    try {
        const saved = FinanceData.save({ ...currentData(), ...patch }, restoring);
        ({ transactions, categories, accounts, recentColors, visibility, wishlist } = saved);
        document.getElementById('storage-notice').hidden = true;
        return true;
    } catch (error) {
        alert(error.message);
        return false;
    }
}
function localDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dateFromString(value) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function validateTransaction(tx, original = null) {
    if (tx.amount === null || tx.amount <= 0) return 'Введите сумму больше нуля, максимум с двумя знаками после запятой.';
    if (!FinanceData.validDate(tx.date)) return 'Укажите корректную дату.';
    if (!accounts.some(a => a.id === tx.from) && tx.from !== original?.from) return 'Выберите счёт.';
    if (tx.type === 'transfer') {
        if (!accounts.some(a => a.id === tx.to) && tx.to !== original?.to) return 'Выберите счёт получателя.';
        if (tx.from === tx.to) return 'Выберите два разных счёта для перевода.';
    } else if (!(categories[tx.type] || []).some(c => c.id === tx.categoryId) && tx.categoryId !== original?.categoryId) {
        return 'Создайте или выберите категорию.';
    }
    return '';
}

const eyeOpenSVG = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeClosedSVG = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

let selectedColor = 'hsl(0, 100%, 50%)';
let currentType = 'expense';
let editingTxId = null;

let currentView = 'main';
let analyticsType = 'expense';
let analyticsPeriod = 'month';


const form = document.getElementById('transaction-form');
const categorySelect = document.getElementById('category-select');
const dateInput = document.getElementById('tx-date');
const fromAccountLabel = document.getElementById('from-account-label');
const hueSlider = document.getElementById('hue-slider');
const catPreviewIcon = document.getElementById('cat-preview-icon');
const newCatIconInput = document.getElementById('new-cat-icon');

function init() {
    if (FinanceData.error) {
        const notice = document.getElementById('storage-notice');
        notice.textContent = FinanceData.error;
        notice.hidden = false;
    }
    renderCategories(categorySelect, currentType);
    renderAccountSelects();
    updatePreviewColor();
    renderRecentColors();
    setCurrentDate();
    setTimeout(updateSliders, 50);
    updateUI();
}

function updateSliders() {
    document.querySelectorAll('.tabs-wrapper').forEach(wrapper => {
        const activeTab = wrapper.querySelector('.tab.active');
        const slider = wrapper.querySelector('.tab-slider');
        if (activeTab && slider) {
            slider.style.width = activeTab.offsetWidth + 'px';
            slider.style.transform = `translateX(${activeTab.offsetLeft}px)`;
        }
    });
}

window.addEventListener('resize', updateSliders);

window.switchView = function(view) {
    currentView = view;
    document.getElementById('main-view').style.display = view === 'main' ? 'block' : 'none';
    document.getElementById('analytics-view').style.display = view === 'analytics' ? 'block' : 'none';
    document.getElementById('wishlist-view').style.display = view === 'wishlist' ? 'block' : 'none';
    
    document.getElementById('nav-main').classList.toggle('active', view === 'main');
    document.getElementById('nav-analytics').classList.toggle('active', view === 'analytics');
    document.getElementById('nav-wishlist').classList.toggle('active', view === 'wishlist');
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => item.setAttribute('aria-current', item.classList.contains('active') ? 'page' : 'false'));
    if (view === 'wishlist') window.WishlistUI?.render();
    
    setTimeout(updateSliders, 10);
    if (view === 'analytics') updateAnalytics();
};

document.getElementById('brand-home').addEventListener('click', event => {
    event.preventDefault();
    switchView('main');
    window.scrollTo(0, 0);
});

document.querySelectorAll('#tx-tabs-wrapper .tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.tabs-wrapper');
        wrapper.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentType = e.target.dataset.type;

        document.getElementById('to-account-group').style.display = currentType === 'transfer' ? 'block' : 'none';
        document.getElementById('category-group').style.display = currentType === 'transfer' ? 'none' : 'block';
        fromAccountLabel.innerText = currentType === 'income' ? 'Куда:' : 'Откуда:';
        
        renderCategories(categorySelect, currentType);
        updateSliders();
    });
});

document.querySelectorAll('.analytics-type-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.tabs-wrapper');
        wrapper.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        analyticsType = e.target.dataset.type;
        updateSliders();
        updateAnalytics();
    });
});

document.querySelectorAll('.analytics-period-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.tabs-wrapper');
        wrapper.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        analyticsPeriod = e.target.dataset.period;
        updateSliders();
        updateAnalytics();
    });
});

function syncDateDisplay(input) {
    const display = input.parentElement.querySelector('.date-display');
    if (!display) return;
    display.textContent = FinanceData.validDate(input.value)
        ? input.value.split('-').reverse().join('.') : 'Выберите дату';
}
for (const input of document.querySelectorAll('.date-field input[type="date"]')) {
    input.addEventListener('input', () => syncDateDisplay(input));
    input.addEventListener('change', () => syncDateDisplay(input));
    input.addEventListener('click', () => {
        // showPicker lets the whole field open the calendar in desktop browsers too.
        try { input.showPicker?.(); } catch { /* iOS opens its native picker itself. */ }
    });
}
function setCurrentDate() {
    dateInput.value = localDateString(new Date());
    syncDateDisplay(dateInput);
}
function moveDate(days) {
    if (!FinanceData.validDate(dateInput.value)) return;
    const date = dateFromString(dateInput.value);
    date.setDate(date.getDate() + days);
    const nextDate = localDateString(date);
    if (FinanceData.validDate(nextDate)) {
        dateInput.value = nextDate;
        syncDateDisplay(dateInput);
    }
}
document.getElementById('date-prev').addEventListener('click', () => moveDate(-1));
document.getElementById('date-next').addEventListener('click', () => moveDate(1));

function getAccountName(id) {
    const acc = accounts.find(a => a.id === id);
    return acc ? acc.name : 'Удаленный счет';
}

function renderAccountSelects() {
    const selects = ['from-account', 'to-account', 'edit-from-account', 'edit-to-account'];
    selects.forEach(selId => {
        const el = document.getElementById(selId);
        if(!el) return;
        const currentVal = el.value;
        el.innerHTML = '';
        accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            opt.innerText = acc.name;
            el.appendChild(opt);
        });
        if ([...el.options].some(o => o.value === currentVal)) el.value = currentVal;
    });
}

function renderHistoryFilter() {
    const filterEl = document.getElementById('history-filter');
    const currentVal = filterEl.value;
    filterEl.innerHTML = '<option value="all">Все</option><option value="transfer">🔄 Переводы</option>';
    
    if (categories.expense && categories.expense.length) {
        const expGroup = document.createElement('optgroup');
        expGroup.label = 'Расходы';
        categories.expense.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = `${c.icon} ${c.name}`;
            expGroup.appendChild(opt);
        });
        filterEl.appendChild(expGroup);
    }

    if (categories.income && categories.income.length) {
        const incGroup = document.createElement('optgroup');
        incGroup.label = 'Доходы';
        categories.income.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = `${c.icon} ${c.name}`;
            incGroup.appendChild(opt);
        });
        filterEl.appendChild(incGroup);
    }

    if ([...filterEl.options].some(o => o.value === currentVal)) {
        filterEl.value = currentVal;
    } else {
        filterEl.value = 'all';
    }
}

let historyLimit = 50;
const expandedGroups = new Set();
document.getElementById('history-filter').addEventListener('change', () => { historyLimit = 50; renderHistory(); });
document.getElementById('history-more').addEventListener('click', () => { historyLimit += 50; renderHistory(); });

function renderCategories(selectElement, type) {
    if (selectElement) {
        const previousValue = selectElement.value;
        selectElement.innerHTML = '';
        if (type !== 'transfer') {
            (categories[type] || []).forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.innerText = `${cat.icon} ${cat.name}`;
                selectElement.appendChild(option);
            });
        }
        if ([...selectElement.options].some(o => o.value === previousValue)) selectElement.value = previousValue;
    }
    syncCategoryButtons();
    renderHistoryFilter();
}

document.getElementById('delete-cat-btn').addEventListener('click', () => {
    const selectedId = categorySelect.value;
    if (!selectedId || currentType === 'transfer') return;
    
    if (confirm('Действительно удалить эту категорию?')) {
        if (!persistChanges({ categories: { ...categories, [currentType]: categories[currentType].filter(c => c.id !== selectedId) } })) return;
        renderCategories(categorySelect, currentType);
        updateUI();
    }
});

function getHSLColor(hue) {
    return `hsl(${hue}, 100%, 45%)`;
}

function updatePreviewColor() {
    const styles = getStyleForColor(selectedColor);
    catPreviewIcon.style.backgroundColor = styles.bg;
    catPreviewIcon.style.color = selectedColor;
    catPreviewIcon.style.border = styles.border;
}

hueSlider.addEventListener('input', (e) => {
    selectedColor = getHSLColor(e.target.value);
    updatePreviewColor();
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
});

newCatIconInput.addEventListener('input', (e) => {
    catPreviewIcon.innerText = e.target.value || '📌';
});

function renderRecentColors() {
    const palette = document.getElementById('recent-colors-palette');
    palette.innerHTML = '';
    recentColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (color === selectedColor ? ' selected' : '');
        
        swatch.style.backgroundColor = color;
        swatch.addEventListener('click', () => {
            selectedColor = color;
            updatePreviewColor();
            
            if (color.startsWith('hsl')) {
                const hueMatch = color.match(/\d+/);
                if (hueMatch) hueSlider.value = hueMatch[0];
            }
            
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
        });
        palette.appendChild(swatch);
    });
}

let editingAccountId = null;
const accountModal = document.getElementById('account-modal');
const accountNameInput = document.getElementById('account-name-input');
const deleteAccountBtn = document.getElementById('delete-account-btn');

window.openAccountModal = function(id = null) {
    editingAccountId = id;
    if (id) {
        const acc = accounts.find(a => a.id === id);
        document.getElementById('account-modal-title').innerText = 'Настройки счета';
        accountNameInput.value = acc.name;
        deleteAccountBtn.style.display = accounts.length > 1 ? 'block' : 'none';
    } else {
        document.getElementById('account-modal-title').innerText = 'Новый счет';
        accountNameInput.value = '';
        deleteAccountBtn.style.display = 'none';
    }
    accountModal.style.display = 'flex';
};

document.getElementById('cancel-account-btn').addEventListener('click', () => accountModal.style.display = 'none');

document.getElementById('delete-account-btn').addEventListener('click', () => {
    if (accounts.length <= 1) return;
    if (confirm('Удалить этот счет? Транзакции останутся в истории, но будут числиться за удаленным счетом.')) {
        if (!persistChanges({ accounts: accounts.filter(a => a.id !== editingAccountId) })) return;
        renderAccountSelects();
        updateUI();
        accountModal.style.display = 'none';
    }
});

document.getElementById('save-account-btn').addEventListener('click', () => {
    const name = accountNameInput.value.trim();
    if (!name) return;
    
    const nextAccounts = editingAccountId
        ? accounts.map(a => a.id === editingAccountId ? { ...a, name } : a)
        : [...accounts, { id: FinanceData.id('acc'), name, baseBalance: 0 }];
    if (!persistChanges({ accounts: nextAccounts })) return;
    renderAccountSelects();
    updateUI();
    accountModal.style.display = 'none';
});

const categoryModal = document.getElementById('category-modal');
const categoryPicker = document.getElementById('category-picker-modal');
let categoryPickerTarget = null;
let categoryPickerType = 'expense';
let categoryEditor = null;
let categoryReturnFocus = null;

function syncCategoryButtons() {
    for (const [selectId, buttonId] of [['category-select', 'category-picker-btn'], ['edit-category-select', 'edit-category-picker-btn']]) {
        const select = document.getElementById(selectId);
        document.getElementById(buttonId).textContent = select.selectedOptions[0]?.textContent || 'Выберите категорию';
    }
}

function openCategoryPicker(select, type) {
    if (type === 'transfer') return;
    categoryPickerTarget = select;
    categoryPickerType = type;
    categoryReturnFocus = document.activeElement;
    renderCategoryPicker();
    categoryPicker.style.display = 'flex';
    (categoryPicker.querySelector('.category-choice[aria-pressed="true"]') || categoryPicker.querySelector('button')).focus();
}
function closeCategoryPicker() {
    categoryPicker.style.display = 'none';
    categoryReturnFocus?.focus();
}
function renderCategoryPicker() {
    const list = document.getElementById('category-picker-list');
    list.replaceChildren();
    document.getElementById('category-picker-title').textContent = categoryPickerType === 'income' ? 'Категории доходов' : 'Категории расходов';
    for (const cat of categories[categoryPickerType] || []) {
        const row = document.createElement('div');
        row.className = 'category-picker-row';
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'category-choice';
        choose.dataset.categoryId = cat.id;
        choose.setAttribute('aria-pressed', String(categoryPickerTarget.value === cat.id));
        const icon = document.createElement('span');
        icon.className = 'cat-icon';
        icon.textContent = cat.icon;
        const style = getStyleForColor(cat.color);
        icon.style.backgroundColor = style.bg;
        icon.style.border = style.border;
        const name = document.createElement('span');
        name.className = 'category-choice-name';
        name.textContent = cat.name;
        choose.append(icon, name);
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'category-edit-btn';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', `Редактировать категорию «${cat.name}»`);
        edit.onclick = () => openCategoryEditor(categoryPickerType, cat.id, true);
        let timer = null, held = false, start = null;
        const cancelHold = () => { clearTimeout(timer); timer = null; };
        choose.addEventListener('pointerdown', e => {
            cancelHold();
            held = false;
            if (!e.isPrimary || e.button !== 0) return;
            start = { x: e.clientX, y: e.clientY };
            timer = setTimeout(() => {
                held = true;
                openCategoryEditor(categoryPickerType, cat.id, true);
            }, 550);
        });
        choose.addEventListener('pointermove', e => {
            if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancelHold();
        });
        for (const event of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'blur']) choose.addEventListener(event, cancelHold);
        choose.addEventListener('contextmenu', e => e.preventDefault());
        choose.onclick = e => {
            cancelHold();
            if (held) { e.preventDefault(); held = false; return; }
            categoryPickerTarget.value = cat.id;
            syncCategoryButtons();
            closeCategoryPicker();
        };
        row.append(choose, edit);
        list.appendChild(row);
    }
    if (!list.children.length) {
        const empty = document.createElement('p');
        empty.className = 'category-picker-hint';
        empty.textContent = 'Категорий пока нет. Нажмите «Новая», чтобы создать первую.';
        list.appendChild(empty);
    }
}

function colorHue(color) {
    if (color.startsWith('hsl')) return Number(color.match(/[\d.]+/)?.[0] || 0);
    let rgb;
    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
        rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    } else rgb = (color.match(/[\d.]+/g) || []).slice(0, 3).map(n => Number(n) / 255);
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (!delta || !Number.isFinite(delta)) return 0;
    const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return Math.round((hue * 60 + 360) % 360);
}
function openCategoryEditor(type, id = null, fromPicker = false) {
    if (type === 'transfer') return;
    const cat = (categories[type] || []).find(c => c.id === id);
    if (id && !cat) return;
    categoryEditor = { type, id, fromPicker, focus: document.activeElement };
    categoryPicker.style.display = 'none';
    document.getElementById('category-modal-title').textContent = cat ? 'Редактировать категорию' : 'Новая категория';
    document.getElementById('save-cat-btn').textContent = cat ? 'Сохранить' : 'Создать';
    newCatIconInput.value = cat?.icon || '';
    document.getElementById('new-cat-name').value = cat?.name || '';
    catPreviewIcon.textContent = cat?.icon || '📌';
    selectedColor = cat?.color || getHSLColor(hueSlider.value);
    hueSlider.value = colorHue(selectedColor);
    updatePreviewColor();
    renderRecentColors();
    categoryModal.style.display = 'flex';
    // Focus a button so opening the editor on a phone does not raise the keyboard.
    document.getElementById('cancel-cat-btn').focus();
}
function closeCategoryEditor() {
    const editor = categoryEditor;
    categoryModal.style.display = 'none';
    categoryEditor = null;
    if (editor?.fromPicker) {
        renderCategoryPicker();
        categoryPicker.style.display = 'flex';
        const item = [...categoryPicker.querySelectorAll('.category-choice')].find(button => button.dataset.categoryId === editor.id);
        (item || categoryPicker.querySelector('button')).focus();
    } else editor?.focus?.focus();
}

document.getElementById('category-picker-btn').onclick = () => openCategoryPicker(categorySelect, currentType);
document.getElementById('edit-category-picker-btn').onclick = () => {
    const tx = transactions.find(t => t.id === editingTxId);
    if (tx) openCategoryPicker(document.getElementById('edit-category-select'), tx.type);
};
document.getElementById('close-category-picker').onclick = closeCategoryPicker;
document.getElementById('picker-add-category').onclick = () => openCategoryEditor(categoryPickerType, null, true);
document.getElementById('open-category-modal').onclick = () => openCategoryEditor(currentType);
document.getElementById('cancel-cat-btn').onclick = closeCategoryEditor;
categoryPicker.addEventListener('click', e => { if (e.target === categoryPicker) closeCategoryPicker(); });
document.addEventListener('keydown', e => {
    const modal = categoryModal.style.display === 'flex' ? categoryModal : categoryPicker.style.display === 'flex' ? categoryPicker : null;
    if (!modal) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        if (modal === categoryModal) closeCategoryEditor(); else closeCategoryPicker();
    } else if (e.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button, input')].filter(el => !el.disabled && el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
});

document.getElementById('save-cat-btn').addEventListener('click', () => {
    if (!categoryEditor) return;
    const { type, id, fromPicker } = categoryEditor;
    const icon = newCatIconInput.value.trim() || '📌';
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) { document.getElementById('new-cat-name').focus(); return; }
    const category = { id: id || FinanceData.id('cat'), name, icon, color: selectedColor };
    const updated = id ? categories[type].map(cat => cat.id === id ? category : cat) : [...categories[type], category];
    if (!persistChanges({
        categories: { ...categories, [type]: updated },
        recentColors: [selectedColor, ...recentColors.filter(c => c !== selectedColor)].slice(0, 5)
    })) return;
    renderCategories(categorySelect, currentType);
    const editingTransaction = transactions.find(tx => tx.id === editingTxId);
    if (editingTransaction && document.getElementById('edit-modal').style.display === 'flex') {
        const select = document.getElementById('edit-category-select');
        const previous = select.value;
        renderCategories(select, editingTransaction.type);
        selectHistoricalValue(select, previous, 'Удалённая категория');
    }
    if (!id) (fromPicker ? categoryPickerTarget : categorySelect).value = category.id;
    syncCategoryButtons();
    renderRecentColors();
    updateUI();
    closeCategoryEditor();
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = FinanceData.parseMoney(document.getElementById('amount').value);

    const tx = {
        id: FinanceData.id('tx'),
        type: currentType,
        amount: amount,
        from: document.getElementById('from-account').value,
        to: currentType === 'transfer' ? document.getElementById('to-account').value : null,
        categoryId: currentType !== 'transfer' ? categorySelect.value : null,
        comment: document.getElementById('comment').value,
        date: dateInput.value
    };

    const error = validateTransaction(tx);
    if (error) return alert(error);
    if (!persistChanges({ transactions: [tx, ...transactions] })) return;
    
    document.getElementById('amount').value = '';
    document.getElementById('comment').value = '';
    updateUI();
});

window.editBalance = function(id) {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    const currentBalances = calculateBalances();
    const newVal = prompt(`Введите новый баланс для счета "${acc.name}" (₽):`, currentBalances[id]);
    
    if (newVal === null) return;
    const value = FinanceData.parseMoney(newVal);
    if (value === null) return alert('Введите баланс числом, например 1000,50.');
    const baseBalance = (cents(acc.baseBalance) + cents(value) - cents(currentBalances[id])) / 100;
    if (!persistChanges({ accounts: accounts.map(a => a.id === id ? { ...a, baseBalance } : a) })) return;
    updateUI();
};

window.toggleVisibility = function(id, event) {
    event.stopPropagation();
    if (!persistChanges({ visibility: { ...visibility, [id]: visibility[id] === false } })) return;
    updateUI();
};

function calculateBalances() {
    let balances = Object.create(null);
    accounts.forEach(a => balances[a.id] = cents(a.baseBalance));
    transactions.forEach(tx => {
        if (tx.type === 'income' && balances[tx.from] !== undefined) balances[tx.from] += cents(tx.amount);
        else if (tx.type === 'expense' && balances[tx.from] !== undefined) balances[tx.from] -= cents(tx.amount);
        else if (tx.type === 'transfer') {
            if (balances[tx.from] !== undefined) balances[tx.from] -= cents(tx.amount);
            if (balances[tx.to] !== undefined) balances[tx.to] += cents(tx.amount);
        }
    });
    for (const id of Object.keys(balances)) balances[id] /= 100;
    return balances;
}

function renderAccountsList() {
    const container = document.getElementById('accounts-list');
    container.innerHTML = '';
    const balances = calculateBalances();
    
    accounts.forEach(acc => {
        const bal = balances[acc.id];
        const isVisible = visibility[acc.id] !== false; 
        
        const accDiv = document.createElement('div');
        accDiv.className = 'account';
        
        accDiv.innerHTML = `
            <span data-action="account" style="flex:1; cursor:pointer;">${escapeHTML(acc.name)}</span>
            <div class="balance-container">
                <div class="eye-icon" data-action="visibility">
                    ${isVisible ? eyeOpenSVG : eyeClosedSVG}
                </div>
                <strong data-action="balance" style="cursor:pointer;">
                    <span class="amount ${isVisible ? '' : 'blur-text'}">${money(bal)}</span>
                    <span class="currency">₽</span>
                </strong>
            </div>
        `;
        accDiv.querySelector('[data-action="account"]').onclick = () => openAccountModal(acc.id);
        accDiv.querySelector('[data-action="visibility"]').onclick = event => toggleVisibility(acc.id, event);
        accDiv.querySelector('[data-action="balance"]').onclick = () => editBalance(acc.id);
        container.appendChild(accDiv);
    });
    
    const addDiv = document.createElement('div');
    addDiv.className = 'account';
    addDiv.style.justifyContent = 'center';
    addDiv.style.color = '#007aff';
    addDiv.style.fontWeight = '600';
    addDiv.style.cursor = 'pointer';
    addDiv.style.borderBottom = 'none';
    addDiv.innerText = '+ Добавить счет';
    addDiv.onclick = () => openAccountModal();
    container.appendChild(addDiv);
}

function updateUI() {
    renderAccountsList();
    renderHistory();
    if (currentView === 'analytics') updateAnalytics();
}

const daysOfWeek = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function getRelativeDateStr(dateStr) {
    if (!dateStr) return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [y, m, d] = dateStr.split('-');
    const txD = new Date(y, m - 1, d);
    
    const diffTime = today - txD;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const dayName = daysOfWeek[txD.getDay()];
    const formattedDate = `${d}.${m}`;
    
    if (diffDays === 0) return `Сегодня, ${formattedDate}, ${dayName}`;
    if (diffDays === 1) return `Вчера, ${formattedDate}, ${dayName}`;
    if (diffDays === 2) return `Позавчера, ${formattedDate}, ${dayName}`;
    
    return `${formattedDate}, ${dayName}`;
}

function hexToRgbaStr(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (hex.length == 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length == 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStyleForColor(colorStr) {
    const translucent = alpha => {
        if (colorStr.startsWith('#')) return hexToRgbaStr(colorStr, alpha);
        const match = colorStr.match(/^(hsl|rgb)a?\(([^)]+)\)$/i);
        if (match) return `${match[1]}a(${match[2].split(',').slice(0, 3).join(',')}, ${alpha})`;
        return '#eee';
    };
    return { bg: translucent(0.2), border: `1px solid ${translucent(0.5)}` };
}

function getTxWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'запись';
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'записи';
    return 'записей';
}

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    const filterVal = document.getElementById('history-filter').value;
    
    let filteredTx = transactions.filter(tx => {
        if (filterVal === 'all') return true;
        if (filterVal === 'transfer') return tx.type === 'transfer';
        return tx.categoryId === filterVal;
    });

    let groupedObj = Object.create(null);
    filteredTx.forEach(tx => {
        const key = JSON.stringify([tx.date, tx.type, tx.categoryId, tx.from, tx.to]);
        if (!groupedObj[key]) {
            groupedObj[key] = {
                ...tx,
                groupKey: key,
                count: 1,
                originalIds: [tx.id]
            };
        } else {
            groupedObj[key].amount = (cents(groupedObj[key].amount) + cents(tx.amount)) / 100;
            groupedObj[key].count += 1;
            groupedObj[key].originalIds.push(tx.id);
        }
    });

    const sortedTx = Object.values(groupedObj).sort((a, b) => {
        if (a.date !== b.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return b.amount - a.amount;
    });

    let currentDateStr = null;
    
    document.getElementById('history-more').hidden = sortedTx.length <= historyLimit;
    const visibleRows = sortedTx.slice(0, historyLimit).flatMap(group => [group,
        ...(expandedGroups.has(group.groupKey) && group.count > 1
            ? filteredTx.filter(tx => group.originalIds.includes(tx.id)).map(tx => ({ ...tx, count: 1, originalIds: [tx.id], isChild: true }))
            : [])]);
    visibleRows.forEach(tx => {
        if (tx.date !== currentDateStr) {
            currentDateStr = tx.date;
            const headerLi = document.createElement('li');
            headerLi.className = 'date-header';
            headerLi.innerText = getRelativeDateStr(tx.date);
            list.appendChild(headerLi);
        }

        const li = document.createElement('li');
        li.className = 'tx-item';
        
        if (tx.isChild) li.classList.add('tx-child');
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        if (tx.count === 1) {
            li.onclick = () => openEditModal(tx.originalIds[0]);
        } else {
            const expanded = expandedGroups.has(tx.groupKey);
            li.setAttribute('aria-expanded', String(expanded));
            li.onclick = () => {
                if (expanded) expandedGroups.delete(tx.groupKey);
                else expandedGroups.add(tx.groupKey);
                renderHistory();
            };
        }
        li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } };

        let cat = { name: 'Перевод', icon: '🔄', color: '#8E8E93' };
        if (tx.type !== 'transfer') {
            cat = (categories[tx.type] || []).find(c => c.id === tx.categoryId) || { name: 'Удалено', icon: '❓', color: '#8E8E93' };
        }
        
        let amountText = tx.type === 'expense' ? `-${money(tx.amount)} ₽` : tx.type === 'income' ? `+${money(tx.amount)} ₽` : `${money(tx.amount)} ₽`;
        let amountClass = tx.type === 'income' ? 'tx-income' : 'tx-expense';
        
        let accInfo = tx.type === 'transfer' 
            ? `Из ${getAccountName(tx.from)} в ${getAccountName(tx.to)}` 
            : `${getAccountName(tx.from)}`;
        
        let details = accInfo;
        if (tx.count > 1) {
            details += ` • ${tx.count} ${getTxWord(tx.count)} ${expandedGroups.has(tx.groupKey) ? '▴' : '▾'}`;
        } else if (tx.comment) {
            details += ` • ${tx.comment}`;
        }

        const styles = getStyleForColor(cat.color);

        li.innerHTML = `
            <div class="cat-icon" style="background-color: ${styles.bg}; color: ${cat.color}; border: ${styles.border}">
                ${escapeHTML(cat.icon)}
            </div>
            <div class="tx-info">
                <div class="tx-header">
                    <span>${escapeHTML(cat.name)}</span>
                    <span class="${amountClass}">${amountText}</span>
                </div>
                <div class="tx-details">${escapeHTML(details)}</div>
            </div>
        `;
        list.appendChild(li);
    });
}

function isDateInAnalyticsPeriod(dateStr, period) {
    const txDate = dateFromString(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    txDate.setHours(0,0,0,0);

    if (period === 'day') {
        return txDate.getTime() === today.getTime();
    } else if (period === 'week') {
        const day = today.getDay() || 7;
        const mon = new Date(today);
        mon.setDate(mon.getDate() - day + 1);
        const sun = new Date(today);
        sun.setDate(sun.getDate() - day + 7);
        return txDate >= mon && txDate <= sun;
    } else if (period === 'month') {
        return txDate.getMonth() === today.getMonth() && txDate.getFullYear() === today.getFullYear();
    } else if (period === 'year') {
        return txDate.getFullYear() === today.getFullYear();
    }
    return true;
}

document.getElementById('analytics-cat-filter').addEventListener('change', updateAnalytics);
document.getElementById('analytics-sort').addEventListener('change', updateAnalytics);

let lastIsSingleCat = null;

function updateAnalytics() {
    const catFilterEl = document.getElementById('analytics-cat-filter');
    const sortEl = document.getElementById('analytics-sort');

    const oldCatVal = catFilterEl.value;
    catFilterEl.replaceChildren(new Option('Все категории', 'all'));
    const filterCats = [...(categories[analyticsType] || [])];
    const knownIds = new Set(filterCats.map(c => c.id));
    transactions.filter(t => t.type === analyticsType).forEach(t => {
        if (!knownIds.has(t.categoryId)) {
            knownIds.add(t.categoryId);
            filterCats.push({ id: t.categoryId, name: 'Удалённая категория', icon: '❓' });
        }
    });
    filterCats.forEach(c => catFilterEl.add(new Option(`${c.icon} ${c.name}`, c.id)));
    catFilterEl.value = [...catFilterEl.options].some(o => o.value === oldCatVal) ? oldCatVal : 'all';

    const isSingleCat = catFilterEl.value !== 'all';

    if (lastIsSingleCat !== isSingleCat) {
        const oldSort = sortEl.value;
        sortEl.innerHTML = `
            <option value="desc">Сначала большие</option>
            <option value="asc">Сначала маленькие</option>
            ${isSingleCat ? '<option value="date-desc">Сначала новые</option>' : ''}
        `;
        if ([...sortEl.options].some(o => o.value === oldSort)) sortEl.value = oldSort;
        else sortEl.value = 'desc';
        lastIsSingleCat = isSingleCat;
    }

    const catFilterVal = catFilterEl.value;
    const sortVal = sortEl.value;

    let periodTxs = transactions.filter(t => t.type === analyticsType && isDateInAnalyticsPeriod(t.date, analyticsPeriod));
    
    // Считаем все данные для правильной отрисовки общей диаграммы
    let catSums = Object.create(null);
    periodTxs.forEach(t => {
        catSums[t.categoryId] = (catSums[t.categoryId] || 0) + cents(t.amount);
    });
    let totalSum = Object.values(catSums).reduce((a, b) => a + b, 0) / 100;

    const typeCats = categories[analyticsType] || [];
    const getCatName = (id) => {
        const c = typeCats.find(c => c.id === id);
        return c ? c.name : 'Удалено';
    };

    // Статистика меняется в зависимости от того, выбрана ли конкретная категория
    let statsTxs = isSingleCat ? periodTxs.filter(t => t.categoryId === catFilterVal) : periodTxs;
    let sMaxTx = null;
    let sMinTx = null;
    let sFreqCounts = Object.create(null);
    
    statsTxs.forEach(t => {
        if (!sMaxTx || t.amount > sMaxTx.amount) sMaxTx = t;
        if (!sMinTx || t.amount < sMinTx.amount) sMinTx = t;
        sFreqCounts[t.categoryId] = (sFreqCounts[t.categoryId] || 0) + 1;
    });

    let mostFreqCatId = null;
    let maxFreq = 0;
    for (const [catId, count] of Object.entries(sFreqCounts)) {
        if (count > maxFreq) {
            maxFreq = count;
            mostFreqCatId = catId;
        }
    }

    document.getElementById('analytics-total-sum').innerText = money(totalSum);
    document.getElementById('stat-max').innerText = sMaxTx ? money(sMaxTx.amount) + ' ₽' : '-';
    document.getElementById('stat-max-cat').innerText = sMaxTx ? getCatName(sMaxTx.categoryId) : '';
    document.getElementById('stat-min').innerText = sMinTx ? money(sMinTx.amount) + ' ₽' : '-';
    document.getElementById('stat-min-cat').innerText = sMinTx ? getCatName(sMinTx.categoryId) : '';
    document.getElementById('stat-freq').innerText = mostFreqCatId !== null ? getCatName(mostFreqCatId) : '-';
    document.getElementById('stat-freq-count').innerText = maxFreq > 0 ? `${maxFreq} ${getTxWord(maxFreq)}` : '';

    // Данные для графика (всегда передаем все категории)
    let chartData = Object.entries(catSums).map(([id, amount]) => {
        const cat = typeCats.find(c => c.id === id) || { name: 'Удалено', icon: '❓', color: '#8E8E93', id: id };
        return { ...cat, amount: amount / 100 };
    });
    
    drawDoughnutChart(chartData, totalSum, catFilterVal);

    const listEl = document.getElementById('analytics-categories-list');
    listEl.innerHTML = '';

    if (!isSingleCat) {
        chartData.sort((a, b) => sortVal === 'asc' ? a.amount - b.amount : b.amount - a.amount);
        
        chartData.forEach(item => {
            const li = document.createElement('li');
            const styles = getStyleForColor(item.color);
            const pct = totalSum > 0 ? (item.amount / totalSum) * 100 : 0;
            
            li.onclick = () => {
                catFilterEl.value = item.id;
                updateAnalytics();
            };
            
            li.innerHTML = `
                <div class="cat-icon" style="background-color: ${styles.bg}; color: ${item.color}; border: ${styles.border}">
                    ${escapeHTML(item.icon)}
                </div>
                <div class="tx-info">
                    <div class="tx-header">
                        <span>${escapeHTML(item.name)}</span>
                        <span style="color: #000;">${money(item.amount)} ₽</span>
                    </div>
                    <div class="tx-details">Доля: ${pct.toFixed(1).replace('.', ',')}%</div>
                </div>
            `;
            listEl.appendChild(li);
        });
    } else {
        let sortedTxs = [...statsTxs];
        if (sortVal === 'asc') sortedTxs.sort((a, b) => a.amount - b.amount);
        else if (sortVal === 'desc') sortedTxs.sort((a, b) => b.amount - a.amount);
        else if (sortVal === 'date-desc') sortedTxs.sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedTxs.forEach(tx => {
            const li = document.createElement('li');
            li.onclick = () => {
                switchView('main');
                openEditModal(tx.id);
            };

            const cat = typeCats.find(c => c.id === tx.categoryId) || { name: 'Удалено', icon: '❓', color: '#8E8E93' };
            const styles = getStyleForColor(cat.color);
            let amountText = tx.type === 'expense' ? `-${money(tx.amount)} ₽` : `+${money(tx.amount)} ₽`;
            let amountClass = tx.type === 'income' ? 'tx-income' : 'tx-expense';

            const [y, m, d] = tx.date.split('-');
            
            let details = `${getAccountName(tx.from)} • ${d}.${m}`;
            if (tx.comment) details += ` • ${tx.comment}`;

            li.innerHTML = `
                <div class="cat-icon" style="background-color: ${styles.bg}; color: ${cat.color}; border: ${styles.border}">
                    ${escapeHTML(cat.icon)}
                </div>
                <div class="tx-info">
                    <div class="tx-header">
                        <span>${escapeHTML(cat.name)}</span>
                        <span class="${amountClass}">${amountText}</span>
                    </div>
                    <div class="tx-details">${escapeHTML(details)}</div>
                </div>
            `;
            listEl.appendChild(li);
        });
    }
    
    if (listEl.innerHTML === '') {
        listEl.innerHTML = '<li style="justify-content: center; color: #8e8e93; font-size: 14px; cursor: default;">Нет данных за этот период</li>';
    }
}

const chart = new BudgetChart(document.getElementById('analytics-chart'), id => {
    const filter = document.getElementById('analytics-cat-filter');
    filter.value = filter.value === id ? 'all' : id;
    updateAnalytics();
});
function drawDoughnutChart(data, total, selectedId = 'all') { chart.update(data, total, selectedId); }

const editModal = document.getElementById('edit-modal');
const editCategorySelect = document.getElementById('edit-category-select');

function selectHistoricalValue(select, value, label) {
    if (![...select.options].some(o => o.value === value)) select.add(new Option(label, value));
    select.value = value;
}
function openEditModal(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editingTxId = id;

    document.getElementById('edit-amount').value = tx.amount;
    document.getElementById('edit-date').value = tx.date;
    syncDateDisplay(document.getElementById('edit-date'));
    renderAccountSelects();
    selectHistoricalValue(document.getElementById('edit-from-account'), tx.from, 'Удалённый счёт');
    if (tx.type === 'transfer') selectHistoricalValue(document.getElementById('edit-to-account'), tx.to, 'Удалённый счёт');
    document.getElementById('edit-comment').value = tx.comment || '';

    if (tx.type === 'transfer') {
        document.getElementById('edit-category-wrap').style.display = 'none';
        document.getElementById('edit-account-to-wrap').style.display = 'block';
        document.getElementById('edit-from-account-label').innerText = 'Откуда:';
    } else {
        document.getElementById('edit-category-wrap').style.display = 'block';
        document.getElementById('edit-account-to-wrap').style.display = 'none';
        document.getElementById('edit-from-account-label').innerText = tx.type === 'income' ? 'Куда:' : 'Откуда:';
        renderCategories(editCategorySelect, tx.type);
        selectHistoricalValue(editCategorySelect, tx.categoryId, 'Удалённая категория');
        syncCategoryButtons();
    }
    
    editModal.style.display = 'flex';
}

document.getElementById('cancel-edit-btn').addEventListener('click', () => editModal.style.display = 'none');

document.getElementById('delete-tx-btn').addEventListener('click', () => {
    if (!confirm('Удалить эту операцию?')) return;
    if (!persistChanges({ transactions: transactions.filter(t => t.id !== editingTxId) })) return;
    editModal.style.display = 'none';
    updateUI();
});

document.getElementById('save-edit-btn').addEventListener('click', () => {
    const original = transactions.find(t => t.id === editingTxId);
    if (!original) return;
    const tx = { ...original,
        amount: FinanceData.parseMoney(document.getElementById('edit-amount').value),
        date: document.getElementById('edit-date').value,
        from: document.getElementById('edit-from-account').value,
        comment: document.getElementById('edit-comment').value
    };
    if (tx.type === 'transfer') tx.to = document.getElementById('edit-to-account').value;
    else tx.categoryId = editCategorySelect.value;
    const error = validateTransaction(tx, original);
    if (error) return alert(error);
    if (!persistChanges({ transactions: transactions.map(t => t.id === editingTxId ? tx : t) })) return;
    editModal.style.display = 'none';
    updateUI();
});

document.getElementById('download-backup-btn').addEventListener('click', async () => {
    const backupData = { ...(FinanceData.error ? FinanceData.recovery : { schemaVersion: 2, ...currentData() }), exportDate: new Date().toISOString() };
    const jsonString = JSON.stringify(backupData, null, 2);
    const d = new Date();
    const fileName = `budget_backup_${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}.json`;
    
    if (navigator.share && navigator.canShare) {
        try {
            const file = new File([jsonString], fileName, { type: 'application/json' });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Резервная копия',
                    text: 'Мой Бюджет - Резервная копия данных'
                });
                return;
            }
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", url);
    dlAnchorElem.setAttribute("download", fileName);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    document.body.removeChild(dlAnchorElem);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById('import-file').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const imported = FinanceData.normalize(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
        if (!confirm(`Заменить текущие данные резервной копией? В файле: ${imported.transactions.length} операций, ${imported.accounts.length} счетов, ${imported.wishlist.items.length} покупок в виш-листе.`)) return;
        if (!persistChanges(imported, true)) return;
        historyLimit = 50;
        expandedGroups.clear();
        document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
        document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
        window.WishlistUI?.render();
        renderCategories(categorySelect, currentType);
        renderAccountSelects();
        renderRecentColors();
        updateUI();
        alert('Данные успешно восстановлены!');
    } catch (error) {
        alert('Не удалось восстановить файл. Текущие данные не изменены.\n' + error.message);
    } finally {
        this.value = '';
    }
});

init();
