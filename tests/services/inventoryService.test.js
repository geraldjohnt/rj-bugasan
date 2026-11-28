import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import {
  createItem, updateItem, setItemStatus, adjustStock, openSack, createCount, saveCountDraft, finalizeCount, discardCount,
} from '../../src/data/inventoryService.js';
import { loadSampleData } from '../../src/data/sampleData.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const D = '2026-11-25';
const itemData = (o = {}) => {
  const { data, errors } = validateItemForm({ name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: '50', priceC: '3250', costC: '2900', minStock: '5', openingQty: '10', openingDate: D, ...o });
  assert.deepEqual(errors, {});
  return data;
};
const movementsOf = async (db, itemId) => (await db.query('inventoryMovements', { where: [['itemId', '==', itemId]] }));

/** Invariant: for every item, the sum of its movements equals its quantity, and each movement chains correctly. */
async function assertLedger(db) {
  for (const item of await db.query('items', {})) {
    const ms = await movementsOf(db, item.id);
    assert.equal(ms.reduce((s, m) => s + m.qtyDeltaH, 0), item.qtyH, `ledger mismatch for ${item.name}`);
    for (const m of ms) { assert.equal(m.qtyAfterH, m.qtyBeforeH + m.qtyDeltaH); assert.ok(m.qtyAfterH >= 0); }
  }
}

async function setupPair(db) {
  const sackId = await createItem(db, actor, itemData());
  const kgId = await createItem(db, actor, itemData({ name: 'Dinorado per KG', unit: 'KG', priceC: '68', costC: '58', minStock: '25', openingQty: '2.5', linkedSackItemId: sackId }));
  return { sackId, kgId };
}

test('create item with opening stock writes an OPENING movement and activity log; links sack ↔ kg', async () => {
  const db = createMockAdapter();
  const { sackId, kgId } = await setupPair(db);
  const sack = await db.get('items', sackId);
  const kg = await db.get('items', kgId);
  assert.equal(sack.qtyH, 1000);
  assert.equal(sack.linkedKgItemId, kgId);
  assert.equal(kg.linkedSackItemId, sackId);
  const ms = await movementsOf(db, sackId);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].type, 'OPENING');
  assert.equal((await db.query('activityLogs', { where: [['action', '==', 'ITEM_CREATE']] })).length, 2);
  await assertLedger(db);
});

test('item without opening stock has no movement; duplicate active names are rejected', async () => {
  const db = createMockAdapter();
  const id = await createItem(db, actor, itemData({ openingQty: '' }));
  assert.equal((await movementsOf(db, id)).length, 0);
  await assert.rejects(createItem(db, actor, itemData()), (e) => e.code === 'DUPLICATE_NAME');
});

test('a sack can be linked to only one kg item', async () => {
  const db = createMockAdapter();
  const { sackId } = await setupPair(db);
  await assert.rejects(createItem(db, actor, itemData({ name: 'Other per KG', unit: 'KG', linkedSackItemId: sackId })), (e) => e.code === 'ALREADY_LINKED');
});

test('editing price and cost is logged with before/after; unit and stock unchanged (BR-019)', async () => {
  const db = createMockAdapter();
  const id = await createItem(db, actor, itemData());
  await updateItem(db, actor, id, itemData({ priceC: '3300', openingQty: '' }));
  const item = await db.get('items', id);
  assert.equal(item.priceC, 330000);
  assert.equal(item.qtyH, 1000);
  const [log] = await db.query('activityLogs', { where: [['action', '==', 'ITEM_PRICE_CHANGE']] });
  assert.deepEqual(log.changes.priceC, { from: 325000, to: 330000 });
});

test('relinking a kg item moves the link from the old sack to the new one', async () => {
  const db = createMockAdapter();
  const { sackId, kgId } = await setupPair(db);
  const sack2 = await createItem(db, actor, itemData({ name: 'Dinorado 25kg Sack', sackWeightKg: '25' }));
  await updateItem(db, actor, kgId, itemData({ name: 'Dinorado per KG', unit: 'KG', priceC: '68', costC: '58', minStock: '25', linkedSackItemId: sack2 }));
  assert.equal((await db.get('items', sackId)).linkedKgItemId, null);
  assert.equal((await db.get('items', sack2)).linkedKgItemId, kgId);
});

test('adjustments: reason required, cannot go negative, archived items blocked', async () => {
  const db = createMockAdapter();
  const id = await createItem(db, actor, itemData());
  const adj = (o) => adjustStock(db, actor, { itemId: id, direction: 'OUT', qtyH: 200, reason: 'Damaged sack', note: '', date: D, ...o });
  assert.equal((await adj()).afterH, 800);
  await assert.rejects(adj({ qtyH: 900 }), (e) => e.code === 'NEGATIVE_STOCK');
  await assert.rejects(adj({ reason: 'Other' }), (e) => e.code === 'INVALID_ADJUSTMENT');
  await adj({ direction: 'IN', qtyH: 100, reason: 'Count correction' });
  assert.equal((await db.get('items', id)).qtyH, 900);
  await setItemStatus(db, actor, id, 'ARCHIVED');
  await assert.rejects(adj(), (e) => e.code === 'ARCHIVED');
  const m = (await movementsOf(db, id)).find((x) => x.type === 'ADJUSTMENT');
  assert.equal(m.reason, 'Damaged sack');
  assert.equal(m.unitCostC, 290000);
  await assertLedger(db);
});

test('open sack is atomic: two linked movements, kg cost updated (BR-016)', async () => {
  const db = createMockAdapter();
  const { sackId, kgId } = await setupPair(db);
  await openSack(db, actor, { sackItemId: sackId, sacks: 2, kgCostC: 5900, date: D });
  const sack = await db.get('items', sackId);
  const kg = await db.get('items', kgId);
  assert.equal(sack.qtyH, 800);
  assert.equal(kg.qtyH, 250 + 10000);
  assert.equal(kg.costC, 5900);
  const out = (await movementsOf(db, sackId)).find((m) => m.type === 'SACK_OPEN_OUT');
  const inn = (await movementsOf(db, kgId)).find((m) => m.type === 'SACK_OPEN_IN');
  assert.ok(out.groupId && out.groupId === inn.groupId);
  // Too many sacks: nothing changes at all
  await assert.rejects(openSack(db, actor, { sackItemId: sackId, sacks: 9, kgCostC: 5900, date: D }), (e) => e.code === 'NEGATIVE_STOCK');
  assert.equal((await db.get('items', kgId)).qtyH, 10250);
  await assertLedger(db);
});

test('concurrent removals of the last stock: only one succeeds', async () => {
  const db = createMockAdapter();
  const id = await createItem(db, actor, itemData({ openingQty: '1' }));
  const take = () => adjustStock(db, actor, { itemId: id, direction: 'OUT', qtyH: 100, reason: 'Spillage', date: D });
  const res = await Promise.allSettled([take(), take()]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await db.get('items', id)).qtyH, 0);
  await assertLedger(db);
});

test('stock count: draft, save, finalize creates adjustments for differences only; then read-only (BR-017)', async () => {
  const db = createMockAdapter();
  const { sackId, kgId } = await setupPair(db);
  const countId = await createCount(db, actor, { date: D });
  await saveCountDraft(db, actor, countId, { [sackId]: 900 });
  assert.equal((await db.get('stockCounts', countId)).lines.find((l) => l.itemId === sackId).countedQtyH, 900);
  // A change after the draft started: the count compares with stock at finalize time.
  await adjustStock(db, actor, { itemId: kgId, direction: 'IN', qtyH: 50, reason: 'Count correction', date: D });
  const r = await finalizeCount(db, actor, countId, { [kgId]: 300 });
  assert.deepEqual(r, { counted: 2, adjusted: 1 });
  assert.equal((await db.get('items', sackId)).qtyH, 900);
  assert.equal((await db.get('items', kgId)).qtyH, 300); // counted equals current (250 + 50): no adjustment
  const count = await db.get('stockCounts', countId);
  assert.equal(count.status, 'FINALIZED');
  assert.equal(count.lines.find((l) => l.itemId === sackId).diffH, -100);
  assert.equal((await movementsOf(db, sackId)).filter((m) => m.type === 'COUNT_ADJUSTMENT').length, 1);
  await assert.rejects(saveCountDraft(db, actor, countId, { [sackId]: 0 }), (e) => e.code === 'COUNT_FINAL');
  await assert.rejects(finalizeCount(db, actor, countId, {}), (e) => e.code === 'COUNT_FINAL');
  await assertLedger(db);
});

test('stock count: nothing counted is rejected; drafts can be discarded', async () => {
  const db = createMockAdapter();
  await setupPair(db);
  const id = await createCount(db, actor, { date: D });
  await assert.rejects(finalizeCount(db, actor, id, {}), (e) => e.code === 'NOTHING_COUNTED');
  await discardCount(db, actor, id);
  assert.equal(await db.get('stockCounts', id), null);
});

test('sample data loads consistently and is not duplicated on a second run', async () => {
  const db = createMockAdapter();
  const first = await loadSampleData(db, actor);
  assert.ok(first.created >= 8);
  const second = await loadSampleData(db, actor);
  assert.equal(second.created, 0);
  assert.equal((await db.query('items', {})).length, first.created);
  await assertLedger(db);
});

test('credit (payday) price is stored, can be cleared, and its changes are logged (D-046)', async () => {
  const db = createMockAdapter();
  const id = await createItem(db, actor, itemData({ installmentPriceC: '3500' }));
  assert.equal((await db.get('items', id)).installmentPriceC, 350000);
  await updateItem(db, actor, id, itemData({ installmentPriceC: '3600', openingQty: '' }));
  let [log] = await db.query('activityLogs', { where: [['action', '==', 'ITEM_PRICE_CHANGE']] });
  assert.deepEqual(log.changes.installmentPriceC, { from: 350000, to: 360000 });
  assert.match(log.summary, /credit price/);
  await updateItem(db, actor, id, itemData({ installmentPriceC: '', openingQty: '' }));
  assert.equal((await db.get('items', id)).installmentPriceC, null);
  // Old items without the field: saving with no payday price is not a change.
  const legacy = await createItem(db, actor, itemData({ name: 'Legacy 25kg Sack', openingQty: '' }));
  await db.update('items', legacy, { installmentPriceC: undefined });
  const r = await updateItem(db, actor, legacy, itemData({ name: 'Legacy 25kg Sack', openingQty: '' }));
  assert.equal(r.changed, false);
});
