/*
 * Suppliers, restocks and expenses (Phase 8). Every write runs in one transaction with its activity-log entry (BR-093).
 * Stock increases only when goods are received (BR-060): each received line writes a RESTOCK_RECEIPT movement and the
 * item quantity in the same transaction, and optionally sets the item's cost to the received cost (BR-062, RQ-033).
 * actor: { uid, displayName }
 */
import { DomainError } from '../domain/errors.js';
import { formatMoney } from '../domain/money.js';
import { formatQty } from '../domain/quantity.js';
import { parseDate } from '../domain/dates.js';
import { formatDocNo } from '../domain/saleTotals.js';
import { nextSeq } from '../domain/sales.js';
import { MOVEMENT_TYPES as MT } from '../domain/inventory.js';
import {
  RESTOCK_STATUS as RS, RESTOCK_PREFIX, RESTOCK_STATUS_LABELS, isOpenRestock, planReceipt, statusFromLines, restockTotalC, remainingH,
  RESTOCK_EXPENSE_CATEGORY, isRestockExpense, checkExpenseLines, planReceiptEdit,
} from '../domain/purchasing.js';
import { takenCostC, avgUnitCostC, batchesOf } from '../domain/batches.js';
import { lineCostOf } from '../domain/reports.js';
import { logWrite } from './activityLog.js';
import { assertOnline, coverItemsIn, supplierCodeIn } from './inventoryService.js';
import { BATCH_SOURCE, addBatch, batchIdFor, batchCounterId, supplierCode } from '../domain/batches.js';
import { writeItemMovement } from './salesService.js';

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });
const created = (adapter, actor) => ({ createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor) });

async function readDoc(tx, col, id, missing) {
  const s = await tx.get(col, id);
  if (!s.exists) throw new DomainError('MISSING', missing);
  return { id, ...s.data };
}

/* ------------------------------------------------------------------ suppliers */

const SUPPLIER_FIELDS = ['name', 'nameLower', 'contactPerson', 'contactNumber', 'email', 'address', 'notes'];

/** data: output of validateSupplierForm. Returns the new id. */
export async function createSupplier(adapter, actor, data) {
  assertOnline();
  const id = adapter.newId();
  return adapter.runTransaction(async (tx) => {
    // D-051: every supplier gets a code SUP001, SUP002 … used in its batch ids.
    const c = await tx.get('counters', 'supplier');
    const seq = c.exists && Number.isInteger(c.data.next) ? c.data.next : 1;
    tx.set('counters', 'supplier', { next: seq + 1 });
    const doc = { status: 'ACTIVE', code: supplierCode(seq), ...created(adapter, actor) };
    for (const k of SUPPLIER_FIELDS) doc[k] = data[k] || '';
    tx.set('suppliers', id, doc);
    logWrite(tx, adapter, actor, { action: 'SUPPLIER_CREATE', entityType: 'supplier', entityId: id, summary: `Added supplier ${doc.name} (${doc.code})` });
    return id;
  });
}

export async function updateSupplier(adapter, actor, id, data) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const s = await readDoc(tx, 'suppliers', id, 'This supplier no longer exists.');
    const patch = {}, changes = {};
    for (const k of SUPPLIER_FIELDS) {
      const v = data[k] ?? '';
      if (v !== (s[k] ?? '')) { patch[k] = v; if (k !== 'nameLower') changes[k] = { from: s[k] ?? '', to: v }; }
    }
    if (!Object.keys(patch).length) return { changed: false };
    tx.update('suppliers', id, { ...patch, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, { action: 'SUPPLIER_UPDATE', entityType: 'supplier', entityId: id, summary: `Edited supplier ${data.name || s.name}`, changes });
    return { changed: true };
  });
}

/** Archive or restore. Archived suppliers keep their history but cannot get new orders. */
export async function setSupplierStatus(adapter, actor, id, status) {
  assertOnline();
  if (status !== 'ACTIVE' && status !== 'ARCHIVED') throw new DomainError('INVALID_STATUS', 'Invalid status.');
  return adapter.runTransaction(async (tx) => {
    const s = await readDoc(tx, 'suppliers', id, 'This supplier no longer exists.');
    if (s.status === status) return;
    tx.update('suppliers', id, { status, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: status === 'ARCHIVED' ? 'SUPPLIER_ARCHIVE' : 'SUPPLIER_RESTORE', entityType: 'supplier', entityId: id,
      summary: `${status === 'ARCHIVED' ? 'Archived' : 'Restored'} supplier ${s.name}`,
    });
  });
}

/* ------------------------------------------------------------------ restocks (BR-060 … BR-062) */

const linesSummary = (lines, key = 'qtyOrderedH') => lines.map((l) => `${formatQty(l[key], l.unit)} ${l.itemName}`).join(', ');

/** data: output of validateRestockForm. Returns the restock number (RS-YYYY-NNNNN, year of the order date). */
export async function createRestock(adapter, actor, data) {
  assertOnline();
  const year = parseDate(data.orderDate).y;
  return adapter.runTransaction(async (tx) => {
    const counter = await tx.get('counters', `restock-${year}`);
    const supplier = await readDoc(tx, 'suppliers', data.supplierId, 'This supplier no longer exists.');
    if (supplier.status !== 'ACTIVE') throw new DomainError('ARCHIVED', 'Restore this supplier before ordering from it.');
    for (const l of data.lines) {
      const it = await tx.get('items', l.itemId);
      if (!it.exists || it.data.status !== 'ACTIVE') throw new DomainError('ARCHIVED', `${l.itemName} is archived or no longer exists.`);
    }
    const seq = nextSeq(counter.data);
    const id = formatDocNo(RESTOCK_PREFIX, year, seq);
    if ((await tx.get('restocks', id)).exists) throw new DomainError('DUPLICATE_ID', `Restock number ${id} is already used.`);
    tx.set('counters', `restock-${year}`, { next: seq + 1 });
    tx.set('restocks', id, {
      restockNo: id, supplierId: supplier.id, supplierName: supplier.name, orderDate: data.orderDate, expectedDate: data.expectedDate || null,
      status: RS.ORDERED, lines: data.lines.map((l) => ({ ...l, qtyReceivedH: 0 })), receipts: [], totalCostC: restockTotalC(data.lines),
      notes: data.notes || '', cancel: null, closed: null, ...created(adapter, actor),
    });
    logWrite(tx, adapter, actor, {
      action: 'RESTOCK_CREATE', entityType: 'restock', entityId: id,
      summary: `Ordered from ${supplier.name}: ${linesSummary(data.lines)} (${formatMoney(restockTotalC(data.lines))})`,
    });
    return id;
  });
}

/** Edit an open order (BR-061: "owner may edit the order line first"). Received quantities cannot be undercut. */
export async function updateRestock(adapter, actor, id, data) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const r = await readDoc(tx, 'restocks', id, 'This restock no longer exists.');
    if (!isOpenRestock(r)) throw new DomainError('RESTOCK_CLOSED', `This order is ${RESTOCK_STATUS_LABELS[r.status].toLowerCase()} and can no longer be edited.`);
    const supplier = data.supplierId !== r.supplierId ? await readDoc(tx, 'suppliers', data.supplierId, 'This supplier no longer exists.') : null;
    if (supplier && supplier.status !== 'ACTIVE') throw new DomainError('ARCHIVED', 'Restore this supplier before ordering from it.');
    if (supplier && (r.receipts || []).length) throw new DomainError('HAS_RECEIPTS', 'The supplier cannot change after goods were received.');
    const old = new Map(r.lines.map((l) => [l.itemId, l]));
    for (const l of data.lines) {
      const o = old.get(l.itemId);
      if (o && l.qtyOrderedH < (o.qtyReceivedH || 0)) throw new DomainError('BELOW_RECEIVED', `${l.itemName}: already received ${formatQty(o.qtyReceivedH, o.unit)}.`);
      if (!o) { const it = await tx.get('items', l.itemId); if (!it.exists || it.data.status !== 'ACTIVE') throw new DomainError('ARCHIVED', `${l.itemName} is archived or no longer exists.`); }
    }
    for (const o of r.lines) if ((o.qtyReceivedH || 0) > 0 && !data.lines.some((l) => l.itemId === o.itemId)) throw new DomainError('HAS_RECEIPTS', `${o.itemName} was already received and cannot be removed.`);
    const lines = data.lines.map((l) => ({ ...l, qtyReceivedH: old.has(l.itemId) ? (old.get(l.itemId).qtyReceivedH || 0) : 0 }));
    const totalCostC = restockTotalC(lines);
    tx.update('restocks', id, {
      supplierId: supplier ? supplier.id : r.supplierId, supplierName: supplier ? supplier.name : r.supplierName,
      orderDate: data.orderDate, expectedDate: data.expectedDate || null, notes: data.notes || '',
      lines, totalCostC, status: statusFromLines(lines), ...stamp(adapter, actor),
    });
    logWrite(tx, adapter, actor, {
      action: 'RESTOCK_UPDATE', entityType: 'restock', entityId: id,
      summary: `Edited order ${id}: ${linesSummary(lines)} (${formatMoney(totalCostC)})`,
      changes: { totalCostC: { from: r.totalCostC, to: totalCostC } },
    });
  });
}

/**
 * Receive goods (BR-061, BR-062, D-050, D-051). input: { date, lines: [{ itemId, qtyH, unitCostC, priceC, updateCost }] }.
 * The delivery becomes ONE batch id RJ-RS-<supplier code>-NNNN shared by its item lines; each line keeps its own cost
 * and cash price. updateCost: also make this cost and price the item's defaults for new stock.
 * input.expenses (D-060, D-062): [{ name, amountC }] — each becomes an expense (category Restock) linked to this delivery.
 * Returns { status, valueC, batchId, expensesC }.
 */
export async function receiveRestock(adapter, actor, id, input) {
  assertOnline();
  const expenseLines = checkExpenseLines(input.expenses || []).map((e) => ({ name: e.name, amountC: e.amountC, expenseId: adapter.newId() }));
  return adapter.runTransaction(async (tx) => {
    const r = await readDoc(tx, 'restocks', id, 'This restock no longer exists.');
    const plan = planReceipt(r, input);
    const raw = {};
    for (const l of plan.receiptLines) {
      const it = await readDoc(tx, 'items', l.itemId, `${l.itemName} no longer exists.`);
      if (it.status !== 'ACTIVE') throw new DomainError('ARCHIVED', `Restore ${it.name} before receiving it.`);
      raw[l.itemId] = it;
    }
    const supplier = await readDoc(tx, 'suppliers', r.supplierId, 'The supplier of this order no longer exists.');
    const code = await supplierCodeIn(tx, supplier);
    const counter = batchCounterId(code.code);
    const cs = await tx.get('counters', counter);
    const seq = cs.exists && Number.isInteger(cs.data.next) ? cs.data.next : 1;
    const batchId = batchIdFor(code.code, seq);
    // D-055: older stock not in a batch becomes the first batch before this delivery is added.
    const cover = await coverItemsIn(tx, raw, input.date);
    const items = cover.items;

    // ---- writes
    code.commit(); cover.commit();
    tx.set('counters', counter, { next: seq + 1 });
    const wanted = new Map((input.lines || []).map((l) => [l.itemId, l]));
    const costChanges = {};
    const receiptLines = [];
    for (const l of plan.receiptLines) {
      const item = items[l.itemId];
      const priceC = Number.isInteger(l.priceC) ? l.priceC : item.priceC;
      const added = addBatch(item, { id: batchId, date: input.date, qtyH: l.qtyH, unitCostC: l.unitCostC, priceC, source: BATCH_SOURCE.RESTOCK, supplierId: r.supplierId, supplierName: r.supplierName, restockId: id });
      const patch = {};
      if (wanted.get(l.itemId).updateCost && (item.costC !== l.unitCostC || item.priceC !== priceC)) {
        patch.costC = l.unitCostC; patch.priceC = priceC;
        costChanges[item.id] = { name: item.name, from: item.costC, to: l.unitCostC, priceFrom: item.priceC, priceTo: priceC };
      }
      writeItemMovement(tx, adapter, actor, item, {
        type: MT.RESTOCK_RECEIPT, deltaH: l.qtyH, unitCostC: l.unitCostC, refType: 'RESTOCK', refId: id, businessDate: input.date, note: `From ${r.supplierName} (batch ${added.id})`,
        batches: added.batches, batchParts: [{ batchId: added.id, qtyH: l.qtyH, unitCostC: l.unitCostC }], itemPatch: patch,
      });
      receiptLines.push({ ...l, priceC, batchId: added.id });
    }
    for (const e of expenseLines) tx.set('expenses', e.expenseId, restockExpenseDoc(adapter, actor, { restockId: id, batchId, date: input.date, name: e.name, amountC: e.amountC }));
    const receipts = [...(r.receipts || []), { date: input.date, batchId, lines: receiptLines, expenses: expenseLines, by: actor.uid, byName: actor.displayName || '', at: new Date().toISOString() }];
    tx.update('restocks', id, { lines: plan.lines, receipts, status: plan.status, ...stamp(adapter, actor) });
    const expensesC = expenseLines.reduce((a, e) => a + e.amountC, 0);
    const costText = Object.values(costChanges).map((c) => `${c.name} cost ${formatMoney(c.from)} → ${formatMoney(c.to)}` + (c.priceFrom !== c.priceTo ? `, price ${formatMoney(c.priceFrom)} → ${formatMoney(c.priceTo)}` : ''));
    logWrite(tx, adapter, actor, {
      action: 'RESTOCK_RECEIVE', entityType: 'restock', entityId: id,
      summary: `Received batch ${batchId} on ${id} from ${r.supplierName}: ${linesSummary(receiptLines, 'qtyH')}` + (costText.length ? `; ${costText.join(', ')}` : '')
        + (expenseLines.length ? `; expenses ${expenseLines.map((e) => `${e.name} ${formatMoney(e.amountC)}`).join(', ')}` : ''),
      changes: { status: { from: r.status, to: plan.status }, batchId, costChanges, expensesC },
    });
    return { status: plan.status, valueC: plan.valueC, batchId, expensesC };
  });
}

const restockExpenseDoc = (adapter, actor, { restockId, batchId, date, name, amountC }) => ({
  date, category: RESTOCK_EXPENSE_CATEGORY, amountC, note: name, restockId, batchId, status: 'ACTIVE', void: null, ...created(adapter, actor),
});

/**
 * D-063: edit a received delivery — unit cost and cash price per line, and its expense lines. Quantities never change.
 * input: { lines: [{ itemId, unitCostC, priceC }], expenses: [{ name, amountC, expenseId? }] }.
 * A new unit cost changes the batch still in stock and the cost recorded on ACTIVE sale lines that took stock from that
 * batch (their profit changes). A new price changes the batch still in stock. Linked expenses are updated in place;
 * removed lines are voided; new lines are created (D-062). Returns { changed, salesUpdated }.
 */
export async function editReceipt(adapter, actor, id, batchId, input) {
  assertOnline();
  const newIds = (input.expenses || []).map(() => adapter.newId());
  // Firestore transactions cannot query: find candidate sales first, re-read them inside the transaction.
  const pre = await adapter.get('restocks', id);
  const pr = pre && (pre.receipts || []).find((x) => x.batchId === batchId);
  const candidates = pr ? (await adapter.query('sales', { where: [['saleDate', '>=', pr.date]] }))
    .filter((s) => s.status === 'ACTIVE' && (s.lines || []).some((l) => (l.batches || []).some((b) => b.batchId === batchId))).map((s) => s.id) : [];
  return adapter.runTransaction(async (tx) => {
    const r = await readDoc(tx, 'restocks', id, 'This restock no longer exists.');
    if (r.status === RS.CANCELLED) throw new DomainError('RESTOCK_CLOSED', 'This order is cancelled.');
    const plan = planReceiptEdit(r, batchId, input);
    const costChanged = new Map(plan.changes.filter((c) => c.costFrom !== c.costTo).map((c) => [c.itemId, c]));
    const items = {};
    for (const c of plan.changes) items[c.itemId] = await readDoc(tx, 'items', c.itemId, `${c.itemName} no longer exists.`);
    const sales = [];
    if (costChanged.size) {
      for (const sid of candidates) { const d = await tx.get('sales', sid); if (d.exists && d.data.status === 'ACTIVE') sales.push({ id: sid, ...d.data }); }
    }
    const linked = {};
    for (const e of [...plan.expenseOps.update.map((u) => u.from), ...plan.expenseOps.void]) {
      if (!e.expenseId) continue;
      const d = await tx.get('expenses', e.expenseId);
      if (d.exists) linked[e.expenseId] = { id: e.expenseId, ...d.data };
    }
    const nothing = !plan.changes.length && !plan.expenseOps.create.length && !plan.expenseOps.update.length && !plan.expenseOps.void.length;
    if (nothing) return { changed: false, salesUpdated: 0 };

    // ---- writes
    for (const c of plan.changes) {
      const item = items[c.itemId];
      if (batchesOf(item).some((b) => b.id === batchId)) {
        tx.update('items', item.id, { batches: batchesOf(item).map((b) => (b.id === batchId ? { ...b, unitCostC: c.costTo, priceC: c.priceTo } : b)), ...stamp(adapter, actor) });
      }
    }
    let salesUpdated = 0;
    for (const s of sales) {
      let touched = false;
      const lines = s.lines.map((l) => {
        const c = costChanged.get(l.itemId);
        if (!c || !(l.batches || []).some((b) => b.batchId === batchId)) return l;
        touched = true;
        const batches = l.batches.map((b) => (b.batchId === batchId ? { ...b, unitCostC: c.costTo } : b));
        return { ...l, batches, unitCostC: avgUnitCostC(batches), costC: takenCostC(batches) };
      });
      if (!touched) continue;
      salesUpdated++;
      tx.update('sales', s.id, { lines, costC: lines.reduce((a, l) => a + lineCostOf(l), 0), ...stamp(adapter, actor) });
    }
    const expenses = [];
    let k = 0;
    for (const e of plan.expenses) {
      if (e.expenseId) { expenses.push(e); continue; }
      const eid = newIds[k++] || adapter.newId();
      tx.set('expenses', eid, restockExpenseDoc(adapter, actor, { restockId: id, batchId, date: plan.receipt.date, name: e.name, amountC: e.amountC }));
      expenses.push({ ...e, expenseId: eid });
    }
    for (const u of plan.expenseOps.update) {
      const cur = linked[u.expenseId];
      if (cur && cur.status === 'ACTIVE') tx.update('expenses', u.expenseId, { amountC: u.to.amountC, note: u.to.name, ...stamp(adapter, actor) });
    }
    for (const v of plan.expenseOps.void) {
      const cur = v.expenseId && linked[v.expenseId];
      if (cur && cur.status === 'ACTIVE') tx.update('expenses', v.expenseId, { status: 'VOIDED', void: { reason: `Removed from restock ${id} (${batchId})`, at: new Date().toISOString(), by: actor.uid }, ...stamp(adapter, actor) });
    }
    const receipts = r.receipts.map((x, i) => (i === plan.index ? { ...plan.receipt, expenses, edited: { at: new Date().toISOString(), by: actor.uid, byName: actor.displayName || '' } } : x));
    tx.update('restocks', id, { receipts, ...stamp(adapter, actor) });

    const parts = [
      ...plan.changes.map((c) => `${c.itemName}` + (c.costFrom !== c.costTo ? ` cost ${formatMoney(c.costFrom)} → ${formatMoney(c.costTo)}` : '') + (c.priceFrom !== c.priceTo ? ` price ${formatMoney(c.priceFrom)} → ${formatMoney(c.priceTo)}` : '')),
      ...plan.expenseOps.create.map((e) => `added ${e.name} ${formatMoney(e.amountC)}`),
      ...plan.expenseOps.update.map((u) => `${u.from.name} ${formatMoney(u.from.amountC)} → ${u.to.name !== u.from.name ? `${u.to.name} ` : ''}${formatMoney(u.to.amountC)}`),
      ...plan.expenseOps.void.map((e) => `removed ${e.name} ${formatMoney(e.amountC)}`),
    ];
    logWrite(tx, adapter, actor, {
      action: 'RESTOCK_RECEIPT_EDIT', entityType: 'restock', entityId: id,
      summary: `Edited delivery ${batchId} of ${id}: ${parts.join('; ')}` + (salesUpdated ? ` (cost updated on ${salesUpdated} sale${salesUpdated === 1 ? '' : 's'})` : ''),
      changes: { batchId, lines: plan.changes, expenses: { created: plan.expenseOps.create, updated: plan.expenseOps.update, voided: plan.expenseOps.void }, salesUpdated },
    });
    return { changed: true, salesUpdated };
  });
}

/** D-051: give a code to every supplier made before codes existed (oldest first). Run when the supplier list loads online. */
export async function ensureSupplierCodes(adapter, actor) {
  assertOnline();
  const all = await adapter.query('suppliers', {});
  const todo = all.filter((s) => !s.code).sort((a, b) => String(a.createdAt?.seconds ?? a.createdAt ?? '').localeCompare(String(b.createdAt?.seconds ?? b.createdAt ?? '')) || a.id.localeCompare(b.id));
  if (!todo.length) return { changed: 0 };
  return adapter.runTransaction(async (tx) => {
    const c = await tx.get('counters', 'supplier');
    const fresh = [];
    for (const s of todo) { const d = await tx.get('suppliers', s.id); if (d.exists && !d.data.code) fresh.push({ id: s.id, ...d.data }); }
    let seq = c.exists && Number.isInteger(c.data.next) ? c.data.next : 1;
    if (!fresh.length) return { changed: 0 };
    for (const s of fresh) tx.update('suppliers', s.id, { code: supplierCode(seq++) });
    tx.set('counters', 'supplier', { next: seq });
    logWrite(tx, adapter, actor, { action: 'SUPPLIER_CODES', entityType: 'supplier', entityId: fresh[0].id, summary: `Gave supplier codes to ${fresh.length} supplier(s)` });
    return { changed: fresh.length };
  });
}

/** BR-060: cancel only while nothing has been received. */
export async function cancelRestock(adapter, actor, id, reason) {
  assertOnline();
  const why = String(reason || '').trim();
  if (!why) throw new DomainError('REASON_REQUIRED', 'Enter the reason for cancelling.');
  return adapter.runTransaction(async (tx) => {
    const r = await readDoc(tx, 'restocks', id, 'This restock no longer exists.');
    if (r.status !== RS.ORDERED || (r.receipts || []).length) throw new DomainError('HAS_RECEIPTS', 'Only orders with nothing received can be cancelled. Close the order instead.');
    tx.update('restocks', id, { status: RS.CANCELLED, cancel: { reason: why, at: new Date().toISOString(), by: actor.uid }, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, { action: 'RESTOCK_CANCEL', entityType: 'restock', entityId: id, summary: `Cancelled order ${id} from ${r.supplierName}: ${why}` });
  });
}

/** D-038: close a partially received order when the rest will not arrive. Status becomes RECEIVED; nothing else changes. */
export async function closeRestock(adapter, actor, id, reason) {
  assertOnline();
  const why = String(reason || '').trim();
  if (!why) throw new DomainError('REASON_REQUIRED', 'Enter the reason for closing.');
  return adapter.runTransaction(async (tx) => {
    const r = await readDoc(tx, 'restocks', id, 'This restock no longer exists.');
    if (r.status !== RS.PARTIALLY_RECEIVED) throw new DomainError('NOT_PARTIAL', 'Only partially received orders can be closed.');
    const short = r.lines.filter((l) => remainingH(l) > 0);
    tx.update('restocks', id, { status: RS.RECEIVED, closed: { reason: why, at: new Date().toISOString(), by: actor.uid, short: short.map((l) => ({ itemId: l.itemId, qtyH: remainingH(l) })) }, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'RESTOCK_CLOSE', entityType: 'restock', entityId: id,
      summary: `Closed order ${id} short (not delivered: ${short.map((l) => `${formatQty(remainingH(l), l.unit)} ${l.itemName}`).join(', ')}): ${why}`,
    });
  });
}

/* ------------------------------------------------------------------ expenses (BR-063) */

/** data: output of validateExpenseForm. Returns the new id. */
export async function createExpense(adapter, actor, data) {
  assertOnline();
  const id = adapter.newId();
  return adapter.runTransaction(async (tx) => {
    tx.set('expenses', id, { date: data.date, category: data.category, amountC: data.amountC, note: data.note || '', status: 'ACTIVE', void: null, ...created(adapter, actor) });
    logWrite(tx, adapter, actor, { action: 'EXPENSE_CREATE', entityType: 'expense', entityId: id, summary: `Expense ${data.category} ${formatMoney(data.amountC)} on ${data.date}${data.note ? ` (${data.note})` : ''}` });
    return id;
  });
}

/** Expenses are corrected by voiding, never deleted (BR-063). */
export async function voidExpense(adapter, actor, id, reason) {
  assertOnline();
  const why = String(reason || '').trim();
  if (!why) throw new DomainError('REASON_REQUIRED', 'Enter the reason for voiding.');
  return adapter.runTransaction(async (tx) => {
    const e = await readDoc(tx, 'expenses', id, 'This expense no longer exists.');
    if (isRestockExpense(e)) throw new DomainError('RESTOCK_EXPENSE', `This expense belongs to restock ${e.restockId}. Change it there.`);
    if (e.status !== 'ACTIVE') throw new DomainError('ALREADY_VOIDED', 'This expense is already voided.');
    tx.update('expenses', id, { status: 'VOIDED', void: { reason: why, at: new Date().toISOString(), by: actor.uid }, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, { action: 'EXPENSE_VOID', entityType: 'expense', entityId: id, summary: `Voided expense ${e.category} ${formatMoney(e.amountC)} of ${e.date}: ${why}` });
  });
}
