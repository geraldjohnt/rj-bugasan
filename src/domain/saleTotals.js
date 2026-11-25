/*
 * Sale lines, totals, discount, payment terms (BR-031 … BR-034, BR-021, BR-024).
 */
import { DomainError } from './errors.js';
import { mulDivRound, sum } from './money.js';
import { validateQty } from './quantity.js';
import { ALLOWED_COUNTS } from './schedule.js';

export const DISCOUNT = { NONE: 'NONE', PERCENT: 'PERCENT', FIXED: 'FIXED' };
export const TERMS = { FULL: 'FULL', OPEN_BALANCE: 'OPEN_BALANCE', INSTALLMENT: 'INSTALLMENT' };
export const WALK_IN_ID = 'WALK_IN';

/** Line total = round(qtyH × unitPriceC / 100) (BR-004). */
export const lineTotal = (qtyH, unitPriceC) => mulDivRound(qtyH, unitPriceC, 100);
export const lineCost = (qtyH, unitCostC) => mulDivRound(qtyH, unitCostC, 100);

/**
 * discount: { type, value } — PERCENT value in hundredths of a percent (5.5% → 550), FIXED value in centavos.
 */
export function discountAmount(subtotalC, discount) {
  if (!discount || discount.type === DISCOUNT.NONE) return 0;
  const v = discount.value;
  if (!Number.isInteger(v) || v < 0) throw new DomainError('INVALID_DISCOUNT', 'Discount cannot be negative.');
  if (discount.type === DISCOUNT.PERCENT) {
    if (v > 10000) throw new DomainError('INVALID_DISCOUNT', 'Discount cannot be more than 100%.');
    return mulDivRound(subtotalC, v, 10000);
  }
  if (discount.type === DISCOUNT.FIXED) {
    if (v > subtotalC) throw new DomainError('INVALID_DISCOUNT', 'Discount cannot be more than the subtotal.');
    return v;
  }
  throw new DomainError('INVALID_DISCOUNT', 'Unknown discount type.');
}

/** lines: [{ itemId, unit, qtyH, unitPriceC, unitCostC }] */
export function computeTotals(lines, discount) {
  if (!lines.length) throw new DomainError('NO_LINES', 'Add at least one item.');
  const computed = lines.map((l) => {
    validateQty(l.qtyH, l.unit);
    if (!Number.isInteger(l.unitPriceC) || l.unitPriceC < 0) throw new DomainError('INVALID_PRICE', 'Price cannot be negative.');
    return { ...l, lineTotalC: lineTotal(l.qtyH, l.unitPriceC), belowCost: l.unitCostC != null && l.unitPriceC < l.unitCostC };
  });
  const subtotalC = sum(computed.map((l) => l.lineTotalC));
  const discountC = discountAmount(subtotalC, discount);
  const costC = sum(computed.map((l) => lineCost(l.qtyH, l.unitCostC || 0)));
  return { lines: computed, subtotalC, discountC, totalC: subtotalC - discountC, costC, grossProfitC: subtotalC - discountC - costC };
}

/** Total requested quantity per item across lines (BR-031). */
export function requestedByItem(lines) {
  const m = new Map();
  for (const l of lines) m.set(l.itemId, (m.get(l.itemId) || 0) + l.qtyH);
  return m;
}

/** Returns [{ itemId, requestedH, availableH }] for every item that lacks stock. */
export function stockShortages(lines, availableByItem) {
  const out = [];
  for (const [itemId, requestedH] of requestedByItem(lines)) {
    const availableH = availableByItem.get(itemId) ?? 0;
    if (requestedH > availableH) out.push({ itemId, requestedH, availableH });
  }
  return out;
}

/** Validates the payment part of a sale. Returns { paidNowC, balanceC }. */
export function validateTerms({ terms, totalC, paidNowC = 0, customerId, plan }) {
  if (!Number.isInteger(paidNowC) || paidNowC < 0) throw new DomainError('INVALID_AMOUNT', 'Amount paid cannot be negative.');
  if (paidNowC > totalC) throw new DomainError('OVERPAYMENT', 'Amount paid is more than the total. Give the difference back as change.');
  const isWalkIn = !customerId || customerId === WALK_IN_ID;
  switch (terms) {
    case TERMS.FULL:
      if (paidNowC !== totalC) throw new DomainError('NOT_FULLY_PAID', 'Full payment must equal the total.');
      break;
    case TERMS.OPEN_BALANCE:
      if (isWalkIn) throw new DomainError('WALK_IN_BALANCE', 'Walk-in sales must be paid in full. Select a registered customer to leave a balance.');
      if (paidNowC >= totalC) throw new DomainError('NO_BALANCE', 'Nothing is left to pay. Use full payment.');
      break;
    case TERMS.INSTALLMENT:
      if (isWalkIn) throw new DomainError('WALK_IN_BALANCE', 'Installment sales need a registered customer.');
      if (!plan || !ALLOWED_COUNTS.includes(plan.count)) throw new DomainError('INVALID_COUNT', 'Choose 3, 4 or 5 installments.');
      if (paidNowC !== (plan.downPaymentC || 0)) throw new DomainError('DOWN_PAYMENT_MISMATCH', 'Amount paid now must equal the down payment.');
      break;
    default:
      throw new DomainError('INVALID_TERMS', 'Choose how the customer will pay.');
  }
  return { paidNowC, balanceC: totalC - paidNowC };
}

/** BR-024: warn (not block) when a credit limit would be exceeded. */
export function creditLimitWarning(customer, newBalanceC) {
  if (!customer || customer.creditLimitC == null || newBalanceC <= 0) return null;
  const after = (customer.outstandingC || 0) + newBalanceC;
  return after > customer.creditLimitC ? { limitC: customer.creditLimitC, afterC: after } : null;
}

/** Sequenced document number: ("RJ-", 2026, 12) → "RJ-2026-00012" (BR-030). */
export function formatDocNo(prefix, year, seq, digits = 5) {
  return `${prefix}${year}-${String(seq).padStart(digits, '0')}`;
}
