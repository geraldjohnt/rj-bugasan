/*
 * Calendar (Phase 9, RQ-035). Events are derived from sales, receivable rows, restocks and deliveries; only custom
 * events are stored (calendarEvents). Pure functions.
 */
import { addDays, parseDate, toDateString, daysInMonth, compareDates, isValidDate, formatDate } from './dates.js';
import { formatMoney } from './money.js';
import { remainingOf, isOverdue, STATUS } from './allocation.js';
import { DomainError } from './errors.js';

export const CAL = { SALE: 'SALE', PAYMENT_DUE: 'PAYMENT_DUE', OVERDUE: 'OVERDUE', RESTOCK: 'RESTOCK', DELIVERY: 'DELIVERY', OTHER: 'OTHER' };
export const CAL_LABELS = { SALE: 'Sales', PAYMENT_DUE: 'Payment due', OVERDUE: 'Overdue', RESTOCK: 'Restocking', DELIVERY: 'Deliveries', OTHER: 'Other' };
export const CAL_ORDER = [CAL.OVERDUE, CAL.PAYMENT_DUE, CAL.DELIVERY, CAL.RESTOCK, CAL.SALE, CAL.OTHER];
const RANK = Object.fromEntries(CAL_ORDER.map((c, i) => [c, i]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthTitle = (y, m) => `${MONTHS[m - 1]} ${y}`;
export const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export function parseMonthKey(key, fallback) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '');
  if (m && +m[2] >= 1 && +m[2] <= 12) return { y: +m[1], m: +m[2] };
  const d = parseDate(fallback);
  return { y: d.y, m: d.m };
}
export function shiftMonth({ y, m }, n) {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Weeks (Sunday first) covering the month: array of 7-date arrays. */
export function monthGrid(y, m) {
  const first = toDateString(y, m, 1);
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const start = addDays(first, -dow);
  const last = toDateString(y, m, daysInMonth(y, m));
  const weeks = [];
  let d = start;
  while (compareDates(d, last) <= 0) {
    const w = [];
    for (let i = 0; i < 7; i++) { w.push(d); d = addDays(d, 1); }
    weeks.push(w);
  }
  return weeks;
}

/** { from, to } of the grid shown for a month (whole weeks). */
export function gridRange(y, m) {
  const g = monthGrid(y, m);
  return { from: g[0][0], to: g[g.length - 1][6] };
}

const isOpenRow = (r) => r.status === STATUS.PENDING || r.status === STATUS.PARTIAL;

/**
 * Build calendar events. src: { sales, rows, restocks, custom } (any may be missing); today = business date.
 * Each event: { id, date, category, title, detail, to (link path) | null, custom (stored event) | null, done }.
 */
export function buildEvents({ sales = [], rows = [], restocks = [], custom = [] }, today) {
  const out = [];
  for (const s of sales) {
    if (s.status !== 'ACTIVE') continue;
    if (s.kind !== 'OPENING_BALANCE' && s.saleDate) {
      out.push({ id: `sale-${s.id}`, date: s.saleDate, category: CAL.SALE, title: `${s.id} · ${s.customerName}`, detail: formatMoney(s.totalC), to: `/sales/${s.id}`, done: true });
    }
    if (s.deliveryDate) {
      const pending = s.fulfillment === 'PENDING';
      out.push({
        id: `delivery-${s.id}`, date: s.deliveryDate, category: CAL.DELIVERY,
        title: `${pending ? 'Deliver' : s.fulfillment === 'PICKED_UP' ? 'Picked up' : 'Delivered'}: ${s.customerName}`,
        detail: s.id, to: `/sales/${s.id}`, done: !pending, late: pending && compareDates(s.deliveryDate, today) < 0,
      });
    }
  }
  for (const r of rows) {
    if (!isOpenRow(r) || !r.dueDate) continue;
    const overdue = isOverdue(r, today);
    out.push({
      id: `due-${r.id}`, date: r.dueDate, category: overdue ? CAL.OVERDUE : CAL.PAYMENT_DUE,
      title: `${r.customerName} · ${formatMoney(remainingOf(r))}`,
      detail: `${r.saleId} · ${r.kind === 'OPEN_BALANCE' ? 'Balance' : `Installment ${r.no} of ${r.count}`}`, to: `/sales/${r.saleId}`, done: false,
    });
  }
  for (const r of restocks) {
    if (r.status === 'CANCELLED') continue;
    if (r.expectedDate && (r.status === 'ORDERED' || r.status === 'PARTIALLY_RECEIVED')) {
      out.push({ id: `restock-${r.id}`, date: r.expectedDate, category: CAL.RESTOCK, title: `Expected: ${r.supplierName}`, detail: r.id, to: `/restocks/${r.id}`, done: false, late: compareDates(r.expectedDate, today) < 0 });
    }
    (r.receipts || []).forEach((rc, i) => out.push({
      id: `receipt-${r.id}-${i}`, date: rc.date, category: CAL.RESTOCK, title: `Received: ${r.supplierName}`, detail: r.id, to: `/restocks/${r.id}`, done: true,
    }));
  }
  for (const e of custom) {
    out.push({ id: `custom-${e.id}`, date: e.date, category: CAL.OTHER, title: e.title, detail: [e.time, e.note].filter(Boolean).join(' · '), to: null, custom: e, done: false, time: e.time || '' });
  }
  return out.sort((a, b) => compareDates(a.date, b.date) || RANK[a.category] - RANK[b.category] || String(a.time || '').localeCompare(String(b.time || '')) || a.title.localeCompare(b.title));
}

/** { 'YYYY-MM-DD': [events] } for events whose category is enabled. */
export function eventsByDate(events, enabled) {
  const map = {};
  for (const e of events) {
    if (enabled && !enabled[e.category]) continue;
    (map[e.date] = map[e.date] || []).push(e);
  }
  return map;
}

/* ------------------------------------------------------------------ custom events */

export function validateEventForm(form) {
  const errors = {};
  const data = { title: String(form.title || '').trim(), date: form.date, time: String(form.time || '').trim(), note: String(form.note || '').trim() };
  if (!data.title) errors.title = 'Required.';
  else if (data.title.length > 120) errors.title = 'Use 120 characters or fewer.';
  if (!isValidDate(data.date)) errors.date = 'Enter a valid date.';
  if (data.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) errors.time = 'Use a time like 09:30.';
  if (data.note.length > 500) errors.note = 'Too long.';
  return { data, errors };
}

export function assertEvent(data) {
  const { errors } = validateEventForm(data);
  const first = Object.values(errors)[0];
  if (first) throw new DomainError('INVALID_EVENT', first, { errors });
}

export const eventDateLabel = (d, today) => (d === today ? `Today · ${formatDate(d)}` : formatDate(d));
