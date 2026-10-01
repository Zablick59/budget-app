// Wishlist categories and purchases never affect account balances or transaction categories.
window.WishlistUI = (() => {
    const $ = id => document.getElementById(id);
    const groups = [
        ['wish', '<path d="m16 4 3.7 7.5 8.3 1.2-6 5.8 1.4 8.3L16 22.9l-7.4 3.9 1.4-8.3-6-5.8 8.3-1.2Z"/>', 'Хотелки', 'Сохраните то, что вам понравилось.'],
        ['candidate', '<circle cx="13.5" cy="13.5" r="8.5"/><path d="m20 20 7 7"/>', 'Кандидаты', 'Варианты, к которым стоит присмотреться.'],
        ['planned', '<rect x="5" y="7" width="22" height="21" rx="5"/><path d="M11 4v6M21 4v6M5 14h22m-16 7 3 3 6-6"/>', 'Запланировано', 'Покупки, с которыми вы уже определились.']
    ];
    const expanded = new Map(groups.map(([id]) => [id, true]));
    const dialog = $('wish-dialog');
    const categoryDialog = $('wish-categories-dialog');
    let editingId = null, editingCategoryId = null, photo = '', photoJob = 0, photoBusy = false;
    let drag = null, suppressClickUntil = 0;

    function finishDrag(drop = false) {
        const state = drag;
        if (!state) return;
        if (drop && state.active) updateDragTarget(state);
        drag = null;
        clearTimeout(state.timer);
        cancelAnimationFrame(state.frame);
        state.ghost?.remove();
        state.card.classList.remove('wish-drag-source');
        document.querySelectorAll('.wish-drop-target').forEach(group => group.classList.remove('wish-drop-target'));
        document.body.classList.remove('wish-dragging');
        if (!state.active) return;
        suppressClickUntil = performance.now() + 650;
        const item = wishlist.items.find(item => item.id === state.id);
        const status = drop ? state.target?.dataset.status : null;
        if (!item || !status || status === item.status) {
            $('wish-drag-announcement').textContent = 'Перенос отменён.';
            return;
        }
        const wasExpanded = expanded.get(status);
        expanded.set(status, true);
        if (commit(wishlist.items.map(i => i.id === state.id ? { ...i, status } : i))) {
            const name = groups.find(([id]) => id === status)[2];
            $('wish-drag-announcement').textContent = `«${item.name}» перенесено в раздел «${name}».`;
            const card = $('wish-groups').querySelector(`[data-id="${CSS.escape(state.id)}"]`);
            card?.querySelector('.wish-card-main').focus({ preventScroll: true });
            card?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        } else expanded.set(status, wasExpanded);
    }
    function dragFrame(now) {
        const state = drag;
        if (!state?.active) return;
        const dt = Math.min(32, now - (state.lastFrame ?? now));
        state.lastFrame = now;
        const bottom = document.querySelector('.bottom-nav').getBoundingClientRect().top;
        const edge = 75;
        const velocity = state.y < edge ? -Math.min(1, (edge - state.y) / edge)
            : state.y > bottom - edge ? Math.min(1, (state.y - bottom + edge) / edge) : 0;
        if (velocity) window.scrollBy(0, velocity * dt * 0.65);
        const left = Math.max(12, Math.min(innerWidth - state.width - 12, state.x - state.offsetX));
        state.ghost.style.transform = `translate3d(${left}px, ${state.y - state.offsetY}px, 0) scale(1.025)`;
        updateDragTarget(state);
        state.frame = requestAnimationFrame(dragFrame);
    }
    function updateDragTarget(state) {
        const bottom = document.querySelector('.bottom-nav').getBoundingClientRect().top;
        const hit = document.elementFromPoint(state.x, Math.max(0, Math.min(bottom - 1, state.y)));
        const group = state.y >= 0 && state.y < bottom ? hit?.closest('#wish-groups .wish-group') : null;
        const target = group?.dataset.status !== state.status ? group : null;
        if (target !== state.target) {
            state.target?.classList.remove('wish-drop-target');
            state.target = target;
            target?.classList.add('wish-drop-target');
        }
    }
    function startHold(target, x, y, pointerId, kind) {
        if (drag) finishDrag();
        const main = target.closest('.wish-card-main');
        if (!main || !main.closest('#wish-groups')) return;
        const card = main.closest('.wish-card');
        const item = wishlist.items.find(item => item.id === card.dataset.id);
        if (!item) return;
        const state = { id: item.id, status: item.status, card, main, x, y, startX: x, startY: y, pointerId, kind };
        drag = state;
        state.timer = setTimeout(() => {
            if (drag !== state || !card.isConnected) return;
            const rect = main.getBoundingClientRect();
            state.active = true;
            state.width = rect.width;
            state.offsetX = Math.max(0, Math.min(rect.width, state.x - rect.left));
            state.offsetY = Math.max(0, Math.min(rect.height, state.y - rect.top));
            state.ghost = document.createElement('div');
            state.ghost.className = 'wish-drag-ghost';
            state.ghost.style.width = rect.width + 'px';
            state.ghost.setAttribute('aria-hidden', 'true');
            state.ghost.inert = true;
            state.ghost.append(main.cloneNode(true));
            document.body.appendChild(state.ghost);
            card.classList.add('wish-drag-source');
            document.body.classList.add('wish-dragging');
            $('wish-drag-announcement').textContent = 'Перетащите карточку на нужный раздел. Отпустите, чтобы переместить.';
            state.frame = requestAnimationFrame(dragFrame);
        }, 450);
    }
    function moveHold(x, y) {
        if (!drag) return;
        if (!drag.active && Math.hypot(x - drag.startX, y - drag.startY) > 10) return finishDrag();
        drag.x = x; drag.y = y;
    }
    const list = $('wish-groups');
    list.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' && event.button === 0 && event.isPrimary) startHold(event.target, event.clientX, event.clientY, event.pointerId, 'pointer');
    });
    window.addEventListener('pointermove', event => {
        if (drag?.kind === 'pointer' && drag.pointerId === event.pointerId) moveHold(event.clientX, event.clientY);
    });
    window.addEventListener('pointerup', event => {
        if (drag?.kind === 'pointer' && drag.pointerId === event.pointerId) finishDrag(true);
    });
    window.addEventListener('pointercancel', event => {
        if (drag?.kind === 'pointer' && drag.pointerId === event.pointerId) finishDrag();
    });
    // A cancellable touchmove keeps ordinary swiping intact until the hold has activated.
    list.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) return finishDrag();
        const touch = event.changedTouches[0];
        startHold(event.target, touch.clientX, touch.clientY, touch.identifier, 'touch');
    }, { passive: true });
    window.addEventListener('touchmove', event => {
        if (drag?.kind !== 'touch') return;
        if (event.touches.length !== 1) return finishDrag();
        const touch = [...event.touches].find(t => t.identifier === drag.pointerId);
        if (!touch) return;
        if (drag.active && event.cancelable) event.preventDefault();
        moveHold(touch.clientX, touch.clientY);
    }, { passive: false });
    window.addEventListener('touchend', event => {
        if (drag?.kind !== 'touch' || ![...event.changedTouches].some(t => t.identifier === drag.pointerId)) return;
        if (drag.active && event.cancelable) event.preventDefault();
        finishDrag(true);
    }, { passive: false });
    window.addEventListener('touchcancel', () => { if (drag?.kind === 'touch') finishDrag(); });
    window.addEventListener('touchstart', event => { if (event.touches.length > 1) finishDrag(); }, { passive: true });
    document.addEventListener('click', event => {
        if (drag?.active || performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    list.addEventListener('contextmenu', event => { if (event.target.closest('.wish-card-main')) event.preventDefault(); });
    list.addEventListener('dragstart', event => { if (event.target.closest('.wish-card-main')) event.preventDefault(); });
    document.addEventListener('scroll', () => { if (drag && !drag.active) finishDrag(); }, true);
    document.addEventListener('keydown', event => { if (drag && event.key === 'Escape') { event.preventDefault(); finishDrag(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) finishDrag(); });
    window.addEventListener('blur', () => finishDrag());
    window.addEventListener('resize', () => finishDrag());

    function options(selected) {
        return groups.map(([id, , name]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${name}</option>`).join('');
    }
    function categoryLabel(cat) { return `${cat.icon || '📌'} ${cat.name}`; }
    const expenseValue = id => '__expense__:' + id;
    function selectedCategory(value) {
        return wishlist.categories.find(c => c.id === value) || categories.expense.find(c => expenseValue(c.id) === value);
    }
    // A selected expense category becomes a local copy, so later wishlist edits stay independent.
    function categoryOptions() {
        const own = wishlist.categories.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(categoryLabel(c))}</option>`).join('');
        const expenses = categories.expense.filter(c => !wishlist.categories.some(w => w.sourceExpenseId === c.id))
            .map(c => `<option value="${escapeHTML(expenseValue(c.id))}">${escapeHTML(categoryLabel(c))}</option>`).join('');
        return (own ? `<optgroup label="Виш-лист">${own}</optgroup>` : '') + (expenses ? `<optgroup label="Из расходов">${expenses}</optgroup>` : '');
    }
    function colorPicker(prefix) {
        const root = $(prefix + '-colors');
        root.innerHTML = `<div class="wish-color-preview"><span id="${prefix}-preview" class="cat-icon"></span><span id="${prefix}-preview-name"></span></div><input id="${prefix}-color" type="hidden" value="#34c759"><label for="${prefix}-hue">Цвет</label><input id="${prefix}-hue" class="wish-hue" type="range" min="0" max="360" value="136"><p class="wish-palette-label">Недавние цвета</p><div id="${prefix}-palette" class="color-palette" role="group" aria-label="Недавние цвета категории"></div>`;
        const value = $(prefix + '-color'), slider = $(prefix + '-hue');
        function preview() {
            const styles = getStyleForColor(value.value);
            const icon = $(prefix + '-preview');
            icon.textContent = $(prefix + '-icon').value.trim() || '📌';
            icon.style.backgroundColor = styles.bg;
            icon.style.border = styles.border;
            $(prefix + '-preview-name').textContent = $(prefix + '-name').value.trim() || 'Ваша категория';
            root.querySelectorAll('.wish-color-swatch').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === value.value)));
        }
        function set(color) { value.value = color; slider.value = colorHue(color); preview(); }
        function reset(color = '#34c759') {
            const palette = $(prefix + '-palette');
            palette.replaceChildren();
            (wishlist.recentColors || recentColors).forEach((color, index) => {
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'color-swatch wish-color-swatch';
                button.dataset.color = color; button.style.backgroundColor = color;
                button.setAttribute('aria-label', `Цвет ${index + 1}`);
                button.addEventListener('click', () => set(color));
                palette.appendChild(button);
            });
            set(color);
        }
        slider.addEventListener('input', () => { value.value = getHSLColor(slider.value); preview(); });
        $(prefix + '-icon').addEventListener('input', preview);
        $(prefix + '-name').addEventListener('input', preview);
        reset();
        return { reset };
    }
    const newCategoryColors = colorPicker('wish-new');
    const editCategoryColors = colorPicker('wish-category');
    function priceHTML(item) {
        if (item.priceType === 'unknown') return '<span class="wish-price-unknown">Цена пока<br>неизвестна</span>';
        if (item.priceType === 'range') return `<span>${money(item.priceMin)}</span><span class="wish-price-to">– ${money(item.priceMax)} ₽</span>`;
        return `<span>${money(item.priceMin)} ₽</span>`;
    }
    function media(item, cat) {
        if (item.photo) return `<img src="${escapeHTML(item.photo)}" alt="" loading="lazy">`;
        return escapeHTML(item.icon || cat?.icon || '✨');
    }
    function render() {
        finishDrag();
        const filter = $('wish-filter');
        const old = filter.value;
        filter.innerHTML = '<option value="all">Все категории</option><option value="none">Без категории</option>' + wishlist.categories.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(categoryLabel(c))}</option>`).join('');
        filter.value = [...filter.options].some(o => o.value === old) ? old : 'all';
        $('wish-groups').innerHTML = groups.map(([status, icon, name, hint]) => {
            const items = wishlist.items.filter(item => item.status === status && (filter.value === 'all' || (filter.value === 'none' ? item.categoryId === null : item.categoryId === filter.value)));
            return `<details class="wish-group" data-status="${status}"${expanded.get(status) ? ' open' : ''}><summary><svg class="wish-section-icon" viewBox="0 0 32 32" aria-hidden="true">${icon}</svg><span>${name}</span><span class="wish-count">${items.length}</span><span class="wish-chevron" aria-hidden="true">⌄</span></summary><div class="wish-group-content">${items.length ? items.map(item => {
                const cat = wishlist.categories.find(c => c.id === item.categoryId);
                return `<article class="wish-card" data-id="${escapeHTML(item.id)}"><button type="button" class="wish-card-main" data-edit="${escapeHTML(item.id)}" aria-label="Редактировать: ${escapeHTML(item.name)}"><span class="wish-card-media"${cat ? ` style="background:${getStyleForColor(cat.color).bg}"` : ''}>${media(item, cat)}</span><span class="wish-card-info"><strong>${escapeHTML(item.name)}</strong>${cat ? `<span class="wish-card-category">${escapeHTML(categoryLabel(cat))}</span>` : ''}${item.note ? `<span class="wish-card-note">${escapeHTML(item.note)}</span>` : ''}</span><span class="wish-card-price">${priceHTML(item)}</span></button><div class="wish-card-footer"><select class="wish-card-status" data-move="${escapeHTML(item.id)}" aria-label="Раздел покупки ${escapeHTML(item.name)}">${options(item.status)}</select>${item.link ? `<a class="wish-card-link" href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer">Товар ↗</a>` : ''}<button type="button" class="wish-edit-button" data-edit="${escapeHTML(item.id)}" aria-label="Редактировать ${escapeHTML(item.name)}">✎</button></div></article>`;
            }).join('') : `<div class="wish-empty"><p>${filter.value === 'all' ? hint : 'В этой категории пока нет покупок.'}</p><button type="button" class="wish-text-button" data-add="${status}">＋ Добавить покупку</button></div>`}</div></details>`;
        }).join('');
        document.querySelectorAll('.wish-group').forEach(group => group.addEventListener('toggle', () => expanded.set(group.dataset.status, group.open)));
    }
    function error(message) {
        $('wish-error').textContent = message;
        $('wish-error').hidden = !message;
        if (message) $('wish-error').scrollIntoView({ block: 'nearest' });
    }
    function categoryChoices(value = '') {
        $('wish-category').innerHTML = '<option value="">Без категории</option>' + categoryOptions() + '<option value="__new__">＋ Новая категория</option>';
        $('wish-category').value = value;
        toggleNewCategory();
    }
    function toggleNewCategory() {
        const visible = $('wish-category').value === '__new__';
        $('wish-new-category').hidden = !visible;
        $('wish-new-name').required = visible;
    }
    function togglePrice() {
        const type = $('wish-price-type').value;
        $('wish-price-fields').hidden = type === 'unknown';
        $('wish-price-max-wrap').hidden = type !== 'range';
        $('wish-price-min-label').textContent = type === 'range' ? 'От, ₽' : 'Сумма, ₽';
        $('wish-price-min').required = type !== 'unknown';
        $('wish-price-max').required = type === 'range';
    }
    function previewPhoto() {
        const cat = selectedCategory($('wish-category').value);
        $('wish-photo-preview').innerHTML = photo ? `<img src="${escapeHTML(photo)}" alt="Фото покупки">` : escapeHTML($('wish-icon').value.trim() || cat?.icon || '✨');
        $('wish-photo-remove').hidden = !photo;
    }
    function openItem(id = null, status = 'wish') {
        const item = wishlist.items.find(i => i.id === id);
        editingId = item?.id ?? null;
        photoJob++;
        photoBusy = false;
        $('wish-save').disabled = false;
        $('wish-form').reset();
        $('wish-editor-title').textContent = item ? 'Редактировать покупку' : 'Новая покупка';
        $('wish-delete').hidden = !item;
        $('wish-name').value = item?.name ?? '';
        $('wish-icon').value = item?.icon ?? '';
        $('wish-status').value = item?.status ?? status;
        $('wish-price-type').value = item?.priceType ?? 'unknown';
        $('wish-price-min').value = item?.priceMin ?? '';
        $('wish-price-max').value = item?.priceMax ?? '';
        $('wish-link').value = item?.link ?? '';
        $('wish-note').value = item?.note ?? '';
        photo = item?.photo ?? '';
        categoryChoices(item?.categoryId ?? '');
        newCategoryColors.reset();
        togglePrice(); previewPhoto(); error('');
        dialog.showModal();
        dialog.scrollTop = 0;
    }
    function commit(items, cats = wishlist.categories, color = null) {
        const palette = wishlist.recentColors || recentColors;
        if (!persistChanges({ wishlist: { ...wishlist, categories: cats, items,
            recentColors: color ? [color, ...palette.filter(c => c !== color)].slice(0, 5) : palette } })) return false;
        render();
        return true;
    }
    $('wish-add').addEventListener('click', () => openItem());
    $('wish-filter').addEventListener('change', render);
    $('wish-category').addEventListener('change', () => { toggleNewCategory(); previewPhoto(); });
    $('wish-price-type').addEventListener('change', togglePrice);
    $('wish-icon').addEventListener('input', previewPhoto);
    $('wish-groups').addEventListener('click', event => {
        const edit = event.target.closest('[data-edit]');
        const add = event.target.closest('[data-add]');
        if (edit) openItem(edit.dataset.edit);
        else if (add) openItem(null, add.dataset.add);
    });
    $('wish-groups').addEventListener('change', event => {
        const select = event.target.closest('[data-move]');
        if (!select) return;
        const item = wishlist.items.find(i => i.id === select.dataset.move);
        if (!item) return;
        const previous = item.status;
        expanded.set(select.value, true);
        if (!commit(wishlist.items.map(i => i.id === item.id ? { ...i, status: select.value } : i))) select.value = previous;
        else document.querySelector(`[data-move="${CSS.escape(item.id)}"]`)?.focus({ preventScroll: true });
    });
    $('wish-form').addEventListener('submit', event => {
        event.preventDefault();
        if (photoBusy) return error('Дождитесь обработки фотографии.');
        const name = $('wish-name').value.trim();
        if (!name) return error('Введите название покупки.');
        let cats = wishlist.categories;
        let categoryId = $('wish-category').value || null;
        let savedColor = null;
        if (categoryId === '__new__') {
            const name = $('wish-new-name').value.trim();
            if (!name) return error('Введите название новой категории.');
            const existing = cats.find(c => c.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'));
            if (existing) return error('Такая категория уже есть. Выберите её из списка.');
            categoryId = FinanceData.id('wishcat');
            savedColor = $('wish-new-color').value;
            cats = [...cats, { id: categoryId, name, icon: $('wish-new-icon').value.trim(), color: savedColor }];
        } else if (!cats.some(c => c.id === categoryId)) {
            const source = categories.expense.find(c => expenseValue(c.id) === categoryId);
            if (source) {
                categoryId = FinanceData.id('wishcat');
                cats = [...cats, { id: categoryId, sourceExpenseId: source.id, name: source.name, icon: source.icon, color: source.color }];
            }
        }
        const priceType = $('wish-price-type').value;
        const priceMin = priceType === 'unknown' ? null : FinanceData.parseMoney($('wish-price-min').value);
        const priceMax = priceType === 'range' ? FinanceData.parseMoney($('wish-price-max').value) : priceMin;
        if (priceType !== 'unknown' && (priceMin === null || priceMax === null || priceMin < 0 || priceMax < priceMin)) return error('Укажите неотрицательную цену; в диапазоне — от меньшей к большей. Не больше двух знаков после запятой.');
        let link = $('wish-link').value.trim();
        if (link) {
            if (!/^[a-z][a-z\d+.-]*:/i.test(link)) link = 'https://' + link;
            try {
                const url = new URL(link);
                if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
                link = url.href;
            } catch { return error('Укажите ссылку на сайт: https://…'); }
        }
        const item = { id: editingId ?? FinanceData.id('wish'), name, status: $('wish-status').value, categoryId,
            icon: $('wish-icon').value.trim(), priceType, priceMin, priceMax, link, photo, note: $('wish-note').value.trim() };
        expanded.set(item.status, true);
        if (commit(editingId ? wishlist.items.map(i => i.id === editingId ? item : i) : [...wishlist.items, item], cats, savedColor)) dialog.close();
    });
    $('wish-delete').addEventListener('click', () => {
        if (confirm('Удалить эту покупку из виш-листа?') && commit(wishlist.items.filter(i => i.id !== editingId))) dialog.close();
    });
    $('wish-photo-remove').addEventListener('click', () => {
        photoJob++; photoBusy = false; photo = ''; $('wish-photo').value = ''; $('wish-save').disabled = false; previewPhoto();
    });
    async function shrinkPhoto(file) {
        if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('Выберите изображение размером до 20 МБ.');
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
            const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            for (const quality of [0.82, 0.65, 0.45, 0.3]) {
                const result = canvas.toDataURL('image/jpeg', quality);
                if (result.length <= 250000) return result;
            }
            throw new Error('Фото слишком сложное для сохранения. Попробуйте уменьшить его.');
        } finally { URL.revokeObjectURL(url); }
    }
    $('wish-photo').addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        const job = ++photoJob;
        photoBusy = true; $('wish-save').disabled = true; error('');
        try {
            const result = await shrinkPhoto(file);
            if (job === photoJob && dialog.open) { photo = result; previewPhoto(); }
        } catch (e) {
            if (job === photoJob && dialog.open) error(e.message || 'Не удалось открыть фото. Попробуйте JPEG, PNG или WebP.');
        } finally {
            if (job === photoJob) { photoBusy = false; $('wish-save').disabled = false; }
        }
    });
    dialog.addEventListener('close', () => { photoJob++; photoBusy = false; });
    document.querySelectorAll('[data-wish-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

    function resetCategory() {
        editingCategoryId = null; $('wish-category-form').reset();
        $('wish-category-form-title').textContent = 'Новая категория';
        $('wish-category-reset').hidden = true;
        editCategoryColors.reset();
    }
    function renderCategoryList() {
        $('wish-category-list').innerHTML = wishlist.categories.length ? wishlist.categories.map(c => `<div class="wish-category-row"><button type="button" data-cat-edit="${escapeHTML(c.id)}"><span class="wish-category-dot" style="background:${c.color}"></span>${escapeHTML(categoryLabel(c))}<span aria-hidden="true"> ✎</span></button><button type="button" class="wish-danger" data-cat-delete="${escapeHTML(c.id)}" aria-label="Удалить категорию ${escapeHTML(c.name)}">✕</button></div>`).join('') : '<p class="wish-hint">Пока нет категорий. Можно создать свою или оставлять покупки без категории.</p>';
    }
    $('wish-manage').addEventListener('click', () => { resetCategory(); renderCategoryList(); categoryDialog.showModal(); });
    $('wish-category-reset').addEventListener('click', resetCategory);
    $('wish-category-list').addEventListener('click', event => {
        const edit = event.target.closest('[data-cat-edit]');
        const remove = event.target.closest('[data-cat-delete]');
        if (edit) {
            const cat = wishlist.categories.find(c => c.id === edit.dataset.catEdit);
            editingCategoryId = cat.id;
            $('wish-category-name').value = cat.name; $('wish-category-icon').value = cat.icon;
            editCategoryColors.reset(cat.color);
            $('wish-category-form-title').textContent = 'Редактировать категорию'; $('wish-category-reset').hidden = false;
            $('wish-category-name').focus();
        } else if (remove && confirm('Удалить категорию? Покупки сохранятся без категории.')) {
            const id = remove.dataset.catDelete;
            if (commit(wishlist.items.map(i => i.categoryId === id ? { ...i, categoryId: null } : i), wishlist.categories.filter(c => c.id !== id))) { resetCategory(); renderCategoryList(); }
        }
    });
    $('wish-category-form').addEventListener('submit', event => {
        event.preventDefault();
        const name = $('wish-category-name').value.trim();
        if (!name) return alert('Введите название категории.');
        if (wishlist.categories.some(c => c.id !== editingCategoryId && c.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) return alert('Такая категория уже есть.');
        const cat = { ...wishlist.categories.find(c => c.id === editingCategoryId), id: editingCategoryId ?? FinanceData.id('wishcat'), name, icon: $('wish-category-icon').value.trim(), color: $('wish-category-color').value };
        const cats = editingCategoryId ? wishlist.categories.map(c => c.id === editingCategoryId ? cat : c) : [...wishlist.categories, cat];
        if (commit(wishlist.items, cats, cat.color)) { resetCategory(); renderCategoryList(); }
    });
    render();
    return { render };
})();
