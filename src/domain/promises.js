/*
 * Promised payment dates (Phase 15, D-068, D-069). Pure functions.
 * A promise is added to a receivable row when a payment leaves a row that is due today or overdue not fully paid
 * (or added by hand later). It never changes the row's due date or the other rows.
 * Row field: promises: [{ date, amountC, madeOn, paymentId|null, by, at }] (oldest first).
 */
import { DomainError } from './errors.js';
import { compareDates, isValidDate, formatDate } from './dates.js';
import { remainingOf, STATUS } from './allocation.js';

export const PROMISE_STATUS = { OPEN: 'OPEN', KEPT: 'KEPT', MISSED: 'MISSED', REPLACED: 'REPLACED' };
export const PROMISE_LABELS = { OPEN: 'Promised', KEPT: 'Kept', MISSED: 'Missed', REPLACED: 'Replaced' };
export const MAX_PROMISES = 30;

const isOpenRow = (r) => r.status === STATUS.PENDING || r.status === STATUS.PARTIAL;
export const promisesOf = (row) => (row && Array.isArray(row.promises) ? row.promises : []);

/**
 * Status of the promise at index idx of row.promises:
 * KEPT     – the row was fully paid on or before the promised date;
 * REPLACED – a newer promise was made before this one's date passed (e.g. another partial payment);
 * MISSED   – its date passed (or a newer promise came after it) without the row being fully paid;
 * OPEN     – still waiting.
 */
export function promiseStatus(row, idx, today) {
  const list = promisesOf(row);
  const p = list[idx];
  if (row.status === STATUS.PAID && row.paidDate && compareDates(row.paidDate, p.date) <= 0
    && compareDates(p.madeOn, row.paidDate) <= 0 && !list.slice(idx + 1).some((q) => compareDates(q.madeOn, row.paidDate) <= 0)) return PROMISE_STATUS.KEPT;
  const later = list[idx + 1];
  if (later) return compareDates(later.madeOn, p.date) <= 0 ? PROMISE_STATUS.REPLACED : PROMISE_STATUS.MISSED;
  if (row.status === STATUS.CANCELLED) return PROMISE_STATUS.REPLACED;
  if (row.status === STATUS.PAID) return PROMISE_STATUS.MISSED; // paid, but after the promised date
  return compareDates(today, p.date) > 0 ? PROMISE_STATUS.MISSED : PROMISE_STATUS.OPEN;
}

/** Every promise of a row with its status, oldest first. */
export const promiseHistory = (row, today) => promisesOf(row).map((p, i) => ({ ...p, status: promiseStatus(row, i, today) }));

/** The row's open promise (the latest, while waiting), or null. */
export function openPromise(row, today) {
  const list = promisesOf(row);
  if (!list.length || !isOpenRow(row)) return null;
  const i = list.length - 1;
  return promiseStatus(row, i, today) === PROMISE_STATUS.OPEN ? { ...list[i], status: PROMISE_STATUS.OPEN } : null;
}

/** The latest promise when it was missed and no newer one exists (the row still needs one), or null. */
export function missedPromise(row, today) {
  const list = promisesOf(row);
  if (!list.length || !isOpenRow(row)) return null;
  const i = list.length - 1;
  return promiseStatus(row, i, today) === PROMISE_STATUS.MISSED ? { ...list[i], status: PROMISE_STATUS.MISSED } : null;
}

/** D-068: rows that need a promise after a payment dated `date` — open rows due on or before it with something left to pay. */
export const rowsNeedingPromise = (rows, date) => rows.filter((r) => isOpenRow(r) && r.dueDate && compareDates(r.dueDate, date) <= 0 && remainingOf(r) > 0);

/** A promised date must be on or after `from` (today, or the payment date). */
export function checkPromiseDate(date, from, message = 'The promised date cannot be in the past.') {
  if (!isValidDate(date)) throw new DomainError('INVALID_DATE', 'Enter the date the customer promised to pay the rest.', { field: 'promiseDate' });
  if (compareDates(date, from) < 0) throw new DomainError('INVALID_DATE', message, { field: 'promiseDate' });
  return date;
}

/** D-068 warning: the next due date of the sale after these rows, when the promise falls after it (else null). */
export function promiseAfterNextDue(rows, needing, date) {
  const last = needing.reduce((m, r) => Math.max(m, r.no || 0), 0);
  const next = rows.filter((r) => isOpenRow(r) && (r.no || 0) > last && r.dueDate).sort((a, b) => compareDates(a.dueDate, b.dueDate))[0];
  return next && compareDates(date, next.dueDate) > 0 ? next : null;
}

/** Add a promise for the row's unpaid rest. */
export function withPromise(row, { date, madeOn, paymentId = null, by, at }) {
  const list = promisesOf(row);
  if (list.length >= MAX_PROMISES) throw new DomainError('TOO_MANY', `Installment ${row.no} already has ${MAX_PROMISES} promises.`);
  return { ...row, promises: [...list, { date, amountC: remainingOf(row), madeOn, paymentId, by, at }] };
}

/** Voiding a payment removes the promises it created (D-068). */
export const withoutPaymentPromises = (row, paymentId) => ({ ...row, promises: promisesOf(row).filter((p) => p.paymentId !== paymentId) });

/** D-069 reliability: see paidOnTime in allocation.js (due date, or a promised date made before paying). */
export { paidOnTime as paidOnTimeWithPromises } from './allocation.js';

/**
 * Open (and latest missed) promises of many rows, soonest first, for Collections and the customer statement.
 * Returns [{ row, promise: { date, amountC (≤ still to pay), madeOn, status } }].
 */
export function currentPromises(rows, today) {
  const out = [];
  for (const r of rows || []) {
    const p = openPromise(r, today) || missedPromise(r, today);
    if (p) out.push({ row: r, promise: { ...p, amountC: Math.min(p.amountC, remainingOf(r)) } });
  }
  return out.sort((a, b) => compareDates(a.promise.date, b.promise.date) || String(a.row.saleId).localeCompare(String(b.row.saleId)) || (a.row.no || 0) - (b.row.no || 0));
}

export const promiseText = (p) => `${PROMISE_LABELS[p.status] || 'Promised'} ${formatDate(p.date)}`;
