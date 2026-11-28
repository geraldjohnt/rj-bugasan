/*
 * Inventory rules (BUSINESS_RULES §1, BR-010 … BR-019). Pure functions: no I/O, no Firebase.
 * Quantities are integer hundredths (qtyH), money integer centavos (…C).
 */
import { DomainError } from './errors.js';
import { UNITS, parseQty, validateQty, formatQty } from './quantity.js';
import { parseMoney, mulDivRound } from './money.js';
import { isValidDate } from './dates.js';
import { batchStockValueC } from './batches.js';

export const MOVEMENT_TYPES = {
  OPENING: 'OPENING',
  SALE: 'SALE',
  SALE_CANCEL: 'SALE_CANCEL',
  RESTOCK_RECEIPT: 'RESTOCK_RECEIPT',
  ADJUSTMENT: 'ADJUSTMENT',
  COUNT_ADJUSTMENT: 'COUNT_ADJUSTMENT',
  SACK_OPEN_OUT: 'SACK_OPEN_OUT',
  SACK_OPEN_IN: 'SACK_OPEN_IN',
};

export const MOVEMENT_LABELS = {
  OPENING: 'Opening stock',
  SALE: 'Sale',
  SALE_CANCEL: 'Sale cancelled',
  RESTOCK_RECEIPT: 'Restock received',
  ADJUSTMENT: 'Adjustment',
  COUNT_ADJUSTMENT: 'Stock count',
  SACK_OPEN_OUT: 'Sack opened (out)',
  SACK_OPEN_IN: 'Sack opened (in)',
};

/** BR-013 */
export const ADJUSTMENT_REASONS = ['Spillage', 'Spoilage/Pests', 'Count correction', 'Damaged sack', 'Personal use', 'Other'];
export const ITEM_CATEGORIES = ['Premium', 'Regular', 'Well-milled', 'Glutinous', 'Brown', 'Other'];

/** Max transaction writes we allow ourselves (Firestore limit is 500). */
export const MAX_TX_WRITES = 480;

export const unitLabel = (unit, plural = true) => (unit === UNITS.SACK ? (plural ? 'sacks' : 'sack') : 'kg');

/* ------------------------------------------------------------------ sack weight */

/** "50" / "25.5" → 50 / 25.5 (kg, up to 2 decimals, > 0). */
export function parseSackWeight(input) {
  const s = String(input ?? '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) <= 0) throw new DomainError('INVALID_SACK_WEIGHT', 'Enter the sack weight in kg (for example 50 or 25.5).');
  if (Number(s) > 1000) throw new DomainError('INVALID_SACK_WEIGHT', 'Sack weight looks too large.');
  return Number(s);
}

/** Sack weight in kg → hundredths of a kg (exact for up to 2 decimals). */
export const sackWeightH = (kg) => Math.round(kg * 100);

/** BR-016: default cost per kg = round(sack cost ÷ sack weight). */
export function defaultKgCostC(sackCostC, sackWeightKg) {
  return mulDivRound(sackCostC, 100, sackWeightH(sackWeightKg));
}

/* ------------------------------------------------------------------ SKU (D-067) */

export const SKU_PREFIX = 'RJ-';
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]*$/;
export const normalizeSku = (v) => String(v ?? '').trim().toUpperCase();
/** CODE = first 3 letters (A–Z) of the variety, or of the name when there is no variety; padded with X. */
export function skuCode(item) {
  const letters = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');
  const src = letters(item && item.variety) || letters(item && item.name);
  return (src + 'XXX').slice(0, 3);
}
export const formatSku = (code, n) => `${SKU_PREFIX}${code}-${String(n).padStart(3, '0')}`;
export const skuCounterId = (code) => `sku-${code}`;
/** Text to search an item by: name, variety, category and SKU. */
export const itemSearchText = (i) => [i.name, i.variety, i.category, i.sku].filter(Boolean).join(' ');

/* ------------------------------------------------------------------ item form */

const trim = (v) => String(v ?? '').trim();

/**
 * Validate the item form (strings as typed). Returns { data, errors }; data is only complete when errors is empty.
 * opts: { isNew, existingNames: Set of lower-case names of other ACTIVE items }
 */
export function validateItemForm(form, { isNew = true, existingNames = new Set() } = {}) {
  const errors = {};
  const data = {};
  const unit = form.unit;
  if (unit !== UNITS.SACK && unit !== UNITS.KG) errors.unit = 'Choose sack or kg.';

  data.name = trim(form.name);
  if (!data.name) errors.name = 'Required.';
  else if (data.name.length > 120) errors.name = 'Use 120 characters or fewer.';
  else if (existingNames.has(data.name.toLowerCase())) errors.name = 'Another active item already has this name.';
  data.nameLower = data.name.toLowerCase();

  data.variety = trim(form.variety);
  data.category = trim(form.category);
  // D-067: blank = the app gives one (RJ-<CODE>-NNN); a typed SKU is kept (upper-case) and must be unique.
  data.sku = normalizeSku(form.sku);
  if (data.sku.length > 30) errors.sku = 'Use 30 characters or fewer.';
  else if (data.sku && !SKU_PATTERN.test(data.sku)) errors.sku = 'Use letters, digits and dashes only.';
  data.description = trim(form.description);
  data.unit = unit;

  if (unit === UNITS.SACK) {
    try { data.sackWeightKg = parseSackWeight(form.sackWeightKg); } catch (e) { errors.sackWeightKg = e.message; }
    data.linkedSackItemId = null;
  } else {
    data.sackWeightKg = null;
    data.linkedSackItemId = form.linkedSackItemId || null;
  }

  const money = (key, label) => {
    try {
      const c = parseMoney(form[key]);
      if (c === null) errors[key] = 'Required.';
      else if (c < 0) errors[key] = `${label} cannot be negative.`;
      else data[key] = c;
    } catch (e) { errors[key] = e.message; }
  };
  money('priceC', 'Price');
  money('costC', 'Cost');
  // Payday / installment price (D-046): optional; empty = same as the cash price.
  try {
    const c = parseMoney(form.installmentPriceC);
    if (c !== null && c < 0) errors.installmentPriceC = 'Price cannot be negative.';
    else data.installmentPriceC = c;
  } catch (e) { errors.installmentPriceC = e.message; }

  if (unit) {
    try { data.minStockH = parseQty(form.minStock, unit) ?? 0; } catch (e) { errors.minStock = e.message; }
    if (isNew) {
      try { data.openingQtyH = parseQty(form.openingQty, unit) ?? 0; } catch (e) { errors.openingQty = e.message; }
      if (data.openingQtyH > 0 && !isValidDate(form.openingDate)) errors.openingDate = 'Enter a valid date.';
      data.openingDate = form.openingDate;
    }
  }
  return { data, errors };
}

/** Warn when the selling price is below cost (BR-032 is for sales; the same hint helps on the item form). */
export const priceBelowCost = (data) => Number.isInteger(data.priceC) && Number.isInteger(data.costC) && data.priceC < data.costC;

/* ------------------------------------------------------------------ cash vs payday price (D-046) */

/** Payday / installment price per unit: its own price when set, otherwise the cash price. */
export const installmentPriceOf = (item) => (Number.isInteger(item.installmentPriceC) ? item.installmentPriceC : item.priceC);

/**
 * List price for a sale on the given terms (BR-032a): FULL (paid now) → cash price;
 * OPEN_BALANCE or INSTALLMENT (pay later) → payday price.
 */
export const listPriceFor = (item, terms) => (terms && terms !== 'FULL' ? installmentPriceOf(item) : item.priceC);

/* ------------------------------------------------------------------ stock arithmetic */

/** BR-014: apply a signed change; never below zero; sacks stay whole. */
export function applyDelta(item, deltaH) {
  if (!Number.isInteger(deltaH) || deltaH === 0) throw new DomainError('QTY_NOT_POSITIVE', 'Quantity must be greater than zero.');
  if (item.unit === UNITS.SACK && deltaH % 100 !== 0) throw new DomainError('INVALID_QTY', 'Sacks must be a whole number.');
  const after = item.qtyH + deltaH;
  if (after < 0) {
    throw new DomainError('NEGATIVE_STOCK', `Not enough stock: ${item.name} has ${formatQty(item.qtyH, item.unit)}.`, { availableH: item.qtyH });
  }
  return after;
}

/** Adjustment input → signed delta. direction: 'IN' | 'OUT'. BR-013: reason required; note required for Other. */
export function validateAdjustment({ direction, qtyH, reason, note, date }, unit) {
  const errors = {};
  if (direction !== 'IN' && direction !== 'OUT') errors.direction = 'Choose add or remove.';
  try { validateQty(qtyH, unit); } catch (e) { errors.qty = e.message; }
  if (!ADJUSTMENT_REASONS.includes(reason)) errors.reason = 'Choose a reason.';
  if (reason === 'Other' && !trim(note)) errors.note = 'Describe the reason.';
  if (!isValidDate(date)) errors.date = 'Enter a valid date.';
  return { errors, deltaH: direction === 'OUT' ? -qtyH : qtyH };
}

/* ------------------------------------------------------------------ open sack (BR-016) */

/**
 * Plan converting `sacks` whole sacks of `sack` into kilos of `kg`.
 * Returns { sackDeltaH, kgDeltaH, kgCostC, sackAfterH, kgAfterH }.
 */
export function planOpenSack(sack, kg, sacks, kgCostC) {
  if (!sack || sack.unit !== UNITS.SACK) throw new DomainError('NOT_SACK', 'Choose a sack item.');
  if (!kg || kg.unit !== UNITS.KG) throw new DomainError('NO_KG_ITEM', 'This sack item has no linked per-kg item.');
  if (sack.linkedKgItemId !== kg.id || kg.linkedSackItemId !== sack.id) throw new DomainError('NOT_LINKED', 'These items are not linked to each other.');
  if (sack.status !== 'ACTIVE' || kg.status !== 'ACTIVE') throw new DomainError('ARCHIVED', 'Both items must be active to open a sack.');
  if (!Number.isInteger(sacks) || sacks <= 0) throw new DomainError('QTY_NOT_POSITIVE', 'Enter at least 1 sack.');
  if (!Number.isInteger(kgCostC) || kgCostC < 0) throw new DomainError('INVALID_AMOUNT', 'Enter a valid cost per kg.');
  const sackDeltaH = -sacks * 100;
  const sackAfterH = applyDelta(sack, sackDeltaH);
  const kgDeltaH = sacks * sackWeightH(sack.sackWeightKg);
  return { sackDeltaH, kgDeltaH, kgCostC, sackAfterH, kgAfterH: kg.qtyH + kgDeltaH };
}

/* ------------------------------------------------------------------ stock count (BR-017) */

/**
 * Compare counted quantities with current stock. lines: [{itemId, countedQtyH|null}], itemsById: {id: item}.
 * Lines without a counted quantity are skipped (not counted). Returns all counted lines with diffH.
 */
export function planCount(lines, itemsById) {
  const out = [];
  for (const line of lines) {
    if (line.countedQtyH === null || line.countedQtyH === undefined) continue;
    const item = itemsById[line.itemId];
    if (!item) throw new DomainError('ITEM_MISSING', `Item no longer exists: ${line.itemName || line.itemId}.`);
    const c = line.countedQtyH;
    if (!Number.isInteger(c) || c < 0) throw new DomainError('INVALID_QTY', `Invalid counted quantity for ${item.name}.`);
    if (item.unit === UNITS.SACK && c % 100 !== 0) throw new DomainError('INVALID_QTY', `Sacks must be whole for ${item.name}.`);
    out.push({ itemId: item.id, systemQtyH: item.qtyH, countedQtyH: c, diffH: c - item.qtyH });
  }
  return out;
}

/* ------------------------------------------------------------------ low stock & valuation (BR-015) */

/** 'OUT' (zero), 'LOW' (≤ minimum), or 'OK'. */
export function stockStatus(item) {
  if (item.qtyH <= 0) return 'OUT';
  if (item.minStockH > 0 && item.qtyH <= item.minStockH) return 'LOW';
  return 'OK';
}

/** Stock value at cost: each batch at its own cost, stock not in a batch at the item's default cost (D-050). */
export const stockValueC = (item) => batchStockValueC(item);

/** Summary over ACTIVE items. */
export function inventorySummary(items) {
  const active = items.filter((i) => i.status === 'ACTIVE');
  return {
    activeCount: active.length,
    valueC: active.reduce((s, i) => s + stockValueC(i), 0),
    lowCount: active.filter((i) => stockStatus(i) === 'LOW').length,
    outCount: active.filter((i) => stockStatus(i) === 'OUT').length,
  };
}
