/*
 * Opening balances (Phase 11, BR-081, D-045). One transaction: counter `ob-YYYY`, the OB sale document, its
 * receivable rows, the customer's outstanding balance and the activity log. No stock movement, no payment, and it
 * does not count as a purchase or as revenue. Payments, reschedules and cancellation use the normal sale services.
 */
import { DomainError } from '../domain/errors.js';
import { formatMoney } from '../domain/money.js';
import { parseDate, today as todayIn } from '../domain/dates.js';
import { formatDocNo, WALK_IN_ID } from '../domain/saleTotals.js';
import { nextSeq } from '../domain/sales.js';
import { STATUS } from '../domain/allocation.js';
import { validateOpeningBalanceForm, OB_PREFIX, OB_KIND } from '../domain/openingBalance.js';
import { logWrite } from './activityLog.js';
import { assertOnline } from './inventoryService.js';
import { installmentId } from './salesService.js';

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });

/** form: see validateOpeningBalanceForm. Returns { saleId, totalC }. */
export async function createOpeningBalance(adapter, actor, form, today = todayIn()) {
  assertOnline();
  const { data, errors } = validateOpeningBalanceForm(form, today);
  if (Object.keys(errors).length) {
    const first = errors.customerId || errors.originalDate || errors.description || errors.count
      || (errors.rows && Object.values(errors.rows.find(Boolean) || {})[0]) || 'Check the form.';
    throw new DomainError('INVALID_OPENING_BALANCE', first, errors);
  }
  const year = parseDate(data.originalDate).y;
  return adapter.runTransaction(async (tx) => {
    const counter = await tx.get('counters', `ob-${year}`);
    const cs = await tx.get('customers', data.customerId);
    if (!cs.exists || data.customerId === WALK_IN_ID) throw new DomainError('CUSTOMER_MISSING', 'This customer no longer exists.');
    const customer = { id: cs.id, ...cs.data };
    if (customer.status === 'ARCHIVED') throw new DomainError('CUSTOMER_ARCHIVED', 'This customer is archived. Restore the customer first.');
    const seq = nextSeq(counter.data);
    const saleId = formatDocNo(OB_PREFIX, year, seq);
    if ((await tx.get('sales', saleId)).exists) throw new DomainError('DUPLICATE_ID', `Number ${saleId} is already used.`);

    tx.set('counters', `ob-${year}`, { next: seq + 1 });
    const count = data.rows.length;
    data.rows.forEach((r) => {
      tx.set('installments', installmentId(saleId, r.no), {
        saleId, customerId: customer.id, customerName: customer.name, saleDate: data.originalDate, kind: data.kind, no: r.no, count,
        dueDate: r.dueDate, amountC: r.amountC, paidC: 0, status: STATUS.PENDING, paidDate: null, revisions: [],
        openingBalance: true, createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
      });
    });
    tx.set('sales', saleId, {
      saleNo: saleId, kind: OB_KIND, saleDate: data.originalDate, description: data.description,
      customerId: customer.id, customerName: customer.name, customerContact: customer.contactNumber || '',
      lines: [], subtotalC: data.totalC, discountType: 'NONE', discountValue: 0, discountC: 0, totalC: data.totalC, costC: 0,
      terms: data.kind, paymentMethod: 'OPENING', plan: null,
      paidC: 0, balanceC: data.totalC, paymentStatus: 'UNPAID', paymentIds: [], installmentCount: count,
      status: 'ACTIVE', fulfillment: 'PICKED_UP', deliveryDate: null, notes: '', cancel: null, creditLimitOverride: false,
      createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
    });
    tx.update('customers', customer.id, { outstandingC: (customer.outstandingC || 0) + data.totalC, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'OPENING_BALANCE_CREATE', entityType: 'sale', entityId: saleId,
      summary: `Opening balance ${saleId} for ${customer.name}: ${formatMoney(data.totalC)} in ${count === 1 ? 'one payment' : `${count} installments`} (${data.description})`,
      changes: { rows: data.rows },
    });
    return { saleId, totalC: data.totalC };
  });
}
