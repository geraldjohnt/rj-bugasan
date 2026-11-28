/*
 * Phase 15 promised payment dates (D-068, D-069) on the Mock adapter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateCustomerForm } from '../../src/domain/customers.js';
import { createItem } from '../../src/data/inventoryService.js';
import { createCustomer } from '../../src/data/customerService.js';
import { createSale } from '../../src/data/salesService.js';
import { recordPayment, voidPayment, addPromise } from '../../src/data/paymentService.js';
import { promiseHistory, openPromise, missedPromise, rowsNeedingPromise, promiseAfterNextDue, PROMISE_STATUS as PS } from '../../src/domain/promises.js';
import { paidOnTime } from '../../src/domain/allocation.js';
import { buildEvents, CAL } from '../../src/domain/calendar.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const D = '2026-11-12';
const TODAY = '2026-11-25';

async function setup(dueDates = ['2026-11-20', '2026-11-30']) {
  const db = createMockAdapter();
  const sackId = await createItem(db, actor, validateItemForm({ name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: '50', priceC: '2500', costC: '2200', minStock: '', openingDate: D, openingQty: '10' }).data);
  const custId = await createCustomer(db, actor, validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567', creditLimit: '10000' }).data);
  const r = await createSale(db, actor, { saleDate: D, customerId: custId, lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }], discount: { type: 'NONE' }, terms: 'INSTALLMENT', method: 'CASH',
    plan: { count: 2, frequency: 'MONTHLY_15', downPaymentC: 0, dueDates } }, undefined, D);
  const rows = async () => (await db.query('installments', { where: [['saleId', '==', r.saleId]] })).sort((a, b) => a.no - b.no);
  return { db, saleId: r.saleId, custId, rows };
}
const pay = (db, saleId, amountC, o = {}, today = TODAY) => recordPayment(db, actor, { saleId, date: today, amountC, method: 'CASH', ...o }, today);

test('a partial payment of an overdue installment needs a promised date; it is added, due dates unchanged', async () => {
  const { db, saleId, rows } = await setup();
  await assert.rejects(pay(db, saleId, 50000), { code: 'PROMISE_REQUIRED' });
  await assert.rejects(pay(db, saleId, 50000, { promiseDate: '2026-11-24' }), { code: 'INVALID_DATE' });
  const p = await pay(db, saleId, 50000, { promiseDate: '2026-11-27' });
  assert.equal(p.promised, '2026-11-27');
  const [r1, r2] = await rows();
  assert.equal(r1.dueDate, '2026-11-20'); assert.equal(r2.dueDate, '2026-11-30');
  assert.equal(r1.promises.length, 1);
  assert.deepEqual({ date: r1.promises[0].date, amountC: r1.promises[0].amountC, madeOn: r1.promises[0].madeOn, paymentId: r1.promises[0].paymentId }, { date: '2026-11-27', amountC: 75000, madeOn: TODAY, paymentId: p.paymentId });
  assert.equal(r2.promises, undefined, 'the next installment is not touched');
  assert.equal(openPromise(r1, TODAY).date, '2026-11-27');
  const log = (await db.query('activityLogs', {})).find((l) => l.action === 'PAYMENT_RECORD');
  assert.match(log.summary, /promised to pay the rest on/);
});

test('no promise needed when paying early, paying in full, or a back-dated payment before the due date', async () => {
  const { db, saleId, rows } = await setup(['2026-11-28', '2026-12-15']);
  await pay(db, saleId, 50000); // #1 not yet due
  assert.equal((await rows())[0].promises, undefined);
  const s2 = await setup();
  await pay(s2.db, s2.saleId, 125000); // #1 fully paid, #2 not due
  await pay(s2.db, s2.saleId, 10000, {}, '2026-11-19'); // back-dated, before #2's… (only #2 open, due Nov 30)
  assert.deepEqual(rowsNeedingPromise(await s2.rows(), TODAY), []);
});

test('promise on the same day as the next due date gives two calendar entries; later than it is allowed', async () => {
  const { db, saleId, rows } = await setup();
  await pay(db, saleId, 50000, { promiseDate: '2026-11-30' });
  const rs = (await rows()).map((r) => ({ ...r, customerName: 'Aling Nena', count: 2 }));
  const ev = buildEvents({ rows: rs }, TODAY).filter((e) => e.date === '2026-11-30');
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map((e) => e.category).sort(), [CAL.PAYMENT_DUE, CAL.PROMISE].sort());
  const prom = ev.find((e) => e.category === CAL.PROMISE);
  assert.match(prom.title, /₱750\.00/);
  // warning helper: a date after the next due date
  assert.equal(promiseAfterNextDue(rs, [rs[0]], '2026-12-01').no, 2);
  assert.equal(promiseAfterNextDue(rs, [rs[0]], '2026-11-30'), null);
});

test('kept promise counts as on time; missed one is flagged and a new promise can be added', async () => {
  const { db, saleId, custId, rows } = await setup();
  await pay(db, saleId, 50000, { promiseDate: '2026-11-27' });
  // kept: rest paid on the promised day
  await pay(db, saleId, 75000, {}, '2026-11-27');
  const [r1] = await rows();
  assert.equal(r1.status, 'PAID');
  assert.equal(promiseHistory(r1, '2026-11-28')[0].status, PS.KEPT);
  assert.equal(paidOnTime(r1), true);
  const c = await db.get('customers', custId);
  assert.equal(c.paidInstallments, 1); assert.equal(c.paidOnTime, 1);

  const s = await setup();
  await pay(s.db, s.saleId, 50000, { promiseDate: '2026-11-26' });
  let [m] = await s.rows();
  assert.equal(missedPromise(m, '2026-11-27').status, PS.MISSED);
  assert.equal(openPromise(m, '2026-11-27'), null);
  // new promise by hand, history kept
  await assert.rejects(addPromise(s.db, actor, s.saleId, { rowId: m.id, date: '2026-11-26' }, '2026-11-27'), { code: 'INVALID_DATE' });
  const np = await addPromise(s.db, actor, s.saleId, { rowId: m.id, date: '2026-11-29' }, '2026-11-27');
  assert.equal(np.amountC, 75000);
  [m] = await s.rows();
  assert.deepEqual(promiseHistory(m, '2026-11-27').map((p) => p.status), [PS.MISSED, PS.OPEN]);
  // paid after the missed date but by the new one: on time (D-069)
  await pay(s.db, s.saleId, 75000, {}, '2026-11-28');
  [m] = await s.rows();
  assert.deepEqual(promiseHistory(m, '2026-11-28').map((p) => p.status), [PS.MISSED, PS.KEPT]);
  assert.equal(paidOnTime(m), true);
  assert.ok((await s.db.query('activityLogs', {})).some((l) => l.action === 'PROMISE_ADD'));
  // paid late with no promise covering it: not on time
  const t = await setup();
  await pay(t.db, t.saleId, 125000, {}, '2026-11-22');
  assert.equal(paidOnTime((await t.rows())[0]), false);
});

test('another partial payment before the promised date replaces the open promise', async () => {
  const { db, saleId, rows } = await setup();
  await pay(db, saleId, 20000, { promiseDate: '2026-11-28' });
  await pay(db, saleId, 20000, { promiseDate: '2026-11-29' }, '2026-11-26');
  const [r1] = await rows();
  assert.deepEqual(promiseHistory(r1, '2026-11-26').map((p) => [p.status, p.amountC]), [[PS.REPLACED, 105000], [PS.OPEN, 85000]]);
  const ev = buildEvents({ rows: [{ ...r1, customerName: 'x', count: 2 }] }, '2026-11-26').filter((e) => e.category === CAL.PROMISE);
  assert.equal(ev.length, 1, 'only the open promise is on the calendar');
});

test('voiding the payment removes the promise it created; cannot add a promise to a paid row', async () => {
  const { db, saleId, rows } = await setup();
  const p = await pay(db, saleId, 50000, { promiseDate: '2026-11-27' });
  await voidPayment(db, actor, p.paymentId, 'Wrong sale');
  const [r1] = await rows();
  assert.deepEqual(r1.promises, []);
  assert.equal(r1.paidC, 0);
  await pay(db, saleId, 250000);
  await assert.rejects(addPromise(db, actor, saleId, { rowId: r1.id, date: '2026-11-30' }), { code: 'NOT_OPEN' });
});
