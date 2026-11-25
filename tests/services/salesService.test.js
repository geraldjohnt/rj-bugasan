/*
 * Phases 5–7 services on the Mock adapter: customers, sales, payments, cancel, reschedule.
 * Invariants checked after every scenario:
 *   - stock ledger: item qty == Σ movements
 *   - receivables: for every ACTIVE sale, Σ unpaid rows == sale.balanceC and paidC + balanceC == totalC
 *   - customer outstanding == Σ balance of its ACTIVE sales; cash == Σ ACTIVE payments == Σ sale.paidC
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateCustomerForm, validateContactForm } from '../../src/domain/customers.js';
import { createItem } from '../../src/data/inventoryService.js';
import { createCustomer, updateCustomer, setCustomerStatus, ensureWalkIn, saveContact, removeContact } from '../../src/data/customerService.js';
import { createSale, cancelSale, updateFulfillment } from '../../src/data/salesService.js';
import { recordPayment, voidPayment, reviseSchedule } from '../../src/data/paymentService.js';
import { outstandingOf } from '../../src/domain/allocation.js';
import { buildStatement } from '../../src/domain/collections.js';
import { loadSampleData } from '../../src/data/sampleData.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const D = '2026-11-12';
const TODAY = '2026-11-25';

async function setup() {
  const db = createMockAdapter();
  const item = (o) => validateItemForm({ unit: 'SACK', sackWeightKg: '50', priceC: '2500', costC: '2200', minStock: '', openingDate: D, ...o }).data;
  const sackId = await createItem(db, actor, item({ name: 'Dinorado 50kg Sack', openingQty: '10' }));
  const kgId = await createItem(db, actor, item({ name: 'Dinorado per KG', unit: 'KG', priceC: '55', costC: '44', openingQty: '20' }));
  const { data } = validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567', creditLimit: '5000' });
  const custId = await createCustomer(db, actor, data);
  return { db, sackId, kgId, custId };
}

const sale = (o) => ({ saleDate: D, customerId: 'WALK_IN', lines: [], discount: { type: 'NONE' }, terms: 'FULL', method: 'CASH', ...o });
const run = (db, input, today = TODAY) => createSale(db, actor, input, undefined, today);

async function assertInvariants(db) {
  for (const item of await db.query('items', {})) {
    const ms = await db.query('inventoryMovements', { where: [['itemId', '==', item.id]] });
    assert.equal(ms.reduce((s, m) => s + m.qtyDeltaH, 0), item.qtyH, `ledger ${item.name}`);
  }
  const sales = await db.query('sales', {});
  const payments = await db.query('payments', {});
  for (const s of sales) {
    assert.equal(s.paidC + s.balanceC, s.status === 'ACTIVE' ? s.totalC : 0, `paid+balance ${s.id}`);
    const rows = await db.query('installments', { where: [['saleId', '==', s.id]] });
    if (s.status === 'ACTIVE') {
      assert.equal(outstandingOf(rows), s.balanceC, `rows vs balance ${s.id}`);
      const cash = payments.filter((p) => p.saleId === s.id && p.status === 'ACTIVE').reduce((a, p) => a + p.amountC, 0);
      assert.equal(cash, s.paidC, `payments vs paid ${s.id}`);
    } else {
      assert.ok(rows.every((r) => r.status === 'CANCELLED'));
      assert.ok(payments.filter((p) => p.saleId === s.id).every((p) => p.status === 'VOIDED'));
    }
  }
  for (const c of await db.query('customers', {})) {
    const owed = sales.filter((s) => s.customerId === c.id && s.status === 'ACTIVE').reduce((a, s) => a + s.balanceC, 0);
    assert.equal(c.outstandingC, owed, `outstanding ${c.name}`);
    const st = buildStatement(sales.filter((s) => s.customerId === c.id), payments.filter((p) => p.customerId === c.id));
    assert.equal(st.balanceC, owed, `statement ${c.name}`);
  }
}

/* ---------------------------------------------------------------- Phase 5 */

test('customers: create, edit (credit limit logged), contacts with a single primary, archive rules', async () => {
  const { db, custId } = await setup();
  const c0 = await db.get('customers', custId);
  assert.equal(c0.outstandingC, 0);
  assert.equal(c0.creditLimitC, 500000);
  const { data } = validateCustomerForm({ name: 'Aling Nena Store', type: 'Store', contactNumber: '0917 123 4567', creditLimit: '' });
  await updateCustomer(db, actor, custId, data);
  const [log] = await db.query('activityLogs', { where: [['action', '==', 'CUSTOMER_UPDATE']] });
  assert.match(log.summary, /credit limit ₱5,000.00 → none/);
  const a = await saveContact(db, actor, custId, validateContactForm({ name: 'Mario', relationship: 'Son', contactNumber: '0918 000 1111', isPrimary: true }).data);
  await saveContact(db, actor, custId, validateContactForm({ name: 'Liza', relationship: 'Neighbor', facebook: 'fb.com/liza', isPrimary: true }).data);
  let c = await db.get('customers', custId);
  assert.equal(c.alternateContacts.length, 2);
  assert.deepEqual(c.alternateContacts.filter((x) => x.isPrimary).map((x) => x.name), ['Liza']);
  await removeContact(db, actor, custId, a);
  c = await db.get('customers', custId);
  assert.deepEqual(c.alternateContacts.map((x) => x.name), ['Liza']);
  await setCustomerStatus(db, actor, custId, 'ARCHIVED');
  await setCustomerStatus(db, actor, custId, 'ACTIVE');
});

test('customers: validation (contact number required, reserved Walk-in name, contact needs a way to reach)', () => {
  assert.equal(validateCustomerForm({ name: 'X', type: 'Store', contactNumber: '' }).errors.contactNumber, 'Required.');
  assert.ok(validateCustomerForm({ name: 'walk-in', type: 'Store', contactNumber: '09171234567' }).errors.name);
  assert.ok(validateCustomerForm({ name: 'X', type: 'Nope', contactNumber: '09171234567' }).errors.type);
  assert.ok(validateCustomerForm({ name: 'X', type: 'Store', contactNumber: 'abc' }).errors.contactNumber);
  assert.ok(validateContactForm({ name: 'Only name' }).errors.contactNumber);
});

test('Walk-in: created once, cannot be edited or archived', async () => {
  const { db } = await setup();
  assert.equal(await ensureWalkIn(db, actor), true);
  assert.equal(await ensureWalkIn(db, actor), false);
  await assert.rejects(setCustomerStatus(db, actor, 'WALK_IN', 'ARCHIVED'), (e) => e.code === 'SYSTEM_CUSTOMER');
  await assert.rejects(updateCustomer(db, actor, 'WALK_IN', { name: 'X' }), (e) => e.code === 'SYSTEM_CUSTOMER');
});

/* ---------------------------------------------------------------- Phase 6 */

test('full walk-in sale: ID, stock, movement, payment, snapshot cost; Walk-in created on the fly', async () => {
  const { db, sackId, kgId } = await setup();
  const r = await run(db, sale({ lines: [{ itemId: sackId, qtyH: 200, unitPriceC: 250000 }, { itemId: kgId, qtyH: 250, unitPriceC: 5000 }], discount: { type: 'FIXED', value: 500 } }));
  assert.equal(r.saleId, 'RJ-2026-00001');
  assert.equal(r.paymentId, 'PAY-2026-00001');
  const s = await db.get('sales', r.saleId);
  assert.equal(s.subtotalC, 500000 + 12500);
  assert.equal(s.totalC, 512000);
  assert.equal(s.paymentStatus, 'PAID');
  assert.equal(s.lines[1].priceOverridden, true);   // list 55.00, sold at 50.00
  assert.equal(s.lines[0].unitCostC, 220000);
  assert.equal((await db.get('items', sackId)).qtyH, 800);
  assert.equal((await db.get('customers', 'WALK_IN')).totalPurchasesC, 512000);
  const r2 = await run(db, sale({ lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }] }));
  assert.equal(r2.saleId, 'RJ-2026-00002');
  await assertInvariants(db);
});

test('walk-in cannot leave a balance; quantity cannot exceed stock (across lines); archived items cannot be sold', async () => {
  const { db, sackId } = await setup();
  await assert.rejects(run(db, sale({ lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }], terms: 'OPEN_BALANCE', paidNowC: 0 })), (e) => e.code === 'WALK_IN_BALANCE');
  await assert.rejects(run(db, sale({ lines: [{ itemId: sackId, qtyH: 600, unitPriceC: 1 }, { itemId: sackId, qtyH: 500, unitPriceC: 1 }] })), (e) => e.code === 'NEGATIVE_STOCK');
  await assert.rejects(run(db, sale({ lines: [{ itemId: sackId, qtyH: 150, unitPriceC: 1 }] })), (e) => e.code === 'INVALID_QTY');
  await assert.rejects(run(db, sale({ saleDate: '2026-12-01', lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 1 }] })), (e) => e.code === 'FUTURE_DATE');
  assert.equal((await db.get('items', sackId)).qtyH, 1000); // nothing written by failed attempts
  assert.equal(await db.get('counters', 'sale-2026'), null);
});

test('concurrent sales of the last sack: exactly one succeeds, IDs never duplicate', async () => {
  const { db, kgId } = await setup();
  const id = await createItem(db, actor, validateItemForm({ name: 'Last Sack', unit: 'SACK', sackWeightKg: '25', priceC: '1', costC: '1', openingQty: '1', openingDate: D }).data);
  const res = await Promise.allSettled([1, 2, 3].map(() => run(db, sale({ lines: [{ itemId: id, qtyH: 100, unitPriceC: 100 }] }))));
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(res.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'NEGATIVE_STOCK'));
  assert.equal((await db.get('items', id)).qtyH, 0);
  const ok = await Promise.all([1, 2, 3].map(() => run(db, sale({ lines: [{ itemId: kgId, qtyH: 100, unitPriceC: 100 }] }))));
  const ids = new Set([...res.filter((r) => r.status === 'fulfilled').map((r) => r.value.saleId), ...ok.map((r) => r.saleId)]);
  assert.equal(ids.size, 4);
  await assertInvariants(db);
});

test('installment sale: down payment, schedule (BR-042/043), customer outstanding, credit-limit warning and override', async () => {
  const { db, sackId, custId } = await setup();
  const input = sale({ customerId: custId, lines: [{ itemId: sackId, qtyH: 300, unitPriceC: 250000 }], terms: 'INSTALLMENT', method: 'CASH',
    plan: { count: 3, frequency: 'MONTHLY_15', downPaymentC: 50000 } });
  await assert.rejects(run(db, input), (e) => e.code === 'CREDIT_LIMIT'); // ₱7,000 balance > ₱5,000 limit
  const r = await run(db, { ...input, creditOverride: true });
  const rows = (await db.query('installments', { where: [['saleId', '==', r.saleId]] })).sort((a, b) => a.no - b.no);
  assert.deepEqual(rows.map((x) => x.dueDate), ['2026-12-15', '2027-01-15', '2027-02-15']);
  assert.deepEqual(rows.map((x) => x.amountC), [233300, 233300, 233400]);
  const c = await db.get('customers', custId);
  assert.equal(c.outstandingC, 700000);
  const p = await db.get('payments', r.paymentId);
  assert.equal(p.isDownPayment, true);
  assert.equal((await db.query('activityLogs', { where: [['action', '==', 'CREDIT_LIMIT_OVERRIDE']] })).length, 1);
  await assertInvariants(db);
});

test('installment due dates can be edited before saving but must stay in order', async () => {
  const { db, sackId, custId } = await setup();
  const base = sale({ customerId: custId, creditOverride: true, lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 300000 }], terms: 'INSTALLMENT', plan: { count: 3, frequency: 'SEMI_MONTHLY', downPaymentC: 0 } });
  await assert.rejects(run(db, { ...base, plan: { ...base.plan, dueDates: ['2026-12-31', '2026-12-15'] } }), (e) => e.code === 'INVALID_DATE');
  const r = await run(db, { ...base, plan: { ...base.plan, dueDates: ['2026-12-01'] } });
  const rows = (await db.query('installments', { where: [['saleId', '==', r.saleId]] })).sort((a, b) => a.no - b.no);
  assert.deepEqual(rows.map((x) => x.dueDate), ['2026-12-01', '2026-12-15', '2026-12-31']);
  assert.equal(r.paymentId, null);
});

test('cancel: stock returned, payments voided as refunds, rows cancelled, customer reversed (BR-036)', async () => {
  const { db, sackId, custId } = await setup();
  const r = await run(db, sale({ customerId: custId, lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }], terms: 'INSTALLMENT', method: 'CASH', plan: { count: 3, frequency: 'MONTHLY_EOM', downPaymentC: 10000 } }));
  await recordPayment(db, actor, { saleId: r.saleId, date: '2026-11-20', amountC: 100000, method: 'CASH' }, TODAY);
  await assert.rejects(cancelSale(db, actor, r.saleId, ''), (e) => e.code === 'REASON_REQUIRED');
  const res = await cancelSale(db, actor, r.saleId, 'Wrong item');
  assert.equal(res.refundedC, 110000);
  assert.equal(res.voidedPayments, 2);
  assert.equal((await db.get('items', sackId)).qtyH, 1000);
  const c = await db.get('customers', custId);
  assert.equal(c.outstandingC, 0);
  assert.equal(c.totalPurchasesC, 0);
  await assert.rejects(cancelSale(db, actor, r.saleId, 'again'), (e) => e.code === 'ALREADY_CANCELLED');
  await assert.rejects(recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 100, method: 'CASH' }, TODAY), (e) => e.code === 'SALE_CANCELLED');
  const mv = await db.query('inventoryMovements', { where: [['type', '==', 'SALE_CANCEL']] });
  assert.equal(mv.length, 1);
  await assertInvariants(db);
});

test('delivery status, date and notes can change; nothing else', async () => {
  const { db, sackId } = await setup();
  const r = await run(db, sale({ lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }] }));
  await updateFulfillment(db, actor, r.saleId, { fulfillment: 'DELIVERED', deliveryDate: '2026-11-13', notes: 'Gate 2' });
  const s = await db.get('sales', r.saleId);
  assert.equal(s.fulfillment, 'DELIVERED');
  assert.equal(s.deliveryDate, '2026-11-13');
  assert.equal(s.notes, 'Gate 2');
  await assert.rejects(updateFulfillment(db, actor, r.saleId, { fulfillment: 'LOST' }), (e) => e.code === 'INVALID_STATUS');
});

/* ---------------------------------------------------------------- Phase 7 */

test('payments: oldest first, excess flows on, overpayment rejected, reliability counted (BR-051, BR-025)', async () => {
  const { db, sackId, custId } = await setup();
  const r = await run(db, sale({ customerId: custId, lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }], terms: 'INSTALLMENT', plan: { count: 3, frequency: 'MONTHLY_15', downPaymentC: 0 } }));
  // rows: Dec 15 833, Jan 15 833, Feb 15 834
  await assert.rejects(recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 250001, method: 'CASH' }, TODAY), (e) => e.code === 'OVERPAYMENT');
  await assert.rejects(recordPayment(db, actor, { saleId: r.saleId, date: '2026-11-01', amountC: 100, method: 'CASH' }, TODAY), (e) => e.code === 'INVALID_DATE');
  const p1 = await recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 100000, method: 'EWALLET', reference: 'GC-1' }, TODAY);
  assert.deepEqual(p1.allocations.map((a) => a.amountC), [83300, 16700]);
  const rows = (await db.query('installments', { where: [['saleId', '==', r.saleId]] })).sort((a, b) => a.no - b.no);
  assert.deepEqual(rows.map((x) => x.status), ['PAID', 'PARTIAL', 'PENDING']);
  let c = await db.get('customers', custId);
  assert.equal(c.paidInstallments, 1);
  assert.equal(c.paidOnTime, 1);
  assert.equal((await db.get('sales', r.saleId)).paymentStatus, 'PARTIAL');
  await recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 150000, method: 'CASH' }, TODAY);
  const s = await db.get('sales', r.saleId);
  assert.equal(s.paymentStatus, 'PAID');
  assert.equal(s.balanceC, 0);
  await assert.rejects(recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 1, method: 'CASH' }, TODAY), (e) => e.code === 'NO_BALANCE');
  c = await db.get('customers', custId);
  assert.equal(c.paidInstallments, 3);
  await assertInvariants(db);
});

test('void payment reverses allocations and reliability; at-sale payments cannot be voided (D-030)', async () => {
  const { db, sackId, custId } = await setup();
  const r = await run(db, sale({ customerId: custId, lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }], terms: 'OPEN_BALANCE', method: 'CASH', paidNowC: 50000, dueDate: '2026-11-20' }));
  await assert.rejects(voidPayment(db, actor, r.paymentId, 'oops'), (e) => e.code === 'AT_SALE');
  const p = await recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 200000, method: 'CASH' }, TODAY);
  let c = await db.get('customers', custId);
  assert.equal(c.paidInstallments, 1);
  assert.equal(c.paidOnTime, 0); // paid Nov 25, due Nov 20 → late
  await assert.rejects(voidPayment(db, actor, p.paymentId, ''), (e) => e.code === 'REASON_REQUIRED');
  await voidPayment(db, actor, p.paymentId, 'Wrong amount');
  c = await db.get('customers', custId);
  assert.equal(c.paidInstallments, 0);
  assert.equal(c.outstandingC, 200000);
  const s = await db.get('sales', r.saleId);
  assert.equal(s.paymentStatus, 'PARTIAL');
  await assert.rejects(voidPayment(db, actor, p.paymentId, 'again'), (e) => e.code === 'ALREADY_VOIDED');
  await assertInvariants(db);
});

test('reschedule: dates and unpaid amounts change, total stays, revision history kept (BR-045)', async () => {
  const { db, sackId, custId } = await setup();
  const r = await run(db, sale({ customerId: custId, lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }], terms: 'INSTALLMENT', plan: { count: 3, frequency: 'MONTHLY_15', downPaymentC: 0 } }));
  await recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 100000, method: 'CASH' }, TODAY); // #1 paid, #2 16700 paid
  await assert.rejects(reviseSchedule(db, actor, r.saleId, [{ no: 2, dueDate: '2027-01-31', amountC: 83300 }, { no: 3, dueDate: '2027-02-15', amountC: 90000 }], 'x'), (e) => e.code === 'TOTAL_CHANGED');
  await assert.rejects(reviseSchedule(db, actor, r.saleId, [{ no: 2, dueDate: '2027-01-31', amountC: 10000 }, { no: 3, dueDate: '2027-02-15', amountC: 156700 }], 'x'), (e) => e.code === 'BELOW_PAID');
  await assert.rejects(reviseSchedule(db, actor, r.saleId, [{ no: 1, dueDate: '2027-01-01', amountC: 83300 }], 'x'), (e) => e.code === 'ROW_LOCKED');
  await assert.rejects(reviseSchedule(db, actor, r.saleId, [{ no: 2, dueDate: '2027-01-31', amountC: 83300 }], ''), (e) => e.code === 'REASON_REQUIRED');
  await reviseSchedule(db, actor, r.saleId, [{ no: 2, dueDate: '2027-01-31', amountC: 50000 }, { no: 3, dueDate: '2027-02-28', amountC: 116700 }], 'Customer asked');
  const rows = (await db.query('installments', { where: [['saleId', '==', r.saleId]] })).sort((a, b) => a.no - b.no);
  assert.deepEqual(rows.map((x) => x.amountC), [83300, 50000, 116700]);
  assert.equal(rows[1].revisions.length, 1);
  assert.deepEqual(rows[1].revisions[0].from, { dueDate: '2027-01-15', amountC: 83300 });
  assert.equal(rows[1].status, 'PARTIAL');
  await assertInvariants(db);
});

test('sample data (phases 4–7) loads consistently and is idempotent', async () => {
  const db = createMockAdapter();
  const first = await loadSampleData(db, actor, TODAY);
  assert.ok(first.customers >= 5 && first.sales >= 5, JSON.stringify(first));
  const second = await loadSampleData(db, actor, TODAY);
  assert.equal(second.created + second.customers + second.sales, 0);
  assert.ok((await db.query('payments', { where: [['status', '==', 'VOIDED']] })).length >= 1);
  assert.ok((await db.query('sales', { where: [['status', '==', 'CANCELLED']] })).length === 1);
  await assertInvariants(db);
});
