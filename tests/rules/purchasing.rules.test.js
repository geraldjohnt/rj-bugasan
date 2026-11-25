/*
 * Phases 8–9 rules tests (Firestore emulator): the real supplier, restock, expense and calendar services run through
 * the rules, plus direct writes the rules must reject. `npm run test:rules`.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { wrapFirestore } from '../../src/data/firestoreAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateSupplierForm, validateRestockForm, validateExpenseForm } from '../../src/domain/purchasing.js';
import { validateEventForm } from '../../src/domain/calendar.js';
import { createItem } from '../../src/data/inventoryService.js';
import {
  createSupplier, setSupplierStatus, createRestock, updateRestock, receiveRestock, cancelRestock, closeRestock, createExpense, voidExpense,
} from '../../src/data/purchasingService.js';
import { createEvent, updateEvent, deleteEvent } from '../../src/data/calendarService.js';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const STRANGER = { uid: 'stranger', email: 'stranger@example.com' };
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

async function setup() {
  const a = adapterAs(OWNER);
  const sackId = await createItem(a, actor, validateItemForm({ name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: '50', priceC: '3250', costC: '2900', minStock: '', openingQty: '2', openingDate: D }).data);
  const supId = await createSupplier(a, actor, validateSupplierForm({ name: 'Golden Grains' }).data);
  const items = { [sackId]: { id: sackId, ...(await a.get('items', sackId)) } };
  const order = (qty) => validateRestockForm({ supplierId: supId, orderDate: D, expectedDate: '', notes: '', lines: [{ itemId: sackId, qty: String(qty), unitCost: '2900' }] }, items).data;
  return { a, sackId, supId, order, items };
}

test('restock lifecycle through the rules: order, edit, partial receipt with cost update, close; cancel; counters +1', async () => {
  const { a, sackId, supId, order, items } = await setup();
  const id = await createRestock(a, actor, order(10));
  assert.match(id, /^RS-\d{4}-00001$/);
  const r0 = await a.get('restocks', id);
  await updateRestock(a, actor, id, validateRestockForm({ supplierId: supId, orderDate: D, expectedDate: '2026-11-20', notes: 'edited', lines: [{ itemId: sackId, qty: '8', unitCost: '2950' }] }, items, r0).data);
  await receiveRestock(a, actor, id, { date: '2026-11-12', lines: [{ itemId: sackId, qtyH: 500, unitCostC: 300000, updateCost: true }] });
  const item = await a.get('items', sackId);
  assert.equal(item.qtyH, 700);
  assert.equal(item.costC, 300000);
  await closeRestock(a, actor, id, 'Rest not coming');
  assert.equal((await a.get('restocks', id)).status, 'RECEIVED');
  const id2 = await createRestock(a, actor, order(1));
  assert.match(id2, /-00002$/);
  await cancelRestock(a, actor, id2, 'Mistake');
  await setSupplierStatus(a, actor, supId, 'ARCHIVED');

  const db = dbAs(OWNER);
  // final orders cannot change; receipts cannot be removed; cancel after receipts refused
  await assertFails(db.doc(`restocks/${id}`).update({ notes: 'x' }));
  await assertFails(db.doc(`restocks/${id2}`).update({ status: 'ORDERED' }));
  const year = id.slice(3, 7);
  await assertFails(db.doc(`counters/restock-${year}`).update({ next: 9 }));
  await assertFails(db.doc('counters/other-2026').set({ next: 2 }));
});

test('restock direct writes the rules reject', async () => {
  const { a, sackId, order } = await setup();
  const id = await createRestock(a, actor, order(5));
  await receiveRestock(a, actor, id, { date: D, lines: [{ itemId: sackId, qtyH: 200, unitCostC: 290000 }] });
  const db = dbAs(OWNER);
  const cur = (await db.doc(`restocks/${id}`).get()).data();
  await assertFails(db.doc(`restocks/${id}`).update({ receipts: [] }));                                          // receipts only grow
  await assertFails(db.doc(`restocks/${id}`).update({ status: 'CANCELLED', cancel: { reason: 'x' } }));         // something was received
  await assertFails(db.doc(`restocks/${id}`).delete());
  await assertFails(db.doc('restocks/RS-2026-99999').set({ ...cur, restockNo: 'RS-2026-99999' }));            // must start ORDERED, no receipts
  await assertFails(db.doc('restocks/BAD-1').set({ ...cur, restockNo: 'BAD-1', status: 'ORDERED', receipts: [] }));
  await assertSucceeds(db.doc(`restocks/${id}`).update({ notes: 'still open' }));
  await assertFails(db.doc('suppliers/x').set({ name: 'X', nameLower: 'y', status: 'ACTIVE' }));
  await assertFails(db.doc('suppliers/x').delete());
  await assertFails(dbAs(STRANGER).doc(`restocks/${id}`).get());
  await assertFails(dbAs(STRANGER).collection('suppliers').get());
});

test('expenses: created and voided through the rules; never edited or deleted', async () => {
  const a = adapterAs(OWNER);
  const id = await createExpense(a, actor, validateExpenseForm({ date: D, category: 'Rent', amount: '5000' }).data);
  const db = dbAs(OWNER);
  await assertFails(db.doc(`expenses/${id}`).update({ amountC: 1 }));
  await assertFails(db.doc(`expenses/${id}`).update({ status: 'VOIDED', void: { reason: '' } }));
  await assertFails(db.doc(`expenses/${id}`).update({ status: 'VOIDED', void: { reason: 'x' }, amountC: 1 })); // void cannot change the amount
  await assertFails(db.doc(`expenses/${id}`).delete());
  await voidExpense(a, actor, id, 'Entered twice');
  await assertFails(db.doc(`expenses/${id}`).update({ status: 'ACTIVE', void: null }));
  await assertFails(db.collection('expenses').add({ date: D, category: 'Rent', amountC: 0, note: '', status: 'ACTIVE', void: null, createdBy: OWNER.uid }));
  await assertFails(db.collection('expenses').add({ date: D, category: 'Food', amountC: 100, note: '', status: 'ACTIVE', void: null, createdBy: OWNER.uid }));
  await assertFails(dbAs(STRANGER).collection('expenses').get());
});

test('calendar events: owner creates, edits and deletes; shape checked; strangers denied', async () => {
  const a = adapterAs(OWNER);
  const id = await createEvent(a, actor, validateEventForm({ title: 'Pay rent', date: '2026-11-30', time: '09:00' }).data);
  await updateEvent(a, actor, id, validateEventForm({ title: 'Pay rent', date: '2026-12-01', time: '' }).data);
  const db = dbAs(OWNER);
  await assertFails(db.doc(`calendarEvents/${id}`).update({ time: '9am' }));
  await assertFails(db.doc(`calendarEvents/${id}`).update({ category: 'SALE' }));
  await assertFails(dbAs(STRANGER).doc(`calendarEvents/${id}`).get());
  await assertFails(dbAs(STRANGER).doc(`calendarEvents/${id}`).delete());
  await deleteEvent(a, actor, id);
  assert.equal(await a.get('calendarEvents', id), null);
});
