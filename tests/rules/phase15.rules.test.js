/*
 * Phase 15 rules tests (Firestore emulator): item expenses and credit price at receiving (D-065, D-066), automatic
 * SKUs and their counters (D-067), promised payment dates (D-068). `npm run test:rules`.
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
import { validateCustomerForm } from '../../src/domain/customers.js';
import { createItem, updateItem, ensureSkus } from '../../src/data/inventoryService.js';
import { createCustomer } from '../../src/data/customerService.js';
import { createSupplier, createRestock, receiveRestock, editReceipt } from '../../src/data/purchasingService.js';
import { createSale } from '../../src/data/salesService.js';
import { recordPayment, voidPayment, addPromise } from '../../src/data/paymentService.js';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const actor = { uid: OWNER.uid, displayName: 'Owner' };
const dbAs = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();
const adapterAs = (u) => wrapFirestore(dbAs(u), firebase.firestore.FieldValue);
const D = '2026-11-10';
const item = (o) => validateItemForm({ unit: 'SACK', sackWeightKg: '50', priceC: '2800', costC: '2500', minStock: '', openingQty: '', openingDate: D, ...o }).data;

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

test('receive and edit with item expenses and credit price through the rules', async () => {
  const a = adapterAs(OWNER);
  const sackId = await createItem(a, actor, item({ name: 'Dinorado 50kg Sack', variety: 'Dinorado' }));
  const supId = await createSupplier(a, actor, validateSupplierForm({ name: 'Golden Grains' }).data);
  const items = { [sackId]: { id: sackId, ...(await a.get('items', sackId)) } };
  const rid = await createRestock(a, actor, validateRestockForm({ supplierId: supId, orderDate: D, lines: [{ itemId: sackId, qty: '10', unitCost: '2500' }] }, items).data);
  const { batchId } = await assertSucceeds(receiveRestock(a, actor, rid, { date: D, lines: [{ itemId: sackId, qtyH: 1000, unitCostC: 250000, priceC: 280000, expenseC: 50000, creditC: 300000 }], expenses: [] }));
  assert.equal((await a.get('items', sackId)).installmentPriceC, 300000);
  await assertSucceeds(editReceipt(a, actor, rid, batchId, { lines: [{ itemId: sackId, unitCostC: 250000, priceC: 280000, expenseC: 60000, creditC: 310000 }], expenses: [] }));
  await assertSucceeds(editReceipt(a, actor, rid, batchId, { lines: [{ itemId: sackId, unitCostC: 250000, priceC: 280000, expenseC: 0 }], expenses: [] }));
  const db = dbAs(OWNER);
  // itemId only on Restock expenses
  await assertFails(db.collection('expenses').add({ date: D, category: 'Rent', amountC: 100, note: '', itemId: sackId, status: 'ACTIVE', void: null, createdAt: new Date(), createdBy: OWNER.uid, updatedAt: new Date(), updatedBy: OWNER.uid }));
  await assertFails(db.collection('expenses').add({ date: D, category: 'Restock', amountC: 100, note: 'x', restockId: rid, batchId, itemId: 5, status: 'ACTIVE', void: null, createdAt: new Date(), createdBy: OWNER.uid, updatedAt: new Date(), updatedBy: OWNER.uid }));
});

test('automatic SKUs, edits and back-fill through the rules; SKU counters never go back', async () => {
  const a = adapterAs(OWNER);
  const id = await assertSucceeds(createItem(a, actor, item({ name: 'Jasmine 25kg Sack', variety: 'Jasmine', sackWeightKg: '25' })));
  assert.equal((await a.get('items', id)).sku, 'RJ-JAS-001');
  await assertSucceeds(createItem(a, actor, item({ name: 'Jasmine 50kg', variety: 'Jasmine', sku: 'RJ-JAS-005' })));
  await assertSucceeds(updateItem(a, actor, id, item({ name: 'Jasmine 25kg Sack', variety: 'Jasmine', sackWeightKg: '25', sku: 'JAS-25' })));
  await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc(`items/${id}`).update({ sku: '' }); });
  await assertSucceeds(ensureSkus(a, actor));
  assert.equal((await a.get('items', id)).sku, 'RJ-JAS-002');
  const db = dbAs(OWNER);
  await assertSucceeds(db.doc('counters/sku-JAS').update({ next: 9 }));
  await assertFails(db.doc('counters/sku-JAS').update({ next: 4 }));
  await assertFails(db.doc('counters/sku-jas1').set({ next: 2 }));
});

test('promised dates on payments, by hand and removed on void through the rules', async () => {
  const a = adapterAs(OWNER);
  const sackId = await createItem(a, actor, item({ name: 'Dinorado 50kg Sack', openingQty: '5' }));
  const custId = await createCustomer(a, actor, validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567', creditLimit: '10000' }).data);
  const s = await createSale(a, actor, { saleDate: D, customerId: custId, lines: [{ itemId: sackId, qtyH: 100, unitPriceC: 250000 }], discount: { type: 'NONE' }, terms: 'INSTALLMENT', method: 'CASH',
    plan: { count: 2, frequency: 'MONTHLY_15', downPaymentC: 0, dueDates: ['2026-11-20', '2026-11-30'] } }, undefined, D);
  const p = await assertSucceeds(recordPayment(a, actor, { saleId: s.saleId, date: '2026-11-25', amountC: 50000, method: 'CASH', promiseDate: '2026-11-27' }, '2026-11-25'));
  const rowId = `${s.saleId}-1`;
  assert.equal((await a.get('installments', rowId)).promises.length, 1);
  await assertSucceeds(addPromise(a, actor, s.saleId, { rowId, date: '2026-11-29' }, '2026-11-28'));
  await assertSucceeds(voidPayment(a, actor, p.paymentId, 'Wrong sale'));
  assert.equal((await a.get('installments', rowId)).promises.length, 1);
  const db = dbAs(OWNER);
  await assertFails(db.doc(`installments/${rowId}`).update({ promises: 'tomorrow' }));
  await assertFails(db.doc(`installments/${rowId}`).update({ promises: Array.from({ length: 31 }, () => ({ date: '2026-12-01' })) }));
});
