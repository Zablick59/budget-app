let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let categories = JSON.parse(localStorage.getItem('categories')) || {
    expense: [
        { id: 'cat_e1', name: 'Еда', icon: '🍔', color: 'hsl(0, 100%, 50%)' },
        { id: 'cat_e2', name: 'Транспорт', icon: '🚕', color: 'hsl(45, 100%, 50%)' }
    ],
    income: [
        { id: 'cat_i1', name: 'Зарплата', icon: '💰', color: 'hsl(120, 100%, 40%)' }
    ]
};
let baseBalances = JSON.parse(localStorage.getItem('baseBalances')) || { main: 0, savings: 0, grandma: 0 };
let recentColors = JSON.parse(localStorage.getItem('recentColors')) || [
    'hsl(0, 100%, 50%)', 'hsl(45, 100%, 50%)', 'hsl(120, 100%, 40%)', 'hsl(210, 100%, 50%)', 'hsl(280, 100%, 50%)'
];
let visibility = JSON.parse(localStorage.getItem('visibility')) || { main: true, savings: true, grandma: true };

const eyeOpenSVG = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeClosedSVG = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

let selectedColor = 'hsl(0, 100%, 50%)';
let currentType = 'expense';
let editingTxId = null;

let currentView = 'main';
let analyticsType = 'expense';
let analyticsPeriod = 'month';

const form = document.getElementById('transaction-form');
const tabs = document.querySelectorAll('.add-transaction .tab');
const categorySelect = document.getElementById('category-select');
const dateInput = document.getElementById('tx-date');
const fromAccountLabel = document.getElementById('from-account-label');
const hueSlider = document.getElementById('hue-slider');
const catPreviewIcon = document.getElementById('cat-preview-icon');
const newCatIconInput = document.getElementById('new-cat-icon');

function init() {
    if (Array.isArray(categories)) {
        categories = { expense: categories, income: [] };
        localStorage.setItem('categories', JSON.stringify(categories));
    }
    renderCategories(categorySelect, currentType);
    updatePreviewColor();
    renderRecentColors();
    setCurrentDate();
    updateUI();
}

function switchView(view) {
    currentView = view;
    document.getElementById('main-view').style.display = view === 'main' ? 'block' : 'none';
    document.getElementById('analytics-view').style.display = view === 'analytics' ? 'block' : 'none';
    
    document.getElementById('nav-main').classList.toggle('active', view === 'main');
    document.getElementById('nav-analytics').classList.toggle('active', view === 'analytics');
    
    if (view === 'analytics') updateAnalytics();
}

document.querySelectorAll('.analytics-type-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.analytics-type-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        analyticsType = e.target.dataset.type;
        updateAnalytics();
    });
});

document.querySelectorAll('.analytics-period-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.analytics-period-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        analyticsPeriod = e.target.dataset.period;
        updateAnalytics();
    });
});

function setCurrentDate() {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    dateInput.value = (new Date(d - tzOffset)).toISOString().split('T')[0];
}

document.getElementById('date-prev').addEventListener('click', () => {
    if (!dateInput.value) return;
    const d = new Date(dateInput.value);
    d.setDate(d.getDate() - 1);
    dateInput.value = d.toISOString().split('T')[0];
});

document.getElementById('date-next').addEventListener('click', () => {
    if (!dateInput.value) return;
    const d = new Date(dateInput.value);
    d.setDate(d.getDate() + 1);
    dateInput.value = d.toISOString().split('T')[0];
});

tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentType = e.target.dataset.type;

        document.getElementById('to-account-group').style.display = currentType === 'transfer' ? 'block' : 'none';
        document.getElementById('category-group').style.display = currentType === 'transfer' ? 'none' : 'block';
        fromAccountLabel.innerText = currentType === 'income' ? 'Куда:' : 'Откуда:';
        
        renderCategories(categorySelect, currentType);
    });
});

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

document.getElementById('history-filter').addEventListener('change', renderHistory);

function renderCategories(selectElement, type) {
    if (selectElement) {
        selectElement.innerHTML = '';
        if (type !== 'transfer') {
            (categories[type] || []).forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.innerText = `${cat.icon} ${cat.name}`;
                selectElement.appendChild(option);
            });
        }
    }
    renderHistoryFilter();
}

document.getElementById('delete-cat-btn').addEventListener('click', () => {
    const selectedId = categorySelect.value;
    if (!selectedId || currentType === 'transfer') return;
    
    if (confirm('Действительно удалить эту категорию?')) {
        categories[currentType] = categories[currentType].filter(c => c.id !== selectedId);
        localStorage.setItem('categories', JSON.stringify(categories));
        renderCategories(categorySelect, currentType);
    }
});

function getHSLColor(hue) {
    return `hsl(${hue}, 100%, 45%)`;
}

function updatePreviewColor() {
    catPreviewIcon.style.backgroundColor = selectedColor.replace(')', ', 0.2)').replace('hsl', 'hsla');
    catPreviewIcon.style.color = selectedColor;
    catPreviewIcon.style.border = `1px solid ${selectedColor.replace(')', ', 0.5)').replace('hsl', 'hsla')}`;
}

hueSlider.addEventListener('input', (e) => {
    selectedColor = getHSLColor(e.target.value);
    updatePreviewColor();
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
});

newCatIconInput.addEventListener('input', (e) => {
    catPreviewIcon.innerText = e.target.value || '📌';
});

function addRecentColor(color) {
    recentColors = recentColors.filter(c => c !== color);
    recentColors.unshift(color);
    if (recentColors.length > 5) recentColors.pop();
    localStorage.setItem('recentColors', JSON.stringify(recentColors));
    renderRecentColors();
}

function renderRecentColors() {
    const palette = document.getElementById('recent-colors-palette');
    palette.innerHTML = '';
    recentColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (color === selectedColor ? ' selected' : '');
        
        let displayColor = color;
        if (color.startsWith('#')) {
            displayColor = color; 
        }

        swatch.style.backgroundColor = displayColor;
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

const categoryModal = document.getElementById('category-modal');
document.getElementById('open-category-modal').addEventListener('click', () => {
    newCatIconInput.value = '';
    document.getElementById('new-cat-name').value = '';
    catPreviewIcon.innerText = '📌';
    selectedColor = getHSLColor(hueSlider.value);
    updatePreviewColor();
    categoryModal.style.display = 'flex';
});

document.getElementById('cancel-cat-btn').addEventListener('click', () => categoryModal.style.display = 'none');

document.getElementById('save-cat-btn').addEventListener('click', () => {
    const icon = newCatIconInput.value.trim() || '📌';
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name || currentType === 'transfer') return;

    const newCat = { id: 'cat' + Date.now(), name, icon, color: selectedColor };
    categories[currentType].push(newCat);
    localStorage.setItem('categories', JSON.stringify(categories));
    
    addRecentColor(selectedColor);
    
    renderCategories(categorySelect, currentType);
    categorySelect.value = newCat.id;
    
    categoryModal.style.display = 'none';
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('amount').value);
    if (!amount || amount <= 0 || !dateInput.value) return;

    const tx = {
        id: Date.now(),
        type: currentType,
        amount: amount,
        from: document.getElementById('from-account').value,
        to: currentType === 'transfer' ? document.getElementById('to-account').value : null,
        categoryId: currentType !== 'transfer' ? categorySelect.value : null,
        comment: document.getElementById('comment').value,
        date: dateInput.value
    };

    transactions.unshift(tx);
    localStorage.setItem('transactions', JSON.stringify(transactions));
    
    document.getElementById('amount').value = '';
    document.getElementById('comment').value = '';
    updateUI();
});

window.editBalance = function(account) {
    const names = { main: 'Основной', savings: 'Накопительный', grandma: 'Бабушкин' };
    const currentBalances = calculateBalances();
    const newVal = prompt(`Введите новый баланс для счета "${names[account]}" (₽):`, currentBalances[account]);
    
    if (newVal !== null && newVal.trim() !== '' && !isNaN(parseFloat(newVal))) {
        const difference = parseFloat(newVal) - currentBalances[account];
        baseBalances[account] += difference;
        localStorage.setItem('baseBalances', JSON.stringify(baseBalances));
        updateUI();
    }
};

window.toggleVisibility = function(acc, event) {
    event.stopPropagation();
    visibility[acc] = !visibility[acc];
    localStorage.setItem('visibility', JSON.stringify(visibility));
    updateUI();
};

function calculateBalances() {
    let balances = { main: baseBalances.main, savings: baseBalances.savings, grandma: baseBalances.grandma };
    transactions.forEach(tx => {
        if (tx.type === 'income') balances[tx.from] += tx.amount;
        else if (tx.type === 'expense') balances[tx.from] -= tx.amount;
        else if (tx.type === 'transfer') {
            balances[tx.from] -= tx.amount;
            balances[tx.to] += tx.amount;
        }
    });
    return balances;
}

function updateUI() {
    const balances = calculateBalances();
    
    ['main', 'savings', 'grandma'].forEach(acc => {
        const amountEl = document.getElementById(`amount-${acc}`);
        const eyeEl = document.getElementById(`eye-${acc}`);
        
        amountEl.innerText = balances[acc];
        
        if (visibility[acc]) {
            amountEl.classList.remove('blur-text');
            eyeEl.innerHTML = eyeOpenSVG;
            eyeEl.style.color = '#000';
        } else {
            amountEl.classList.add('blur-text');
            eyeEl.innerHTML = eyeClosedSVG;
            eyeEl.style.color = '#8e8e93';
        }
    });

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
    if (colorStr.startsWith('#')) {
        return {
            bg: hexToRgbaStr(colorStr, 0.2),
            border: `1px solid ${hexToRgbaStr(colorStr, 0.5)}`
        };
    } else if (colorStr.startsWith('hsl')) {
        return {
            bg: colorStr.replace(')', ', 0.2)').replace('hsl', 'hsla'),
            border: `1px solid ${colorStr.replace(')', ', 0.5)').replace('hsl', 'hsla')}`
        };
    }
    return { bg: '#eee', border: '1px solid #ccc' };
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

    let groupedObj = {};
    filteredTx.forEach(tx => {
        const key = `${tx.date}_${tx.type}_${tx.categoryId}_${tx.from}_${tx.to}`;
        if (!groupedObj[key]) {
            groupedObj[key] = {
                ...tx,
                count: 1,
                originalIds: [tx.id],
                allComments: tx.comment ? [tx.comment] : []
            };
        } else {
            groupedObj[key].amount += tx.amount;
            groupedObj[key].count += 1;
            groupedObj[key].originalIds.push(tx.id);
            if (tx.comment) groupedObj[key].allComments.push(tx.comment);
        }
    });

    const sortedTx = Object.values(groupedObj).sort((a, b) => {
        if (a.date !== b.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return b.amount - a.amount;
    });

    let currentDateStr = null;
    
    sortedTx.slice(0, 50).forEach(tx => {
        if (tx.date !== currentDateStr) {
            currentDateStr = tx.date;
            const headerLi = document.createElement('li');
            headerLi.className = 'date-header';
            headerLi.innerText = getRelativeDateStr(tx.date);
            list.appendChild(headerLi);
        }

        const li = document.createElement('li');
        li.className = 'tx-item';
        
        if (tx.count === 1) {
            li.onclick = () => openEditModal(tx.originalIds[0]);
        } else {
            li.onclick = () => {
                const cmt = tx.allComments.length ? `\n\nКомментарии:\n- ` + tx.allComments.join('\n- ') : '';
                if(confirm(`Сгруппировано операций: ${tx.count}${cmt}\n\nРедактировать объединенные записи нельзя. Хотите удалить их все?`)) {
                    transactions = transactions.filter(t => !tx.originalIds.includes(t.id));
                    localStorage.setItem('transactions', JSON.stringify(transactions));
                    updateUI();
                }
            };
        }
        
        let cat = { name: 'Перевод', icon: '🔄', color: '#8E8E93' };
        if (tx.type !== 'transfer') {
            cat = (categories[tx.type] || []).find(c => c.id === tx.categoryId) || { name: 'Удалено', icon: '❓', color: '#8E8E93' };
        }
        
        let amountText = tx.type === 'expense' ? `-${tx.amount} ₽` : tx.type === 'income' ? `+${tx.amount} ₽` : `${tx.amount} ₽`;
        let amountClass = tx.type === 'income' ? 'tx-income' : 'tx-expense';
        
        const accountNames = { main: 'Основной', savings: 'Накопительный', grandma: 'Бабушкин' };
        
        let accInfo = tx.type === 'transfer' 
            ? `Из ${accountNames[tx.from]} в ${accountNames[tx.to]}` 
            : `${accountNames[tx.from]}`;
        
        let details = accInfo;
        if (tx.count > 1) {
            details += ` • ${tx.count} ${getTxWord(tx.count)}`;
        } else if (tx.comment) {
            details += ` • ${tx.comment}`;
        }

        const styles = getStyleForColor(cat.color);

        li.innerHTML = `
            <div class="cat-icon" style="background-color: ${styles.bg}; color: ${cat.color}; ${styles.border}">
                ${cat.icon}
            </div>
            <div class="tx-info">
                <div class="tx-header">
                    <span>${cat.name}</span>
                    <span class="${amountClass}">${amountText}</span>
                </div>
                <div class="tx-details">${details}</div>
            </div>
        `;
        list.appendChild(li);
    });
}

function isDateInAnalyticsPeriod(dateStr, period) {
    const txDate = new Date(dateStr);
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
    }
    return true;
}

function updateAnalytics() {
    let txs = transactions.filter(t => t.type === analyticsType && isDateInAnalyticsPeriod(t.date, analyticsPeriod));
    
    let catSums = {};
    let catCounts = {};
    
    let maxTx = null;
    let minTx = null;

    txs.forEach(t => {
        catSums[t.categoryId] = (catSums[t.categoryId] || 0) + t.amount;
        catCounts[t.categoryId] = (catCounts[t.categoryId] || 0) + 1;
        
        if (!maxTx || t.amount > maxTx.amount) maxTx = t;
        if (!minTx || t.amount < minTx.amount) minTx = t;
    });

    let totalSum = Object.values(catSums).reduce((a, b) => a + b, 0);
    document.getElementById('analytics-total-sum').innerText = totalSum;

    let mostFreqCatId = null;
    let maxFreq = 0;
    for (const [catId, count] of Object.entries(catCounts)) {
        if (count > maxFreq) {
            maxFreq = count;
            mostFreqCatId = catId;
        }
    }

    const typeCats = categories[analyticsType] || [];
    
    const getCatName = (id) => {
        const c = typeCats.find(c => c.id === id);
        return c ? c.name : 'Неизвестно';
    };

    document.getElementById('stat-max').innerText = maxTx ? maxTx.amount + ' ₽' : '-';
    document.getElementById('stat-max-cat').innerText = maxTx ? getCatName(maxTx.categoryId) : '';
    
    document.getElementById('stat-min').innerText = minTx ? minTx.amount + ' ₽' : '-';
    document.getElementById('stat-min-cat').innerText = minTx ? getCatName(minTx.categoryId) : '';
    
    document.getElementById('stat-freq').innerText = mostFreqCatId ? getCatName(mostFreqCatId) : '-';
    document.getElementById('stat-freq-count').innerText = maxFreq > 0 ? `${maxFreq} ${getTxWord(maxFreq)}` : '';

    const listEl = document.getElementById('analytics-categories-list');
    listEl.innerHTML = '';
    
    let sortedCats = Object.entries(catSums).map(([id, amount]) => {
        const cat = typeCats.find(c => c.id === id) || { name: 'Удалено', icon: '❓', color: '#8E8E93' };
        return { ...cat, amount };
    }).sort((a, b) => b.amount - a.amount);

    drawDoughnutChart(sortedCats, totalSum);

    sortedCats.forEach(item => {
        const li = document.createElement('li');
        const styles = getStyleForColor(item.color);
        const pct = totalSum > 0 ? Math.round((item.amount / totalSum) * 100) : 0;
        
        li.innerHTML = `
            <div class="cat-icon" style="background-color: ${styles.bg}; color: ${item.color}; ${styles.border}">
                ${item.icon}
            </div>
            <div class="tx-info">
                <div class="tx-header">
                    <span>${item.name}</span>
                    <span style="color: #000;">${item.amount} ₽</span>
                </div>
                <div class="tx-details">Доля: ${pct}%</div>
            </div>
        `;
        listEl.appendChild(li);
    });
    
    if (sortedCats.length === 0) {
        listEl.innerHTML = '<li style="justify-content: center; color: #8e8e93; font-size: 14px;">Нет данных за этот период</li>';
    }
}

function drawDoughnutChart(data, total) {
    const canvas = document.getElementById('analytics-chart');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 70;
    const lineWidth = 36;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (total === 0 || data.length === 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#e5e5ea';
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        return;
    }

    let startAngle = -0.5 * Math.PI;
    
    data.forEach(item => {
        const sliceAngle = (item.amount / total) * 2 * Math.PI;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        
        if (sliceAngle > 0.4) {
            const midAngle = startAngle + sliceAngle / 2;
            const textX = centerX + Math.cos(midAngle) * radius;
            const textY = centerY + Math.sin(midAngle) * radius;
            const pct = Math.round((item.amount / total) * 100) + '%';
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Montserrat';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText(pct, textX, textY);
            ctx.shadowBlur = 0; 
        }
        
        startAngle += sliceAngle;
    });
}

const editModal = document.getElementById('edit-modal');
const editCategorySelect = document.getElementById('edit-category-select');

function openEditModal(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editingTxId = id;

    document.getElementById('edit-amount').value = tx.amount;
    document.getElementById('edit-date').value = tx.date;
    document.getElementById('edit-from-account').value = tx.from;
    document.getElementById('edit-to-account').value = tx.to || 'main';
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
        editCategorySelect.value = tx.categoryId;
    }
    
    editModal.style.display = 'flex';
}

document.getElementById('cancel-edit-btn').addEventListener('click', () => editModal.style.display = 'none');

document.getElementById('delete-tx-btn').addEventListener('click', () => {
    transactions = transactions.filter(t => t.id !== editingTxId);
    localStorage.setItem('transactions', JSON.stringify(transactions));
    editModal.style.display = 'none';
    updateUI();
});

document.getElementById('save-edit-btn').addEventListener('click', () => {
    const tx = transactions.find(t => t.id === editingTxId);
    tx.amount = parseFloat(document.getElementById('edit-amount').value);
    tx.date = document.getElementById('edit-date').value;
    tx.from = document.getElementById('edit-from-account').value;
    tx.comment = document.getElementById('edit-comment').value;
    
    if (tx.type === 'transfer') {
        tx.to = document.getElementById('edit-to-account').value;
    } else {
        tx.categoryId = editCategorySelect.value;
    }

    localStorage.setItem('transactions', JSON.stringify(transactions));
    editModal.style.display = 'none';
    updateUI();
});

document.getElementById('download-backup-btn').addEventListener('click', async () => {
    const backupData = {
        transactions: transactions,
        categories: categories,
        baseBalances: baseBalances,
        recentColors: recentColors,
        visibility: visibility,
        exportDate: new Date().toISOString()
    };
    
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
            console.log(e);
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
    URL.revokeObjectURL(url);
});

document.getElementById('import-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let rawText = e.target.result.replace(/[“”«»]/g, '"');
            const importedData = JSON.parse(rawText);
            
            if (importedData.transactions) {
                transactions = importedData.transactions;
                localStorage.setItem('transactions', JSON.stringify(transactions));
            }
            if (importedData.categories) {
                categories = importedData.categories;
                localStorage.setItem('categories', JSON.stringify(categories));
            }
            if (importedData.baseBalances) {
                baseBalances = importedData.baseBalances;
                localStorage.setItem('baseBalances', JSON.stringify(baseBalances));
            }
            if (importedData.recentColors) {
                recentColors = importedData.recentColors;
                localStorage.setItem('recentColors', JSON.stringify(recentColors));
            }
            if (importedData.visibility) {
                visibility = importedData.visibility;
                localStorage.setItem('visibility', JSON.stringify(visibility));
            }
            
            alert('Данные успешно восстановлены!');
            renderCategories(categorySelect, currentType);
            updateUI();
            
        } catch (error) {
            alert('Ошибка восстановления файла:\n' + error.message + '\n\nУбедитесь, что внутри файла нет текста, отличного от кода.');
        }
        document.getElementById('import-file').value = ''; 
    };
    reader.readAsText(file);
});

init();