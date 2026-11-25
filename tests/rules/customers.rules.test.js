/*
 * Phase 5 rules tests (Firestore emulator): the real customer services run through the rules. `npm run test:rules`.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { wrapFirestore } from '../../src/data/firestoreAdapter.js';
import { validateCustomerForm, validateContactForm } from '../../src/domain/customers.js';
import { createCustomer, updateCustomer, setCustomerStatus, ensureWalkIn, saveContact, removeContact } from '../../src/data/customerService.js';
import { loadSampleData } from '../../src/data/sampleData.js';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const STRANGER = { uid: 'stranger', email: 'stranger@example.com' };
const actor = { uid: OWNER.uid, displayName: 'Owner' };
const dbAs = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();
const adapterAs = (u) => wrapFirestore(dbAs(u), firebase.firestore.FieldValue);
const form = (o = {}) => validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567', creditLimit: '5000', ...o }).data;
const base = { name: 'A', nameLower: 'a', type: 'Store', system: false, status: 'ACTIVE', outstandingC: 0, totalPurchasesC: 0, alternateContacts: [], creditLimitC: null };

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

test('owner: every customer service write is accepted by the rules', async () => {
  const a = adapterAs(OWNER);
  assert.equal(await ensureWalkIn(a, actor), true);
  const id = await createCustomer(a, actor, form());
  await updateCustomer(a, actor, id, form({ creditLimit: '', address: 'Market Road' }));
  const cid = await saveContact(a, actor, id, validateContactForm({ name: 'Mario', relationship: 'Son', contactNumber: '0918 000 1111', isPrimary: true }).data);
  await saveContact(a, actor, id, { ...validateContactForm({ name: 'Mario S.', contactNumber: '0918 000 1111' }).data, id: cid });
  await removeContact(a, actor, id, cid);
  await setCustomerStatus(a, actor, id, 'ARCHIVED');
  await setCustomerStatus(a, actor, id, 'ACTIVE');
  const c = await a.get('customers', id);
  assert.equal(c.address, 'Market Road');
  assert.equal(c.creditLimitC, null);
});

test('owner: sample data (items + customers) loads through the rules', async () => {
  const r = await loadSampleData(adapterAs(OWNER), actor);
  assert.equal(r.created, 9);
  assert.equal(r.customers, 5);
});

test('customers: bad shapes, negative balances and deletes are rejected', async () => {
  const db = dbAs(OWNER);
  await assertSucceeds(db.doc('customers/c1').set(base));
  await assertFails(db.doc('customers/c2').set({ ...base, type: 'VIP' }));
  await assertFails(db.doc('customers/c2').set({ ...base, nameLower: 'other' }));
  await assertFails(db.doc('customers/c2').set({ ...base, outstandingC: -1 }));
  await assertFails(db.doc('customers/c2').set({ ...base, creditLimitC: 1.5 }));
  await assertFails(db.doc('customers/c2').set({ ...base, hacked: true }));
  await assertFails(db.doc('customers/c2').set({ ...base, system: true }));      // only WALK_IN is a system customer
  await assertFails(db.doc('customers/c1').update({ system: true }));
  await assertFails(db.doc('customers/c1').delete());
});

test('customers: cannot archive with an outstanding balance (BR-026)', async () => {
  const db = dbAs(OWNER);
  await assertSucceeds(db.doc('customers/c1').set({ ...base, outstandingC: 500 }));
  await assertFails(db.doc('customers/c1').update({ status: 'ARCHIVED' }));
  await assertSucceeds(db.doc('customers/c1').update({ outstandingC: 0 }));
  await assertSucceeds(db.doc('customers/c1').update({ status: 'ARCHIVED' }));
});

test('Walk-in: fixed identity; only its summary fields may change (BR-020)', async () => {
  const db = dbAs(OWNER);
  const walk = { ...base, name: 'Walk-in', nameLower: 'walk-in', type: 'Other', system: true };
  await assertFails(db.doc('customers/WALK_IN').set({ ...walk, system: false }));
  await assertFails(db.doc('customers/WALK_IN').set({ ...walk, name: 'Someone', nameLower: 'someone' }));
  await assertSucceeds(db.doc('customers/WALK_IN').set(walk));
  await assertSucceeds(db.doc('customers/WALK_IN').update({ totalPurchasesC: 1000, lastSaleDate: '2026-11-25' }));
  await assertFails(db.doc('customers/WALK_IN').update({ status: 'ARCHIVED' }));
  await assertFails(db.doc('customers/WALK_IN').update({ contactNumber: '0917' }));
  await assertFails(db.doc('customers/WALK_IN').update({ alternateContacts: [{ name: 'x' }] }));
});

test('strangers (signed up, no profile) cannot read or write customers', async () => {
  await createCustomer(adapterAs(OWNER), actor, form());
  const db = dbAs(STRANGER);
  await assertFails(db.collection('customers').get());
  await assertFails(db.doc('customers/x').set(base));
  await assertFails(env.unauthenticatedContext().firestore().collection('customers').get());
});
