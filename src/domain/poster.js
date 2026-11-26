/*
 * Price poster (D-047): which items go on the Facebook price-update image and how they read.
 * Pure functions; the drawing lives in features/inventory/pricePoster.js.
 */
import { UNITS } from './quantity.js';
import { installmentPriceOf } from './inventory.js';

/** Default selection: active sack items (the reference poster lists sacks only). */
export const defaultPosterSelection = (items) => items.filter((i) => i.status === 'ACTIVE' && i.unit === UNITS.SACK).map((i) => i.id);

/** "Dinorado 50kg Sack" → "Dinorado 50kg"; "Malagkit per KG" stays as is. */
export function posterName(item) {
  const n = String(item.name || '').replace(/\s+sacks?$/i, '').trim();
  return n || item.name;
}

/**
 * Rows for the poster, grouped by variety (or name) alphabetically, bigger sacks first, per-kg items last in a group.
 * opts: { selectedIds: string[], hideOutOfStock: boolean }
 * Row: { id, name, cashC, paydayC, perKg, soldOut }
 */
export function posterRows(items, { selectedIds, hideOutOfStock = false } = {}) {
  const chosen = new Set(selectedIds || defaultPosterSelection(items));
  const groupOf = (i) => (i.variety || i.name || '').trim().toLowerCase();
  const weight = (i) => (i.unit === UNITS.SACK ? Number(i.sackWeightKg) || 0 : -1);
  return items
    .filter((i) => i.status === 'ACTIVE' && chosen.has(i.id))
    .filter((i) => !(hideOutOfStock && i.qtyH <= 0))
    .sort((a, b) => groupOf(a).localeCompare(groupOf(b)) || weight(b) - weight(a) || a.name.localeCompare(b.name))
    .map((i) => ({
      id: i.id, name: posterName(i), cashC: i.priceC, paydayC: installmentPriceOf(i), perKg: i.unit === UNITS.KG, soldOut: i.qtyH <= 0,
    }));
}

/** "₱2,960" — whole pesos when there are no centavos, as on a price board. */
export function posterPrice(c) {
  const pesos = Math.floor(Math.abs(c) / 100);
  const cents = Math.abs(c) % 100;
  const whole = pesos.toLocaleString('en-US');
  return `₱${whole}${cents ? '.' + String(cents).padStart(2, '0') : ''}`;
}

/** "2026-11-26" → "NOVEMBER 26, 2026". */
export function posterDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  if (!y || !m || !d || m > 12) return '';
  return `${months[m - 1]} ${d}, ${y}`;
}

/** "RJ Bugasan" → ["RJ", "BUGASAN"]; one word → [word]. Upper-cased for the logo. */
export function brandLines(name) {
  const words = String(name || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return ['PRICE LIST'];
  if (words.length === 1) return words;
  return [words.slice(0, -1).join(' '), words[words.length - 1]];
}
