/*
 * Restocking, suppliers and expenses (Phase 8, BUSINESS_RULES §6, BR-060 … BR-063, RQ-032, RQ-033, RQ-037).
 * Pure functions: no I/O. Quantities are integer hundredths (qtyH), money integer centavos (…C).
 */
import { DomainError } from './errors.js';
import { UNITS, parseQty, formatQty } from './quantity.js';
import { parseMoney, mulDivRound } from './money.js';
import { isValidDate, compareDates } from './dates.js';
import { lineCost } from './saleTotals.js';

export const RESTOCK_STATUS = { ORDERED: 'ORDERED', PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED', RECEIVED: 'RECEIVED', CANCELLED: 'CANCELLED' };
export const RESTOCK_STATUS_LABELS = { ORDERED: 'Ordered', PARTIALLY_RECEIVED: 'Partially received', RECEIVED: 'Received', CANCELLED: 'Cancelled' };
export const RESTOCK_PREFIX = 'RS-';
export const MAX_RESTOCK_LINES = 40;

/** BR-063 */
export const EXPENSE_CATEGORIES = ['Delivery/Fuel', 'Rent', 'Wages', 'Utilities', 'Supplies', 'Other'];
/** D-062: expenses entered on a restock receipt. Never chosen on the Expenses page (only created/changed from the restock). */
export const RESTOCK_EXPENSE_CATEGORY = 'Restock';
/** Every category an expense can have (filters, reports). */
export const ALL_EXPENSE_CATEGORIES = [...EXPENSE_CATEGORIES, RESTOCK_EXPENSE_CATEGORY];
export const MAX_RECEIPT_EXPENSES = 20;
export const isRestockExpense = (e) => !!e && e.category === RESTOCK_EXPENSE_CATEGORY && !!e.restockId;

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

/* ------------------------------------------------------------------ restock expenses (Phase 14, D-060 … D-063) */

/**
 * Parse the expense lines typed on a receipt (D-060). rows: [{ name, amount, expenseId? }] (strings as typed).
 * Empty rows are skipped. Returns { lines: [{ name, amountC, expenseId? }], errors: { [rowIndex]: { name?, amount? } }, totalC }.
 */
export function parseExpenseLines(rows) {
  const lines = [];
  const errors = {};
  (rows || []).forEach((r, idx) => {
    const name = trim(r.name);
    const amountText = trim(r.amount);
    if (!name && !amountText) return;
    const e = {};
    if (!name) e.name = 'Enter what it was for.';
    else if (name.length > 60) e.name = 'Use 60 characters or fewer.';
    let amountC = null;
    try { amountC = parseMoney(amountText); if (amountC === null) e.amount = 'Required.'; else if (amountC <= 0) e.amount = 'Enter an amount greater than zero.'; } catch (x) { e.amount = x.message; }
    if (Object.keys(e).length) { errors[idx] = e; return; }
    lines.push({ name, amountC, ...(r.expenseId ? { expenseId: r.expenseId } : {}) });
  });
  if (lines.length > MAX_RECEIPT_EXPENSES) errors.all = `Use ${MAX_RECEIPT_EXPENSES} expense lines or fewer.`;
  return { lines, errors, totalC: lines.reduce((s, l) => s + l.amountC, 0) };
}

/** Check already-parsed expense lines (service side). */
export function checkExpenseLines(lines) {
  if (!Array.isArray(lines)) return [];
  if (lines.length > MAX_RECEIPT_EXPENSES) throw new DomainError('TOO_MANY', `Use ${MAX_RECEIPT_EXPENSES} expense lines or fewer.`);
  return lines.map((l) => {
    const name = trim(l.name);
    if (!name || name.length > 60) throw new DomainError('INVALID_EXPENSE', 'Each expense needs a name of up to 60 characters.');
    if (!Number.isInteger(l.amountC) || l.amountC <= 0) throw new DomainError('INVALID_AMOUNT', `Invalid amount for ${name}.`);
    return { name, amountC: l.amountC, ...(l.expenseId ? { expenseId: l.expenseId } : {}) };
  });
}

/**
 * D-061: split totalC over lines in proportion to their value (qty × unit cost), largest remainder so the shares add
 * up exactly. When every line has value 0 the total is split equally. values: centavos per line. Returns centavos per line.
 */
export function splitByValue(values, totalC) {
  if (!values.length || !totalC) return values.map(() => 0);
  const base = values.reduce((s, v) => s + v, 0);
  const weights = base > 0 ? values : values.map(() => 1);
  const w = base > 0 ? base : values.length;
  const raw = weights.map((v) => v * totalC);
  const shares = raw.map((r) => Math.floor(r / w));
  let left = totalC - shares.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, rem: r % w })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) shares[order[k].i] += 1;
  return shares;
}

/** Expense share per unit (rounded to the centavo): shareC ÷ qty. qtyH is hundredths. */
export const sharePerUnitC = (shareC, qtyH) => (qtyH > 0 ? mulDivRound(shareC, 100, qtyH) : 0);

/**
 * D-061: what the Receive dialog shows per line. lines: [{ qtyH, unitCostC, priceC }] (nulls allowed while typing).
 * Returns [{ shareC, perUnitC, landedC, profitC }] (landed = unit cost + share per unit; profit = cash price − landed).
 */
export function expenseBreakdown(lines, totalC) {
  const values = lines.map((l) => (l.qtyH > 0 && Number.isInteger(l.unitCostC) ? lineCost(l.qtyH, l.unitCostC) : 0));
  const active = lines.map((l) => l.qtyH > 0);
  const shares = splitByValue(values.filter((_, i) => active[i]), totalC);
  let k = 0;
  return lines.map((l, i) => {
    if (!active[i]) return { shareC: 0, perUnitC: 0, landedC: null, profitC: null };
    const shareC = shares[k++];
    const perUnitC = sharePerUnitC(shareC, l.qtyH);
    const landedC = Number.isInteger(l.unitCostC) ? l.unitCostC + perUnitC : null;
    const profitC = landedC !== null && Number.isInteger(l.priceC) ? l.priceC - landedC : null;
    return { shareC, perUnitC, landedC, profitC };
  });
}

export const receiptExpensesC = (receipt) => ((receipt && receipt.expenses) || []).reduce((s, e) => s + e.amountC, 0);
export const restockExpensesC = (restock) => (restock.receipts || []).reduce((s, r) => s + receiptExpensesC(r), 0);

/**
 * Names used before on restock expenses, newest first, each with its last amount (D-062 suggestions).
 * expenses: expense documents. Returns [{ name, amountC }].
 */
export function expenseNameSuggestions(expenses) {
  const rows = (expenses || []).filter((e) => e.category === RESTOCK_EXPENSE_CATEGORY && e.status === 'ACTIVE' && trim(e.note))
    .slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const seen = new Map();
  for (const e of rows) { const k = trim(e.note).toLowerCase(); if (!seen.has(k)) seen.set(k, { name: trim(e.note), amountC: e.amountC }); }
  return [...seen.values()];
}

/**
 * D-063: plan an edit of a received delivery. input: { lines: [{ itemId, unitCostC, priceC }], expenses: [{ name, amountC, expenseId? }] }.
 * Quantities never change. Returns { index, receipt, changes: [{ itemId, itemName, costFrom, costTo, priceFrom, priceTo }],
 * expenseOps: { create: [line], update: [{ expenseId, from, to }], void: [line] } }.
 */
export function planReceiptEdit(restock, batchId, input) {
  const receipts = restock.receipts || [];
  const index = receipts.findIndex((r) => r.batchId === batchId);
  if (index < 0) throw new DomainError('RECEIPT_MISSING', `Delivery ${batchId} is not on ${restock.id || 'this order'}.`);
  const old = receipts[index];
  const byItem = new Map((input.lines || []).map((l) => [l.itemId, l]));
  const changes = [];
  const lines = old.lines.map((l) => {
    const n = byItem.get(l.itemId);
    if (!n) return l;
    if (!Number.isInteger(n.unitCostC) || n.unitCostC < 0) throw new DomainError('INVALID_AMOUNT', `Invalid unit cost for ${l.itemName}.`);
    if (!Number.isInteger(n.priceC) || n.priceC < 0) throw new DomainError('INVALID_AMOUNT', `Invalid selling price for ${l.itemName}.`);
    if (n.unitCostC === l.unitCostC && n.priceC === l.priceC) return l;
    changes.push({ itemId: l.itemId, itemName: l.itemName, unit: l.unit, costFrom: l.unitCostC, costTo: n.unitCostC, priceFrom: l.priceC, priceTo: n.priceC });
    return { ...l, unitCostC: n.unitCostC, priceC: n.priceC };
  });
  const next = checkExpenseLines(input.expenses || []);
  const prev = old.expenses || [];
  const prevById = new Map(prev.filter((e) => e.expenseId).map((e) => [e.expenseId, e]));
  const create = [], update = [];
  for (const e of next) {
    const p = e.expenseId ? prevById.get(e.expenseId) : null;
    if (e.expenseId && !p) throw new DomainError('EXPENSE_MISSING', `${e.name} is not an expense of this delivery.`);
    if (!p) create.push(e);
    else if (p.name !== e.name || p.amountC !== e.amountC) update.push({ expenseId: e.expenseId, from: p, to: e });
  }
  const keep = new Set(next.filter((e) => e.expenseId).map((e) => e.expenseId));
  const voids = prev.filter((e) => !e.expenseId || !keep.has(e.expenseId));
  return { index, receipt: { ...old, lines }, expenses: next, changes, expenseOps: { create, update, void: voids } };
}
