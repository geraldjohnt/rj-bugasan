/*
 * Phase 14 services on the Mock adapter: expenses entered at receiving become linked "Restock" expenses (D-060, D-062);
 * editing a received delivery changes batch cost/price, past sale-line costs and the linked expenses (D-063).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateSupplierForm, validateRestockForm } from '../../src/domain/purchasing.js';
import { createItem } from '../../src/data/inventoryService.js';
import { createSupplier, createRestock, receiveRestock, editReceipt, voidExpense } from '../../src/data/purchasingService.js';
import { createSale, cancelSale } from '../../src/data/salesService.js';
import { profitAndLoss } from '../../src/domain/reports.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const D = '2026-11-10';
const TODAY = '2026-11-28';

async function setup() {
  const db = createMockAdapter();
  const item = (o) => validateItemForm({ unit: 'SACK', sackWeightKg: '50', priceC: '2800', costC: '2500', minStock: '', openingDate: D, openingQty: '', ...o }).data;
  const sackId = await createItem(db, actor, item({ name: 'Dinorado 50kg Sack' }));
  const otherId = await createItem(db, actor, item({ name: 'Jasmine 25kg Sack', sackWeightKg: '25', costC: '1000', priceC: '1200' }));
  const supId = await createSupplier(db, actor, validateSupplierForm({ name: 'Golden Grains' }).data);
  const items = Object.fromEntries((await db.query('items', {})).map((i) => [i.id, i]));
  const { data } = validateRestockForm({ supplierId: supId, orderDate: D, lines: [{ itemId: sackId, qty: '150', unitCost: '2500' }, { itemId: otherId, qty: '10', unitCost: '1000' }] }, items);
  const rid = await createRestock(db, actor, data);
  return { db, sackId, otherId, rid };
}

const restockExpenses = async (db) => (await db.query('expenses', {})).filter((e) => e.category === 'Restock');

test('receiving with expenses: one Restock expense per line, linked to the restock and delivery', async () => {
  const { db, sackId, otherId, rid } = await setup();
  const r = await receiveRestock(db, actor, rid, { date: D, lines: [{ itemId: sackId, qtyH: 15000, unitCostC: 250000, priceC: 280000 }, { itemId: otherId, qtyH: 1000, unitCostC: 100000, priceC: 120000 }],
    expenses: [{ name: 'Trucking', amountC: 400000 }, { name: 'Labor', amountC: 200000 }] });
  assert.equal(r.expensesC, 600000);
  const ex = await restockExpenses(db);
  assert.equal(ex.length, 2);
  for (const e of ex) { assert.equal(e.restockId, rid); assert.equal(e.batchId, r.batchId); assert.equal(e.date, D); assert.equal(e.status, 'ACTIVE'); }
  const restock = await db.get('restocks', rid);
  assert.deepEqual(restock.receipts[0].expenses.map((e) => [e.name, e.amountC, !!e.expenseId]), [['Trucking', 400000, true], ['Labor', 200000, true]]);
  // D-061: batch cost stays the supplier unit cost
  assert.equal((await db.get('items', sackId)).batches[0].unitCostC, 250000);
  // net profit counts the expenses once
  const pl = profitAndLoss([], await db.query('expenses', {}), D, D);
  assert.equal(pl.expensesC, 600000); assert.equal(pl.byCategory.Restock, 600000);
  // cannot be voided from the Expenses page
  await assert.rejects(voidExpense(db, actor, ex[0].id, 'x'), { code: 'RESTOCK_EXPENSE' });
  assert.ok((await db.query('activityLogs', {})).find((l) => l.action === 'RESTOCK_RECEIVE').summary.includes('Trucking'));
});

test('receiving without expenses still works', async () => {
  const { db, sackId, rid } = await setup();
  await receiveRestock(db, actor, rid, { date: D, lines: [{ itemId: sackId, qtyH: 100, unitCostC: 250000, priceC: 280000 }] });
  assert.equal((await restockExpenses(db)).length, 0);
  assert.deepEqual((await db.get('restocks', rid)).receipts[0].expenses, []);
});

test('edit after receiving: cost changes batch and past sale costs; price changes batch; expenses updated, voided, added', async () => {
  const { db, sackId, otherId, rid } = await setup();
  const { batchId } = await receiveRestock(db, actor, rid, { date: D, lines: [{ itemId: sackId, qtyH: 15000, unitCostC: 250000, priceC: 280000 }, { itemId: otherId, qtyH: 1000, unitCostC: 100000, priceC: 120000 }],
    expenses: [{ name: 'Trucking', amountC: 400000 }, { name: 'Labor', amountC: 200000 }] });
  const s1 = await createSale(db, actor, { saleDate: '2026-11-12', customerId: 'WALK_IN', lines: [{ itemId: sackId, qtyH: 200 }], terms: 'FULL', method: 'CASH' }, undefined, TODAY);
  const s2 = await createSale(db, actor, { saleDate: '2026-11-13', customerId: 'WALK_IN', lines: [{ itemId: sackId, qtyH: 100 }], terms: 'FULL', method: 'CASH' }, undefined, TODAY);
  await cancelSale(db, actor, s2.saleId, 'Mistake');
  assert.equal((await db.get('sales', s1.saleId)).costC, 500000);
  const restock = await db.get('restocks', rid);
  const [trucking] = restock.receipts[0].expenses;
  const r = await editReceipt(db, actor, rid, batchId, {
    lines: [{ itemId: sackId, unitCostC: 255000, priceC: 290000 }, { itemId: otherId, unitCostC: 100000, priceC: 120000 }],
    expenses: [{ name: 'Trucking', amountC: 450000, expenseId: trucking.expenseId }, { name: 'Fuel', amountC: 50000 }],
  });
  assert.deepEqual(r, { changed: true, salesUpdated: 1 });
  const b = (await db.get('items', sackId)).batches.find((x) => x.id === batchId);
  assert.equal(b.unitCostC, 255000); assert.equal(b.priceC, 290000); assert.equal(b.qtyH, 14800);
  const sale = await db.get('sales', s1.saleId);
  assert.equal(sale.costC, 510000); assert.equal(sale.lines[0].unitCostC, 255000); assert.equal(sale.lines[0].batches[0].unitCostC, 255000);
  assert.equal(sale.totalC, 560000); // price on a saved sale never changes
  assert.equal((await db.get('sales', s2.saleId)).costC, 250000); // cancelled sale untouched
  const ex = await restockExpenses(db);
  const byNote = Object.fromEntries(ex.map((e) => [e.note, e]));
  assert.equal(byNote.Trucking.amountC, 450000); assert.equal(byNote.Trucking.status, 'ACTIVE');
  assert.equal(byNote.Labor.status, 'VOIDED'); assert.match(byNote.Labor.void.reason, /Removed from restock/);
  assert.equal(byNote.Fuel.status, 'ACTIVE'); assert.equal(byNote.Fuel.batchId, batchId);
  const rc = (await db.get('restocks', rid)).receipts[0];
  assert.equal(rc.lines[0].unitCostC, 255000); assert.equal(rc.lines[0].qtyH, 15000);
  assert.deepEqual(rc.expenses.map((e) => [e.name, e.amountC]), [['Trucking', 450000], ['Fuel', 50000]]);
  assert.ok(rc.edited);
  const log = (await db.query('activityLogs', {})).find((l) => l.action === 'RESTOCK_RECEIPT_EDIT');
  assert.match(log.summary, /Trucking ₱4,000\.00 → ₱4,500\.00/);
  assert.match(log.summary, /removed Labor/);
  // nothing changed → no write
  const again = await db.get('restocks', rid);
  assert.deepEqual(await editReceipt(db, actor, rid, batchId, {
    lines: again.receipts[0].lines.map((l) => ({ itemId: l.itemId, unitCostC: l.unitCostC, priceC: l.priceC })), expenses: again.receipts[0].expenses,
  }), { changed: false, salesUpdated: 0 });
});

test('edit works when the order is fully received and when the batch is sold out', async () => {
  const { db, sackId, otherId, rid } = await setup();
  const { batchId } = await receiveRestock(db, actor, rid, { date: D, lines: [{ itemId: sackId, qtyH: 15000, unitCostC: 250000, priceC: 280000 }, { itemId: otherId, qtyH: 1000, unitCostC: 100000, priceC: 120000 }] });
  assert.equal((await db.get('restocks', rid)).status, 'RECEIVED');
  await createSale(db, actor, { saleDate: '2026-11-12', customerId: 'WALK_IN', lines: [{ itemId: otherId, qtyH: 1000 }], terms: 'FULL', method: 'CASH' }, undefined, TODAY);
  const r = await editReceipt(db, actor, rid, batchId, { lines: [{ itemId: otherId, unitCostC: 90000, priceC: 120000 }], expenses: [{ name: 'Trucking', amountC: 100000 }] });
  assert.equal(r.salesUpdated, 1);
  assert.equal((await db.query('sales', {}))[0].costC, 900000);
  assert.equal((await restockExpenses(db)).length, 1);
});
