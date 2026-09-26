// Run with Node: node --test tests/data.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
const fixture = () => ({ accounts: [{ id: 'a', name: 'Основной', baseBalance: 1000 }],
    categories: { expense: [{ id: 'food', name: 'Еда', icon: '🍔', color: '#f00' }], income: [] },
    transactions: [{ id: 1, from: 'a', type: 'expense', amount: 100.25, date: '2026-09-26', categoryId: 'food', comment: 'Подарок «маме»' }] });
function environment(raw = {}, map = new Map(Object.entries(raw))) {
    let failWrite = false;
    const context = vm.createContext({ console, localStorage: {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => { if (failWrite) throw new Error('QuotaExceededError'); map.set(key, value); }
    } });
    vm.runInContext(code + '\n globalThis.api = FinanceData;', context);
    return { api: context.api, map, failWrite(value = true) { failWrite = value; } };
}
test('legacy data loads without writing, first save is atomic and keeps originals', () => {
    const raw = Object.fromEntries(Object.entries(fixture()).map(([k, v]) => [k, JSON.stringify(v)]));
    const { api, map } = environment(raw);
    const data = api.load();
    assert.equal(map.has('budgetDataV2'), false);
    assert.equal(data.transactions[0].comment, 'Подарок «маме»');
    api.save(data);
    for (const [k, v] of Object.entries(raw)) assert.equal(map.get(k), v);
    assert.equal(JSON.parse(map.get('budgetDataV2')).transactions[0].amount, 100.25);
});
test('invalid backup is rejected without any writes', () => {
    const { api, map } = environment(); api.load(); api.save(fixture());
    const before = JSON.stringify([...map]);
    for (const invalid of [{ ...fixture(), categories: { expense: 'wrong', income: [] } },
        { transactions: [] }, { ...fixture(), accounts: [] },
        { ...fixture(), transactions: [{ ...fixture().transactions[0], amount: null }] },
        { ...fixture(), transactions: [{ ...fixture().transactions[0], date: '2026-02-30' }] }]) {
        assert.throws(() => api.save(invalid, true));
        assert.equal(JSON.stringify([...map]), before);
    }
});
test('write failure leaves last successful snapshot intact and can be retried', () => {
    const env = environment(); env.api.load(); env.api.save(fixture());
    const before = env.map.get('budgetDataV2'); env.failWrite();
    assert.throws(() => env.api.save({ ...fixture(), transactions: [] }), /Не удалось сохранить/);
    assert.equal(env.map.get('budgetDataV2'), before);
    env.failWrite(false);
    env.api.save({ ...fixture(), transactions: [] });
    assert.equal(JSON.parse(env.map.get('budgetDataV2')).transactions.length, 0);
});
test('broken stored JSON is retained, edits blocked and raw copy available', () => {
    const { api, map } = environment({ transactions: '{broken' }); api.load();
    assert.match(api.error, /не перезаписаны/);
    assert.throws(() => api.save(fixture()));
    assert.equal(map.get('transactions'), '{broken');
    assert.equal(api.recovery.rawStorage.transactions, '{broken');
    api.save(fixture(), true);
    assert.equal(api.error, '');
});
test('legacy base balances and category array migrate together', () => {
    const old = fixture(); old.categories = old.categories.expense;
    delete old.accounts; old.baseBalances = { main: 500, savings: 20, grandma: 0 };
    old.transactions[0].from = 'main';
    const env = environment(); env.api.load();
    const restored = env.api.save(old, true);
    assert.equal(restored.accounts[0].baseBalance, 500);
    assert.equal(restored.categories.expense[0].id, 'food');
    assert.equal(restored.categories.income.length, 0);
});
test('comma decimals, spaces, invalid values and exact kopecks', () => {
    const { api } = environment();
    assert.equal(api.parseMoney('1 000,50'), 1000.5);
    assert.equal(api.parseMoney('0.01'), 0.01);
    assert.equal(api.parseMoney('-20,50'), -20.5);
    for (const input of ['', ' ', 'abc', 'Infinity', '1.001', '12abc', '1e3']) assert.equal(api.parseMoney(input), null);
    assert.equal((api.cents(0.1) + api.cents(0.2)) / 100, 0.3);
});
test('other tab changes cannot be overwritten by a stale snapshot', () => {
    const map = new Map();
    const first = environment({}, map), second = environment({}, map);
    first.api.load(); second.api.load(); first.api.save(fixture());
    assert.throws(() => second.api.save(fixture()), /другой вкладке/);
});
test('historical deleted references and quote characters survive round trip', () => {
    const { api } = environment(); const old = fixture();
    old.transactions[0].from = 'deleted'; old.transactions[0].categoryId = '';
    old.accounts[0].name = '<b>Банк & счёт</b>';
    const data = api.normalize(JSON.parse(JSON.stringify(old)));
    assert.equal(data.transactions[0].from, 'deleted');
    assert.equal(data.transactions[0].categoryId, '');
    assert.equal(data.accounts[0].name, '<b>Банк & счёт</b>');
});
test('duplicate operation IDs and negative expenses are rejected', () => {
    const { api } = environment();
    const data = fixture(); data.transactions.push({ ...data.transactions[0] });
    assert.throws(() => api.normalize(data), /повторяются/);
    data.transactions = [{ ...data.transactions[0], amount: -100 }];
    assert.throws(() => api.normalize(data), /положительная/);
});
