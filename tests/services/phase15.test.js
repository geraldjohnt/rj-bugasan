/*
 * Phase 15 services on the Mock adapter: per-item expense and credit price at receiving (D-065, D-066),
 * automatic SKUs (D-067).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateItemForm, skuCode, formatSku } from '../../src/domain/inventory.js';
import { validateSupplierForm, validateRestockForm, expenseBreakdown, receiptExpensesC, expenseNameSuggestions } from '../../src/domain/purchasing.js';
import { createItem, updateItem, ensureSkus } from '../../src/data/inventoryService.js';
import { createSupplier, createRestock, receiveRestock, editReceipt } from '../../src/data/purchasingService.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const D = '2026-11-10';
const item = (o) => validateItemForm({ unit: 'SACK', sackWeightKg: '50', priceC: '2800', costC: '2500', minStock: '', openingDate: D, openingQty: '', ...o }).data;

async function setup() {
  const db = createMockAdapter();
  const sackId = await createItem(db, actor, item({ name: 'Dinorado 50kg Sack', variety: 'Dinorado', installmentPriceC: '3000' }));
  const otherId = await createItem(db, actor, item({ name: 'Jasmine 25kg Sack', variety: 'Jasmine', sackWeightKg: '25', costC: '1000', priceC: '1200' }));
  const supId = await createSupplier(db, actor, validateSupplierForm({ name: 'Golden Grains' }).data);
  const items = Object.fromEntries((await db.query('items', {})).map((i) => [i.id, i]));
  const { data } = validateRestockForm({ supplierId: supId, orderDate: D, lines: [{ itemId: sackId, qty: '150', unitCost: '2500' }, { itemId: otherId, qty: '10', unitCost: '1000' }] }, items);
  const rid = await createRestock(db, actor, data);
  return { db, sackId, otherId, rid };
}
const restockExpenses = async (db) => (await db.query('expenses', {})).filter((e) => e.category === 'Restock');

test('D-065 breakdown: the line expense stays on its line; shared lines are split by value', () => {
  // 150 sacks × 2,500 with ₱1,500 own expense (₱10/sack) + ₱6,000 shared → ₱40 + ₱10 = ₱50/sack
  const [a, b] = expenseBreakdown([{ qtyH: 15000, unitCostC: 250000, priceC: 280000, expenseC: 150000 }, { qtyH: 0, unitCostC: 100000, priceC: null, expenseC: 50000 }], 600000);
  assert.equal(a.shareC, 600000); assert.equal(a.itemExpenseC, 150000);
  assert.equal(a.perUnitC, 5000); assert.equal(a.landedC, 255000); assert.equal(a.profitC, 25000);
  assert.equal(b.landedC, null);
  assert.equal(receiptExpensesC({ expenses: [{ amountC: 100 }], lines: [{ expenseC: 50 }, {}] }), 150);
});

test('D-065/D-066 receiving: line expense becomes a linked Restock expense; credit price updates the item', async () => {
  const { db, sackId, otherId, rid } = await setup();
  const r = await receiveRestock(db, actor, rid, { date: D, lines: [
    { itemId: sackId, qtyH: 15000, unitCostC: 250000, priceC: 280000, expenseC: 150000, creditC: 310000 },
    { itemId: otherId, qtyH: 1000, unitCostC: 100000, priceC: 120000, expenseC: 0, creditC: null },
  ], expenses: [{ name: 'Trucking', amountC: 600000 }] });
  assert.equal(r.expensesC, 750000);
  const ex = await restockExpenses(db);
  assert.equal(ex.length, 2);
  const own = ex.find((e) => e.itemId === sackId);
  assert.equal(own.amountC, 150000); assert.equal(own.note, 'Dinorado 50kg Sack'); assert.equal(own.restockId, rid); assert.equal(own.batchId, r.batchId);
  const rc = (await db.get('restocks', rid)).receipts[0];
  const line = rc.lines.find((l) => l.itemId === sackId);
  assert.equal(line.expenseC, 150000); assert.equal(line.expenseId, own.id);
  assert.equal(rc.lines.find((l) => l.itemId === otherId).expenseC, undefined);
  assert.equal(receiptExpensesC(rc), 750000);
  // batch cost stays the unit cost (no double counting)
  assert.equal((await db.get('items', sackId)).batches[0].unitCostC, 250000);
  // credit price: changed on the sack item, untouched on the other
  assert.equal((await db.get('items', sackId)).installmentPriceC, 310000);
  assert.equal((await db.get('items', otherId)).installmentPriceC, null);
  const log = (await db.query('activityLogs', {})).find((l) => l.action === 'RESTOCK_RECEIVE');
  assert.match(log.summary, /credit price ₱3,000\.00 → ₱3,100\.00/);
  assert.match(log.summary, /Dinorado 50kg Sack ₱1,500\.00/);
  // own-expense names are not offered as suggestions
  assert.deepEqual(expenseNameSuggestions(await db.query('expenses', {})).map((s) => s.name), ['Trucking']);
});

test('D-065/D-066 edit delivery: line expense added, changed and removed; credit price updates the item', async () => {
  const { db, sackId, otherId, rid } = await setup();
  const r = await receiveRestock(db, actor, rid, { date: D, lines: [{ itemId: sackId, qtyH: 1000, unitCostC: 250000, priceC: 280000, expenseC: 10000 }, { itemId: otherId, qtyH: 500, unitCostC: 100000, priceC: 120000 }] });
  const lines = (o = {}) => [{ itemId: sackId, unitCostC: 250000, priceC: 280000, ...o.sack }, { itemId: otherId, unitCostC: 100000, priceC: 120000, ...o.other }];
  // change sack 100 → 200, add other 50, credit price on other
  const e1 = await editReceipt(db, actor, rid, r.batchId, { lines: lines({ sack: { expenseC: 20000 }, other: { expenseC: 5000, creditC: 130000 } }), expenses: [] });
  assert.equal(e1.changed, true);
  let ex = await restockExpenses(db);
  assert.equal(ex.find((e) => e.itemId === sackId).amountC, 20000);
  const otherExp = ex.find((e) => e.itemId === otherId);
  assert.equal(otherExp.amountC, 5000); assert.equal(otherExp.status, 'ACTIVE');
  assert.equal((await db.get('items', otherId)).installmentPriceC, 130000);
  let rc = (await db.get('restocks', rid)).receipts[0];
  assert.equal(rc.lines.find((l) => l.itemId === otherId).expenseId, otherExp.id);
  // remove the sack's own expense → voided
  await editReceipt(db, actor, rid, r.batchId, { lines: lines({ sack: { expenseC: 0 }, other: { expenseC: 5000, creditC: 130000 } }), expenses: [] });
  ex = await restockExpenses(db);
  assert.equal(ex.find((e) => e.itemId === sackId).status, 'VOIDED');
  rc = (await db.get('restocks', rid)).receipts[0];
  assert.equal(rc.lines.find((l) => l.itemId === sackId).expenseC, undefined);
  // same values again → nothing changed
  assert.equal((await editReceipt(db, actor, rid, r.batchId, { lines: lines({ sack: { expenseC: 0 }, other: { expenseC: 5000, creditC: 130000 } }), expenses: [] })).changed, false);
  const log = (await db.query('activityLogs', {})).filter((l) => l.action === 'RESTOCK_RECEIPT_EDIT')[0];
  assert.match(log.summary, /added Jasmine 25kg Sack expense ₱50\.00/);
  assert.match(log.summary, /credit price — → ₱1,300\.00/);
});

test('D-067 SKU code: variety letters, else item name; padded', () => {
  assert.equal(skuCode({ variety: 'Dinorado', name: 'x' }), 'DIN');
  assert.equal(skuCode({ variety: '', name: 'Malagkit per KG' }), 'MAL');
  assert.equal(skuCode({ variety: '7-Tonner', name: 'x' }), 'TON');
  assert.equal(skuCode({ name: 'A1' }), 'AXX');
  assert.equal(formatSku('DIN', 7), 'RJ-DIN-007');
  assert.equal(formatSku('DIN', 1234), 'RJ-DIN-1234');
  assert.equal(validateItemForm({ name: 'x', unit: 'KG', priceC: '1', costC: '1', sku: 'rj din 1' }).errors.sku, 'Use letters, digits and dashes only.');
  assert.equal(validateItemForm({ name: 'x', unit: 'KG', priceC: '1', costC: '1', sku: ' rj-din-9 ' }).data.sku, 'RJ-DIN-9');
});

test('D-067 SKUs: automatic per code, typed ones kept and unique, blank keeps it, back-fill of old items', async () => {
  const db = createMockAdapter();
  const a = await createItem(db, actor, item({ name: 'Dinorado 50kg Sack', variety: 'Dinorado' }));
  const typed = await createItem(db, actor, item({ name: 'Dinorado 25kg Sack', variety: 'Dinorado', sku: 'rj-din-002' }));
  const b = await createItem(db, actor, item({ name: 'Dinorado per KG', variety: 'Dinorado', unit: 'KG', sackWeightKg: '' }));
  const c = await createItem(db, actor, item({ name: 'Malagkit per KG', unit: 'KG', sackWeightKg: '' }));
  assert.equal((await db.get('items', a)).sku, 'RJ-DIN-001');
  assert.equal((await db.get('items', typed)).sku, 'RJ-DIN-002');
  assert.equal((await db.get('items', b)).sku, 'RJ-DIN-003', 'skips the typed RJ-DIN-002');
  assert.equal((await db.get('items', c)).sku, 'RJ-MAL-001');
  await assert.rejects(createItem(db, actor, item({ name: 'Other', sku: 'RJ-DIN-001' })), { code: 'DUPLICATE_SKU' });
  // edit: duplicate refused, own SKU kept, cleared → new automatic one
  const form = (id, o) => ({ ...item({ name: 'Malagkit per KG', unit: 'KG', sackWeightKg: '' }), ...o });
  await assert.rejects(updateItem(db, actor, c, form(c, { sku: 'rj-din-003' })), { code: 'DUPLICATE_SKU' });
  await updateItem(db, actor, c, form(c, { sku: '' }));
  assert.equal((await db.get('items', c)).sku, 'RJ-MAL-001', 'blank keeps the SKU');
  await updateItem(db, actor, c, form(c, { sku: 'MAL-SPECIAL' }));
  assert.equal((await db.get('items', c)).sku, 'MAL-SPECIAL');
  // back-fill: items stored without an SKU (made before Phase 15)
  const copy = { ...(await db.get('items', b)), name: 'Jasmine 25kg Sack', nameLower: 'jasmine 25kg sack', variety: 'Jasmine', sku: '' };
  delete copy.id;
  await db.update('items', a, { sku: '' });
  await db.set('items', 'old1', copy);
  const r = await ensureSkus(db, actor);
  assert.equal(r.changed, 2);
  assert.equal((await db.get('items', a)).sku, 'RJ-DIN-004', 'counter never reuses numbers');
  assert.equal((await db.get('items', 'old1')).sku, 'RJ-JAS-001');
  assert.equal((await ensureSkus(db, actor)).changed, 0);
  assert.ok((await db.query('activityLogs', {})).some((l) => l.action === 'ITEM_SKUS'));
});

test('sample data (D-025) covers Phase 15: SKUs, item expense, credit price from receiving, promises', async () => {
  const { loadSampleData } = await import('../../src/data/sampleData.js');
  const { currentPromises } = await import('../../src/domain/promises.js');
  const db = createMockAdapter();
  const asOf = '2026-11-28';
  await loadSampleData(db, actor, asOf);
  const items = await db.query('items', {});
  assert.ok(items.every((i) => /^RJ-[A-Z]{3}-\d{3}$/.test(i.sku)), 'every sample item has an automatic SKU');
  assert.equal(items.find((i) => i.name === 'Dinorado 50kg Sack').sku, 'RJ-DIN-001');
  assert.equal(items.find((i) => i.name === 'Malagkit per KG').installmentPriceC, 8800);
  assert.ok((await db.query('expenses', {})).some((e) => e.itemId && e.amountC === 25000));
  const rows = await db.query('installments', {});
  const cur = currentPromises(rows, asOf);
  assert.ok(cur.some((c) => c.promise.status === 'OPEN' && c.promise.date === '2026-11-30'));
  assert.ok(rows.some((r) => (r.promises || []).length >= 2));
  await loadSampleData(db, actor, asOf); // idempotent
  assert.equal((await db.query('items', {})).length, items.length);
});
