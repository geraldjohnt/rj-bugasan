/*
 * Collections and customer statements (Phase 7, RQ-034, BR-044, BR-025). Pure functions.
 */
import { addDays, compareDates, daysBetween, formatDate } from './dates.js';
import { formatMoney } from './money.js';
import { remainingOf, isOverdue, STATUS } from './allocation.js';

export const BUCKETS = { OVERDUE: 'OVERDUE', TODAY: 'TODAY', WEEK: 'WEEK', UPCOMING: 'UPCOMING', NO_DATE: 'NO_DATE' };
export const BUCKET_LABELS = { OVERDUE: 'Overdue', TODAY: 'Due today', WEEK: 'Next 7 days', UPCOMING: 'Later', NO_DATE: 'No due date' };

/** Which collections tab an open receivable row belongs to. "Next 7 days" = tomorrow … today + 7. */
export function bucketOf(row, today) {
  if (!row.dueDate) return BUCKETS.NO_DATE;
  if (isOverdue(row, today)) return BUCKETS.OVERDUE;
  if (row.dueDate === today) return BUCKETS.TODAY;
  if (compareDates(row.dueDate, addDays(today, 7)) <= 0) return BUCKETS.WEEK;
  return BUCKETS.UPCOMING;
}

const isOpen = (r) => r.status === STATUS.PENDING || r.status === STATUS.PARTIAL;

/** Group open rows into buckets, oldest due first; returns { [bucket]: { rows, totalC } }. */
export function groupCollections(rows, today) {
  const out = Object.fromEntries(Object.values(BUCKETS).map((b) => [b, { rows: [], totalC: 0 }]));
  const open = rows.filter(isOpen).sort((a, b) => compareDates(a.dueDate || '9999-12-31', b.dueDate || '9999-12-31') || a.saleId.localeCompare(b.saleId) || a.no - b.no);
  for (const r of open) {
    const b = out[bucketOf(r, today)];
    const remainingC = remainingOf(r);
    b.rows.push({ ...r, remainingC, daysOverdue: isOverdue(r, today) ? daysBetween(r.dueDate, today) : 0 });
    b.totalC += remainingC;
  }
  return out;
}

/** Fill the reminder template (Settings → Sales). Unknown placeholders are left as typed. */
export function reminderText(template, { customer, business, amountC, saleNo, installment, count, dueDate }) {
  const values = {
    customer: customer || '', business: business || '', amount: formatMoney(amountC || 0), sale: saleNo || '',
    installment: count ? `${installment} of ${count}` : String(installment || ''), dueDate: dueDate ? formatDate(dueDate) : 'soon',
  };
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

/**
 * Reliability counters (BR-025) change when an installment becomes or stops being fully paid.
 * Only rows with a due date count. Returns { paidInstallments, paidOnTime } deltas.
 */
export function reliabilityDelta(before, after) {
  const counts = (r) => (r.status === STATUS.PAID && r.dueDate ? { p: 1, t: compareDates(r.paidDate, r.dueDate) <= 0 ? 1 : 0 } : { p: 0, t: 0 });
  const a = counts(before), b = counts(after);
  return { paidInstallments: b.p - a.p, paidOnTime: b.t - a.t };
}

export function sumDeltas(deltas) {
  return deltas.reduce((s, d) => ({ paidInstallments: s.paidInstallments + d.paidInstallments, paidOnTime: s.paidOnTime + d.paidOnTime }), { paidInstallments: 0, paidOnTime: 0 });
}

/**
 * Customer statement (RQ-038 data, Phase 7): sales (charges) and payments (credits) in date order with a running
 * balance. Cancelled sales and voided payments are left out, so the closing balance equals the customer's outstanding.
 */
export function buildStatement(sales, payments) {
  const entries = [
    ...sales.filter((s) => s.status === 'ACTIVE').map((s) => ({ date: s.saleDate, kind: 'SALE', ref: s.id, description: s.kind === 'OPENING_BALANCE' ? 'Opening balance' : 'Sale', chargeC: s.totalC, creditC: 0, order: 0 })),
    ...payments.filter((p) => p.status === 'ACTIVE').map((p) => ({ date: p.date, kind: 'PAYMENT', ref: p.id, saleId: p.saleId, description: p.isDownPayment ? 'Down payment' : 'Payment', chargeC: 0, creditC: p.amountC, order: 1 })),
  ].sort((a, b) => compareDates(a.date, b.date) || a.order - b.order || a.ref.localeCompare(b.ref));
  let bal = 0;
  for (const e of entries) { bal += e.chargeC - e.creditC; e.balanceC = bal; }
  return { entries, totalChargesC: entries.reduce((s, e) => s + e.chargeC, 0), totalCreditsC: entries.reduce((s, e) => s + e.creditC, 0), balanceC: bal };
}
