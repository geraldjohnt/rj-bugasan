/*
 * Stock batches, oldest first (Phase 13; D-050 … D-053). Pure functions: no I/O.
 *
 * Every item keeps its OPEN batches on the item document (`item.batches`, oldest first), because Firestore client
 * transactions cannot run queries. A batch: { id, date, qtyH (still in stock), receivedQtyH, unitCostC, priceC (cash),
 * source, supplierId, supplierName, restockId }. Batch ids are unique per item; one delivery shares its id across items.
 *
 * Invariant: Σ batch qtyH ≤ item.qtyH. The difference is stock "not in any batch" (uncovered). Uncovered stock cannot
 * be sold or opened (D-053) until the owner enters old batches for it; adjustments and counts take it first.
 */
import { DomainError } from './errors.js';
import { mulDivRound, parseMoney } from './money.js';
import { parseQty, formatQty } from './quantity.js';
import { isValidDate, compareDates } from './dates.js';

export const BATCH_SOURCE = { RESTOCK: 'RESTOCK', OLD: 'OLD', OPENING: 'OPENING', SACK_OPEN: 'SACK_OPEN' };
export const BATCH_SOURCE_LABELS = { RESTOCK: 'Restock', OLD: 'Old stock', OPENING: 'Opening stock', SACK_OPEN: 'Opened sack' };
/** Max open batches per item (keeps the item document small). */
export const MAX_BATCHES = 150;
/** Counter code for batches entered by hand without a supplier. */
export const OLD_CODE = 'OLD';

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

/* ------------------------------------------------------------------ ids (D-051) */

/** 1 → "SUP001" */
export const supplierCode = (seq) => `SUP${String(seq).padStart(3, '0')}`;
/** ("SUP001", 1) → "RJ-RS-SUP001-0001" */
export const batchIdFor = (code, seq) => `RJ-RS-${code}-${String(seq).padStart(4, '0')}`;
export const batchCounterId = (code) => `batch-${code}`;

/* ------------------------------------------------------------------ reading */

export const batchesOf = (item) => (item && Array.isArray(item.batches) ? item.batches : []);
export const coveredH = (item) => sum(batchesOf(item), (b) => b.qtyH);
export const uncoveredH = (item) => Math.max(0, (item.qtyH || 0) - coveredH(item));

/**
 * Cash price shown for an item (D-052, R9-Q11): the oldest open batch's price, or the item's default price when it has
 * no batches. nextPriceC is set when the batch after it is priced differently.
 */
export function displayPrice(item) {
  const open = batchesOf(item).filter((b) => b.qtyH > 0);
  const priceC = open.length ? open[0].priceC : item.priceC;
  const next = open.find((b) => b.priceC !== priceC);
  return { priceC, nextPriceC: next ? next.priceC : null };
}
export const displayPriceC = (item) => displayPrice(item).priceC;

/** Value of stock on hand: batches at their own cost, uncovered stock at the item's default cost. */
export const batchStockValueC = (item) =>
  sum(batchesOf(item), (b) => mulDivRound(b.qtyH, b.unitCostC, 100)) + mulDivRound(uncoveredH(item), item.costC || 0, 100);

/** KG cost from a sack batch cost (BR-016): round(sack cost ÷ sack weight). */
export const defaultKgCost = (sackCostC, sackWeightKg) => mulDivRound(sackCostC, 100, Math.round(sackWeightKg * 100));

/* ------------------------------------------------------------------ pricing of a taken allocation (D-052) */

/**
 * D-052: a line that takes stock from several batches is priced at the WEIGHTED AVERAGE of the batches' cash prices,
 * rounded to the centavo (2 × ₱1,500 + 3 × ₱1,550 → ₱1,530). This is the only place the rule lives; replace this
 * function to change it (user asked to keep it easy to change).
 */
export function blendedPriceC(taken) {
  const q = sum(taken, (t) => t.qtyH);
  if (!q) return 0;
  return mulDivRound(sum(taken, (t) => t.qtyH * t.priceC), 1, q);
}

/** Exact cost of a taken allocation (each part at its batch cost). */
export const takenCostC = (taken) => sum(taken, (t) => mulDivRound(t.qtyH, t.unitCostC, 100));
/** Average unit cost, for display and the below-cost warning. */
export const avgUnitCostC = (taken) => { const q = sum(taken, (t) => t.qtyH); return q ? mulDivRound(sum(taken, (t) => t.qtyH * t.unitCostC), 1, q) : 0; };

/* ------------------------------------------------------------------ changing batches */

const snapshot = (b, qtyH) => ({
  batchId: b.id, qtyH, date: b.date, unitCostC: b.unitCostC, priceC: b.priceC, source: b.source || null,
  supplierId: b.supplierId || null, supplierName: b.supplierName || null, restockId: b.restockId || null, receivedQtyH: b.receivedQtyH ?? null,
});

/**
 * Take qtyH from the batches: oldest first, or only from `batchId` when given (owner override, D-050).
 * Returns { batches (new array, emptied batches removed), taken: [snapshot…] }. Throws NOT_ENOUGH_BATCH.
 */
export function takeFromBatches(item, qtyH, { batchId = null } = {}) {
  if (!Number.isInteger(qtyH) || qtyH <= 0) throw new DomainError('QTY_NOT_POSITIVE', 'Quantity must be greater than zero.');
  const batches = batchesOf(item).map((b) => ({ ...b }));
  const taken = [];
  let left = qtyH;
  const pool = batchId ? batches.filter((b) => b.id === batchId) : batches;
  if (batchId && !pool.length) throw new DomainError('BATCH_MISSING', `Batch ${batchId} of ${item.name} is no longer in stock.`);
  for (const b of pool) {
    if (!left) break;
    const q = Math.min(left, b.qtyH);
    if (q <= 0) continue;
    b.qtyH -= q; left -= q;
    taken.push(snapshot(b, q));
  }
  if (left > 0) {
    const have = sum(pool, (b) => b.qtyH + (taken.find((t) => t.batchId === b.id)?.qtyH || 0));
    const unc = uncoveredH(item);
    const where = batchId ? `batch ${batchId} has` : 'its batches hold';
    throw new DomainError('NOT_ENOUGH_BATCH',
      `Not enough stock: ${item.name} — ${where} ${formatQty(have, item.unit)}, needed ${formatQty(qtyH, item.unit)}.`
      + (unc > 0 && !batchId ? ` ${formatQty(unc, item.unit)} is not in any batch; add its batch under Items → ${item.name} → Batches first.` : ''),
      { availableH: have, uncoveredH: unc });
  }
  return { batches: batches.filter((b) => b.qtyH > 0), taken };
}

/** Insert keeping oldest-first order (by date; same date → after the ones already there). */
function insertOrdered(batches, b) {
  const i = batches.findIndex((x) => compareDates(x.date, b.date) > 0);
  if (i < 0) batches.push(b); else batches.splice(i, 0, b);
}

/**
 * Add a batch (or quantity to one). A batch with the same id AND the same cost and price is merged; a same id with a
 * different cost/price gets a suffix (/2, /3 …) so ids stay unique per item. Returns { batches, id }.
 */
export function addBatch(item, batch) {
  if (!Number.isInteger(batch.qtyH) || batch.qtyH <= 0) throw new DomainError('QTY_NOT_POSITIVE', 'Quantity must be greater than zero.');
  const batches = batchesOf(item).map((b) => ({ ...b }));
  let id = batch.id;
  for (let n = 2; ; n++) {
    const same = batches.find((b) => b.id === id);
    if (!same) break;
    if (same.unitCostC === batch.unitCostC && same.priceC === batch.priceC) {
      same.qtyH += batch.qtyH;
      same.receivedQtyH = (same.receivedQtyH || 0) + (batch.receivedQtyH ?? batch.qtyH);
      return { batches, id };
    }
    id = `${batch.id}/${n}`;
  }
  if (batches.length >= MAX_BATCHES) throw new DomainError('TOO_MANY_BATCHES', `${item.name} already has ${MAX_BATCHES} open batches.`);
  insertOrdered(batches, {
    id, date: batch.date, qtyH: batch.qtyH, receivedQtyH: batch.receivedQtyH ?? batch.qtyH, unitCostC: batch.unitCostC, priceC: batch.priceC,
    source: batch.source, supplierId: batch.supplierId || null, supplierName: batch.supplierName || null, restockId: batch.restockId || null,
  });
  return { batches, id };
}

/** Put a taken allocation back (sale cancelled): into the same batch if still open, otherwise the batch comes back. */
export function returnToBatches(item, taken) {
  let cur = { ...item, batches: batchesOf(item) };
  for (const t of taken) {
    const open = cur.batches.find((b) => b.id === t.batchId);
    if (open) {
      cur = { ...cur, batches: cur.batches.map((b) => (b.id === t.batchId ? { ...b, qtyH: b.qtyH + t.qtyH } : b)) };
    } else {
      const batches = cur.batches.map((b) => ({ ...b }));
      insertOrdered(batches, {
        id: t.batchId, date: t.date, qtyH: t.qtyH, receivedQtyH: t.receivedQtyH ?? t.qtyH, unitCostC: t.unitCostC, priceC: t.priceC,
        source: t.source, supplierId: t.supplierId || null, supplierName: t.supplierName || null, restockId: t.restockId || null,
      });
      cur = { ...cur, batches };
    }
  }
  return cur.batches;
}

/**
 * Stock leaving outside a sale (adjustment out, count shortfall): stock not in any batch goes first, then the given
 * batch or the oldest. Returns { batches, taken, fromUncoveredH }.
 */
export function removeStock(item, qtyH, { batchId = null } = {}) {
  const fromUncoveredH = batchId ? 0 : Math.min(qtyH, uncoveredH(item));
  const rest = qtyH - fromUncoveredH;
  if (!rest) return { batches: batchesOf(item), taken: [], fromUncoveredH };
  const r = takeFromBatches(item, rest, { batchId });
  return { ...r, fromUncoveredH };
}

/**
 * Stock found outside a delivery (adjustment in, count surplus): added to the chosen batch, or the newest open batch,
 * or — when the item has none — left as stock not in any batch. Returns { batches, batchId|null }.
 */
export function addFoundStock(item, qtyH, { batchId = null } = {}) {
  const batches = batchesOf(item).map((b) => ({ ...b }));
  const target = batchId ? batches.find((b) => b.id === batchId) : batches[batches.length - 1];
  if (batchId && !target) throw new DomainError('BATCH_MISSING', `Batch ${batchId} of ${item.name} is no longer in stock.`);
  if (!target) return { batches, batchId: null };
  target.qtyH += qtyH;
  return { batches, batchId: target.id };
}

/* ------------------------------------------------------------------ sale allocation */

/**
 * Allocate sale lines to batches (D-050). lines: [{ itemId, qtyH, batchId? }]. Lines that name a batch are served
 * first so automatic lines cannot use up the batch the owner picked; automatic lines then take oldest first.
 * Returns { taken: [per line, same order], batchesByItem: { itemId: new batches } }.
 */
export function allocateLines(lines, itemsById) {
  const cur = {};
  const taken = new Array(lines.length);
  const order = lines.map((l, i) => i).sort((a, b) => (lines[a].batchId ? 0 : 1) - (lines[b].batchId ? 0 : 1) || a - b);
  for (const i of order) {
    const l = lines[i];
    const item = itemsById[l.itemId];
    if (!item) throw new DomainError('ITEM_MISSING', 'An item in this sale no longer exists.');
    const state = cur[l.itemId] || item;
    try {
      const r = takeFromBatches(state, l.qtyH, { batchId: l.batchId || null });
      cur[l.itemId] = { ...state, batches: r.batches, qtyH: state.qtyH - l.qtyH };
      taken[i] = r.taken;
    } catch (e) {
      if (e.code === 'NOT_ENOUGH_BATCH' && state !== item) {
        // Several lines of the same item: report against the item total.
        const total = lines.filter((x) => x.itemId === l.itemId).reduce((s, x) => s + x.qtyH, 0);
        throw new DomainError('NOT_ENOUGH_BATCH', `Not enough stock: ${item.name} — its batches hold ${formatQty(coveredH(item), item.unit)}, the sale needs ${formatQty(total, item.unit)}.`
          + (uncoveredH(item) > 0 ? ` ${formatQty(uncoveredH(item), item.unit)} is not in any batch; add its batch under Items → ${item.name} → Batches first.` : ''), e.details);
      }
      throw e;
    }
  }
  return { taken, batchesByItem: Object.fromEntries(Object.entries(cur).map(([id, s]) => [id, s.batches])) };
}

/** Short text for a taken allocation: "RJ-RS-SUP001-0001 (2 sacks), RJ-RS-SUP001-0002 (3 sacks)". */
export const takenText = (taken, unit) => (taken || []).map((t) => `${t.batchId} (${formatQty(t.qtyH, unit)})`).join(', ');

/* ------------------------------------------------------------------ stock without a batch (D-055) */

/**
 * D-055 (supersedes D-053): stock that is not in any batch — stock from before batches existed, or found by an
 * adjustment while the item had no batch — belongs to the item's FIRST batch. If the item has batches, it is added to
 * the oldest one; otherwise a new batch `newBatchId` is made at the item's default cost and cash price.
 * Returns the item unchanged when everything is covered. needsNewBatch(item) tells whether an id must be reserved.
 */
export const needsNewBatch = (item) => uncoveredH(item) > 0 && !batchesOf(item).length;
export function coverUncovered(item, newBatchId, date) {
  const unc = uncoveredH(item);
  if (!unc) return item;
  const batches = batchesOf(item).map((b) => ({ ...b }));
  if (batches.length) {
    batches[0].qtyH += unc;
    batches[0].receivedQtyH = (batches[0].receivedQtyH || 0) + unc;
    return { ...item, batches };
  }
  if (!newBatchId) throw new DomainError('BATCH_ID_NEEDED', 'A batch number is needed for stock not in any batch.');
  return { ...item, batches: [{ id: newBatchId, date, qtyH: unc, receivedQtyH: unc, unitCostC: item.costC || 0, priceC: item.priceC || 0, source: BATCH_SOURCE.OLD, supplierId: null, supplierName: null, restockId: null }] };
}

/** form: { unitCost, price }. Changing a batch's cost or price affects only later sales. */
export function validateBatchEdit(form) {
  const errors = {}, data = {};
  for (const [key, field] of [['unitCostC', 'unitCost'], ['priceC', 'price']]) {
    try { const c = parseMoney(form[field]); if (c === null) errors[field] = 'Required.'; else if (c < 0) errors[field] = 'Cannot be negative.'; else data[key] = c; } catch (e) { errors[field] = e.message; }
  }
  return { data, errors };
}
