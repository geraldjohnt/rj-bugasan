/*
 * Sale planning (Phase 6, BUSINESS_RULES §3–4). Turns the New Sale form into a validated plan that the sale service
 * writes in one transaction. Pure: the caller passes current items, customer and settings.
 */
import { DomainError } from './errors.js';
import { UNITS, formatQty } from './quantity.js';
import { isValidDate, compareDates } from './dates.js';
import { computeTotals, stockShortages, validateTerms, creditLimitWarning, TERMS, DISCOUNT, WALK_IN_ID } from './saleTotals.js';
import { buildSchedule, FREQUENCIES, ALLOWED_COUNTS } from './schedule.js';
import { listPriceFor } from './inventory.js';

export const METHODS = { CASH: 'CASH', BANK: 'BANK', EWALLET: 'EWALLET' };
export const METHOD_LABELS = { CASH: 'Cash', BANK: 'Bank transfer', EWALLET: 'E-wallet', INSTALLMENT: 'Installment' };
export const TERMS_LABELS = { FULL: 'Paid in full', OPEN_BALANCE: 'Partial / pay later', INSTALLMENT: 'Installment' };
export const FULFILLMENT = { PENDING: 'PENDING', DELIVERED: 'DELIVERED', PICKED_UP: 'PICKED_UP' };
export const FULFILLMENT_LABELS = { PENDING: 'Pending', DELIVERED: 'Delivered', PICKED_UP: 'Picked up' };
export const PAYMENT_STATUS_LABELS = { UNPAID: 'Unpaid', PARTIAL: 'Partly paid', PAID: 'Paid' };

/** Lines per sale; keeps every sale transaction far below Firestore's 500-write limit. */
export const MAX_LINES = 40;

export const DEFAULT_SALES_SETTINGS = {
  saleIdPrefix: 'RJ-', sequenceDigits: 5, defaultInstallmentCount: 2, defaultFrequency: FREQUENCIES.MONTHLY_15, firstDueGapDays: 7,
  reminderTemplate: 'Hi {customer}, this is a friendly reminder from {business}: {amount} for {sale} (installment {installment}) is due on {dueDate}. Thank you!',
  receiptFooter: 'Thank you for your purchase!',
};

/** Settings → Sales form (strings as typed). Returns { data, errors }. */
export function validateSalesSettings(form) {
  const errors = {};
  const data = { ...DEFAULT_SALES_SETTINGS, ...form };
  data.saleIdPrefix = String(form.saleIdPrefix ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}-?$/.test(data.saleIdPrefix)) errors.saleIdPrefix = 'Use 1 to 6 letters or digits, optionally ending with "-" (e.g. RJ-).';
  const gap = Number(String(form.firstDueGapDays ?? '').trim());
  if (!Number.isInteger(gap) || gap < 0 || gap > 60) errors.firstDueGapDays = 'Enter 0 to 60 days.';
  else data.firstDueGapDays = gap;
  data.defaultInstallmentCount = Number(form.defaultInstallmentCount);
  if (!ALLOWED_COUNTS.includes(data.defaultInstallmentCount)) errors.defaultInstallmentCount = 'Choose 2, 3, 4 or 5.';
  if (!FREQUENCIES[form.defaultFrequency]) errors.defaultFrequency = 'Choose a frequency.';
  data.reminderTemplate = String(form.reminderTemplate ?? '').trim();
  if (!data.reminderTemplate) errors.reminderTemplate = 'Required.';
  else if (data.reminderTemplate.length > 500) errors.reminderTemplate = 'Use 500 characters or fewer.';
  data.receiptFooter = String(form.receiptFooter ?? '').trim().slice(0, 200);
  data.sequenceDigits = 5;
  delete data.updatedAt; delete data.updatedBy;
  return { data, errors };
}

export const paymentStatusOf = (paidC, totalC) => (paidC >= totalC ? 'PAID' : paidC > 0 ? 'PARTIAL' : 'UNPAID');

/**
 * input: {
 *   saleDate, customerId, lines: [{ itemId, qtyH, unitPriceC }], discount: { type, value },
 *   terms, method (CASH|BANK|EWALLET; for installments the down-payment method), paidNowC,
 *   dueDate (open balance, optional), plan: { count, frequency, downPaymentC, dueDates? (edited dates) },
 *   fulfillment, deliveryDate, notes, creditOverride
 * }
 * ctx: { itemsById, customer, settings, today }
 * Returns { saleLines, totals, paidNowC, balanceC, receivables: [{ no, dueDate, amountC, kind }], creditWarning, plan }.
 */
export function planSale(input, { itemsById, customer, settings = DEFAULT_SALES_SETTINGS, today }) {
  if (!isValidDate(input.saleDate)) throw new DomainError('INVALID_DATE', 'Enter a valid sale date.');
  if (today && compareDates(input.saleDate, today) > 0) throw new DomainError('FUTURE_DATE', 'The sale date cannot be in the future.');
  if (!customer) throw new DomainError('NO_CUSTOMER', 'Choose a customer.');
  if (customer.status !== 'ACTIVE') throw new DomainError('CUSTOMER_ARCHIVED', `${customer.name} is archived. Restore the customer first.`);
  const lines = input.lines || [];
  if (!lines.length) throw new DomainError('NO_LINES', 'Add at least one item.');
  if (lines.length > MAX_LINES) throw new DomainError('TOO_MANY_LINES', `A sale can have at most ${MAX_LINES} lines.`);

  const enriched = lines.map((l) => {
    const item = itemsById[l.itemId];
    if (!item) throw new DomainError('ITEM_MISSING', 'An item in this sale no longer exists.');
    if (item.status !== 'ACTIVE') throw new DomainError('ITEM_ARCHIVED', `${item.name} is archived and cannot be sold.`);
    return { ...l, unit: item.unit, unitCostC: item.costC };
  });

  const shortages = stockShortages(enriched, new Map(Object.values(itemsById).map((i) => [i.id, i.qtyH])));
  if (shortages.length) {
    const s = shortages[0];
    const item = itemsById[s.itemId];
    throw new DomainError('NEGATIVE_STOCK', `Not enough stock: ${item.name} has ${formatQty(s.availableH, item.unit)}, the sale needs ${formatQty(s.requestedH, item.unit)}.`, { shortages });
  }

  const totals = computeTotals(enriched, input.discount || { type: DISCOUNT.NONE });
  const saleLines = totals.lines.map((l) => {
    const item = itemsById[l.itemId];
    const listPriceC = listPriceFor(item, input.terms);
    return {
      itemId: item.id, itemName: item.name, unit: item.unit, sackWeightKg: item.unit === UNITS.SACK ? item.sackWeightKg : null,
      qtyH: l.qtyH, listPriceC, unitPriceC: l.unitPriceC, priceOverridden: l.unitPriceC !== listPriceC,
      unitCostC: item.costC, lineTotalC: l.lineTotalC,
    };
  });

  const terms = input.terms;
  const paidNowC = terms === TERMS.FULL ? totals.totalC : terms === TERMS.INSTALLMENT ? ((input.plan && input.plan.downPaymentC) || 0) : (input.paidNowC || 0);
  const { balanceC } = validateTerms({ terms, totalC: totals.totalC, paidNowC, customerId: customer.id, plan: input.plan });
  if (paidNowC > 0 && !METHODS[input.method]) throw new DomainError('INVALID_METHOD', 'Choose how the customer paid.');

  let receivables = [];
  let plan = null;
  if (terms === TERMS.OPEN_BALANCE) {
    const dueDate = input.dueDate || null;
    if (dueDate && !isValidDate(dueDate)) throw new DomainError('INVALID_DATE', 'Enter a valid due date.');
    if (dueDate && compareDates(dueDate, input.saleDate) < 0) throw new DomainError('INVALID_DATE', 'The due date cannot be before the sale date.');
    receivables = [{ no: 1, dueDate, amountC: balanceC, kind: 'OPEN_BALANCE' }];
  } else if (terms === TERMS.INSTALLMENT) {
    const gapDays = Number.isInteger(input.plan.gapDays) ? input.plan.gapDays : settings.firstDueGapDays;
    const sched = buildSchedule({ totalC: totals.totalC, downPaymentC: paidNowC, count: input.plan.count, frequency: input.plan.frequency, saleDate: input.saleDate, gapDays });
    const edited = input.plan.dueDates || [];
    let prev = input.saleDate;
    receivables = sched.installments.map((row, i) => {
      const dueDate = edited[i] || row.dueDate;
      if (!isValidDate(dueDate)) throw new DomainError('INVALID_DATE', `Installment ${row.no}: enter a valid due date.`);
      if (compareDates(dueDate, prev) < 0) throw new DomainError('INVALID_DATE', `Installment ${row.no}: due dates must be in order and not before the sale date.`);
      prev = dueDate;
      return { no: row.no, dueDate, amountC: row.amountC, kind: 'INSTALLMENT' };
    });
    plan = { count: input.plan.count, frequency: input.plan.frequency, downPaymentC: paidNowC, firstDueGapDays: gapDays };
  }

  const creditWarning = customer.id === WALK_IN_ID ? null : creditLimitWarning(customer, balanceC);
  if (creditWarning && !input.creditOverride) {
    throw new DomainError('CREDIT_LIMIT', 'This sale goes over the customer\'s credit limit. Confirm to continue.', creditWarning);
  }
  const fulfillment = FULFILLMENT[input.fulfillment] ? input.fulfillment : FULFILLMENT.PENDING;
  if (input.deliveryDate && !isValidDate(input.deliveryDate)) throw new DomainError('INVALID_DATE', 'Enter a valid delivery date.');
  return { saleLines, totals, paidNowC, balanceC, receivables, plan, creditWarning, fulfillment };
}

/** Next sequence for a counter document ({ next }) read inside a transaction. */
export const nextSeq = (counterDoc) => (counterDoc && Number.isInteger(counterDoc.next) ? counterDoc.next : 1);

/** "3 sacks Dinorado 50kg Sack, 2.5 kg Malagkit per KG" — what goes back to stock when a sale is cancelled. */
export const linesText = (lines) => lines.map((l) => `${formatQty(l.qtyH, l.unit)} ${l.itemName}`).join(', ');
