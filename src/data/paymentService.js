/*
 * Payments and schedules (Phase 7, BR-045, BR-050 … BR-053). One transaction per action: payment, receivable rows,
 * sale totals, customer summary and activity log change together.
 */
import { DomainError } from '../domain/errors.js';
import { formatMoney, sum } from '../domain/money.js';
import { parseDate, today as todayIn, isValidDate, compareDates, formatDate } from '../domain/dates.js';
import { formatDocNo } from '../domain/saleTotals.js';
import { allocatePayment, reverseAllocations, outstandingOf, statusFor, STATUS } from '../domain/allocation.js';
import { validateRevision } from '../domain/schedule.js';
import { METHODS, nextSeq, paymentStatusOf } from '../domain/sales.js';
import { reliabilityDelta, sumDeltas } from '../domain/collections.js';
import { rowsNeedingPromise, checkPromiseDate, withPromise, withoutPaymentPromises, promisesOf } from '../domain/promises.js';
import { logWrite } from './activityLog.js';
import { assertOnline } from './inventoryService.js';
import { readSale, readRows, paymentDoc, PAYMENT_PREFIX } from './salesService.js';

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });
const ROW_FIELDS = (r) => ({ paidC: r.paidC, status: r.status, paidDate: r.paidDate, ...(r.promises ? { promises: r.promises } : {}) });

async function readCustomer(tx, id) {
  const s = await tx.get('customers', id);
  return s.exists ? { id, ...s.data } : null;
}

function customerPatch(c, outstandingDeltaC, rel, adapter, actor) {
  return {
    outstandingC: Math.max(0, (c.outstandingC || 0) + outstandingDeltaC),
    paidInstallments: Math.max(0, (c.paidInstallments || 0) + rel.paidInstallments),
    paidOnTime: Math.max(0, (c.paidOnTime || 0) + rel.paidOnTime),
    ...stamp(adapter, actor),
  };
}

/**
 * Record a payment on a sale (BR-051): allocated oldest installment first; may not exceed the balance.
 * input: { saleId, date, amountC, method, reference, note, promiseDate }. Returns { paymentId, allocations, balanceC, promised }.
 * D-068: when the payment leaves a row due on or before the payment date not fully paid, promiseDate (on or after the payment date) is
 * required; a promise for each such row's rest is added to it (due dates unchanged).
 */
export async function recordPayment(adapter, actor, input, today = todayIn()) {
  assertOnline();
  if (!isValidDate(input.date)) throw new DomainError('INVALID_DATE', 'Enter a valid payment date.');
  if (compareDates(input.date, today) > 0) throw new DomainError('FUTURE_DATE', 'The payment date cannot be in the future.');
  if (!METHODS[input.method]) throw new DomainError('INVALID_METHOD', 'Choose how the customer paid.');
  const year = parseDate(input.date).y;
  return adapter.runTransaction(async (tx) => {
    const sale = await readSale(tx, input.saleId);
    const rows = await readRows(tx, sale);
    const customer = await readCustomer(tx, sale.customerId);
    const counter = await tx.get('counters', `payment-${year}`);
    if (sale.status !== 'ACTIVE') throw new DomainError('SALE_CANCELLED', 'This sale is cancelled. Payments cannot be recorded.');
    if (compareDates(input.date, sale.saleDate) < 0) throw new DomainError('INVALID_DATE', `The payment date cannot be before the sale date (${formatDate(sale.saleDate)}).`);
    if (!customer) throw new DomainError('CUSTOMER_MISSING', 'The customer of this sale no longer exists.');
    if (outstandingOf(rows) <= 0) throw new DomainError('NO_BALANCE', 'This sale is fully paid.');

    const allocated = allocatePayment(rows, input.amountC, input.date);
    const allocations = allocated.allocations;
    // Rows due on or before the payment date (a back-dated payment is judged on its own date).
    const needing = rowsNeedingPromise(allocated.rows, input.date);
    if (needing.length && !input.promiseDate) {
      throw new DomainError('PROMISE_REQUIRED', 'Part of what is due is still unpaid. Enter the date the customer promised to pay the rest.', { field: 'promiseDate' });
    }
    if (needing.length) checkPromiseDate(input.promiseDate, input.date, 'The promised date cannot be before the payment date.');
    const at = new Date().toISOString();
    const promisedIds = new Set(needing.map((r) => r.id));
    const after = allocated.rows.map((r) => (promisedIds.has(r.id) ? withPromise(r, { date: input.promiseDate, madeOn: input.date, paymentId: null, by: actor.uid, at }) : r));
    const seq = nextSeq(counter.data);
    const paymentId = formatDocNo(PAYMENT_PREFIX, year, seq);
    for (const r of after) if (promisedIds.has(r.id)) r.promises[r.promises.length - 1].paymentId = paymentId;

    tx.set('counters', `payment-${year}`, { next: seq + 1 });
    tx.set('payments', paymentId, paymentDoc(adapter, actor, { sale, customer, date: input.date, amountC: input.amountC, method: input.method, reference: input.reference, note: input.note, allocations }));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const deltas = [];
    for (const r of after) {
      if (!allocations.some((a) => a.installmentId === r.id) && !promisedIds.has(r.id)) continue;
      deltas.push(reliabilityDelta(byId.get(r.id), r));
      tx.update('installments', r.id, { ...ROW_FIELDS(r), ...stamp(adapter, actor) });
    }
    const paidC = sale.paidC + input.amountC;
    const balanceC = sale.totalC - paidC;
    tx.update('sales', sale.id, { paidC, balanceC, paymentStatus: paymentStatusOf(paidC, sale.totalC), paymentIds: [...(sale.paymentIds || []), paymentId], ...stamp(adapter, actor) });
    tx.update('customers', customer.id, customerPatch(customer, -input.amountC, sumDeltas(deltas), adapter, actor));
    logWrite(tx, adapter, actor, {
      action: 'PAYMENT_RECORD', entityType: 'payment', entityId: paymentId,
      summary: `Payment ${paymentId}: ${formatMoney(input.amountC)} from ${customer.name} for ${sale.id}` + (balanceC ? `, balance ${formatMoney(balanceC)}` : ', now fully paid')
        + (needing.length ? `; promised to pay the rest on ${formatDate(input.promiseDate)} (${needing.map((r) => `#${r.no}`).join(', ')})` : ''),
      changes: { saleId: sale.id, allocations, ...(needing.length ? { promiseDate: input.promiseDate, promisedRows: needing.map((r) => r.no) } : {}) },
    });
    return { paymentId, allocations, balanceC, promised: needing.length ? input.promiseDate : null };
  });
}

/**
 * Void a payment (BR-052): reverses its allocations. Payments taken when the sale was saved (full payment, amount
 * paid at sale, down payment) are part of the sale and are reversed only by cancelling the sale (D-032).
 */
export async function voidPayment(adapter, actor, paymentId, reason) {
  assertOnline();
  const why = String(reason || '').trim();
  if (!why) throw new DomainError('REASON_REQUIRED', 'Enter the reason for voiding.');
  return adapter.runTransaction(async (tx) => {
    const ps = await tx.get('payments', paymentId);
    if (!ps.exists) throw new DomainError('PAYMENT_MISSING', 'This payment no longer exists.');
    const p = { id: paymentId, ...ps.data };
    if (p.status !== 'ACTIVE') throw new DomainError('ALREADY_VOIDED', 'This payment is already voided.');
    if (p.atSale) throw new DomainError('AT_SALE', 'This payment was taken when the sale was saved. Cancel the sale instead (and create it again if needed).');
    const sale = await readSale(tx, p.saleId);
    const rows = await readRows(tx, sale);
    const customer = await readCustomer(tx, sale.customerId);
    if (sale.status !== 'ACTIVE') throw new DomainError('SALE_CANCELLED', 'The sale is cancelled; its payments were already voided.');

    // D-068: promises made with this payment go with it.
    const after = reverseAllocations(rows, p.allocations || []).map((r) => (promisesOf(r).some((x) => x.paymentId === p.id) ? withoutPaymentPromises(r, p.id) : r));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const deltas = [];
    tx.update('payments', p.id, { status: 'VOIDED', void: { reason: why, refund: false, at: adapter.serverTime(), by: actor.uid } });
    for (const r of after) {
      const hadPromise = promisesOf(byId.get(r.id)).some((x) => x.paymentId === p.id);
      if (!(p.allocations || []).some((a) => a.installmentId === r.id) && !hadPromise) continue;
      deltas.push(reliabilityDelta(byId.get(r.id), r));
      tx.update('installments', r.id, { ...ROW_FIELDS(r), ...stamp(adapter, actor) });
    }
    const paidC = sale.paidC - p.amountC;
    tx.update('sales', sale.id, { paidC, balanceC: sale.totalC - paidC, paymentStatus: paymentStatusOf(paidC, sale.totalC), ...stamp(adapter, actor) });
    if (customer) tx.update('customers', customer.id, customerPatch(customer, p.amountC, sumDeltas(deltas), adapter, actor));
    logWrite(tx, adapter, actor, {
      action: 'PAYMENT_VOID', entityType: 'payment', entityId: p.id,
      summary: `Voided payment ${p.id} (${formatMoney(p.amountC)}) on ${sale.id}: ${why}`,
    });
    return { balanceC: sale.totalC - paidC };
  });
}

/**
 * D-068/D-069: add a promised date to an open row by hand (e.g. after a missed promise). The row's due date and the
 * other rows are unchanged. input: { rowId, date }. Returns { date, amountC }.
 */
export async function addPromise(adapter, actor, saleId, input, today = todayIn()) {
  assertOnline();
  checkPromiseDate(input.date, today);
  return adapter.runTransaction(async (tx) => {
    const sale = await readSale(tx, saleId);
    if (sale.status !== 'ACTIVE') throw new DomainError('SALE_CANCELLED', 'This sale is cancelled.');
    const rows = await readRows(tx, sale);
    const row = rows.find((r) => r.id === input.rowId);
    if (!row) throw new DomainError('ROW_MISSING', 'This installment is not on the sale.');
    if (row.status !== STATUS.PENDING && row.status !== STATUS.PARTIAL) throw new DomainError('NOT_OPEN', `Installment ${row.no} is ${row.status === STATUS.PAID ? 'already paid' : 'cancelled'}.`);
    const next = withPromise(row, { date: input.date, madeOn: today, paymentId: null, by: actor.uid, at: new Date().toISOString() });
    tx.update('installments', row.id, { promises: next.promises, ...stamp(adapter, actor) });
    const p = next.promises[next.promises.length - 1];
    logWrite(tx, adapter, actor, {
      action: 'PROMISE_ADD', entityType: 'sale', entityId: saleId,
      summary: `${sale.customerName} promised to pay ${formatMoney(p.amountC)} of ${saleId} #${row.no} on ${formatDate(p.date)}`,
      changes: { no: row.no, date: p.date, amountC: p.amountC },
    });
    return { date: p.date, amountC: p.amountC };
  });
}

/**
 * Reschedule unpaid rows (BR-045): change due dates and redistribute unpaid amounts; total unchanged; each changed
 * row keeps a revision entry. proposed: [{ no, dueDate, amountC }].
 */
export async function reviseSchedule(adapter, actor, saleId, proposed, reason) {
  assertOnline();
  const why = String(reason || '').trim();
  if (!why) throw new DomainError('REASON_REQUIRED', 'Enter the reason for the change.');
  return adapter.runTransaction(async (tx) => {
    const sale = await readSale(tx, saleId);
    if (sale.status !== 'ACTIVE') throw new DomainError('SALE_CANCELLED', 'This sale is cancelled.');
    const rows = await readRows(tx, sale);
    const result = validateRevision(rows, proposed);
    const at = new Date().toISOString(); // serverTimestamp() is not allowed inside arrays
    const changed = [];
    result.forEach((r, i) => {
      const old = rows[i];
      if (r.dueDate === old.dueDate && r.amountC === old.amountC) return;
      if (compareDates(r.dueDate, sale.saleDate) < 0) throw new DomainError('INVALID_DATE', `Installment ${r.no}: the due date cannot be before the sale date.`);
      if (statusFor(r) === STATUS.PAID) throw new DomainError('BECOMES_PAID', `Installment ${r.no}: the amount would equal what is already paid. Leave at least ₱0.01 unpaid, or record a payment.`);
      changed.push({ before: old, after: r });
    });
    if (!changed.length) throw new DomainError('NO_CHANGE', 'Nothing was changed.');
    for (const { before, after } of changed) {
      const revision = { at, by: actor.uid, reason: why, from: { dueDate: before.dueDate, amountC: before.amountC }, to: { dueDate: after.dueDate, amountC: after.amountC } };
      tx.update('installments', before.id, { dueDate: after.dueDate, amountC: after.amountC, status: statusFor(after), revisions: [...(before.revisions || []), revision], ...stamp(adapter, actor) });
    }
    logWrite(tx, adapter, actor, {
      action: 'SCHEDULE_REVISE', entityType: 'sale', entityId: saleId,
      summary: `Rescheduled ${saleId} (${why}): ` + changed.map(({ before, after }) => `#${before.no} ${before.dueDate ? formatDate(before.dueDate) : 'no date'} ${formatMoney(before.amountC)} → ${formatDate(after.dueDate)} ${formatMoney(after.amountC)}`).join('; '),
      changes: { rows: changed.map(({ before, after }) => ({ no: before.no, from: { dueDate: before.dueDate, amountC: before.amountC }, to: { dueDate: after.dueDate, amountC: after.amountC } })) },
    });
    return { changed: changed.length, totalC: sum(result.map((r) => r.amountC)) };
  });
}
