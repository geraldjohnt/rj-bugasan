/*
 * Phase 4 rules tests (Firestore emulator): the real inventory services run against the emulator through the
 * Firestore adapter, so every write the app makes is checked by the published rules. `npm run test:rules`.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { wrapFirestore } from '../../src/data/firestoreAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { createItem, updateItem, setItemStatus, adjustStock, openSack, createCount, finalizeCount, discardCount } from '../../src/data/inventoryService.js';
import { loadSampleData } from '../../src/data/sampleData.js';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const STRANGER = { uid: 'stranger', email: 'stranger@example.com' };
const actor = { uid: OWNER.uid, displayName: 'Owner' };
const D = '2026-11-25';
const dbAs = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();
const adapterAs = (u) => wrapFirestore(dbAs(u), firebase.firestore.FieldValue);
const itemData = (o = {}) => validateItemForm({ name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: '50', priceC: '3250', costC: '2900', minStock: '5', openingQty: '10', openingDate: D, ...o }).data;

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-rj-ims', firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('settings/bootstrap').set({ ownerUid: OWNER.uid });
    await db.doc(`users/${OWNER.uid}`).set({ username: 'rjowner', displayName: 'Owner', role: 'owner', active: true, preferences: null });
  });
});

test('owner: every inventory service write is accepted by the rules', async () => {
  const a = adapterAs(OWNER);
  const sackId = await createItem(a, actor, itemData());
  const kgId = await createItem(a, actor, itemData({ name: 'Dinorado per KG', unit: 'KG', priceC: '68', costC: '58', openingQty: '', linkedSackItemId: sackId }));
  await updateItem(a, actor, kgId, itemData({ name: 'Dinorado per KG', unit: 'KG', priceC: '70', costC: '58', openingQty: '', linkedSackItemId: sackId }));
  await openSack(a, actor, { sackItemId: sackId, sacks: 2, kgCostC: 5800, date: D });
  await adjustStock(a, actor, { itemId: kgId, direction: 'OUT', qtyH: 150, reason: 'Spillage', note: '', date: D });
  const countId = await createCount(a, actor, { date: D });
  const r = await finalizeCount(a, actor, countId, { [sackId]: 700 });
  assert.deepEqual(r, { counted: 1, adjusted: 1 });
  const draft = await createCount(a, actor, { date: D });
  await discardCount(a, actor, draft);
  await setItemStatus(a, actor, kgId, 'ARCHIVED');
  assert.equal((await a.get('items', sackId)).qtyH, 700);
  assert.equal((await a.get('items', kgId)).qtyH, 10000 - 150);
});

test('owner: sample data loads through the rules', async () => {
  const r = await loadSampleData(adapterAs(OWNER), actor);
  assert.equal(r.created, 9);
});

test('items: negative stock, half sacks, bad units and deletes are rejected', async () => {
  const db = dbAs(OWNER);
  const ok = { name: 'A', nameLower: 'a', unit: 'KG', qtyH: 0, priceC: 1, costC: 1, minStockH: 0, status: 'ACTIVE' };
  await assertSucceeds(db.doc('items/a').set(ok));
  await assertFails(db.doc('items/b').set({ ...ok, qtyH: -1 }));
  await assertFails(db.doc('items/b').set({ ...ok, unit: 'BOX' }));
  await assertFails(db.doc('items/b').set({ ...ok, unit: 'SACK', sackWeightKg: 50, qtyH: 150 }));
  await assertFails(db.doc('items/b').set({ ...ok, priceC: 1.5 }));
  await assertSucceeds(db.doc('items/p1').set({ ...ok, name: 'P1', nameLower: 'p1', installmentPriceC: 120 }));
  await assertSucceeds(db.doc('items/p2').set({ ...ok, name: 'P2', nameLower: 'p2', installmentPriceC: null }));
  await assertFails(db.doc('items/b').set({ ...ok, installmentPriceC: -1 }));
  await assertFails(db.doc('items/b').set({ ...ok, installmentPriceC: 1.5 }));
  await assertFails(db.doc('items/b').set({ ...ok, installmentPriceC: '100' }));
  await assertFails(db.doc('items/b').set({ ...ok, nameLower: 'other' }));
  await assertFails(db.doc('items/b').set({ ...ok, hacked: true }));
  await assertFails(db.doc('items/a').update({ unit: 'SACK', sackWeightKg: 50 }));
  await assertFails(db.doc('items/a').delete());
});

test('movements: immutable, arithmetic must hold, adjustments need a reason', async () => {
  const db = dbAs(OWNER);
  const m = { type: 'ADJUSTMENT', itemId: 'a', itemName: 'A', unit: 'KG', qtyDeltaH: -50, qtyBeforeH: 100, qtyAfterH: 50, unitCostC: 1, reason: 'Spillage', businessDate: D, createdBy: OWNER.uid };
  await assertSucceeds(db.doc('inventoryMovements/m1').set(m));
  await assertFails(db.doc('inventoryMovements/m1').update({ qtyDeltaH: -10 }));
  await assertFails(db.doc('inventoryMovements/m1').delete());
  await assertFails(db.doc('inventoryMovements/m2').set({ ...m, qtyAfterH: 60 }));
  await assertFails(db.doc('inventoryMovements/m2').set({ ...m, qtyBeforeH: 20, qtyAfterH: -30 }));
  await assertFails(db.doc('inventoryMovements/m2').set({ ...m, reason: '' }));
  await assertFails(db.doc('inventoryMovements/m2').set({ ...m, type: 'MAGIC' }));
  await assertFails(db.doc('inventoryMovements/m2').set({ ...m, createdBy: 'someone-else' }));
});

test('stock counts: finalized counts cannot be changed or deleted', async () => {
  const db = dbAs(OWNER);
  await assertSucceeds(db.doc('stockCounts/c1').set({ status: 'DRAFT', lines: [], date: D }));
  await assertSucceeds(db.doc('stockCounts/c1').update({ status: 'FINALIZED' }));
  await assertFails(db.doc('stockCounts/c1').update({ status: 'DRAFT' }));
  await assertFails(db.doc('stockCounts/c1').update({ note: 'changed' }));
  await assertFails(db.doc('stockCounts/c1').delete());
});

test('activity log: append-only, written as yourself, readable by the owner only', async () => {
  const db = dbAs(OWNER);
  await assertSucceeds(db.doc('activityLogs/l1').set({ by: OWNER.uid, action: 'X', summary: 's' }));
  await assertFails(db.doc('activityLogs/l2').set({ by: 'other', action: 'X', summary: 's' }));
  await assertFails(db.doc('activityLogs/l1').update({ summary: 'edited' }));
  await assertFails(db.doc('activityLogs/l1').delete());
  await assertSucceeds(db.doc('activityLogs/l1').get());
});

test('strangers (signed up, no profile) cannot read or write inventory', async () => {
  await createItem(adapterAs(OWNER), actor, itemData());
  const db = dbAs(STRANGER);
  await assertFails(db.collection('items').get());
  await assertFails(db.collection('inventoryMovements').get());
  await assertFails(db.doc('items/x').set({ name: 'A', nameLower: 'a', unit: 'KG', qtyH: 0, priceC: 1, costC: 1, minStockH: 0, status: 'ACTIVE' }));
  await assertFails(db.collection('activityLogs').get());
  await assertFails(env.unauthenticatedContext().firestore().collection('items').get());
});
