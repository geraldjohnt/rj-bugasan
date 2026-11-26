/*
 * Inventory service (Phase 4). Every quantity change happens in one transaction together with its
 * immutable movement and activity-log entry (BR-011, BR-093). All reads precede writes (Firestore rule).
 * actor: { uid, displayName }
 */
import { DomainError } from '../domain/errors.js';
import { UNITS, formatQty } from '../domain/quantity.js';
import { formatMoney } from '../domain/money.js';
import {
  MOVEMENT_TYPES as MT, MAX_TX_WRITES, applyDelta, validateAdjustment, planOpenSack, planCount,
} from '../domain/inventory.js';
import { logWrite } from './activityLog.js';

export function assertOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new DomainError('OFFLINE', 'You are offline. Changes are disabled until the connection returns.');
  }
}

async function readItem(tx, id) {
  const s = await tx.get('items', id);
  if (!s.exists) throw new DomainError('ITEM_MISSING', 'This item no longer exists.');
  return { id, ...s.data };
}

async function assertNameFree(adapter, nameLower, selfId = null) {
  const same = await adapter.query('items', { where: [['nameLower', '==', nameLower]] });
  if (same.some((i) => i.status === 'ACTIVE' && i.id !== selfId)) {
    throw new DomainError('DUPLICATE_NAME', 'Another active item already has this name.', { field: 'name' });
  }
}

function writeMovement(tx, adapter, actor, item, m) {
  const id = adapter.newId();
  tx.set('inventoryMovements', id, {
    itemId: item.id, itemName: item.name, unit: item.unit,
    type: m.type,
    qtyDeltaH: m.afterH - item.qtyH,
    qtyBeforeH: item.qtyH,
    qtyAfterH: m.afterH,
    unitCostC: m.unitCostC ?? item.costC,
    reason: m.reason || null,
    note: m.note || null,
    refType: m.refType || null,
    refId: m.refId || null,
    groupId: m.groupId || null,
    businessDate: m.businessDate,
    createdAt: adapter.serverTime(),
    createdBy: actor.uid,
  });
  return id;
}

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });

function assertLinkableSack(sack, kgItemId) {
  if (sack.unit !== UNITS.SACK) throw new DomainError('NOT_SACK', 'The linked item must be a sack item.', { field: 'linkedSackItemId' });
  if (sack.linkedKgItemId && sack.linkedKgItemId !== kgItemId) {
    throw new DomainError('ALREADY_LINKED', `${sack.name} is already linked to another per-kg item.`, { field: 'linkedSackItemId' });
  }
}

/* ------------------------------------------------------------------ items */

/** data: output of validateItemForm (isNew). Returns the new item id. */
export async function createItem(adapter, actor, data) {
  assertOnline();
  await assertNameFree(adapter, data.nameLower);
  const id = adapter.newId();
  return adapter.runTransaction(async (tx) => {
    const sack = data.unit === UNITS.KG && data.linkedSackItemId ? await readItem(tx, data.linkedSackItemId) : null;
    if (sack) assertLinkableSack(sack, id);
    const item = {
      name: data.name, nameLower: data.nameLower, variety: data.variety, category: data.category, unit: data.unit,
      sackWeightKg: data.unit === UNITS.SACK ? data.sackWeightKg : null,
      linkedSackItemId: data.unit === UNITS.KG ? (data.linkedSackItemId || null) : null,
      linkedKgItemId: null,
      sku: data.sku, description: data.description,
      qtyH: 0, priceC: data.priceC, installmentPriceC: Number.isInteger(data.installmentPriceC) ? data.installmentPriceC : null, costC: data.costC, minStockH: data.minStockH,
      supplierId: null, status: 'ACTIVE',
      createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
    };
    if (data.openingQtyH > 0) {
      writeMovement(tx, adapter, actor, { id, ...item }, { type: MT.OPENING, afterH: data.openingQtyH, businessDate: data.openingDate, note: 'Opening stock' });
      item.qtyH = data.openingQtyH;
    }
    tx.set('items', id, item);
    if (sack) tx.update('items', sack.id, { linkedKgItemId: id, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'ITEM_CREATE', entityType: 'item', entityId: id,
      summary: `Added item ${item.name}` + (item.qtyH ? ` with opening stock ${formatQty(item.qtyH, item.unit)}` : ''),
    });
    return id;
  });
}

const EDITABLE = ['name', 'nameLower', 'variety', 'category', 'sku', 'description', 'priceC', 'installmentPriceC', 'costC', 'minStockH', 'sackWeightKg', 'linkedSackItemId'];

/** data: output of validateItemForm (isNew: false). Unit and quantity cannot change here. */
export async function updateItem(adapter, actor, id, data) {
  assertOnline();
  await assertNameFree(adapter, data.nameLower, id);
  return adapter.runTransaction(async (tx) => {
    const item = await readItem(tx, id);
    const newLink = item.unit === UNITS.KG ? (data.linkedSackItemId || null) : null;
    const oldLink = item.linkedSackItemId || null;
    const oldSack = oldLink && oldLink !== newLink ? await readItem(tx, oldLink).catch(() => null) : null;
    const newSack = newLink && newLink !== oldLink ? await readItem(tx, newLink) : null;
    if (newSack) assertLinkableSack(newSack, id);

    const patch = {};
    const changes = {};
    for (const k of EDITABLE) {
      let v = data[k];
      if (k === 'sackWeightKg' && item.unit !== UNITS.SACK) v = null;
      if (k === 'linkedSackItemId') v = newLink;
      if (v === undefined) continue;
      if (k === 'installmentPriceC' && v === (item[k] ?? null)) continue;
      if (v !== item[k]) { patch[k] = v; if (k !== 'nameLower') changes[k] = { from: item[k] ?? null, to: v }; }
    }
    if (!Object.keys(patch).length) return { changed: false };
    tx.update('items', id, { ...patch, ...stamp(adapter, actor) });
    if (oldSack) tx.update('items', oldSack.id, { linkedKgItemId: null, ...stamp(adapter, actor) });
    if (newSack) tx.update('items', newSack.id, { linkedKgItemId: id, ...stamp(adapter, actor) });

    const priceChanged = 'priceC' in changes || 'costC' in changes || 'installmentPriceC' in changes;
    const parts = [];
    const money = (c) => (c === null ? 'same as cash' : formatMoney(c));
    if ('priceC' in changes) parts.push(`price ${formatMoney(changes.priceC.from)} → ${formatMoney(changes.priceC.to)}`);
    if ('installmentPriceC' in changes) parts.push(`payday price ${money(changes.installmentPriceC.from)} → ${money(changes.installmentPriceC.to)}`);
    if ('costC' in changes) parts.push(`cost ${formatMoney(changes.costC.from)} → ${formatMoney(changes.costC.to)}`);
    logWrite(tx, adapter, actor, {
      action: priceChanged ? 'ITEM_PRICE_CHANGE' : 'ITEM_UPDATE', entityType: 'item', entityId: id,
      summary: `Edited ${data.name || item.name}` + (parts.length ? `: ${parts.join(', ')}` : ''),
      changes,
    });
    return { changed: true };
  });
}

/** Archive or restore (BR-018). Items are never deleted. */
export async function setItemStatus(adapter, actor, id, status) {
  assertOnline();
  if (status !== 'ACTIVE' && status !== 'ARCHIVED') throw new DomainError('INVALID_STATUS', 'Invalid status.');
  if (status === 'ACTIVE') {
    const it = await adapter.get('items', id);
    if (it) await assertNameFree(adapter, it.nameLower, id);
  }
  return adapter.runTransaction(async (tx) => {
    const item = await readItem(tx, id);
    if (item.status === status) return;
    tx.update('items', id, { status, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: status === 'ARCHIVED' ? 'ITEM_ARCHIVE' : 'ITEM_RESTORE', entityType: 'item', entityId: id,
      summary: `${status === 'ARCHIVED' ? 'Archived' : 'Restored'} item ${item.name}`,
    });
  });
}

/* ------------------------------------------------------------------ adjustments (BR-013, BR-014) */

/** input: { itemId, direction: 'IN'|'OUT', qtyH, reason, note, date } */
export async function adjustStock(adapter, actor, input) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const item = await readItem(tx, input.itemId);
    if (item.status !== 'ACTIVE') throw new DomainError('ARCHIVED', 'Restore this item before adjusting its stock.');
    const { errors, deltaH } = validateAdjustment(input, item.unit);
    const first = Object.values(errors)[0];
    if (first) throw new DomainError('INVALID_ADJUSTMENT', first, { errors });
    const afterH = applyDelta(item, deltaH);
    const note = String(input.note || '').trim();
    const movementId = writeMovement(tx, adapter, actor, item, { type: MT.ADJUSTMENT, afterH, reason: input.reason, note, businessDate: input.date });
    tx.update('items', item.id, { qtyH: afterH, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'STOCK_ADJUST', entityType: 'item', entityId: item.id,
      summary: `${deltaH > 0 ? 'Added' : 'Removed'} ${formatQty(Math.abs(deltaH), item.unit)} ${deltaH > 0 ? 'to' : 'from'} ${item.name} (${input.reason}${note ? ': ' + note : ''})`,
      changes: { qtyH: { from: item.qtyH, to: afterH }, movementId },
    });
    return { afterH };
  });
}

/* ------------------------------------------------------------------ open sack (BR-016) */

/** input: { sackItemId, sacks (whole number), kgCostC, date } */
export async function openSack(adapter, actor, { sackItemId, sacks, kgCostC, date }) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const sack = await readItem(tx, sackItemId);
    if (!sack.linkedKgItemId) throw new DomainError('NO_KG_ITEM', 'Link a per-kg item to this sack item first.');
    const kg = await readItem(tx, sack.linkedKgItemId);
    const plan = planOpenSack(sack, kg, sacks, kgCostC);
    const groupId = adapter.newId();
    const common = { refType: 'SACK_OPEN', refId: groupId, groupId, businessDate: date };
    writeMovement(tx, adapter, actor, sack, { ...common, type: MT.SACK_OPEN_OUT, afterH: plan.sackAfterH, note: `Opened into ${kg.name}` });
    writeMovement(tx, adapter, actor, kg, { ...common, type: MT.SACK_OPEN_IN, afterH: plan.kgAfterH, unitCostC: kgCostC, note: `From ${sack.name}` });
    tx.update('items', sack.id, { qtyH: plan.sackAfterH, ...stamp(adapter, actor) });
    tx.update('items', kg.id, { qtyH: plan.kgAfterH, costC: kgCostC, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'SACK_OPEN', entityType: 'item', entityId: sack.id,
      summary: `Opened ${formatQty(-plan.sackDeltaH, UNITS.SACK)} of ${sack.name} into ${formatQty(plan.kgDeltaH, UNITS.KG)} of ${kg.name} at ${formatMoney(kgCostC)}/kg`,
      changes: { groupId, kgCostC: { from: kg.costC, to: kgCostC } },
    });
    return plan;
  });
}

/* ------------------------------------------------------------------ stock counts (BR-017) */

/** Start a draft count over all active items. Returns the count id. */
export async function createCount(adapter, actor, { date, note = '' }) {
  assertOnline();
  const items = (await adapter.query('items', { where: [['status', '==', 'ACTIVE']] }))
    .sort((a, b) => a.nameLower.localeCompare(b.nameLower));
  if (!items.length) throw new DomainError('NO_ITEMS', 'Add items before starting a stock count.');
  const id = adapter.newId();
  await adapter.runTransaction(async (tx) => {
    tx.set('stockCounts', id, {
      date, note: String(note).trim(), status: 'DRAFT',
      lines: items.map((i) => ({ itemId: i.id, itemName: i.name, unit: i.unit, systemQtyH: i.qtyH, countedQtyH: null, diffH: null })),
      finalizedAt: null, finalizedBy: null,
      createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
    });
  });
  return id;
}

async function readDraft(tx, id) {
  const s = await tx.get('stockCounts', id);
  if (!s.exists) throw new DomainError('COUNT_MISSING', 'This stock count no longer exists.');
  if (s.data.status !== 'DRAFT') throw new DomainError('COUNT_FINAL', 'This stock count is already finalized.');
  return s.data;
}

/** counted: { [itemId]: countedQtyH | null } */
export async function saveCountDraft(adapter, actor, id, counted) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const count = await readDraft(tx, id);
    const lines = count.lines.map((l) => ({ ...l, countedQtyH: l.itemId in counted ? counted[l.itemId] : l.countedQtyH }));
    tx.update('stockCounts', id, { lines, ...stamp(adapter, actor) });
  });
}

export async function discardCount(adapter, actor, id) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    await readDraft(tx, id);
    tx.delete('stockCounts', id);
  });
}

/**
 * Finalize: compares counted quantities with stock *at this moment* (sales may have happened since the draft
 * was started) and writes a COUNT_ADJUSTMENT movement for every difference. Read-only afterwards.
 */
export async function finalizeCount(adapter, actor, id, counted) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const count = await readDraft(tx, id);
    const lines = count.lines.map((l) => ({ ...l, countedQtyH: l.itemId in counted ? counted[l.itemId] : l.countedQtyH }));
    const countedLines = lines.filter((l) => l.countedQtyH !== null && l.countedQtyH !== undefined);
    if (!countedLines.length) throw new DomainError('NOTHING_COUNTED', 'Enter at least one counted quantity.');
    const itemsById = {};
    for (const l of countedLines) itemsById[l.itemId] = await readItem(tx, l.itemId).catch(() => null);
    const plan = planCount(countedLines, itemsById);
    const changed = plan.filter((p) => p.diffH !== 0);
    if (changed.length * 2 + 2 > MAX_TX_WRITES) throw new DomainError('TOO_MANY', 'Too many differences for one count. Split the count into smaller ones.');

    for (const p of changed) {
      const item = itemsById[p.itemId];
      writeMovement(tx, adapter, actor, item, {
        type: MT.COUNT_ADJUSTMENT, afterH: p.countedQtyH, reason: 'Stock count', refType: 'STOCK_COUNT', refId: id, businessDate: count.date,
      });
      tx.update('items', item.id, { qtyH: p.countedQtyH, ...stamp(adapter, actor) });
    }
    const byItem = Object.fromEntries(plan.map((p) => [p.itemId, p]));
    tx.update('stockCounts', id, {
      status: 'FINALIZED',
      lines: lines.map((l) => (byItem[l.itemId] ? { ...l, systemQtyH: byItem[l.itemId].systemQtyH, diffH: byItem[l.itemId].diffH } : { ...l, countedQtyH: null, diffH: null })),
      finalizedAt: adapter.serverTime(), finalizedBy: actor.uid, ...stamp(adapter, actor),
    });
    logWrite(tx, adapter, actor, {
      action: 'STOCK_COUNT_FINALIZE', entityType: 'stockCount', entityId: id,
      summary: `Finalized stock count of ${count.date}: ${plan.length} item(s) counted, ${changed.length} adjusted`,
    });
    return { counted: plan.length, adjusted: changed.length };
  });
}
