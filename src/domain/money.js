/*
 * Money as integer centavos (BR-001). Never use floating point for amounts.
 */
import { DomainError } from './errors.js';

/** Round-half-up of (a * b / d) for integers, sign-aware (BR-004). */
export function mulDivRound(a, b, d) {
  const n = a * b;
  if (!Number.isSafeInteger(n)) throw new DomainError('OVERFLOW', 'Amount is too large.');
  const sign = (n < 0) !== (d < 0) ? -1 : 1;
  const an = Math.abs(n), ad = Math.abs(d);
  return sign * Math.floor((an * 2 + ad) / (ad * 2));
}

/** Parse "1,234.50", "₱ 99", "0.5" → centavos. Returns null for empty input. Throws on invalid. */
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[₱,\s]/g, '');
  if (s === '') return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new DomainError('INVALID_AMOUNT', 'Enter an amount with up to 2 decimal places.');
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const c = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(c)) throw new DomainError('OVERFLOW', 'Amount is too large.');
  return neg ? -c : c;
}

/** 123450 → "₱1,234.50" */
export function formatMoney(c, { symbol = '₱' } = {}) {
  const neg = c < 0;
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '−' : ''}${symbol}${whole}.${frac}`;
}

/** 123450 → "1234.50" (for inputs and CSV) */
export function centavosToPlain(c) {
  const neg = c < 0, abs = Math.abs(c);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const sum = (values) => values.reduce((a, b) => a + b, 0);
