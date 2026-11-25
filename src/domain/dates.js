/*
 * Business dates are "YYYY-MM-DD" strings in Asia/Manila (BR-003). All arithmetic is done in UTC on the
 * calendar date only, so time zones and daylight saving can never shift a date.
 */
import { DomainError } from './errors.js';

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export function parseDate(s) {
  const m = RE.exec(s || '');
  if (!m) throw new DomainError('INVALID_DATE', `Invalid date: ${s}`);
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) throw new DomainError('INVALID_DATE', `Invalid date: ${s}`);
  return { y, m: mo, d };
}
export const isValidDate = (s) => { try { parseDate(s); return true; } catch (e) { return false; } };
export const toDateString = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const lastDayOfMonth = (y, m) => toDateString(y, m, daysInMonth(y, m));

const toUtc = (s) => { const { y, m, d } = parseDate(s); return Date.UTC(y, m - 1, d); };
const fromUtc = (t) => { const x = new Date(t); return toDateString(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };

export const addDays = (s, n) => fromUtc(toUtc(s) + n * 86400000);
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000); // b − a
export const compareDates = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // ISO strings sort correctly

export function addMonths(s, n) {
  const { y, m } = parseDate(s);
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Today's business date in the given time zone (default Asia/Manila). */
export function today(timeZone = 'Asia/Manila', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "2026-11-25" → "Nov 25, 2026" */
export function formatDate(s) {
  if (!s) return '';
  const { y, m, d } = parseDate(s);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
