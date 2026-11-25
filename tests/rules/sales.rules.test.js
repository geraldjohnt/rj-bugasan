/*
 * Phases 6–7 rules tests (Firestore emulator): the real sale and payment services run through the rules,
 * plus direct writes that the rules must reject. `npm run test:rules`.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { wrapFirestore } from '../../src/data/firestoreAdapter.js';
import { validateItemForm } from '../../src/domain/inventory.js';
import { validateCustomerForm } from '../../src/domain/customers.js';
import { createItem } from '../../src/data/inventoryService.js';
import { createCustomer } from '../../src/data/customerService.js';
import { createSale, cancelSale, updateFulfillment } from '../../src/data/salesService.js';
import { recordPayment, voidPayment, reviseSchedule } from '../../src/data/paymentService.js';
import { today } from '../../src/domain/dates.js';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const STRANGER = { uid: 'stranger', email: 'stranger@example.com' };
const actor = { uid: OWNER.uid, displayName: 'Owner' };
const dbAs = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();
const adapterAs = (u) => wrapFirestore(dbAs(u), firebase.firestore.FieldValue);
const D = '2026-11-12';
const TODAY = '2026-11-25';
const Y = today().slice(0, 4);

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
  const itemId = await createItem(a, actor, validateItemForm({ name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: '50', priceC: '2500', costC: '2200', minStock: '', openingQty: '10', openingDate: D }).data);
  const custId = await createCustomer(a, actor, validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567' }).data);
  return { a, itemId, custId };
}
const sale = (o) => ({ saleDate: D, customerId: 'WALK_IN', discount: { type: 'NONE' }, terms: 'FULL', method: 'CASH', ...o });

test('owner: full sale lifecycle through the rules (sale, installments, payments, void, reschedule, delivery, cancel)', async () => {
  const { a, itemId, custId } = await setup();
  const w = await createSale(a, actor, sale({ lines: [{ itemId, qtyH: 100, unitPriceC: 250000 }] }), undefined, TODAY);
  assert.equal(w.saleId, 'RJ-2026-00001');
  const r = await createSale(a, actor, sale({ customerId: custId, lines: [{ itemId, qtyH: 200, unitPriceC: 250000 }], terms: 'INSTALLMENT',
    plan: { count: 3, frequency: 'MONTHLY_15', downPaymentC: 50000 } }), undefined, TODAY);
  const p = await recordPayment(a, actor, { saleId: r.saleId, date: TODAY, amountC: 200000, method: 'EWALLET', reference: 'GC1' }, TODAY);
  await voidPayment(a, actor, p.paymentId, 'Wrong amount');
  await recordPayment(a, actor, { saleId: r.saleId, date: TODAY, amountC: 100000, method: 'CASH' }, TODAY);
  await reviseSchedule(a, actor, r.saleId, [{ no: 2, dueDate: '2027-01-31', amountC: 100000 }, { no: 3, dueDate: '2027-02-28', amountC: 200000 }], 'Customer asked');
  await updateFulfillment(a, actor, r.saleId, { fulfillment: 'DELIVERED', deliveryDate: '2026-11-13', notes: 'Gate 2' });
  const res = await cancelSale(a, actor, r.saleId, 'Wrong item');
  assert.equal(res.voidedPayments, 2);
  assert.equal((await a.get('items', itemId)).qtyH, 900);
  assert.equal((await a.get('customers', custId)).outstandingC, 0);
  assert.equal((await a.get('counters', 'payment-2026')).next, 5); // 4 payments: walk-in, down payment, voided, second
  await assert.rejects(updateFulfillment(a, actor, r.saleId, { fulfillment: 'PENDING' }), (e) => e.code === 'SALE_CANCELLED');
});

test('owner: a sale whose stock ran out meanwhile is refused (no oversell)', async () => {
  const { a, itemId } = await setup();
  await createSale(a, actor, sale({ lines: [{ itemId, qtyH: 1000, unitPriceC: 1 }] }), undefined, TODAY);
  await assert.rejects(createSale(a, actor, sale({ lines: [{ itemId, qtyH: 100, unitPriceC: 1 }] }), undefined, TODAY), (e) => e.code === 'NEGATIVE_STOCK');
});

test('counters: only sale-/payment-YYYY, and only +1 at a time', async () => {
  const db = dbAs(OWNER);
  await assertFails(db.doc('counters/other-2026').set({ next: 2 }));
  await assertSucceeds(db.doc(`counters/sale-${Y}`).set({ next: 2 }));
  await assertFails(db.doc(`counters/sale-${Y}`).update({ next: 1 }));   // going back would reuse IDs
  await assertFails(db.doc(`counters/sale-${Y}`).update({ next: 5 }));
  await assertSucceeds(db.doc(`counters/sale-${Y}`).update({ next: 3 }));
  await assertFails(db.doc(`counters/sale-${Y}`).delete());
});

const S = {
  saleNo: 'RJ-2026-00001', kind: 'SALE', saleDate: '2026-11-12', customerId: 'c1', customerName: 'A', lines: [{ itemId: 'i' }],
  subtotalC: 1000, discountC: 100, totalC: 900, paidC: 400, balanceC: 500, terms: 'OPEN_BALANCE', status: 'ACTIVE',
  fulfillment: 'PENDING', deliveryDate: null, notes: '', createdBy: OWNER.uid,
};
test('sales: arithmetic, Walk-in rule, locked fields, cancel is final, no deletes', async () => {
  const db = dbAs(OWNER);
  const doc = db.doc('sales/RJ-2026-00001');
  await assertFails(db.doc('sales/RJ-2026-00002').set(S));                         // id must equal saleNo
  await assertFails(doc.set({ ...S, totalC: 1000 }));                              // total ≠ subtotal − discount
  await assertFails(doc.set({ ...S, paidC: 900 }));                                // paid + balance ≠ total
  await assertFails(doc.set({ ...S, terms: 'FULL' }));                             // full payment cannot leave a balance
  await assertFails(doc.set({ ...S, customerId: 'WALK_IN' }));                     // BR-021
  await assertFails(doc.set({ ...S, lines: [] }));
  await assertSucceeds(doc.set(S));
  await assertFails(doc.update({ totalC: 1 }));                                    // BR-035 locked
  await assertFails(doc.update({ lines: [] }));
  await assertFails(doc.update({ paidC: 500 }));                                   // must keep paid + balance = total
  await assertSucceeds(doc.update({ paidC: 500, balanceC: 400, paymentStatus: 'PARTIAL' }));
  await assertSucceeds(doc.update({ fulfillment: 'DELIVERED', deliveryDate: '2026-11-13' }));
  await assertFails(doc.update({ status: 'CANCELLED', paidC: 0, balanceC: 0, cancel: { reason: '' } }));
  await assertSucceeds(doc.update({ status: 'CANCELLED', paidC: 0, balanceC: 0, cancel: { reason: 'Wrong item' } }));
  await assertFails(doc.update({ status: 'ACTIVE', paidC: 500, balanceC: 400 }));  // cancelled is final
  await assertFails(doc.update({ notes: 'x' }));
  await assertFails(doc.delete());
});

const R = { saleId: 'RJ-2026-00001', customerId: 'c1', kind: 'INSTALLMENT', no: 1, count: 3, dueDate: '2026-12-15', amountC: 1000, paidC: 0, status: 'PENDING', paidDate: null, revisions: [] };
test('installments: id from sale + no, paid ≤ amount, status matches paid, history only grows, cancelled is final', async () => {
  const db = dbAs(OWNER);
  const doc = db.doc('installments/RJ-2026-00001-1');
  await assertFails(db.doc('installments/whatever').set(R));
  await assertFails(doc.set({ ...R, paidC: 10 }));
  await assertFails(doc.set({ ...R, no: 6 }));
  await assertSucceeds(doc.set(R));
  await assertFails(doc.update({ paidC: 1200, status: 'PAID' }));
  await assertFails(doc.update({ paidC: 1000, status: 'PARTIAL' }));
  await assertSucceeds(doc.update({ paidC: 400, status: 'PARTIAL' }));
  await assertFails(doc.update({ saleId: 'RJ-2026-00009' }));
  await assertSucceeds(doc.update({ amountC: 900, dueDate: '2027-01-15', revisions: [{ reason: 'asked' }] }));
  await assertFails(doc.update({ revisions: [] }));                                // history cannot be erased
  await assertSucceeds(doc.update({ status: 'CANCELLED' }));
  await assertFails(doc.update({ status: 'PENDING', paidC: 0 }));
  await assertFails(doc.delete());
});

const PAY = { saleId: 'RJ-2026-00001', customerId: 'c1', customerName: 'A', date: '2026-11-20', amountC: 500, method: 'CASH', reference: '', note: '', allocations: [], isDownPayment: false, atSale: false, status: 'ACTIVE', void: null, createdBy: OWNER.uid };
test('payments: valid on create, never edited, only voided with a reason, never deleted', async () => {
  const db = dbAs(OWNER);
  const doc = db.doc('payments/PAY-2026-00001');
  await assertFails(db.doc('payments/X-1').set(PAY));
  await assertFails(doc.set({ ...PAY, amountC: 0 }));
  await assertFails(doc.set({ ...PAY, method: 'CHEQUE' }));
  await assertFails(doc.set({ ...PAY, status: 'VOIDED' }));
  await assertSucceeds(doc.set(PAY));
  await assertFails(doc.update({ amountC: 400 }));
  await assertFails(doc.update({ status: 'VOIDED', void: { reason: '' } }));
  await assertFails(doc.update({ status: 'VOIDED', void: { reason: 'x' }, amountC: 1 }));
  await assertSucceeds(doc.update({ status: 'VOIDED', void: { reason: 'Wrong amount' } }));
  await assertFails(doc.update({ status: 'ACTIVE', void: null }));
  await assertFails(doc.delete());
});

test('strangers (signed up, no profile) cannot read or write sales data', async () => {
  const db = dbAs(STRANGER);
  for (const c of ['sales', 'installments', 'payments', 'counters']) await assertFails(db.collection(c).get());
  await assertFails(db.doc('sales/RJ-2026-00001').set({ ...S, createdBy: STRANGER.uid }));
  await assertFails(db.doc('payments/PAY-2026-00001').set({ ...PAY, createdBy: STRANGER.uid }));
  await assertFails(env.unauthenticatedContext().firestore().collection('payments').get());
});
