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
import { logWrite } from './activityLog.js';
import { assertOnline } from './inventoryService.js';
import { readSale, readRows, paymentDoc, PAYMENT_PREFIX } from './salesService.js';

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });
const ROW_FIELDS = (r) => ({ paidC: r.paidC, status: r.status, paidDate: r.paidDate });

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
 * input: { saleId, date, amountC, method, reference, note }. Returns { paymentId, allocations, balanceC }.
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

    const { allocations, rows: after } = allocatePayment(rows, input.amountC, input.date);
    const seq = nextSeq(counter.data);
    const paymentId = formatDocNo(PAYMENT_PREFIX, year, seq);

    tx.set('counters', `payment-${year}`, { next: seq + 1 });
    tx.set('payments', paymentId, paymentDoc(adapter, actor, { sale, customer, date: input.date, amountC: input.amountC, method: input.method, reference: input.reference, note: input.note, allocations }));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const deltas = [];
    for (const r of after) {
      if (!allocations.some((a) => a.installmentId === r.id)) continue;
      deltas.push(reliabilityDelta(byId.get(r.id), r));
      tx.update('installments', r.id, { ...ROW_FIELDS(r), ...stamp(adapter, actor) });
    }
    const paidC = sale.paidC + input.amountC;
    const balanceC = sale.totalC - paidC;
    tx.update('sales', sale.id, { paidC, balanceC, paymentStatus: paymentStatusOf(paidC, sale.totalC), paymentIds: [...(sale.paymentIds || []), paymentId], ...stamp(adapter, actor) });
    tx.update('customers', customer.id, customerPatch(customer, -input.amountC, sumDeltas(deltas), adapter, actor));
    logWrite(tx, adapter, actor, {
      action: 'PAYMENT_RECORD', entityType: 'payment', entityId: paymentId,
      summary: `Payment ${paymentId}: ${formatMoney(input.amountC)} from ${customer.name} for ${sale.id}` + (balanceC ? `, balance ${formatMoney(balanceC)}` : ', now fully paid'),
      changes: { saleId: sale.id, allocations },
    });
    return { paymentId, allocations, balanceC };
  });
}

/**
 * Void a payment (BR-052): reverses its allocations. Payments taken when the sale was saved (full payment, amount
 * paid at sale, down payment) are part of the sale and are reversed only by cancelling the sale (D-030).
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

    const after = reverseAllocations(rows, p.allocations || []);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const deltas = [];
    tx.update('payments', p.id, { status: 'VOIDED', void: { reason: why, refund: false, at: adapter.serverTime(), by: actor.uid } });
    for (const r of after) {
      if (!(p.allocations || []).some((a) => a.installmentId === r.id)) continue;
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
