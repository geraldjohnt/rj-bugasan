/*
 * Phase 11 rules tests (Firestore emulator): opening balances and backup restore through the real services,
 * plus writes the rules must reject. `npm run test:rules`.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { wrapFirestore } from '../../src/data/firestoreAdapter.js';
import { validateCustomerForm } from '../../src/domain/customers.js';
import { createCustomer } from '../../src/data/customerService.js';
import { recordPayment } from '../../src/data/paymentService.js';
import { createOpeningBalance } from '../../src/data/openingBalanceService.js';
import { exportBackup, restoreBackup } from '../../src/data/backupService.js';
import { parseBackup } from '../../src/domain/backup.js';
import { today } from '../../src/domain/dates.js';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const STAFF = { uid: 'staff1', email: 'staff@example.com' };
const actor = { uid: OWNER.uid, displayName: 'Owner' };
const dbAs = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();
const adapterAs = (u) => wrapFirestore(dbAs(u), firebase.firestore.FieldValue, firebase.firestore.Timestamp);
const TODAY = today();
const ob = (customerId) => ({ customerId, originalDate: '2026-08-10', description: 'From the Excel ledger', rows: [{ dueDate: '2026-11-15', amount: '1500' }, { dueDate: '2026-12-15', amount: '1500' }] });

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
    await db.doc(`users/${STAFF.uid}`).set({ username: 'staff', displayName: 'Staff', role: 'staff', active: true, preferences: null });
  });
});

test('owner: opening balance and a payment on it pass the rules', async () => {
  const a = adapterAs(OWNER);
  const custId = await createCustomer(a, actor, validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567' }).data);
  const r = await createOpeningBalance(a, actor, ob(custId), TODAY);
  assert.equal(r.saleId, 'OB-2026-00001');
  await recordPayment(a, actor, { saleId: r.saleId, date: TODAY, amountC: 100000, method: 'CASH' }, TODAY);
  const s = await a.get('sales', r.saleId);
  assert.equal(s.balanceC, 200000);
});

test('opening balances: forged shapes are rejected', async () => {
  const db = dbAs(OWNER);
  const base = { saleNo: 'OB-2026-00009', kind: 'OPENING_BALANCE', status: 'ACTIVE', saleDate: '2026-08-10', customerId: 'c1', lines: [],
    subtotalC: 1000, discountC: 0, totalC: 1000, paidC: 0, balanceC: 1000, terms: 'OPEN_BALANCE', paymentIds: [], installmentCount: 1,
    description: 'x', createdBy: OWNER.uid };
  await assertSucceeds(db.doc('sales/OB-2026-00009').set(base));
  await assertFails(db.doc('sales/OB-2026-00010').set({ ...base, saleNo: 'OB-2026-00010', paidC: 500, balanceC: 500 }));
  await assertFails(db.doc('sales/OB-2026-00011').set({ ...base, saleNo: 'OB-2026-00011', customerId: 'WALK_IN' }));
  await assertFails(db.doc('sales/OB-2026-00012').set({ ...base, saleNo: 'OB-2026-00012', lines: [{ itemId: 'i' }] }));
  await assertFails(db.doc('sales/RJ-2026-00012').set({ ...base, saleNo: 'RJ-2026-00012' }));
  await assertFails(dbAs(STAFF).doc('sales/OB-2026-00013').set({ ...base, saleNo: 'OB-2026-00013', createdBy: STAFF.uid }));
});

test('restore: owner round-trip works; outside the restore window the same writes are refused', async () => {
  const a = adapterAs(OWNER);
  const custId = await createCustomer(a, actor, validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567' }).data);
  const r = await createOpeningBalance(a, actor, ob(custId), TODAY);
  await recordPayment(a, actor, { saleId: r.saleId, date: TODAY, amountC: 150000, method: 'CASH' }, TODAY);
  const backup = await exportBackup(a, actor);
  const parsed = parseBackup(JSON.stringify(backup));
  const paidRow = await a.get('installments', `${r.saleId}-1`);
  assert.equal(paidRow.status, 'PAID');

  // Simulate loss: rows wiped (rules disabled, as if the database were new).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const col of ['installments', 'payments', 'sales', 'counters', 'customers', 'activityLogs']) {
      const snap = await db.collection(col).get();
      for (const d of snap.docs) await d.ref.delete();
    }
  });
  // A paid installment cannot be created by the normal rules …
  const db = dbAs(OWNER);
  await assertFails(db.doc(`installments/${r.saleId}-1`).set({ ...paidRow }));
  // … nor by staff during an open window
  await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc('settings/restore').set({ active: true }); });
  await assertFails(dbAs(STAFF).doc('items/x').set({ name: 'x' }));
  await assertFails(dbAs(OWNER).doc('users/owner1').set({ role: 'owner', active: true }));
  await assertFails(dbAs(OWNER).doc('settings/bootstrap').delete());
  await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc('settings/restore').set({ active: false }); });

  const res = await restoreBackup(a, actor, parsed.backup, 'RESTORE');
  assert.ok(res.written > 5);
  const back = await a.get('installments', `${r.saleId}-1`);
  assert.equal(back.status, 'PAID');
  assert.ok(back.createdAt && typeof back.createdAt.toDate === 'function', 'timestamps restored as timestamps');
  const c = await a.get('customers', custId);
  assert.equal(c.outstandingC, 150000);
  assert.equal((await a.get('settings', 'restore')).active, false);
  // window closed again
  await assertFails(db.doc('items/x').delete());
  await assertFails(db.doc(`installments/${r.saleId}-1`).delete());
});

test('restore: staff cannot open the window or export the activity log', async () => {
  await assertFails(dbAs(STAFF).doc('settings/restore').set({ active: true }));
  await assertFails(dbAs(STAFF).collection('activityLogs').get());
});
