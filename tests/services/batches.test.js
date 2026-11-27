/*
 * Phase 13 services on the Mock adapter: restock receipts make batches (one id per delivery, per-supplier counter),
 * sales take oldest first with exact cost, cancel puts stock back, old stock becomes the first batch (D-055),
 * open sack carries batch cost, charges on a sale (D-054).
 * Invariant after every scenario: item qty == Σ movements and Σ batches == item qty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateSupplierForm, validateRestockForm } from '../../src/domain/purchasing.js';
import { createItem, adjustStock, openSack, updateBatch, ensureBatches, updateItem } from '../../src/data/inventoryService.js';
import { createSupplier, createRestock, receiveRestock, ensureSupplierCodes } from '../../src/data/purchasingService.js';
import { createSale, cancelSale } from '../../src/data/salesService.js';
import { coveredH } from '../../src/domain/batches.js';
import { salesSummary } from '../../src/domain/reports.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const D = '2026-11-10';
const TODAY = '2026-11-27';

async function setup() {
  const db = createMockAdapter();
  const item = (o) => validateItemForm({ unit: 'SACK', sackWeightKg: '50', priceC: '1500', costC: '1400', minStock: '', openingDate: D, ...o }).data;
  const sackId = await createItem(db, actor, item({ name: 'Dinorado 50kg Sack', openingQty: '' }));
  const kgId = await createItem(db, actor, item({ name: 'Dinorado per KG', unit: 'KG', priceC: '35', costC: '30', openingQty: '', linkedSackItemId: sackId }));
  const supId = await createSupplier(db, actor, validateSupplierForm({ name: 'Golden Grains' }).data);
  const sup2 = await createSupplier(db, actor, validateSupplierForm({ name: 'Second Supplier' }).data);
  return { db, sackId, kgId, supId, sup2 };
}

async function receive(db, supId, itemId, qty, cost, price, date = D) {
  const items = Object.fromEntries((await db.query('items', {})).map((i) => [i.id, i]));
  const { data } = validateRestockForm({ supplierId: supId, orderDate: date, lines: [{ itemId, qty: String(qty), unitCost: String(cost) }] }, items);
  const id = await createRestock(db, actor, data);
  const qtyH = items[itemId].unit === 'SACK' ? qty * 100 : qty * 100;
  return { id, ...(await receiveRestock(db, actor, id, { date, lines: [{ itemId, qtyH, unitCostC: cost * 100, priceC: price * 100 }] })) };
}

async function assertBatches(db) {
  for (const item of await db.query('items', {})) {
    const ms = await db.query('inventoryMovements', { where: [['itemId', '==', item.id]] });
    assert.equal(ms.reduce((s, m) => s + m.qtyDeltaH, 0), item.qtyH, `ledger ${item.name}`);
    assert.ok(coveredH(item) <= item.qtyH, `batches ≤ stock ${item.name}`);
  }
}

test('suppliers get codes; each delivery gets RJ-RS-<code>-NNNN counted per supplier', async () => {
  const { db, sackId, supId, sup2 } = await setup();
  assert.equal((await db.get('suppliers', supId)).code, 'SUP001');
  assert.equal((await db.get('suppliers', sup2)).code, 'SUP002');
  assert.equal((await receive(db, supId, sackId, 2, 1400, 1500)).batchId, 'RJ-RS-SUP001-0001');
  assert.equal((await receive(db, supId, sackId, 3, 1450, 1550)).batchId, 'RJ-RS-SUP001-0002');
  assert.equal((await receive(db, sup2, sackId, 1, 1460, 1560)).batchId, 'RJ-RS-SUP002-0001');
  const s = await db.get('items', sackId);
  assert.deepEqual(s.batches.map((b) => [b.id, b.qtyH, b.unitCostC, b.priceC]), [
    ['RJ-RS-SUP001-0001', 200, 140000, 150000], ['RJ-RS-SUP001-0002', 300, 145000, 155000], ['RJ-RS-SUP002-0001', 100, 146000, 156000]]);
  const r = (await db.query('restocks', {})).find((x) => x.receipts[0].batchId === 'RJ-RS-SUP001-0002');
  assert.equal(r.receipts[0].lines[0].priceC, 155000);
  await assertBatches(db);
});

test('suppliers made before codes get them in order (ensureSupplierCodes, or on first receipt)', async () => {
  const db = createMockAdapter();
  await db.runTransaction(async (tx) => {
    tx.set('suppliers', 'a', { name: 'A', nameLower: 'a', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z' });
    tx.set('suppliers', 'b', { name: 'B', nameLower: 'b', status: 'ACTIVE', createdAt: '2026-02-01T00:00:00Z' });
  });
  assert.deepEqual(await ensureSupplierCodes(db, actor), { changed: 2 });
  assert.equal((await db.get('suppliers', 'a')).code, 'SUP001');
  assert.equal((await db.get('suppliers', 'b')).code, 'SUP002');
  const c = await createSupplier(db, actor, validateSupplierForm({ name: 'C' }).data);
  assert.equal((await db.get('suppliers', c)).code, 'SUP003');
});

test('sale takes oldest first with weighted price and exact cost; cancel returns stock to the same batches', async () => {
  const { db, sackId, supId } = await setup();
  await receive(db, supId, sackId, 2, 1400, 1500);
  await receive(db, supId, sackId, 3, 1450, 1550);
  const r = await createSale(db, actor, { saleDate: '2026-11-20', customerId: 'WALK_IN', lines: [{ itemId: sackId, qtyH: 500 }], terms: 'FULL', method: 'CASH' }, undefined, TODAY);
  const sale = await db.get('sales', r.saleId);
  assert.equal(sale.lines[0].unitPriceC, 153000);
  assert.equal(sale.totalC, 765000);
  assert.equal(sale.costC, 715000);
  assert.deepEqual(sale.lines[0].batches.map((b) => [b.batchId, b.qtyH]), [['RJ-RS-SUP001-0001', 200], ['RJ-RS-SUP001-0002', 300]]);
  assert.equal((await db.get('items', sackId)).batches.length, 0);
  const mv = (await db.query('inventoryMovements', {})).find((m) => m.type === 'SALE');
  assert.equal(mv.batches.length, 2);
  await assertBatches(db);
  await cancelSale(db, actor, r.saleId, 'Wrong item');
  assert.deepEqual((await db.get('items', sackId)).batches.map((b) => [b.id, b.qtyH]), [['RJ-RS-SUP001-0001', 200], ['RJ-RS-SUP001-0002', 300]]);
  await assertBatches(db);
});

test('owner override: a line can take from a chosen batch', async () => {
  const { db, sackId, supId } = await setup();
  await receive(db, supId, sackId, 2, 1400, 1500);
  await receive(db, supId, sackId, 3, 1450, 1550);
  const r = await createSale(db, actor, { saleDate: '2026-11-20', customerId: 'WALK_IN', lines: [{ itemId: sackId, qtyH: 100, batchId: 'RJ-RS-SUP001-0002' }], terms: 'FULL', method: 'CASH' }, undefined, TODAY);
  const sale = await db.get('sales', r.saleId);
  assert.equal(sale.lines[0].unitPriceC, 155000);
  assert.equal(sale.lines[0].batchPicked, 'RJ-RS-SUP001-0002');
  assert.deepEqual((await db.get('items', sackId)).batches.map((b) => b.qtyH), [200, 200]);
});

test('D-055: stock from before batches becomes the first batch — on sale, on receipt and via ensureBatches', async () => {
  const { db, sackId, supId } = await setup();
  // Simulate an item from an older version: stock but no batches field.
  await db.runTransaction(async (tx) => { tx.update('items', sackId, { qtyH: 400, batches: null }); });
  await receive(db, supId, sackId, 1, 1450, 1550);
  const it = await db.get('items', sackId);
  assert.deepEqual(it.batches.map((b) => [b.id, b.qtyH, b.unitCostC, b.priceC, b.source]), [['RJ-RS-OLD-0001', 400, 140000, 150000, 'OLD'], ['RJ-RS-SUP001-0001', 100, 145000, 155000, 'RESTOCK']]);
  // stock not in a batch again (e.g. old data) is added to the first batch
  await db.runTransaction(async (tx) => { tx.update('items', sackId, { qtyH: 700 }); });
  assert.deepEqual(await ensureBatches(db, actor, TODAY), { changed: 1 });
  assert.equal((await db.get('items', sackId)).batches[0].qtyH, 600);
});

test('sale of an item with no batches registers its stock first (nothing blocked)', async () => {
  const { db } = await setup();
  await db.runTransaction(async (tx) => { tx.set('items', 'legacy', { name: 'Legacy rice', nameLower: 'legacy rice', unit: 'KG', qtyH: 1000, priceC: 5000, costC: 4000, minStockH: 0, status: 'ACTIVE' }); });
  const r = await createSale(db, actor, { saleDate: '2026-11-20', customerId: 'WALK_IN', lines: [{ itemId: 'legacy', qtyH: 250 }], terms: 'FULL', method: 'CASH' }, undefined, TODAY);
  const sale = await db.get('sales', r.saleId);
  assert.equal(sale.lines[0].batches[0].batchId, 'RJ-RS-OLD-0001');
  assert.equal(sale.costC, 10000);
  assert.equal((await db.get('items', 'legacy')).batches[0].qtyH, 750);
});

test('new item opening stock is its first batch; adjustments use batches; batch price edit', async () => {
  const db = createMockAdapter();
  const id = await createItem(db, actor, validateItemForm({ name: 'Jasmine', unit: 'KG', priceC: '60', costC: '50', minStock: '', openingQty: '10', openingDate: D }).data);
  const it = await db.get('items', id);
  assert.deepEqual(it.batches.map((b) => [b.id, b.qtyH, b.source]), [['RJ-RS-OLD-0001', 1000, 'OPENING']]);
  await adjustStock(db, actor, { itemId: id, direction: 'OUT', qtyH: 200, reason: 'Spillage', note: '', date: D });
  assert.equal((await db.get('items', id)).batches[0].qtyH, 800);
  await adjustStock(db, actor, { itemId: id, direction: 'IN', qtyH: 100, reason: 'Count correction', note: '', date: D });
  assert.equal((await db.get('items', id)).batches[0].qtyH, 900);
  await updateBatch(db, actor, id, 'RJ-RS-OLD-0001', { unitCost: '50', price: '65' });
  assert.equal((await db.get('items', id)).batches[0].priceC, 6500);
  await assertBatches(db);
});

test('open sack: KG batch keeps the sack batch id and its cost per kg', async () => {
  const { db, sackId, kgId, supId } = await setup();
  await receive(db, supId, sackId, 2, 1400, 1500);
  await openSack(db, actor, { sackItemId: sackId, sacks: 1, date: D });
  const kg = await db.get('items', kgId);
  assert.deepEqual(kg.batches.map((b) => [b.id, b.qtyH, b.unitCostC, b.priceC]), [['RJ-RS-SUP001-0001', 5000, 2800, 3500]]);
  assert.equal(kg.qtyH, 5000);
  await assertBatches(db);
});

test('D-054: charges are in the total and balance, not discounted, reported separately', async () => {
  const { db, sackId, supId } = await setup();
  await receive(db, supId, sackId, 2, 1400, 1500);
  const r = await createSale(db, actor, {
    saleDate: '2026-11-20', customerId: 'WALK_IN', lines: [{ itemId: sackId, qtyH: 100 }], terms: 'FULL', method: 'CASH',
    discount: { type: 'FIXED', value: 10000 }, charges: [{ name: 'Delivery fee', amountC: 5000 }],
  }, undefined, TODAY);
  const sale = await db.get('sales', r.saleId);
  assert.equal(sale.totalC, 150000 - 10000 + 5000);
  assert.deepEqual(sale.charges, [{ name: 'Delivery fee', amountC: 5000 }]);
  assert.equal(sale.chargesC, 5000);
  const s = salesSummary(await db.query('sales', {}), '2026-11-01', '2026-11-30');
  assert.equal(s.chargesC, 5000);
  assert.equal(s.productRevenueC, 140000);
  assert.equal(s.revenueC, 145000);
});

test('updating item defaults does not touch batches', async () => {
  const { db, sackId, supId } = await setup();
  await receive(db, supId, sackId, 2, 1400, 1500);
  const it = await db.get('items', sackId);
  const { data } = validateItemForm({ ...it, unit: 'SACK', sackWeightKg: '50', priceC: '1600', costC: '1400', minStock: '' }, { isNew: false });
  await updateItem(db, actor, sackId, data);
  assert.equal((await db.get('items', sackId)).batches[0].priceC, 150000);
});
