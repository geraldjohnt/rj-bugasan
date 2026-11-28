/*
 * Phase 14 rules tests (Firestore emulator): restock expenses at receiving, edit of a received delivery (fully received
 * order, sale-line costs, linked expenses), and direct writes the rules must reject. `npm run test:rules`.
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
import { createItem } from '../../src/data/inventoryService.js';
import { createSupplier, createRestock, receiveRestock, editReceipt } from '../../src/data/purchasingService.js';
import { createSale } from '../../src/data/salesService.js';

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

test('receive with expenses, sell, then edit the fully received delivery through the rules', async () => {
  const a = adapterAs(OWNER);
  const sackId = await createItem(a, actor, validateItemForm({ name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: '50', priceC: '2800', costC: '2500', minStock: '', openingQty: '', openingDate: D }).data);
  const supId = await createSupplier(a, actor, validateSupplierForm({ name: 'Golden Grains' }).data);
  const items = { [sackId]: { id: sackId, ...(await a.get('items', sackId)) } };
  const rid = await createRestock(a, actor, validateRestockForm({ supplierId: supId, orderDate: D, lines: [{ itemId: sackId, qty: '150', unitCost: '2500' }] }, items).data);
  const { batchId } = await assertSucceeds(receiveRestock(a, actor, rid, { date: D, lines: [{ itemId: sackId, qtyH: 15000, unitCostC: 250000, priceC: 280000 }],
    expenses: [{ name: 'Trucking', amountC: 400000 }, { name: 'Labor', amountC: 200000 }] }));
  const sale = await createSale(a, actor, { saleDate: '2026-11-12', customerId: 'WALK_IN', lines: [{ itemId: sackId, qtyH: 200 }], terms: 'FULL', method: 'CASH' }, undefined, '2026-11-28');
  const rc = (await a.get('restocks', rid)).receipts[0];
  const r = await assertSucceeds(editReceipt(a, actor, rid, batchId, {
    lines: [{ itemId: sackId, unitCostC: 255000, priceC: 290000 }],
    expenses: [{ name: 'Trucking', amountC: 450000, expenseId: rc.expenses[0].expenseId }, { name: 'Fuel', amountC: 50000 }],
  }));
  assert.equal(r.salesUpdated, 1);
  assert.equal((await a.get('sales', sale.saleId)).costC, 510000);

  const db = dbAs(OWNER);
  const truckingId = rc.expenses[0].expenseId;
  // a linked expense: amount/name may change; not its date, category or link
  await assertSucceeds(db.doc(`expenses/${truckingId}`).update({ amountC: 460000, note: 'Trucking' }));
  await assertFails(db.doc(`expenses/${truckingId}`).update({ restockId: 'RS-2026-99999' }));
  await assertFails(db.doc(`expenses/${truckingId}`).update({ amountC: 0 }));
  // the received order: receipts may change, not status, lines or the number of deliveries
  await assertFails(db.doc(`restocks/${rid}`).update({ status: 'PARTIALLY_RECEIVED' }));
  await assertFails(db.doc(`restocks/${rid}`).update({ receipts: [] }));
  await assertFails(db.doc(`restocks/${rid}`).update({ notes: 'x' }));
  // a sale: only lines/costC for this purpose; totals stay locked
  await assertFails(db.doc(`sales/${sale.saleId}`).update({ costC: 1, totalC: 1 }));
  await assertFails(db.doc(`sales/${sale.saleId}`).update({ lines: [] }));
});

test('expense create: Restock category needs a restock link; other categories may not carry one', async () => {
  const db = dbAs(OWNER);
  const base = { date: D, amountC: 100, status: 'ACTIVE', void: null, createdBy: OWNER.uid };
  await assertFails(db.collection('expenses').add({ ...base, category: 'Restock', note: 'Trucking' }));
  await assertFails(db.collection('expenses').add({ ...base, category: 'Restock', note: '', restockId: 'RS-2026-00001', batchId: 'B' }));
  await assertSucceeds(db.collection('expenses').add({ ...base, category: 'Restock', note: 'Trucking', restockId: 'RS-2026-00001', batchId: 'RJ-RS-SUP001-0001' }));
  await assertFails(db.collection('expenses').add({ ...base, category: 'Rent', note: '', restockId: 'RS-2026-00001', batchId: 'B' }));
  const id = (await db.collection('expenses').add({ ...base, category: 'Rent', note: '' })).id;
  await assertFails(db.doc(`expenses/${id}`).update({ amountC: 5 })); // direct expenses still never edited
});
