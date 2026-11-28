/*
 * Inventory service (Phase 4). Every quantity change happens in one transaction together with its
 * immutable movement and activity-log entry (BR-011, BR-093). All reads precede writes (Firestore rule).
 * actor: { uid, displayName }
 */
import { DomainError } from '../domain/errors.js';
import { UNITS, formatQty } from '../domain/quantity.js';
import { formatMoney } from '../domain/money.js';
import {
  MOVEMENT_TYPES as MT, MAX_TX_WRITES, applyDelta, validateAdjustment, planOpenSack, planCount, normalizeSku, skuCode, formatSku, skuCounterId,
} from '../domain/inventory.js';
import {
  BATCH_SOURCE, OLD_CODE, batchIdFor, batchCounterId, batchesOf, uncoveredH, addBatch, takeFromBatches, removeStock, addFoundStock,
  defaultKgCost, validateBatchEdit, needsNewBatch, coverUncovered,
} from '../domain/batches.js';
import { logWrite } from './activityLog.js';

const nextOf = (snap) => (snap && snap.exists && Number.isInteger(snap.data.next) ? snap.data.next : 1);

/**
 * D-055: give stock not in any batch to the items' first batch, inside a transaction. Call in the READ phase (it may
 * read the OLD counter); returns { items: normalized copies keyed like the input, commit } — call commit() when writing.
 * The normalized batches are written by whatever item update the caller makes next.
 */
export async function coverItemsIn(tx, itemsById, date) {
  const need = Object.values(itemsById).filter((i) => i && needsNewBatch(i));
  let seq = null;
  if (need.length) seq = nextOf(await tx.get('counters', batchCounterId(OLD_CODE)));
  const out = {};
  let n = 0;
  for (const [k, item] of Object.entries(itemsById)) {
    if (!item) { out[k] = item; continue; }
    out[k] = needsNewBatch(item) ? coverUncovered(item, batchIdFor(OLD_CODE, seq + n++), date) : coverUncovered(item, null, date);
  }
  return { items: out, commit: () => { if (n) tx.set('counters', batchCounterId(OLD_CODE), { next: seq + n }); } };
}

/** D-055 one-off: register every item's stock that is not in a batch (run when the item list loads online). */
export async function ensureBatches(adapter, actor, date) {
  assertOnline();
  const items = await adapter.query('items', {});
  const todo = items.filter((i) => uncoveredH(i) > 0);
  if (!todo.length) return { changed: 0 };
  return adapter.runTransaction(async (tx) => {
    const fresh = {};
    for (const i of todo.slice(0, 200)) fresh[i.id] = await readItem(tx, i.id);
    const { items: covered, commit } = await coverItemsIn(tx, fresh, date);
    const changed = Object.values(covered).filter((i, k) => i !== Object.values(fresh)[k]);
    if (!changed.length) return { changed: 0 };
    commit();
    for (const i of changed) tx.update('items', i.id, { batches: i.batches, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'BATCH_REGISTER', entityType: 'item', entityId: changed[0].id,
      summary: `Registered stock not in a batch as the first batch of ${changed.length} item(s): ${changed.map((i) => `${i.name} (${i.batches[0].id})`).join(', ')}`,
    });
    return { changed: changed.length };
  });
}

/** D-067: give an SKU to every item that has none (oldest first). Run when item lists load online. */
export async function ensureSkus(adapter, actor) {
  assertOnline();
  const all = await adapter.query('items', {});
  const key = (i) => String(i.createdAt?.seconds ?? i.createdAt ?? '');
  const todo = all.filter((i) => !i.sku).sort((a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
  if (!todo.length) return { changed: 0 };
  const used = new Set(all.filter((i) => i.sku).map((i) => normalizeSku(i.sku)));
  return adapter.runTransaction(async (tx) => {
    const fresh = [];
    for (const i of todo.slice(0, 200)) { const d = await tx.get('items', i.id); if (d.exists && !d.data.sku) fresh.push({ id: i.id, ...d.data }); }
    if (!fresh.length) return { changed: 0 };
    const pending = {};
    const given = [];
    let last = null;
    for (const i of fresh) { last = await reserveSku(tx, i, used, pending); given.push({ item: i, sku: last.sku }); }
    for (const c of Object.keys(pending)) tx.set('counters', c, { next: pending[c].next });
    for (const g of given) tx.update('items', g.item.id, { sku: g.sku, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'ITEM_SKUS', entityType: 'item', entityId: given[0].item.id,
      summary: `Gave SKUs to ${given.length} item(s): ${given.map((g) => `${g.item.name} ${g.sku}`).join(', ')}`,
    });
    return { changed: given.length };
  });
}

/**
 * Batch id for stock that did not come with a restock receipt (D-051): from the supplier's counter when a supplier is
 * known (and has a code), otherwise from the OLD counter. Reads must run before any write of the transaction.
 * Returns { id, commit } — call commit() in the write phase.
 */
export async function reserveBatchId(tx, code = OLD_CODE) {
  const counter = batchCounterId(code);
  const seq = nextOf(await tx.get('counters', counter));
  return { id: batchIdFor(code, seq), commit: () => tx.set('counters', counter, { next: seq + 1 }) };
}

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

/** D-067: SKUs are unique (case-insensitive). Returns the set of SKUs in use by other items. */
async function skusInUse(adapter, selfId = null) {
  const all = await adapter.query('items', {});
  return new Set(all.filter((i) => i.id !== selfId && i.sku).map((i) => normalizeSku(i.sku)));
}
function assertSkuFree(used, sku) {
  if (sku && used.has(normalizeSku(sku))) throw new DomainError('DUPLICATE_SKU', `Another item already has SKU ${sku}.`, { field: 'sku' });
}
/**
 * Next free SKU for an item (D-067): RJ-<CODE>-NNN from counter sku-<CODE>, skipping numbers already typed on
 * other items. Reads before writes; call commit() in the write phase. used: Set of SKUs in use (updated on commit).
 */
export async function reserveSku(tx, item, used, pending = {}) {
  const code = skuCode(item);
  const counter = skuCounterId(code);
  if (!(counter in pending)) pending[counter] = { start: nextOf(await tx.get('counters', counter)), next: null };
  const p = pending[counter];
  let seq = p.next ?? p.start;
  while (used.has(formatSku(code, seq))) seq++;
  const sku = formatSku(code, seq);
  used.add(sku);
  p.next = seq + 1;
  return { sku, commit: () => tx.set('counters', counter, { next: p.next }) };
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
    ...(m.batchParts && m.batchParts.length ? { batches: m.batchParts.map((b) => ({ batchId: b.batchId, qtyH: b.qtyH, unitCostC: b.unitCostC })) } : {}),
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
  const used = await skusInUse(adapter);
  assertSkuFree(used, data.sku);
  const id = adapter.newId();
  return adapter.runTransaction(async (tx) => {
    const sack = data.unit === UNITS.KG && data.linkedSackItemId ? await readItem(tx, data.linkedSackItemId) : null;
    if (sack) assertLinkableSack(sack, id);
    const batchNo = data.openingQtyH > 0 ? await reserveBatchId(tx) : null;
    const skuNo = data.sku ? null : await reserveSku(tx, data, new Set(used));
    const item = {
      name: data.name, nameLower: data.nameLower, variety: data.variety, category: data.category, unit: data.unit,
      sackWeightKg: data.unit === UNITS.SACK ? data.sackWeightKg : null,
      linkedSackItemId: data.unit === UNITS.KG ? (data.linkedSackItemId || null) : null,
      linkedKgItemId: null,
      sku: data.sku || skuNo.sku, description: data.description,
      qtyH: 0, priceC: data.priceC, installmentPriceC: Number.isInteger(data.installmentPriceC) ? data.installmentPriceC : null, costC: data.costC, minStockH: data.minStockH,
      supplierId: null, status: 'ACTIVE', batches: [],
      createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
    };
    if (data.openingQtyH > 0) {
      // Opening stock of a new item becomes its first batch at the item's cost and cash price (D-053).
      const b = addBatch({ ...item, batches: [] }, { id: batchNo.id, date: data.openingDate, qtyH: data.openingQtyH, unitCostC: data.costC, priceC: data.priceC, source: BATCH_SOURCE.OPENING });
      writeMovement(tx, adapter, actor, { id, ...item }, { type: MT.OPENING, afterH: data.openingQtyH, businessDate: data.openingDate, note: `Opening stock (batch ${batchNo.id})`, batchParts: [{ batchId: batchNo.id, qtyH: data.openingQtyH, unitCostC: data.costC }] });
      batchNo.commit();
      item.qtyH = data.openingQtyH;
      item.batches = b.batches;
    }
    if (skuNo) skuNo.commit();
    tx.set('items', id, item);
    if (sack) tx.update('items', sack.id, { linkedKgItemId: id, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'ITEM_CREATE', entityType: 'item', entityId: id,
      summary: `Added item ${item.name} (${item.sku})` + (item.qtyH ? ` with opening stock ${formatQty(item.qtyH, item.unit)}` : ''),
    });
    return id;
  });
}

const EDITABLE = ['name', 'nameLower', 'variety', 'category', 'sku', 'description', 'priceC', 'installmentPriceC', 'costC', 'minStockH', 'sackWeightKg', 'linkedSackItemId'];

/** data: output of validateItemForm (isNew: false). Unit and quantity cannot change here. */
/** opts.applyPriceToBatches: a changed cash price also becomes the price of every batch in stock (D-050). */
export async function updateItem(adapter, actor, id, data, { applyPriceToBatches = false } = {}) {
  assertOnline();
  await assertNameFree(adapter, data.nameLower, id);
  const used = await skusInUse(adapter, id);
  if (data.sku !== undefined) assertSkuFree(used, data.sku);
  return adapter.runTransaction(async (tx) => {
    const item = await readItem(tx, id);
    // D-067: a blank SKU keeps the item's SKU; an item without one gets an automatic one.
    const skuNo = data.sku === '' && !item.sku ? await reserveSku(tx, { ...item, ...data }, new Set(used)) : null;
    if (data.sku === '') data = { ...data, sku: skuNo ? skuNo.sku : item.sku };
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
    const repriced = applyPriceToBatches && 'priceC' in patch ? batchesOf(item).filter((b) => b.priceC !== patch.priceC).length : 0;
    if (repriced) patch.batches = batchesOf(item).map((b) => ({ ...b, priceC: patch.priceC }));
    if (skuNo && patch.sku === skuNo.sku) skuNo.commit();
    tx.update('items', id, { ...patch, ...stamp(adapter, actor) });
    if (oldSack) tx.update('items', oldSack.id, { linkedKgItemId: null, ...stamp(adapter, actor) });
    if (newSack) tx.update('items', newSack.id, { linkedKgItemId: id, ...stamp(adapter, actor) });

    const priceChanged = 'priceC' in changes || 'costC' in changes || 'installmentPriceC' in changes;
    const parts = [];
    const money = (c) => (c === null ? 'same as cash' : formatMoney(c));
    if ('priceC' in changes) parts.push(`price ${formatMoney(changes.priceC.from)} → ${formatMoney(changes.priceC.to)}` + (repriced ? ` (also ${repriced} batch(es) in stock)` : ''));
    if ('installmentPriceC' in changes) parts.push(`credit price ${money(changes.installmentPriceC.from)} → ${money(changes.installmentPriceC.to)}`);
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
    const raw = await readItem(tx, input.itemId);
    if (raw.status !== 'ACTIVE') throw new DomainError('ARCHIVED', 'Restore this item before adjusting its stock.');
    const cov = await coverItemsIn(tx, { x: raw }, input.date);
    const item = cov.items.x;
    cov.commit();
    const { errors, deltaH } = validateAdjustment(input, item.unit);
    const first = Object.values(errors)[0];
    if (first) throw new DomainError('INVALID_ADJUSTMENT', first, { errors });
    const afterH = applyDelta(item, deltaH);
    const note = String(input.note || '').trim();
    // D-050: stock out takes stock not in any batch first, then the chosen or oldest batch; stock in goes to the chosen
    // or newest batch (or stays outside batches when the item has none).
    const b = deltaH < 0 ? removeStock(item, -deltaH, { batchId: input.batchId || null }) : addFoundStock(item, deltaH, { batchId: input.batchId || null });
    const parts = deltaH < 0 ? b.taken : (b.batchId ? [{ batchId: b.batchId, qtyH: deltaH, unitCostC: b.batches.find((x) => x.id === b.batchId).unitCostC }] : []);
    const movementId = writeMovement(tx, adapter, actor, item, { type: MT.ADJUSTMENT, afterH, reason: input.reason, note, businessDate: input.date, batchParts: parts, unitCostC: parts.length ? parts[0].unitCostC : item.costC });
    tx.update('items', item.id, { qtyH: afterH, batches: b.batches, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'STOCK_ADJUST', entityType: 'item', entityId: item.id,
      summary: `${deltaH > 0 ? 'Added' : 'Removed'} ${formatQty(Math.abs(deltaH), item.unit)} ${deltaH > 0 ? 'to' : 'from'} ${item.name} (${input.reason}${note ? ': ' + note : ''})`,
      changes: { qtyH: { from: item.qtyH, to: afterH }, movementId },
    });
    return { afterH };
  });
}

/* ------------------------------------------------------------------ open sack (BR-016) */

/**
 * input: { sackItemId, sacks (whole number), kgCostC (optional override), date }.
 * D-050: sacks come out of the sack item's batches oldest first; each sack batch used becomes a KG batch with the same
 * id, cost = sack batch cost ÷ sack weight (or the override) and the KG item's default cash price.
 */
export async function openSack(adapter, actor, { sackItemId, sacks, kgCostC = null, date }) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const rawSack = await readItem(tx, sackItemId);
    if (!rawSack.linkedKgItemId) throw new DomainError('NO_KG_ITEM', 'Link a per-kg item to this sack item first.');
    const rawKg = await readItem(tx, rawSack.linkedKgItemId);
    const cov = await coverItemsIn(tx, { sack: rawSack, kg: rawKg }, date);
    const { sack, kg } = cov.items;
    cov.commit();
    const override = Number.isInteger(kgCostC) ? kgCostC : null;
    const plan = planOpenSack(sack, kg, sacks, override ?? 0);
    const out = takeFromBatches(sack, -plan.sackDeltaH);
    let kgState = kg;
    const inParts = [];
    for (const t of out.taken) {
      const qtyH = (t.qtyH / 100) * Math.round(sack.sackWeightKg * 100);
      const unitCostC = override ?? defaultKgCost(t.unitCostC, sack.sackWeightKg);
      const r = addBatch(kgState, { id: t.batchId, date, qtyH, unitCostC, priceC: kg.priceC, source: BATCH_SOURCE.SACK_OPEN, supplierId: t.supplierId, supplierName: t.supplierName, restockId: t.restockId });
      kgState = { ...kgState, batches: r.batches };
      inParts.push({ batchId: r.id, qtyH, unitCostC });
    }
    const avgKgCostC = inParts.length ? Math.round(inParts.reduce((s, p) => s + p.qtyH * p.unitCostC, 0) / inParts.reduce((s, p) => s + p.qtyH, 0)) : 0;
    const groupId = adapter.newId();
    const common = { refType: 'SACK_OPEN', refId: groupId, groupId, businessDate: date };
    writeMovement(tx, adapter, actor, sack, { ...common, type: MT.SACK_OPEN_OUT, afterH: plan.sackAfterH, note: `Opened into ${kg.name}`, batchParts: out.taken, unitCostC: out.taken[0].unitCostC });
    writeMovement(tx, adapter, actor, kg, { ...common, type: MT.SACK_OPEN_IN, afterH: plan.kgAfterH, unitCostC: avgKgCostC, note: `From ${sack.name}`, batchParts: inParts });
    tx.update('items', sack.id, { qtyH: plan.sackAfterH, batches: out.batches, ...stamp(adapter, actor) });
    tx.update('items', kg.id, { qtyH: plan.kgAfterH, batches: kgState.batches, costC: avgKgCostC, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: 'SACK_OPEN', entityType: 'item', entityId: sack.id,
      summary: `Opened ${formatQty(-plan.sackDeltaH, UNITS.SACK)} of ${sack.name} into ${formatQty(plan.kgDeltaH, UNITS.KG)} of ${kg.name} at ${inParts.map((p) => `${formatMoney(p.unitCostC)}/kg (${p.batchId})`).join(', ')}`,
      changes: { groupId, kgCostC: { from: kg.costC, to: avgKgCostC }, batches: inParts.map((p) => p.batchId) },
    });
    return { ...plan, kgCostC: avgKgCostC, batches: inParts };
  });
}

/* ------------------------------------------------------------------ batch corrections */

/** Change a batch's cost and/or cash price (affects later sales only). */
export async function updateBatch(adapter, actor, itemId, batchId, form) {
  assertOnline();
  const { data, errors } = validateBatchEdit(form);
  const first = Object.values(errors)[0];
  if (first) throw new DomainError('INVALID_BATCH', first, { errors });
  return adapter.runTransaction(async (tx) => {
    const item = await readItem(tx, itemId);
    const b = batchesOf(item).find((x) => x.id === batchId);
    if (!b) throw new DomainError('BATCH_MISSING', `Batch ${batchId} is no longer in stock.`);
    if (b.unitCostC === data.unitCostC && b.priceC === data.priceC) return { changed: false };
    tx.update('items', item.id, { batches: batchesOf(item).map((x) => (x.id === batchId ? { ...x, ...data } : x)), ...stamp(adapter, actor) });
    const parts = [];
    if (b.unitCostC !== data.unitCostC) parts.push(`cost ${formatMoney(b.unitCostC)} → ${formatMoney(data.unitCostC)}`);
    if (b.priceC !== data.priceC) parts.push(`price ${formatMoney(b.priceC)} → ${formatMoney(data.priceC)}`);
    logWrite(tx, adapter, actor, {
      action: 'BATCH_UPDATE', entityType: 'item', entityId: item.id, summary: `Batch ${batchId} of ${item.name}: ${parts.join(', ')}`,
      changes: { batchId, unitCostC: { from: b.unitCostC, to: data.unitCostC }, priceC: { from: b.priceC, to: data.priceC } },
    });
    return { changed: true };
  });
}

/**
 * Supplier code (D-051) inside a transaction: the supplier's own code, or a new SUPnnn from the `supplier` counter
 * for suppliers made before codes existed. Returns { code, commit }.
 */
export async function supplierCodeIn(tx, supplier) {
  if (supplier.code) return { code: supplier.code, commit: () => {} };
  const seq = nextOf(await tx.get('counters', 'supplier'));
  const code = `SUP${String(seq).padStart(3, '0')}`;
  return { code, commit: () => { tx.set('counters', 'supplier', { next: seq + 1 }); tx.update('suppliers', supplier.id, { code }); } };
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
    const raw = {};
    for (const l of countedLines) raw[l.itemId] = await readItem(tx, l.itemId).catch(() => null);
    const cov = await coverItemsIn(tx, raw, count.date);
    Object.assign(itemsById, cov.items);
    const plan = planCount(countedLines, itemsById);
    const changed = plan.filter((p) => p.diffH !== 0);
    if (changed.length * 2 + 2 > MAX_TX_WRITES) throw new DomainError('TOO_MANY', 'Too many differences for one count. Split the count into smaller ones.');

    cov.commit();
    for (const p of plan) {
      if (p.diffH === 0 && cov.items[p.itemId] !== raw[p.itemId]) tx.update('items', p.itemId, { batches: cov.items[p.itemId].batches, ...stamp(adapter, actor) });
    }
    for (const p of changed) {
      const item = itemsById[p.itemId];
      const b = p.diffH < 0 ? removeStock(item, -p.diffH) : addFoundStock(item, p.diffH);
      const parts = p.diffH < 0 ? b.taken : (b.batchId ? [{ batchId: b.batchId, qtyH: p.diffH, unitCostC: b.batches.find((x) => x.id === b.batchId).unitCostC }] : []);
      writeMovement(tx, adapter, actor, item, {
        type: MT.COUNT_ADJUSTMENT, afterH: p.countedQtyH, reason: 'Stock count', refType: 'STOCK_COUNT', refId: id, businessDate: count.date,
        batchParts: parts, unitCostC: parts.length ? parts[0].unitCostC : item.costC,
      });
      tx.update('items', item.id, { qtyH: p.countedQtyH, batches: b.batches, ...stamp(adapter, actor) });
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
