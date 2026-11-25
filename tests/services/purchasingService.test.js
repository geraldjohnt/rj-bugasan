/*
 * Phase 8–9 services on the Mock adapter: suppliers, restocks (order, edit, receive, cost update, cancel, close),
 * expenses (create, void), custom calendar events, and the sample data for these phases.
 * Invariant after every scenario: item qty == Σ movements; restock received qty == Σ receipt lines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateSupplierForm, validateRestockForm, validateExpenseForm } from '../../src/domain/purchasing.js';
import { validateEventForm } from '../../src/domain/calendar.js';
import { createItem, setItemStatus } from '../../src/data/inventoryService.js';
import {
  createSupplier, updateSupplier, setSupplierStatus, createRestock, updateRestock, receiveRestock, cancelRestock, closeRestock, createExpense, voidExpense,
} from '../../src/data/purchasingService.js';
import { createEvent, updateEvent, deleteEvent } from '../../src/data/calendarService.js';
import { loadSampleData } from '../../src/data/sampleData.js';
import { salesSummary, profitAndLoss } from '../../src/domain/reports.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const D = '2026-11-10';

async function setup() {
  const db = createMockAdapter();
  const item = (o) => validateItemForm({ unit: 'SACK', sackWeightKg: '50', priceC: '3250', costC: '2900', minStock: '', openingDate: D, ...o }).data;
  const sackId = await createItem(db, actor, item({ name: 'Dinorado 50kg Sack', openingQty: '2' }));
  const kgId = await createItem(db, actor, item({ name: 'Dinorado per KG', unit: 'KG', priceC: '68', costC: '58', openingQty: '' }));
  const supId = await createSupplier(db, actor, validateSupplierForm({ name: 'Golden Grains Trading', contactNumber: '0917 555 9000' }).data);
  const items = Object.fromEntries((await db.query('items', {})).map((i) => [i.id, i]));
  const order = (lines, o = {}) => validateRestockForm({ supplierId: supId, orderDate: D, expectedDate: '2026-11-15', notes: '', lines, ...o }, items);
  return { db, sackId, kgId, supId, items, order };
}

async function assertLedger(db) {
  for (const item of await db.query('items', {})) {
    const ms = await db.query('inventoryMovements', { where: [['itemId', '==', item.id]] });
    assert.equal(ms.reduce((s, m) => s + m.qtyDeltaH, 0), item.qtyH, `ledger ${item.name}`);
  }
  for (const r of await db.query('restocks', {})) {
    for (const l of r.lines) {
      const got = (r.receipts || []).flatMap((rc) => rc.lines).filter((x) => x.itemId === l.itemId).reduce((s, x) => s + x.qtyH, 0);
      assert.equal(got, l.qtyReceivedH, `received ${r.id} ${l.itemName}`);
      assert.ok(l.qtyReceivedH <= l.qtyOrderedH);
    }
  }
}

test('supplier: create, edit, archive blocks new orders, restore', async () => {
  const { db, supId, sackId, order } = await setup();
  await updateSupplier(db, actor, supId, validateSupplierForm({ name: 'Golden Grains', contactPerson: 'Mr. Lim' }).data);
  assert.equal((await db.get('suppliers', supId)).contactPerson, 'Mr. Lim');
  await setSupplierStatus(db, actor, supId, 'ARCHIVED');
  await assert.rejects(createRestock(db, actor, order([{ itemId: sackId, qty: '1', unitCost: '2900' }]).data), { code: 'ARCHIVED' });
  await setSupplierStatus(db, actor, supId, 'ACTIVE');
  const logs = (await db.query('activityLogs', {})).map((l) => l.action);
  for (const a of ['SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'SUPPLIER_ARCHIVE', 'SUPPLIER_RESTORE']) assert.ok(logs.includes(a), a);
});

test('restock: order changes no stock; partial receipt with cost update; full receipt; numbers RS-YYYY-NNNNN (BR-060 … BR-062)', async () => {
  const { db, sackId, kgId, order } = await setup();
  const o = order([{ itemId: sackId, qty: '10', unitCost: '2950' }, { itemId: kgId, qty: '50', unitCost: '58' }]);
  assert.deepEqual(o.errors, {});
  const id = await createRestock(db, actor, o.data);
  assert.equal(id, 'RS-2026-00001');
  assert.equal((await db.get('items', sackId)).qtyH, 200, 'ordering does not change stock');
  const id2 = await createRestock(db, actor, order([{ itemId: kgId, qty: '5', unitCost: '58' }]).data);
  assert.equal(id2, 'RS-2026-00002');

  const r1 = await receiveRestock(db, actor, id, { date: '2026-11-12', lines: [{ itemId: sackId, qtyH: 600, unitCostC: 295000, updateCost: true }, { itemId: kgId, qtyH: 0, unitCostC: 5800 }] });
  assert.equal(r1.status, 'PARTIALLY_RECEIVED');
  const sack = await db.get('items', sackId);
  assert.equal(sack.qtyH, 800);
  assert.equal(sack.costC, 295000, 'cost updated when ticked');
  const mv = (await db.query('inventoryMovements', { where: [['refId', '==', id]] }));
  assert.equal(mv.length, 1);
  assert.equal(mv[0].type, 'RESTOCK_RECEIPT');
  assert.equal(mv[0].unitCostC, 295000);

  await assert.rejects(receiveRestock(db, actor, id, { date: '2026-11-13', lines: [{ itemId: sackId, qtyH: 500, unitCostC: 295000 }] }), { code: 'OVER_RECEIVE' });
  await assert.rejects(cancelRestock(db, actor, id, 'Changed mind'), { code: 'HAS_RECEIPTS' });

  const r2 = await receiveRestock(db, actor, id, { date: '2026-11-14', lines: [{ itemId: sackId, qtyH: 400, unitCostC: 300000, updateCost: false }, { itemId: kgId, qtyH: 5000, unitCostC: 5800, updateCost: true }] });
  assert.equal(r2.status, 'RECEIVED');
  assert.equal((await db.get('items', sackId)).costC, 295000, 'cost kept when not ticked');
  assert.equal((await db.get('items', kgId)).qtyH, 5000);
  const r = await db.get('restocks', id);
  assert.equal(r.receipts.length, 2);
  await assert.rejects(receiveRestock(db, actor, id, { date: '2026-11-15', lines: [{ itemId: sackId, qtyH: 100, unitCostC: 1 }] }), { code: 'RESTOCK_CLOSED' });
  const logs = (await db.query('activityLogs', { where: [['entityId', '==', id]] })).map((l) => l.action);
  assert.deepEqual(logs.sort(), ['RESTOCK_CREATE', 'RESTOCK_RECEIVE', 'RESTOCK_RECEIVE']);
  await assertLedger(db);
});

test('restock: edit an open order (BR-061), cancel when nothing received, close a short delivery (D-038)', async () => {
  const { db, sackId, kgId, items, order, supId } = await setup();
  const id = await createRestock(db, actor, order([{ itemId: sackId, qty: '5', unitCost: '2900' }]).data);
  await receiveRestock(db, actor, id, { date: D, lines: [{ itemId: sackId, qtyH: 300, unitCostC: 290000 }] });
  const existing = await db.get('restocks', id);
  const edit = validateRestockForm({ supplierId: supId, orderDate: D, expectedDate: '', notes: 'More kg', lines: [{ itemId: sackId, qty: '4', unitCost: '2900' }, { itemId: kgId, qty: '20', unitCost: '57' }] }, items, existing);
  assert.deepEqual(edit.errors, {});
  await updateRestock(db, actor, id, edit.data);
  let r = await db.get('restocks', id);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].qtyReceivedH, 300);
  assert.equal(r.status, 'PARTIALLY_RECEIVED');
  assert.equal(r.totalCostC, 4 * 290000 + 20 * 5700);
  await assert.rejects(updateRestock(db, actor, id, { ...edit.data, lines: [{ ...edit.data.lines[0], qtyOrderedH: 200 }] }), { code: 'BELOW_RECEIVED' });
  await assert.rejects(closeRestock(db, actor, id, ''), { code: 'REASON_REQUIRED' });
  await closeRestock(db, actor, id, 'Supplier ran out');
  r = await db.get('restocks', id);
  assert.equal(r.status, 'RECEIVED');
  assert.equal(r.closed.short.length, 2);
  await assert.rejects(updateRestock(db, actor, id, edit.data), { code: 'RESTOCK_CLOSED' });

  const id2 = await createRestock(db, actor, order([{ itemId: kgId, qty: '10', unitCost: '58' }]).data);
  await assert.rejects(closeRestock(db, actor, id2, 'x'), { code: 'NOT_PARTIAL' });
  await cancelRestock(db, actor, id2, 'Ordered by mistake');
  assert.equal((await db.get('restocks', id2)).status, 'CANCELLED');
  await assert.rejects(receiveRestock(db, actor, id2, { date: D, lines: [{ itemId: kgId, qtyH: 100, unitCostC: 1 }] }), { code: 'RESTOCK_CLOSED' });

  await setItemStatus(db, actor, kgId, 'ARCHIVED');
  await assert.rejects(createRestock(db, actor, { ...order([{ itemId: sackId, qty: '1', unitCost: '1' }]).data, lines: [{ itemId: kgId, itemName: 'Dinorado per KG', unit: 'KG', qtyOrderedH: 100, qtyReceivedH: 0, unitCostC: 1 }] }), { code: 'ARCHIVED' });
  await assertLedger(db);
});

test('expenses: create and void (never deleted); net profit uses active expenses only', async () => {
  const db = createMockAdapter();
  const a = await createExpense(db, actor, validateExpenseForm({ date: D, category: 'Rent', amount: '5000' }).data);
  const b = await createExpense(db, actor, validateExpenseForm({ date: D, category: 'Delivery/Fuel', amount: '350.50', note: 'Tricycle' }).data);
  await assert.rejects(voidExpense(db, actor, a, ''), { code: 'REASON_REQUIRED' });
  await voidExpense(db, actor, a, 'Entered twice');
  await assert.rejects(voidExpense(db, actor, a, 'again'), { code: 'ALREADY_VOIDED' });
  const all = await db.query('expenses', {});
  assert.equal(all.length, 2);
  assert.equal(all.find((e) => e.id === a).status, 'VOIDED');
  assert.equal(profitAndLoss([], all, '2026-11-01', '2026-11-30').expensesC, 35050);
  assert.ok(b);
});

test('custom calendar events: create, edit, delete, validation, logged', async () => {
  const db = createMockAdapter();
  const id = await createEvent(db, actor, validateEventForm({ title: 'Pay rent', date: '2026-11-30', time: '09:00' }).data);
  await updateEvent(db, actor, id, validateEventForm({ title: 'Pay store rent', date: '2026-12-01', time: '' }).data);
  assert.equal((await db.get('calendarEvents', id)).date, '2026-12-01');
  await assert.rejects(createEvent(db, actor, { title: '', date: '2026-11-30' }), { code: 'INVALID_EVENT' });
  await deleteEvent(db, actor, id);
  assert.equal(await db.get('calendarEvents', id), null);
  const logs = (await db.query('activityLogs', {})).map((l) => l.action).sort();
  assert.deepEqual(logs, ['EVENT_CREATE', 'EVENT_DELETE', 'EVENT_UPDATE']);
});

test('sample data adds suppliers, restocks, expenses and events once; ledger and reports stay consistent', async () => {
  const db = createMockAdapter();
  const r1 = await loadSampleData(db, actor, '2026-11-25');
  assert.ok(r1.suppliers >= 3 && r1.restocks >= 4 && r1.expenses >= 6 && r1.events >= 2, JSON.stringify(r1));
  const statuses = (await db.query('restocks', {})).map((r) => r.status).sort();
  for (const s of ['CANCELLED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED']) assert.ok(statuses.includes(s), s);
  assert.ok((await db.query('expenses', {})).some((e) => e.status === 'VOIDED'));
  await assertLedger(db);
  const r2 = await loadSampleData(db, actor, '2026-11-25');
  assert.equal(r2.suppliers + r2.restocks + r2.expenses + r2.events, 0);
  const sales = await db.query('sales', {});
  assert.ok(salesSummary(sales, '2026-08-01', '2026-11-30').revenueC > 0);
});
