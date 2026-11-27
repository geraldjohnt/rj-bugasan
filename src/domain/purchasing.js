/*
 * Restocking, suppliers and expenses (Phase 8, BUSINESS_RULES §6, BR-060 … BR-063, RQ-032, RQ-033, RQ-037).
 * Pure functions: no I/O. Quantities are integer hundredths (qtyH), money integer centavos (…C).
 */
import { DomainError } from './errors.js';
import { UNITS, parseQty, formatQty } from './quantity.js';
import { parseMoney } from './money.js';
import { isValidDate, compareDates } from './dates.js';
import { lineCost } from './saleTotals.js';

export const RESTOCK_STATUS = { ORDERED: 'ORDERED', PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED', RECEIVED: 'RECEIVED', CANCELLED: 'CANCELLED' };
export const RESTOCK_STATUS_LABELS = { ORDERED: 'Ordered', PARTIALLY_RECEIVED: 'Partially received', RECEIVED: 'Received', CANCELLED: 'Cancelled' };
export const RESTOCK_PREFIX = 'RS-';
export const MAX_RESTOCK_LINES = 40;

/** BR-063 */
export const EXPENSE_CATEGORIES = ['Delivery/Fuel', 'Rent', 'Wages', 'Utilities', 'Supplies', 'Other'];

const trim = (v) => String(v ?? '').trim();
export const isOpenRestock = (r) => r.status === RESTOCK_STATUS.ORDERED || r.status === RESTOCK_STATUS.PARTIALLY_RECEIVED;
export const remainingH = (line) => Math.max(0, line.qtyOrderedH - (line.qtyReceivedH || 0));
export const restockTotalC = (lines) => lines.reduce((s, l) => s + lineCost(l.qtyOrderedH, l.unitCostC), 0);
export const receivedValueC = (restock) => (restock.receipts || []).reduce((s, r) => s + r.lines.reduce((a, l) => a + lineCost(l.qtyH, l.unitCostC), 0), 0);

/* ------------------------------------------------------------------ suppliers */

export function validateSupplierForm(form) {
  const errors = {};
  const data = {
    name: trim(form.name), contactPerson: trim(form.contactPerson), contactNumber: trim(form.contactNumber),
    email: trim(form.email), address: trim(form.address), notes: trim(form.notes),
  };
  if (!data.name) errors.name = 'Required.';
  else if (data.name.length > 120) errors.name = 'Use 120 characters or fewer.';
  data.nameLower = data.name.toLowerCase();
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Enter a valid email address.';
  if (data.contactNumber && !/^[0-9+()\-\s]{6,20}$/.test(data.contactNumber)) errors.contactNumber = 'Use digits, spaces, +, - or brackets.';
  for (const k of ['contactPerson', 'address', 'notes']) if (data[k].length > 500) errors[k] = 'Too long.';
  return { data, errors };
}

/* ------------------------------------------------------------------ restock order (BR-060, BR-061) */

/**
 * Validate the restock form. form: { supplierId, orderDate, expectedDate, notes, lines: [{ itemId, qty, unitCost }] } (strings as typed).
 * itemsById: current items. existing: the stored order when editing (received quantities are kept and cannot be undercut).
 * Returns { data, errors }; errors.lines[i] holds per-line messages.
 */
export function validateRestockForm(form, itemsById, existing = null) {
  const errors = {};
  const data = { supplierId: form.supplierId || '', orderDate: form.orderDate, expectedDate: form.expectedDate || null, notes: trim(form.notes) };
  if (!data.supplierId) errors.supplierId = 'Choose a supplier.';
  if (!isValidDate(data.orderDate)) errors.orderDate = 'Enter a valid date.';
  if (data.expectedDate && !isValidDate(data.expectedDate)) errors.expectedDate = 'Enter a valid date.';
  else if (data.expectedDate && isValidDate(data.orderDate) && compareDates(data.expectedDate, data.orderDate) < 0) errors.expectedDate = 'Cannot be before the order date.';
  if (data.notes.length > 500) errors.notes = 'Too long.';

  const oldLines = new Map(((existing && existing.lines) || []).map((l) => [l.itemId, l]));
  const lineErrors = {};
  const lines = [];
  const seen = new Set();
  (form.lines || []).forEach((l, i) => {
    const e = {};
    if (!l.itemId && !trim(l.qty) && !trim(l.unitCost)) return; // empty row
    const item = itemsById[l.itemId];
    const old = oldLines.get(l.itemId);
    if (!l.itemId) e.itemId = 'Choose an item.';
    else if (!item) e.itemId = 'This item no longer exists.';
    else if (item.status !== 'ACTIVE' && !old) e.itemId = 'Archived items cannot be restocked.';
    else if (seen.has(l.itemId)) e.itemId = 'This item is already on the order.';
    let qtyH = null, unitCostC = null;
    if (item) {
      try { qtyH = parseQty(l.qty, item.unit); } catch (x) { e.qty = x.message; }
      if (!e.qty && (qtyH === null || qtyH <= 0)) e.qty = 'Enter a quantity.';
      if (!e.qty && old && qtyH < (old.qtyReceivedH || 0)) e.qty = `Already received ${formatQty(old.qtyReceivedH, item.unit)}.`;
    }
    try { unitCostC = parseMoney(l.unitCost); if (unitCostC === null) e.unitCost = 'Required.'; else if (unitCostC < 0) e.unitCost = 'Cannot be negative.'; } catch (x) { e.unitCost = x.message; }
    if (l.itemId) seen.add(l.itemId);
    if (Object.keys(e).length) { lineErrors[i] = e; return; }
    lines.push({ itemId: item.id, itemName: item.name, unit: item.unit, qtyOrderedH: qtyH, qtyReceivedH: old ? (old.qtyReceivedH || 0) : 0, unitCostC });
  });
  for (const old of oldLines.values()) {
    if ((old.qtyReceivedH || 0) > 0 && !lines.some((l) => l.itemId === old.itemId) && !Object.values(lineErrors).length) {
      errors.lines = `${old.itemName} was already partly received and cannot be removed.`;
    }
  }
  if (Object.keys(lineErrors).length) errors.lineErrors = lineErrors;
  if (!lines.length && !errors.lineErrors) errors.lines = 'Add at least one item.';
  if (lines.length > MAX_RESTOCK_LINES) errors.lines = `Use at most ${MAX_RESTOCK_LINES} items per order.`;
  data.lines = lines;
  data.totalCostC = restockTotalC(lines);
  return { data, errors };
}

/** BR-060: status follows the received quantities. */
export function statusFromLines(lines) {
  const any = lines.some((l) => (l.qtyReceivedH || 0) > 0);
  const all = lines.every((l) => remainingH(l) === 0);
  return all ? RESTOCK_STATUS.RECEIVED : any ? RESTOCK_STATUS.PARTIALLY_RECEIVED : RESTOCK_STATUS.ORDERED;
}

/**
 * Plan a receipt (BR-061). input: { date, lines: [{ itemId, qtyH, unitCostC, priceC }] }. Lines with qtyH 0 are skipped.
 * priceC: the cash selling price of this batch (D-050); when missing the caller uses the item's default price.
 * Returns { receiptLines, lines (updated order lines), status, valueC }.
 */
export function planReceipt(restock, input) {
  if (!isOpenRestock(restock)) throw new DomainError('RESTOCK_CLOSED', `This order is ${RESTOCK_STATUS_LABELS[restock.status].toLowerCase()}; nothing more can be received.`);
  if (!isValidDate(input.date)) throw new DomainError('INVALID_DATE', 'Enter a valid receiving date.');
  if (compareDates(input.date, restock.orderDate) < 0) throw new DomainError('INVALID_DATE', 'The receiving date cannot be before the order date.');
  const byItem = new Map(restock.lines.map((l) => [l.itemId, l]));
  const receiptLines = [];
  for (const r of input.lines || []) {
    const line = byItem.get(r.itemId);
    if (!line) throw new DomainError('NOT_ON_ORDER', 'An item is not on this order.');
    if (!Number.isInteger(r.qtyH) || r.qtyH < 0) throw new DomainError('INVALID_QTY', `Invalid quantity for ${line.itemName}.`);
    if (r.qtyH === 0) continue;
    if (line.unit === UNITS.SACK && r.qtyH % 100 !== 0) throw new DomainError('INVALID_QTY', `Sacks must be whole for ${line.itemName}.`);
    if (r.qtyH > remainingH(line)) {
      throw new DomainError('OVER_RECEIVE', `${line.itemName}: only ${formatQty(remainingH(line), line.unit)} still to receive. Edit the order first if more arrived.`);
    }
    if (!Number.isInteger(r.unitCostC) || r.unitCostC < 0) throw new DomainError('INVALID_AMOUNT', `Invalid unit cost for ${line.itemName}.`);
    if (receiptLines.some((x) => x.itemId === r.itemId)) throw new DomainError('DUPLICATE_LINE', `${line.itemName} appears twice.`);
    if (r.priceC !== undefined && r.priceC !== null && (!Number.isInteger(r.priceC) || r.priceC < 0)) throw new DomainError('INVALID_AMOUNT', `Invalid selling price for ${line.itemName}.`);
    receiptLines.push({ itemId: r.itemId, itemName: line.itemName, unit: line.unit, qtyH: r.qtyH, unitCostC: r.unitCostC, priceC: Number.isInteger(r.priceC) ? r.priceC : null });
  }
  if (!receiptLines.length) throw new DomainError('NOTHING_RECEIVED', 'Enter at least one received quantity.');
  const got = new Map(receiptLines.map((l) => [l.itemId, l]));
  const lines = restock.lines.map((l) => (got.has(l.itemId) ? { ...l, qtyReceivedH: (l.qtyReceivedH || 0) + got.get(l.itemId).qtyH } : l));
  return { receiptLines, lines, status: statusFromLines(lines), valueC: receiptLines.reduce((s, l) => s + lineCost(l.qtyH, l.unitCostC), 0) };
}

/** BR-062: a received cost that differs from the item's current cost offers "Update item cost" (pre-checked). */
export const costDiffers = (item, unitCostC) => !!item && Number.isInteger(unitCostC) && item.costC !== unitCostC;

/* ------------------------------------------------------------------ expenses (BR-063, RQ-037) */

export function validateExpenseForm(form) {
  const errors = {};
  const data = { date: form.date, category: form.category, note: trim(form.note), amountC: null };
  if (!isValidDate(data.date)) errors.date = 'Enter a valid date.';
  if (!EXPENSE_CATEGORIES.includes(data.category)) errors.category = 'Choose a category.';
  try {
    data.amountC = parseMoney(form.amount);
    if (data.amountC === null) errors.amount = 'Required.';
    else if (data.amountC <= 0) errors.amount = 'Enter an amount greater than zero.';
  } catch (e) { errors.amount = e.message; }
  if (data.category === 'Other' && !data.note) errors.note = 'Describe the expense.';
  if (data.note.length > 500) errors.note = 'Too long.';
  return { data, errors };
}
