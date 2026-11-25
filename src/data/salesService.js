/*
 * Sales service (Phase 6). A sale and everything it touches — counter, stock, movements, receivable rows, payment,
 * customer summary and activity log — is written in ONE transaction (DATABASE_DESIGN §3). Firestore retries the
 * transaction when another device changed the same items, so two devices can never oversell the last stock (BR-031).
 * actor: { uid, displayName }
 */
import { DomainError } from '../domain/errors.js';
import { formatMoney } from '../domain/money.js';
import { formatQty } from '../domain/quantity.js';
import { parseDate, today as todayIn, isValidDate } from '../domain/dates.js';
import { formatDocNo, requestedByItem, TERMS, WALK_IN_ID } from '../domain/saleTotals.js';
import { planSale, nextSeq, paymentStatusOf, DEFAULT_SALES_SETTINGS, FULFILLMENT, linesText } from '../domain/sales.js';
import { MOVEMENT_TYPES as MT } from '../domain/inventory.js';
import { STATUS } from '../domain/allocation.js';
import { reliabilityDelta, sumDeltas } from '../domain/collections.js';
import { logWrite } from './activityLog.js';
import { assertOnline } from './inventoryService.js';
import { walkInDoc } from './customerService.js';

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });
export const PAYMENT_PREFIX = 'PAY-';
export const installmentId = (saleId, no) => `${saleId}-${no}`;

export async function readSale(tx, id) {
  const s = await tx.get('sales', id);
  if (!s.exists) throw new DomainError('SALE_MISSING', 'This sale no longer exists.');
  return { id, ...s.data };
}

/** All receivable rows of a sale (ids are `{saleId}-{n}`). */
export async function readRows(tx, sale) {
  const rows = [];
  for (let n = 1; n <= (sale.installmentCount || 0); n++) {
    const s = await tx.get('installments', installmentId(sale.id, n));
    if (s.exists) rows.push({ id: s.id, ...s.data });
  }
  return rows;
}

export function writeItemMovement(tx, adapter, actor, item, { type, deltaH, unitCostC, refType, refId, businessDate, note = null }) {
  const afterH = item.qtyH + deltaH;
  if (afterH < 0) throw new DomainError('NEGATIVE_STOCK', `Not enough stock: ${item.name} has ${formatQty(item.qtyH, item.unit)}.`);
  tx.set('inventoryMovements', adapter.newId(), {
    itemId: item.id, itemName: item.name, unit: item.unit, type,
    qtyDeltaH: deltaH, qtyBeforeH: item.qtyH, qtyAfterH: afterH, unitCostC,
    reason: null, note, refType, refId, groupId: null, businessDate,
    createdAt: adapter.serverTime(), createdBy: actor.uid,
  });
  tx.update('items', item.id, { qtyH: afterH, ...stamp(adapter, actor) });
  return afterH;
}

/** Payment document (BR-050). */
export function paymentDoc(adapter, actor, { sale, customer, date, amountC, method, reference = '', note = '', allocations = [], isDownPayment = false, atSale = false }) {
  return {
    saleId: sale.id, customerId: customer.id, customerName: customer.name, date, amountC, method,
    reference: String(reference || '').trim(), note: String(note || '').trim(), allocations, isDownPayment, atSale,
    status: 'ACTIVE', void: null, createdAt: adapter.serverTime(), createdBy: actor.uid,
  };
}

/**
 * Create a sale. input: see planSale; settings: sales settings (prefix, firstDueGapDays …).
 * Returns { saleId, paymentId, totalC, balanceC }.
 */
export async function createSale(adapter, actor, input, settings = DEFAULT_SALES_SETTINGS, today = todayIn()) {
  assertOnline();
  if (!isValidDate(input.saleDate)) throw new DomainError('INVALID_DATE', 'Enter a valid sale date.');
  const year = parseDate(input.saleDate).y;
  const prefix = settings.saleIdPrefix ?? DEFAULT_SALES_SETTINGS.saleIdPrefix;
  const digits = settings.sequenceDigits || 5;
  const itemIds = [...requestedByItem(input.lines || []).keys()];

  return adapter.runTransaction(async (tx) => {
    // ---- reads (all before any write)
    const saleCounter = await tx.get('counters', `sale-${year}`);
    const payCounter = await tx.get('counters', `payment-${year}`);
    const custSnap = await tx.get('customers', input.customerId || WALK_IN_ID);
    const itemsById = {};
    for (const id of itemIds) {
      const s = await tx.get('items', id);
      if (s.exists) itemsById[id] = { id, ...s.data };
    }
    const saleSeq = nextSeq(saleCounter.data);
    const saleId = formatDocNo(prefix, year, saleSeq, digits);
    if ((await tx.get('sales', saleId)).exists) throw new DomainError('DUPLICATE_ID', `Sale number ${saleId} is already used. Check the Sale ID prefix in Settings.`);

    let customer;
    if (custSnap.exists) customer = { id: custSnap.id, ...custSnap.data };
    else if ((input.customerId || WALK_IN_ID) === WALK_IN_ID) customer = { id: WALK_IN_ID, ...walkInDoc(adapter, actor), isNewDoc: true };
    else throw new DomainError('CUSTOMER_MISSING', 'This customer no longer exists.');

    const plan = planSale(input, { itemsById, customer, settings, today });

    // ---- writes
    tx.set('counters', `sale-${year}`, { next: saleSeq + 1 });
    for (const id of itemIds) {
      const qtyH = plan.saleLines.filter((l) => l.itemId === id).reduce((s, l) => s + l.qtyH, 0);
      writeItemMovement(tx, adapter, actor, itemsById[id], { type: MT.SALE, deltaH: -qtyH, unitCostC: itemsById[id].costC, refType: 'SALE', refId: saleId, businessDate: input.saleDate });
    }

    let paymentId = null;
    const sale = { id: saleId };
    if (plan.paidNowC > 0) {
      const paySeq = nextSeq(payCounter.data);
      paymentId = formatDocNo(PAYMENT_PREFIX, year, paySeq);
      tx.set('counters', `payment-${year}`, { next: paySeq + 1 });
      tx.set('payments', paymentId, paymentDoc(adapter, actor, {
        sale, customer, date: input.saleDate, amountC: plan.paidNowC, method: input.method, reference: input.reference,
        isDownPayment: input.terms === TERMS.INSTALLMENT, atSale: true,
      }));
    }

    plan.receivables.forEach((r) => {
      tx.set('installments', installmentId(saleId, r.no), {
        saleId, customerId: customer.id, customerName: customer.name, saleDate: input.saleDate, kind: r.kind, no: r.no, count: plan.receivables.length,
        dueDate: r.dueDate, amountC: r.amountC, paidC: 0, status: STATUS.PENDING, paidDate: null, revisions: [],
        createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
      });
    });

    tx.set('sales', saleId, {
      saleNo: saleId, kind: 'SALE', saleDate: input.saleDate,
      customerId: customer.id, customerName: customer.name, customerContact: customer.contactNumber || '',
      lines: plan.saleLines,
      subtotalC: plan.totals.subtotalC,
      discountType: (input.discount && input.discount.type) || 'NONE', discountValue: (input.discount && input.discount.value) || 0,
      discountC: plan.totals.discountC, totalC: plan.totals.totalC, costC: plan.totals.costC,
      terms: input.terms, paymentMethod: input.terms === TERMS.INSTALLMENT ? 'INSTALLMENT' : input.method,
      plan: plan.plan, paidC: plan.paidNowC, balanceC: plan.balanceC, paymentStatus: paymentStatusOf(plan.paidNowC, plan.totals.totalC),
      paymentIds: paymentId ? [paymentId] : [], installmentCount: plan.receivables.length,
      status: 'ACTIVE', fulfillment: plan.fulfillment, deliveryDate: input.deliveryDate || null, notes: String(input.notes || '').trim(),
      cancel: null, creditLimitOverride: !!plan.creditWarning,
      createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
    });

    const summary = {
      outstandingC: (customer.outstandingC || 0) + plan.balanceC,
      totalPurchasesC: (customer.totalPurchasesC || 0) + plan.totals.totalC,
      lastSaleDate: customer.lastSaleDate && customer.lastSaleDate > input.saleDate ? customer.lastSaleDate : input.saleDate,
    };
    if (customer.isNewDoc) { const { id, isNewDoc, ...doc } = customer; tx.set('customers', WALK_IN_ID, { ...doc, ...summary }); }
    else tx.update('customers', customer.id, { ...summary, ...stamp(adapter, actor) });

    logWrite(tx, adapter, actor, {
      action: 'SALE_CREATE', entityType: 'sale', entityId: saleId,
      summary: `Sale ${saleId} to ${customer.name}: ${formatMoney(plan.totals.totalC)}` + (plan.balanceC ? `, balance ${formatMoney(plan.balanceC)}` : ', paid in full')
        + (plan.saleLines.some((l) => l.priceOverridden) ? ' (price changed on a line)' : ''),
      changes: { lines: plan.saleLines.map((l) => ({ itemId: l.itemId, qtyH: l.qtyH, unitPriceC: l.unitPriceC, listPriceC: l.listPriceC })) },
    });
    if (plan.creditWarning) {
      logWrite(tx, adapter, actor, {
        action: 'CREDIT_LIMIT_OVERRIDE', entityType: 'sale', entityId: saleId,
        summary: `Credit limit of ${customer.name} (${formatMoney(plan.creditWarning.limitC)}) exceeded with sale ${saleId}: balance becomes ${formatMoney(plan.creditWarning.afterC)}`,
      });
    }
    return { saleId, paymentId, totalC: plan.totals.totalC, balanceC: plan.balanceC };
  });
}

/**
 * Cancel a sale (BR-036, D-009): stock returned, active payments voided as refunds, open rows cancelled, customer
 * summary reversed, all in one transaction. Returns { returnedText, refundedC, voidedPayments }.
 */
export async function cancelSale(adapter, actor, saleId, reason) {
  assertOnline();
  const why = String(reason || '').trim();
  if (!why) throw new DomainError('REASON_REQUIRED', 'Enter the reason for cancelling.');
  return adapter.runTransaction(async (tx) => {
    const sale = await readSale(tx, saleId);
    if (sale.status === 'CANCELLED') throw new DomainError('ALREADY_CANCELLED', 'This sale is already cancelled.');
    const itemIds = [...new Set(sale.lines.map((l) => l.itemId))];
    const items = {};
    for (const id of itemIds) {
      const s = await tx.get('items', id);
      if (!s.exists) throw new DomainError('ITEM_MISSING', 'An item of this sale no longer exists; the sale cannot be cancelled.');
      items[id] = { id, ...s.data };
    }
    const rows = await readRows(tx, sale);
    const payments = [];
    for (const pid of sale.paymentIds || []) {
      const s = await tx.get('payments', pid);
      if (s.exists && s.data.status === 'ACTIVE') payments.push({ id: pid, ...s.data });
    }
    const cs = await tx.get('customers', sale.customerId);

    // ---- writes
    for (const id of itemIds) {
      const lines = sale.lines.filter((l) => l.itemId === id);
      const qtyH = lines.reduce((s, l) => s + l.qtyH, 0);
      writeItemMovement(tx, adapter, actor, items[id], { type: MT.SALE_CANCEL, deltaH: qtyH, unitCostC: lines[0].unitCostC, refType: 'SALE', refId: sale.id, businessDate: todayIn(), note: `Cancelled ${sale.id}` });
    }
    const at = adapter.serverTime();
    for (const p of payments) {
      tx.update('payments', p.id, { status: 'VOIDED', void: { reason: `Refunded — sale cancelled: ${why}`, refund: true, at, by: actor.uid } });
    }
    const deltas = [];
    for (const r of rows) {
      if (r.status === STATUS.CANCELLED) continue;
      deltas.push(reliabilityDelta(r, { ...r, status: STATUS.CANCELLED }));
      tx.update('installments', r.id, { status: STATUS.CANCELLED, ...stamp(adapter, actor) });
    }
    const refundedC = payments.reduce((s, p) => s + p.amountC, 0);
    tx.update('sales', sale.id, {
      status: 'CANCELLED', cancel: { reason: why, at, by: actor.uid, refundedC },
      paidC: 0, balanceC: 0, ...stamp(adapter, actor),
    });
    if (cs.exists) {
      const c = cs.data;
      const d = sumDeltas(deltas);
      tx.update('customers', sale.customerId, {
        outstandingC: Math.max(0, (c.outstandingC || 0) - sale.balanceC),
        // Opening balances never counted as purchases (D-045).
        totalPurchasesC: sale.kind === 'OPENING_BALANCE' ? (c.totalPurchasesC || 0) : Math.max(0, (c.totalPurchasesC || 0) - sale.totalC),
        paidInstallments: Math.max(0, (c.paidInstallments || 0) + d.paidInstallments),
        paidOnTime: Math.max(0, (c.paidOnTime || 0) + d.paidOnTime),
        ...stamp(adapter, actor),
      });
    }
    const returnedText = linesText(sale.lines);
    logWrite(tx, adapter, actor, {
      action: 'SALE_CANCEL', entityType: 'sale', entityId: sale.id,
      summary: `Cancelled ${sale.id} (${why})` + (sale.lines.length ? `: returned ${returnedText} to stock` : '') + (payments.length ? `, voided ${payments.length} payment(s) totalling ${formatMoney(refundedC)}` : ''),
      changes: { voidedPayments: payments.map((p) => p.id), refundedC },
    });
    return { returnedText, refundedC, voidedPayments: payments.length };
  });
}

/** Delivery status, delivery date and notes are the only sale fields that may change later (BR-035, BR-037). */
export async function updateFulfillment(adapter, actor, saleId, { fulfillment, deliveryDate, notes }) {
  assertOnline();
  if (!FULFILLMENT[fulfillment]) throw new DomainError('INVALID_STATUS', 'Choose a delivery status.');
  if (deliveryDate && !isValidDate(deliveryDate)) throw new DomainError('INVALID_DATE', 'Enter a valid delivery date.');
  return adapter.runTransaction(async (tx) => {
    const sale = await readSale(tx, saleId);
    if (sale.status !== 'ACTIVE') throw new DomainError('SALE_CANCELLED', 'This sale is cancelled and can no longer be changed.');
    const patch = {};
    if (sale.fulfillment !== fulfillment) patch.fulfillment = fulfillment;
    if ((sale.deliveryDate || null) !== (deliveryDate || null)) patch.deliveryDate = deliveryDate || null;
    const n = String(notes ?? sale.notes ?? '').trim();
    if ((sale.notes || '') !== n) patch.notes = n;
    if (!Object.keys(patch).length) return { changed: false };
    tx.update('sales', saleId, { ...patch, ...stamp(adapter, actor) });
    const what = [];
    if (patch.fulfillment) what.push(`delivery status ${sale.fulfillment} → ${fulfillment}`);
    if ('deliveryDate' in patch) what.push(`delivery date ${patch.deliveryDate || 'cleared'}`);
    if ('notes' in patch) what.push('notes');
    logWrite(tx, adapter, actor, { action: 'SALE_UPDATE', entityType: 'sale', entityId: saleId, summary: `Updated ${saleId}: ${what.join(', ')}` });
    return { changed: true };
  });
}
