/*
 * Phase 13 rules tests (Firestore emulator): the real batch, restock and sale services run through the rules
 * (supplier codes, batch counters, item batches, sale charges), plus direct writes the rules must reject.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { wrapFirestore } from '../../src/data/firestoreAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateSupplierForm, validateRestockForm } from '../../src/domain/purchasing.js';
import { createItem, openSack, updateBatch, ensureBatches, adjustStock } from '../../src/data/inventoryService.js';
import { createSupplier, createRestock, receiveRestock, ensureSupplierCodes } from '../../src/data/purchasingService.js';
import { createSale, cancelSale } from '../../src/data/salesService.js';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const actor = { uid: OWNER.uid, displayName: 'Owner' };
const dbAs = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();
const adapterAs = (u) => wrapFirestore(dbAs(u), firebase.firestore.FieldValue);
const D = '2026-11-10';

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

test('restock receipt, sale with charges, cancel, open sack, batch edit — all pass the rules', async () => {
  const a = adapterAs(OWNER);
  const f = (o) => validateItemForm({ unit: 'SACK', sackWeightKg: '50', priceC: '1500', costC: '1400', minStock: '', openingDate: D, ...o }).data;
  const sackId = await createItem(a, actor, f({ name: 'Dinorado 50kg Sack', openingQty: '1' }));
  await createItem(a, actor, f({ name: 'Dinorado per KG', unit: 'KG', priceC: '35', costC: '30', openingQty: '', linkedSackItemId: sackId }));
  const supId = await createSupplier(a, actor, validateSupplierForm({ name: 'Golden Grains' }).data);
  const items = { [sackId]: { id: sackId, ...(await a.get('items', sackId)) } };
  const rs = await createRestock(a, actor, validateRestockForm({ supplierId: supId, orderDate: D, lines: [{ itemId: sackId, qty: '3', unitCost: '1450' }] }, items).data);
  const got = await receiveRestock(a, actor, rs, { date: D, lines: [{ itemId: sackId, qtyH: 300, unitCostC: 145000, priceC: 155000, updateCost: true }] });
  assert.equal(got.batchId, 'RJ-RS-SUP001-0001');
  const sale = await createSale(a, actor, { saleDate: D, customerId: 'WALK_IN', lines: [{ itemId: sackId, qtyH: 200 }], terms: 'FULL', method: 'CASH', charges: [{ name: 'Delivery fee', amountC: 5000 }] }, undefined, '2026-11-27');
  assert.equal((await a.get('sales', sale.saleId)).chargesC, 5000);
  await cancelSale(a, actor, sale.saleId, 'test');
  await openSack(a, actor, { sackItemId: sackId, sacks: 1, date: D });
  await updateBatch(a, actor, sackId, 'RJ-RS-SUP001-0001', { unitCost: '1450', price: '1600' });
  await adjustStock(a, actor, { itemId: sackId, direction: 'OUT', qtyH: 100, reason: 'Spillage', note: '', date: D });
});

test('old data: supplier codes and first batches for many at once (counters may jump)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const n of ['a', 'b', 'c']) await db.doc(`suppliers/${n}`).set({ name: n, nameLower: n, status: 'ACTIVE' });
    for (const n of ['x', 'y']) await db.doc(`items/${n}`).set({ name: n, nameLower: n, unit: 'KG', qtyH: 500, priceC: 100, costC: 90, minStockH: 0, status: 'ACTIVE' });
  });
  const a = adapterAs(OWNER);
  assert.equal((await ensureSupplierCodes(a, actor)).changed, 3);
  assert.equal((await ensureBatches(a, actor, D)).changed, 2);
  assert.equal((await a.get('counters', 'batch-OLD')).next, 3);
});

test('rules reject bad charges, bad codes, backwards counters', async () => {
  const db = dbAs(OWNER);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('counters/batch-SUP001').set({ next: 5 });
    await ctx.firestore().doc('suppliers/s1').set({ name: 'S', nameLower: 's', status: 'ACTIVE' });
  });
  await assertFails(db.doc('counters/batch-SUP001').update({ next: 4 }));
  await assertSucceeds(db.doc('counters/batch-SUP001').update({ next: 9 }));
  await assertFails(db.doc('counters/sale-2026').set({ next: 9 }).then(() => db.doc('counters/sale-2026').update({ next: 20 })));
  await assertFails(db.doc('counters/batch-hack').set({ next: 2 }));
  await assertFails(db.doc('suppliers/s1').update({ code: 'X1' }));
  await assertSucceeds(db.doc('suppliers/s1').update({ code: 'SUP007' }));
  const sale = (o) => ({ saleNo: 'RJ-2026-00001', kind: 'SALE', status: 'ACTIVE', saleDate: D, customerId: 'WALK_IN', lines: [{}], subtotalC: 1000, discountC: 0,
    chargesC: 100, totalC: 1100, paidC: 1100, balanceC: 0, terms: 'FULL', fulfillment: 'PICKED_UP', createdBy: OWNER.uid, ...o });
  await assertFails(db.doc('sales/RJ-2026-00001').set(sale({ totalC: 1000, paidC: 1000 })));
  await assertFails(db.doc('sales/RJ-2026-00001').set(sale({ chargesC: -100, totalC: 900, paidC: 900 })));
  await assertSucceeds(db.doc('sales/RJ-2026-00001').set(sale()));
});
