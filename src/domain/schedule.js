/*
 * Installment schedules (BR-041 … BR-045).
 */
import { DomainError } from './errors.js';
import { addDays, addMonths, compareDates, isValidDate, lastDayOfMonth, parseDate, toDateString } from './dates.js';
import { sum } from './money.js';

export const FREQUENCIES = {
  MONTHLY_15: 'MONTHLY_15',       // every 15th
  MONTHLY_EOM: 'MONTHLY_EOM',     // every last day of month
  SEMI_MONTHLY: 'SEMI_MONTHLY',   // 15th and last day
};
export const FREQUENCY_LABELS = {
  MONTHLY_15: 'Monthly, every 15th',
  MONTHLY_EOM: 'Monthly, end of month',
  SEMI_MONTHLY: 'Twice a month (15th and end of month)',
};
export const ALLOWED_COUNTS = [3, 4, 5];

/** Candidate due dates of a frequency within a month, in order. */
function candidatesInMonth(y, m, frequency) {
  switch (frequency) {
    case FREQUENCIES.MONTHLY_15: return [toDateString(y, m, 15)];
    case FREQUENCIES.MONTHLY_EOM: return [lastDayOfMonth(y, m)];
    case FREQUENCIES.SEMI_MONTHLY: return [toDateString(y, m, 15), lastDayOfMonth(y, m)];
    default: throw new DomainError('INVALID_FREQUENCY', 'Choose a payment frequency.');
  }
}

/** The first `count` candidate dates that are on or after `fromDate`. */
export function nextDueDates(fromDate, frequency, count) {
  const out = [];
  const { y, m } = parseDate(fromDate);
  for (let i = 0; out.length < count; i++) {
    const ym = addMonths(toDateString(y, m, 1), i);
    for (const d of candidatesInMonth(ym.y, ym.m, frequency)) {
      if (compareDates(d, fromDate) >= 0 && out.length < count) out.push(d);
    }
  }
  return out;
}

/** BR-042: first due date is the first candidate at least `gapDays` after the sale date. */
export function firstDueDate(saleDate, frequency, gapDays = 7) {
  return nextDueDates(addDays(saleDate, gapDays), frequency, 1)[0];
}

/** BR-043: whole-peso installments, remainder (incl. centavos) on the last one. Sum is always exact. */
export function splitAmount(financedC, count) {
  if (!ALLOWED_COUNTS.includes(count)) throw new DomainError('INVALID_COUNT', `Number of installments must be ${ALLOWED_COUNTS.join(', ')}.`);
  if (!Number.isInteger(financedC) || financedC <= 0) throw new DomainError('NOTHING_TO_FINANCE', 'Amount to pay in installments must be greater than zero.');
  const base = Math.floor(financedC / count / 100) * 100;
  if (base < 100) throw new DomainError('INSTALLMENT_TOO_SMALL', 'Each installment would be less than ₱1. Reduce the number of installments.');
  const amounts = Array(count).fill(base);
  amounts[count - 1] = financedC - base * (count - 1);
  return amounts;
}

/**
 * Build a schedule. Returns { financedC, installments: [{ no, dueDate, amountC }] }.
 * downPaymentC is optional (BR-026) and must leave something to finance.
 */
export function buildSchedule({ totalC, downPaymentC = 0, count, frequency, saleDate, gapDays = 7 }) {
  if (!Number.isInteger(downPaymentC) || downPaymentC < 0) throw new DomainError('INVALID_DOWN_PAYMENT', 'Down payment cannot be negative.');
  if (downPaymentC >= totalC) throw new DomainError('INVALID_DOWN_PAYMENT', 'Down payment must be less than the total. Use a full payment instead.');
  const financedC = totalC - downPaymentC;
  const amounts = splitAmount(financedC, count);
  const dates = nextDueDates(addDays(saleDate, gapDays), frequency, count);
  return { financedC, installments: amounts.map((amountC, i) => ({ no: i + 1, dueDate: dates[i], amountC })) };
}

/**
 * BR-045: validate a revision of unpaid installments.
 * current: [{ no, dueDate, amountC, paidC, status }], proposed: [{ no, dueDate, amountC }] for editable rows.
 * Fully paid rows cannot change; partially paid rows cannot go below what is paid; the total must not change.
 */
export function validateRevision(current, proposed) {
  const byNo = new Map(proposed.map((p) => [p.no, p]));
  const result = current.map((row) => {
    const p = byNo.get(row.no);
    if (!p) return row;
    if (row.status === 'PAID' || row.status === 'CANCELLED') {
      if (p.amountC !== row.amountC || p.dueDate !== row.dueDate) throw new DomainError('ROW_LOCKED', `Installment ${row.no} is ${row.status.toLowerCase()} and cannot be changed.`);
      return row;
    }
    if (!isValidDate(p.dueDate)) throw new DomainError('INVALID_DATE', `Installment ${row.no}: enter a valid due date.`);
    if (!Number.isInteger(p.amountC) || p.amountC <= 0) throw new DomainError('INVALID_AMOUNT', `Installment ${row.no}: amount must be greater than zero.`);
    if (p.amountC < (row.paidC || 0)) throw new DomainError('BELOW_PAID', `Installment ${row.no}: amount cannot be less than the ₱ already paid.`);
    return { ...row, dueDate: p.dueDate, amountC: p.amountC };
  });
  const before = sum(current.filter((r) => r.status !== 'CANCELLED').map((r) => r.amountC));
  const after = sum(result.filter((r) => r.status !== 'CANCELLED').map((r) => r.amountC));
  if (before !== after) throw new DomainError('TOTAL_CHANGED', 'The installments must still add up to the same total.', { before, after });
  return result;
}
