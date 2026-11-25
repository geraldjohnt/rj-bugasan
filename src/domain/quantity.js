/*
 * Quantities as integer hundredths of the unit (BR-002): 1 sack = 100, 2.75 kg = 275.
 * Sacks must be whole; kilos allow 0.01 steps.
 */
import { DomainError } from './errors.js';

export const UNITS = { SACK: 'SACK', KG: 'KG' };

export function parseQty(input, unit) {
  const s = String(input ?? '').replace(/[,\s]/g, '');
  if (s === '') return null;
  if (unit === UNITS.SACK) {
    if (!/^\d+$/.test(s)) throw new DomainError('INVALID_QTY', 'Sacks must be a whole number.');
    return Number(s) * 100;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new DomainError('INVALID_QTY', 'Enter kilos with up to 2 decimal places.');
  const [w, f = ''] = s.split('.');
  return Number(w) * 100 + Number((f + '00').slice(0, 2));
}

export function validateQty(qtyH, unit) {
  if (!Number.isInteger(qtyH) || qtyH <= 0) throw new DomainError('QTY_NOT_POSITIVE', 'Quantity must be greater than zero.');
  if (unit === UNITS.SACK && qtyH % 100 !== 0) throw new DomainError('INVALID_QTY', 'Sacks must be a whole number.');
  return qtyH;
}

/** 275 → "2.75"; 300 → "3"; 250 → "2.5" */
export function qtyToPlain(qtyH) {
  const neg = qtyH < 0, a = Math.abs(qtyH);
  const w = Math.floor(a / 100), f = a % 100;
  const frac = f === 0 ? '' : '.' + String(f).padStart(2, '0').replace(/0$/, '');
  return `${neg ? '-' : ''}${w}${frac}`;
}

/** 275, KG → "2.75 kg"; 100, SACK → "1 sack"; 300, SACK → "3 sacks" */
export function formatQty(qtyH, unit) {
  const n = qtyToPlain(qtyH);
  if (unit === UNITS.KG) return `${n} kg`;
  return `${n} ${Math.abs(qtyH) === 100 ? 'sack' : 'sacks'}`;
}
