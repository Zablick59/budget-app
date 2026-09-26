// Run with Playwright installed: node tests/browser.cjs
// Set BUDGET_CHROME_PATH to use an existing Chrome executable.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-check-'));
const today = '2026-09-26';
const fixture = () => ({ accounts: [{ id: 'a', name: 'Основной', baseBalance: 1000 }, { id: 'b', name: 'Копилка', baseBalance: 0 }], categories: { expense: [
    { id: 'food', name: 'Продукты', icon: '🍔', color: '#ff5263' },
    { id: 'home', name: 'Хозтовары', icon: '🛍️', color: '#f5b72d' },
    { id: 'travel', name: 'Транспорт', icon: '🚕', color: '#458bff' }
], income: [{ id: 'salary', name: 'Зарплата', icon: '💰', color: '#3aa875' }] }, transactions: [
    { id: 1, type: 'expense', amount: 100.25, date: today, from: 'a', to: null, categoryId: 'food', comment: 'Подарок «маме»' },
    { id: 2, type: 'expense', amount: 1255, date: today, from: 'a', to: null, categoryId: 'home', comment: 'Для дома' },
    { id: 3, type: 'expense', amount: 25, date: today, from: 'a', to: null, categoryId: 'travel', comment: '' }
] });
let browser;
async function open(seed = fixture(), viewport = {width:390,height:844}) {
    const context = await browser.newContext({viewport, locale:'ru-RU', timezoneId:'Asia/Yekaterinburg',deviceScaleFactor:2});
    await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'budget.test') return route.abort();
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!['index.html','data.js','chart.js','app.js','style.css','manifest.json','icon.svg'].includes(name)) return route.fulfill({status:404,body:''});
        await route.fulfill({body:fs.readFileSync(root+'/'+name), contentType: name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.svg')?'image/svg+xml':'text/html'});
    });
    await context.addInitScript(seed => {
        if (!sessionStorage.getItem('seeded')) {
            for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            sessionStorage.setItem('seeded','yes');
        }
    }, seed);
    const page = await context.newPage(), errors = [], dialogs = [];
    await page.clock.setFixedTime(new Date('2026-09-26T10:00:00Z'));
    page.on('pageerror', e=>errors.push(e.message));
    page.on('dialog', async d=>{dialogs.push(d.message());await d.accept(d.type()==='prompt'?'1000,50':undefined);});
    await page.goto('https://budget.test/');
    await page.waitForSelector('#accounts-list .account');
    return {page, context, errors, dialogs, close: async()=>{assert.deepEqual(errors,[]);await context.close();}};
}
async function run(name, fn) {
    if (process.env.BUDGET_TEST_FILTER && !name.includes(process.env.BUDGET_TEST_FILTER)) return;
    await fn(); console.log('PASS '+name);
}
async function importFile(page, data) {
    await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await page.waitForFunction(()=>document.querySelector('#import-file').value==='');
}
(async()=>{
    fs.mkdirSync(screenshotDir,{recursive:true});
    browser=await chromium.launch({headless:true,...(process.env.BUDGET_CHROME_PATH ? {executablePath:process.env.BUDGET_CHROME_PATH} : {})});
    await run('legacy startup, invalid edit guards, comma amount and persistence after reload',async()=>{
        const t=await open(),p=t.page;
        assert.equal(await p.evaluate(()=>calculateBalances().a),-380.25);
        await p.evaluate(()=>openEditModal(1));
        for(const value of ['', '-100', '0', 'abc', '1.001']){
            await p.fill('#edit-amount',value); await p.click('#save-edit-btn');
            assert.equal(await p.evaluate(()=>transactions.find(t=>t.id===1).amount),100.25);
            assert.equal(await p.locator('#edit-modal').isVisible(),true);
        }
        await p.fill('#edit-amount','100,50');await p.click('#save-edit-btn');
        await p.reload();assert.equal(await p.evaluate(()=>transactions.find(t=>t.id===1).amount),100.5);
        assert.equal(await p.evaluate(()=>localStorage.getItem('transactions')!==null),true);
        await t.close();
    });
    await run('new decimals, transfer, balance correction and exact cents',async()=>{
        const seed=fixture();seed.transactions=[];const t=await open(seed),p=t.page;
        for(const amount of ['0,10','0,20']){await p.fill('#amount',amount);await p.click('#transaction-form .submit-btn');}
        assert.equal(await p.evaluate(()=>calculateBalances().a),999.7);
        await p.click('[data-type="transfer"]');await p.fill('#amount','20,05');await p.click('#transaction-form .submit-btn');
        assert.equal(await p.evaluate(()=>transactions.length),2);
        await p.selectOption('#to-account','b');await p.click('#transaction-form .submit-btn');
        assert.equal(await p.evaluate(()=>calculateBalances().b),20.05);
        await p.evaluate(()=>editBalance('a'));assert.equal(await p.evaluate(()=>calculateBalances().a),1000.5);
        await t.close();
    });
    await run('invalid import preserves snapshot, quote-containing backup round trip, legacy import',async()=>{
        const t=await open(),p=t.page;const before=await p.evaluate(()=>JSON.stringify(currentData()));
        await importFile(p,{...fixture(),transactions:[],categories:{expense:'bad',income:[]}});
        assert.equal(await p.evaluate(()=>JSON.stringify(currentData())),before);
        const data=fixture();data.transactions[0].comment='«маме» и “папе”';await importFile(p,data);
        assert.equal(await p.evaluate(()=>transactions[0].comment),'«маме» и “папе”');
        const old=fixture();old.categories=old.categories.expense;delete old.accounts;old.baseBalances={main:200,savings:30,grandma:0};old.transactions.forEach(t=>t.from='main');
        await importFile(p,old);assert.equal(await p.locator('#category-select option').count(),3);
        assert.equal(await p.evaluate(()=>accounts[0].baseBalance),200);
        await t.close();
    });
    await run('quota failure leaves UI and stored transactions unchanged',async()=>{
        const t=await open(),p=t.page;
        await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}});
        await p.evaluate(()=>openEditModal(1));await p.fill('#edit-amount','555');await p.click('#save-edit-btn');
        assert.equal(await p.evaluate(()=>transactions.find(t=>t.id===1).amount),100.25);
        assert.equal(await p.locator('#edit-modal').isVisible(),true);
        await t.close();
    });
    await run('HTML injection remains literal in names, comments and analytics',async()=>{
        const data=fixture();const literal='<img src=x onerror="window.injected=true"> & текст';
        data.accounts[0].name=literal;data.categories.expense[0].name=literal;data.transactions[0].comment=literal;
        const t=await open(data),p=t.page;
        assert.equal(await p.locator('#history-list img').count(),0);assert.equal(await p.locator('#accounts-list img').count(),0);
        assert((await p.locator('#category-select').textContent()).includes(literal));
        await p.click('#nav-analytics');assert.equal(await p.locator('#analytics-categories-list img').count(),0);
        assert.equal(await p.evaluate(()=>window.injected),undefined);
        await t.close();
    });
    await run('groups expand, individual edit works, more than 50 groups accessible',async()=>{
        const data=fixture();data.transactions.push({...data.transactions[0],id:4,amount:10});
        const t=await open(data),p=t.page;
        await p.locator('#history-list [aria-expanded]').click();assert.equal(await p.locator('.tx-child').count(),2);
        await p.locator('.tx-child').first().click();assert.equal(await p.locator('#edit-modal').isVisible(),true);
        await p.fill('#edit-amount','50');await p.click('#save-edit-btn');
        assert.equal(await p.evaluate(()=>transactions.find(t=>t.id===1).amount),50);
        const many=fixture();many.transactions=Array.from({length:75},(_,i)=>({...many.transactions[0],id:i,categoryId:'old'+i}));
        await importFile(p,many);assert.equal(await p.locator('#history-list .tx-item').count(),50);
        await p.click('#history-more');assert.equal(await p.locator('#history-list .tx-item').count(),75);
        await t.close();
    });
    await run('analytics categories update, deleted category selectable, historical account preserved',async()=>{
        const t=await open(),p=t.page;await p.click('#nav-analytics');await p.click('#nav-main');
        await p.click('#open-category-modal');await p.fill('#new-cat-name','Новая & тест');await p.fill('#new-cat-icon','🧑‍💻');await p.click('#save-cat-btn');
        await p.click('#nav-analytics');assert((await p.locator('#analytics-cat-filter').textContent()).includes('Новая & тест'));
        const deleted=fixture();deleted.transactions[0].categoryId='deleted';deleted.transactions[0].from='old';await importFile(p,deleted);
        await p.click('#nav-analytics');await p.selectOption('#analytics-cat-filter','deleted');assert.equal(await p.locator('#analytics-categories-list li').count(),1);
        await p.locator('#analytics-categories-list li').click();await p.fill('#edit-comment','Сохранён');await p.click('#save-edit-btn');
        assert.equal(await p.evaluate(()=>transactions[0].from),'old');assert.equal(await p.evaluate(()=>transactions[0].categoryId),'deleted');
        await t.close();
    });
    await run('modal date fits at 320, 375, 390 and 430 pixels and short landscape',async()=>{
        const t=await open(),p=t.page;await p.evaluate(()=>openEditModal(2));
        for (const viewport of [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932},{width:667,height:375}]){
            await p.setViewportSize(viewport);
            const boxes=await p.evaluate(()=>{const field=document.querySelector('#edit-date'),m=document.querySelector('#edit-modal .modal-content');const r=field.getBoundingClientRect(),b=m.getBoundingClientRect();return {left:r.left,right:r.right,ml:b.left,mr:b.right,color:getComputedStyle(field).color,overflow:m.scrollWidth>m.clientWidth};});
            assert(boxes.left>=boxes.ml+19 && boxes.right<=boxes.mr-19,JSON.stringify(boxes));
            assert.equal(boxes.color,'rgb(0, 0, 0)');assert.equal(boxes.overflow,false);
        }
        await p.setViewportSize({width:390,height:844});await p.reload();await p.evaluate(()=>openEditModal(2));await p.screenshot({path:screenshotDir+'/edit-modal.png'});await t.close();
    });
    await run('date text stays centered and updates, navigation stays at viewport bottom', async () => {
        const t = await open(), p = t.page;
        assert.equal(await p.locator('#tx-date').evaluate(el => el.previousElementSibling.textContent), '26.09.2026');
        await p.click('#date-prev');
        assert.equal(await p.locator('#tx-date').evaluate(el => el.previousElementSibling.textContent), '25.09.2026');
        await p.click('#date-next');
        await p.fill('#tx-date', '2026-08-15');
        assert.equal(await p.locator('#tx-date').evaluate(el => el.previousElementSibling.textContent), '15.08.2026');
        await p.evaluate(() => openEditModal(1));
        await p.fill('#edit-date', '2026-09-20');
        assert.equal(await p.locator('#edit-date').evaluate(el => el.previousElementSibling.textContent), '20.09.2026');
        await p.click('#save-edit-btn');
        assert.equal(await p.evaluate(() => transactions.find(tx => tx.id === 1).date), '2026-09-20');
        await p.evaluate(() => openEditModal(1));
        for (const viewport of [{width:320,height:568},{width:390,height:844},{width:667,height:375}]) {
            await p.setViewportSize(viewport);
            const metrics = await p.evaluate(() => ({
                navBottom: document.querySelector('.bottom-nav').getBoundingClientRect().bottom,
                height: innerHeight,
                viewport: document.querySelector('meta[name="viewport"]').content,
                date: [...document.querySelectorAll('.date-display')].map(display => {
                    const range = document.createRange(); range.selectNodeContents(display);
                    const text = range.getBoundingClientRect(), field = display.parentElement.getBoundingClientRect();
                    return { delta: Math.abs((text.top + text.bottom) / 2 - (field.top + field.bottom) / 2), color: getComputedStyle(display).color };
                })
            }));
            assert.equal(metrics.navBottom, metrics.height);
            assert(!metrics.viewport.includes('viewport-fit=cover'));
            for (const field of metrics.date) { assert(field.delta < 2, JSON.stringify(field)); assert.equal(field.color, 'rgb(0, 0, 0)'); }
        }
        await p.setViewportSize({width:390,height:844});
        await p.reload();
        await p.screenshot({path:screenshotDir+'/main-date-centered.png'});
        await p.evaluate(() => openEditModal(1));
        await p.screenshot({path:screenshotDir+'/date-centered.png'});
        await t.close();
    });
    await run('chart animates smoothly, labels share center, tiny sector stays within canvas and is clickable',async()=>{
        const data=fixture();data.transactions[0].amount=1;const t=await open(data),p=t.page;
        await p.click('#nav-analytics');await p.selectOption('#analytics-cat-filter','food');
        await p.waitForFunction(()=>chart.items.find(i=>i.id==='food')?.focus===1);
        const state=await p.evaluate(()=>{const i=chart.items.find(i=>i.id==='food'),g=chart.geometry(i);return {g,focus:i.focus}});
        assert(state.g.x-32>0&&state.g.x+32<300&&state.g.y-32>0&&state.g.y+32<300);
        const labels = await p.evaluate(() => {
            const calls = [], prototype = CanvasRenderingContext2D.prototype, original = prototype.fillText;
            prototype.fillText = function(text, x, y, ...args) { calls.push({ text, x, y }); return original.call(this, text, x, y, ...args); };
            chart.makeLabel('🍔', '<1%', 2);
            const rendered = [...calls]; calls.length = 0;
            chart.paint(); chart.paint();
            prototype.fillText = original;
            return { rendered, perFrameTextCalls: calls.length };
        });
        const icon = labels.rendered.find(label => label.text === '🍔'), percent = labels.rendered.find(label => label.text === '<1%');
        assert.equal(icon.x, percent.x); assert(icon.y < percent.y);
        assert.equal(labels.perFrameTextCalls, 0);
        await p.screenshot({path:screenshotDir+'/chart-tiny.png'});
        const rect=await p.locator('#analytics-chart').boundingBox();
        await p.mouse.click(rect.x+state.g.x*rect.width/300,rect.y+state.g.y*rect.height/300);
        assert.equal(await p.locator('#analytics-cat-filter').inputValue(),'all');
        await p.selectOption('#analytics-cat-filter','home');await p.waitForFunction(()=>chart.items.find(i=>i.id==='home')?.focus===1);
        const ring = await p.evaluate(() => {
            const selected = chart.items.find(item => item.id === 'home');
            const geometry = chart.geometry(selected);
            const image = chart.canvas.getContext('2d').getImageData(0, 0, chart.canvas.width, chart.canvas.height);
            const scale = chart.canvas.width / 300;
            let outside = 0;
            for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
                if (image.data[(y * image.width + x) * 4 + 3] < 30) continue;
                const px = x / scale, py = y / scale;
                if (Math.hypot(px - 150, py - 150) > 114 && Math.hypot(px - geometry.x, py - geometry.y) > 34) outside++;
            }
            return { outside, fixed: [0, 0.5, 1].map(focus => {
                const g = chart.geometry({ ...selected, focus });
                return [g.cx, g.cy, g.radius, g.width];
            }) };
        });
        assert.equal(ring.outside, 0, 'Only the bubble may extend beyond the original ring');
        assert.deepEqual(ring.fixed, [[150,150,90,42],[150,150,90,42],[150,150,90,42]]);
        await p.screenshot({path:screenshotDir+'/chart-selected.png'});
        await p.selectOption('#analytics-cat-filter','travel');
        await p.waitForFunction(()=>{const i=chart.items.find(i=>i.id==='travel');return i.focus>0&&i.focus<1});
        await p.waitForFunction(()=>chart.items.find(i=>i.id==='travel')?.focus===1);
        await t.close();
    });
    await run('category picker edits existing category without changing transactions, persists and supports cancel', async () => {
        const t = await open(), p = t.page;
        const original = await p.evaluate(() => JSON.stringify(transactions));
        await p.click('#category-picker-btn');
        await p.locator('.category-picker-row').filter({has:p.locator('[data-category-id="food"]')}).locator('.category-edit-btn').click();
        assert.equal(await p.inputValue('#new-cat-name'), 'Продукты');
        await p.fill('#new-cat-name', 'Отменить'); await p.click('#cancel-cat-btn');
        assert.equal(await p.evaluate(() => categories.expense[0].name), 'Продукты');
        await p.locator('.category-picker-row').filter({has:p.locator('[data-category-id="food"]')}).locator('.category-edit-btn').click();
        await p.fill('#new-cat-name', 'Еда & покупки'); await p.fill('#new-cat-icon', '🥑');
        await p.locator('#hue-slider').fill('210');
        await p.click('#save-cat-btn');
        assert.equal(await p.locator('#category-picker-modal').isVisible(), true);
        await p.locator('.category-choice[data-category-id="food"]').click();
        assert.equal(await p.locator('#category-picker-btn').textContent(), '🥑 Еда & покупки');
        assert.equal(await p.evaluate(() => JSON.stringify(transactions)), original);
        assert((await p.locator('#history-list').textContent()).includes('Еда & покупки'));
        await p.reload();
        assert.equal(await p.evaluate(() => categories.expense[0].id), 'food');
        assert.equal(await p.evaluate(() => categories.expense[0].color), 'hsl(210, 100%, 45%)');
        await p.click('#nav-analytics');
        assert((await p.locator('#analytics-cat-filter').textContent()).includes('Еда & покупки'));
        await t.close();
    });
    await run('category long press opens editor and movement cancels hold', async () => {
        const t = await open(), p = t.page;
        await p.click('#category-picker-btn');
        const button = p.locator('.category-choice[data-category-id="home"]');
        const box = await button.boundingBox();
        await p.mouse.move(box.x + 30, box.y + 25); await p.mouse.down();
        await p.waitForFunction(() => document.querySelector('#category-modal').style.display === 'flex');
        await p.mouse.up();
        assert.equal(await p.inputValue('#new-cat-name'), 'Хозтовары');
        assert.equal(await p.locator('#category-modal').isVisible(), true);
        await p.click('#cancel-cat-btn');
        await button.dispatchEvent('pointerdown', {isPrimary:true,button:0,pointerType:'touch',clientX:30,clientY:30});
        await button.dispatchEvent('pointermove', {isPrimary:true,pointerType:'touch',clientX:30,clientY:80});
        await p.waitForTimeout(650);
        assert.equal(await p.locator('#category-modal').isVisible(), false);
        await button.dispatchEvent('pointercancel', {isPrimary:true,pointerType:'touch'});
        await p.screenshot({path:screenshotDir+'/category-picker.png'});
        await t.close();
    });
    await run('income category edits from transaction modal, preserves selected expense and unchanged color', async () => {
        const seed = fixture(); seed.transactions.push({id:4,type:'income',from:'a',amount:500,date:today,categoryId:'salary',comment:''});
        const t = await open(seed), p = t.page;
        await p.evaluate(() => openEditModal(4));
        await p.click('#edit-category-picker-btn');
        assert.equal(await p.locator('.category-choice').count(), 1);
        await p.locator('.category-edit-btn').click();
        await p.fill('#new-cat-name', 'Доход от работы'); await p.fill('#new-cat-icon', '💼');
        await p.screenshot({path:screenshotDir+'/category-edit.png'});
        await p.click('#save-cat-btn');
        await p.locator('.category-choice').click();
        assert((await p.locator('#edit-category-picker-btn').textContent()).includes('Доход от работы'));
        await p.click('#save-edit-btn');
        assert.equal(await p.evaluate(() => categories.income[0].color), '#3aa875');
        assert.equal(await p.evaluate(() => transactions.find(t => t.id === 4).categoryId), 'salary');
        assert.equal(await p.evaluate(() => categories.expense[0].name), 'Продукты');
        await t.close();
    });
    await run('category creation in empty picker and write failure preserve editor state', async () => {
        const seed = fixture(); seed.categories.expense = []; seed.transactions = [];
        const t = await open(seed), p = t.page;
        await p.click('#category-picker-btn'); await p.click('#picker-add-category');
        await p.fill('#new-cat-name', 'Первая'); await p.click('#save-cat-btn');
        await p.locator('.category-choice').click();
        assert((await p.locator('#category-picker-btn').textContent()).includes('Первая'));
        await p.click('#category-picker-btn'); await p.locator('.category-edit-btn').click();
        await p.fill('#new-cat-name', 'Не сохранена');
        await p.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); }; });
        await p.click('#save-cat-btn');
        assert.equal(await p.locator('#category-modal').isVisible(), true);
        assert.equal(await p.evaluate(() => categories.expense[0].name), 'Первая');
        await t.close();
    });
    await run('corrupt startup keeps raw data and blocks destructive replacement by ordinary edits',async()=>{
        const t=await open({...fixture(),transactions:'{broken'}),p=t.page;
        assert.equal(await p.locator('#storage-notice').isVisible(),true);
        await p.fill('#amount','123');await p.click('#transaction-form .submit-btn');
        assert.equal(await p.evaluate(()=>localStorage.getItem('transactions')),'{broken');
        assert.equal(await p.evaluate(()=>localStorage.getItem('budgetDataV2')),null);
        await importFile(p,fixture());assert.equal(await p.locator('#storage-notice').isVisible(),false);
        await t.close();
    });
    console.log('Screenshots: '+screenshotDir);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
