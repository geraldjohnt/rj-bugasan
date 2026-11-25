/*
 * Payment allocation to receivable rows (BR-044, BR-050 … BR-052).
 * Row shape: { id, no, dueDate, amountC, paidC, status, paidDate }
 */
import { DomainError } from './errors.js';
import { compareDates, daysBetween } from './dates.js';
import { sum } from './money.js';

export const STATUS = { PENDING: 'PENDING', PARTIAL: 'PARTIAL', PAID: 'PAID', CANCELLED: 'CANCELLED' };

export const remainingOf = (row) => (row.status === STATUS.CANCELLED ? 0 : row.amountC - (row.paidC || 0));
export const outstandingOf = (rows) => sum(rows.map(remainingOf));

export function statusFor(row) {
  if (row.status === STATUS.CANCELLED) return STATUS.CANCELLED;
  const paid = row.paidC || 0;
  return paid >= row.amountC ? STATUS.PAID : paid > 0 ? STATUS.PARTIAL : STATUS.PENDING;
}

/** Overdue is derived, never stored (BR-044). */
export function isOverdue(row, today) {
  return row.status !== STATUS.PAID && row.status !== STATUS.CANCELLED && !!row.dueDate && compareDates(row.dueDate, today) < 0;
}

/** Every row always carries paidC and paidDate so stored documents have a consistent shape. */
const normalize = (r) => ({ ...r, paidC: r.paidC || 0, paidDate: r.paidDate ?? null });

const order = (a, b) => (a.no || 0) - (b.no || 0) || compareDates(a.dueDate || '9999-12-31', b.dueDate || '9999-12-31');

/**
 * Allocate a payment oldest-first. Returns { allocations: [{ installmentId, amountC }], rows: updatedRows }.
 * Throws if the payment exceeds the outstanding balance (surplus is change, never stored — BR-051).
 */
export function allocatePayment(rows, amountC, paymentDate) {
  if (!Number.isInteger(amountC) || amountC <= 0) throw new DomainError('INVALID_AMOUNT', 'Payment must be greater than zero.');
  const outstanding = outstandingOf(rows);
  if (amountC > outstanding) throw new DomainError('OVERPAYMENT', 'Payment is more than the remaining balance. Give the difference back as change.', { outstanding });
  let left = amountC;
  const allocations = [];
  const updated = new Map();
  for (const row of [...rows].sort(order)) {
    if (left === 0) break;
    const rem = remainingOf(row);
    if (rem <= 0) continue;
    const take = Math.min(rem, left);
    left -= take;
    allocations.push({ installmentId: row.id, amountC: take });
    const next = { ...row, paidC: (row.paidC || 0) + take };
    next.status = statusFor(next);
    next.paidDate = next.status === STATUS.PAID ? paymentDate : null;
    updated.set(row.id, next);
  }
  return { allocations, rows: rows.map((r) => normalize(updated.get(r.id) || r)) };
}

/** Reverse a payment's allocations (void, BR-052). */
export function reverseAllocations(rows, allocations) {
  const byId = new Map(allocations.map((a) => [a.installmentId, a.amountC]));
  return rows.map((row) => {
    if (!byId.has(row.id)) return normalize(row);
    const paidC = (row.paidC || 0) - byId.get(row.id);
    if (paidC < 0) throw new DomainError('INCONSISTENT', `Cannot reverse more than was paid on installment ${row.no}.`);
    const next = { ...row, paidC };
    next.status = statusFor(next);
    if (next.status !== STATUS.PAID) next.paidDate = null;
    return normalize(next);
  });
}

/** BR-025 reliability label from counts of fully paid installments. */
export function reliability(paidCount, paidOnTimeCount) {
  if (paidCount < 3) return { label: 'New', ratio: null };
  const ratio = paidOnTimeCount / paidCount;
  return { label: ratio >= 0.9 ? 'Good' : ratio >= 0.7 ? 'Fair' : 'Poor', ratio };
}

export const paidOnTime = (row) => row.status === STATUS.PAID && !!row.dueDate && compareDates(row.paidDate, row.dueDate) <= 0;

/** Aging bucket by days past due (BR §7). */
export function agingBucket(row, today) {
  if (!isOverdue(row, today)) return 'CURRENT';
  const days = daysBetween(row.dueDate, today);
  return days <= 30 ? 'D1_30' : days <= 60 ? 'D31_60' : 'D61_PLUS';
}
