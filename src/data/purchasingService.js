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
} from '../domain/purchasing.js';
import { logWrite } from './activityLog.js';
import { assertOnline } from './inventoryService.js';
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
    const doc = { status: 'ACTIVE', ...created(adapter, actor) };
    for (const k of SUPPLIER_FIELDS) doc[k] = data[k] || '';
    tx.set('suppliers', id, doc);
    logWrite(tx, adapter, actor, { action: 'SUPPLIER_CREATE', entityType: 'supplier', entityId: id, summary: `Added supplier ${doc.name}` });
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
 * Receive goods (BR-061, BR-062). input: { date, lines: [{ itemId, qtyH, unitCostC, updateCost }] }.
 * Returns { status, valueC }.
 */
export async function receiveRestock(adapter, actor, id, input) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const r = await readDoc(tx, 'restocks', id, 'This restock no longer exists.');
    const plan = planReceipt(r, input);
    const items = {};
    for (const l of plan.receiptLines) {
      const it = await readDoc(tx, 'items', l.itemId, `${l.itemName} no longer exists.`);
      if (it.status !== 'ACTIVE') throw new DomainError('ARCHIVED', `Restore ${it.name} before receiving it.`);
      items[l.itemId] = it;
    }
    const wanted = new Map((input.lines || []).map((l) => [l.itemId, l]));
    const costChanges = {};
    for (const l of plan.receiptLines) {
      const item = items[l.itemId];
      writeItemMovement(tx, adapter, actor, item, {
        type: MT.RESTOCK_RECEIPT, deltaH: l.qtyH, unitCostC: l.unitCostC, refType: 'RESTOCK', refId: id, businessDate: input.date, note: `From ${r.supplierName}`,
      });
      if (wanted.get(l.itemId).updateCost && item.costC !== l.unitCostC) {
        tx.update('items', item.id, { costC: l.unitCostC, ...stamp(adapter, actor) });
        costChanges[item.id] = { name: item.name, from: item.costC, to: l.unitCostC };
      }
    }
    const receipts = [...(r.receipts || []), { date: input.date, lines: plan.receiptLines, by: actor.uid, byName: actor.displayName || '', at: new Date().toISOString() }];
    tx.update('restocks', id, { lines: plan.lines, receipts, status: plan.status, ...stamp(adapter, actor) });
    const costText = Object.values(costChanges).map((c) => `${c.name} cost ${formatMoney(c.from)} → ${formatMoney(c.to)}`);
    logWrite(tx, adapter, actor, {
      action: 'RESTOCK_RECEIVE', entityType: 'restock', entityId: id,
      summary: `Received on ${id} from ${r.supplierName}: ${linesSummary(plan.receiptLines, 'qtyH')}` + (costText.length ? `; ${costText.join(', ')}` : ''),
      changes: { status: { from: r.status, to: plan.status }, costChanges },
    });
    return { status: plan.status, valueC: plan.valueC };
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
    if (e.status !== 'ACTIVE') throw new DomainError('ALREADY_VOIDED', 'This expense is already voided.');
    tx.update('expenses', id, { status: 'VOIDED', void: { reason: why, at: new Date().toISOString(), by: actor.uid }, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, { action: 'EXPENSE_VOID', entityType: 'expense', entityId: id, summary: `Voided expense ${e.category} ${formatMoney(e.amountC)} of ${e.date}: ${why}` });
  });
}
