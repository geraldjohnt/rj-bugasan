/* Phase 5 — customer domain and services on the Mock adapter. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateCustomerForm, validateContactForm, upsertContact, matchesCustomer, customerReliability, assertArchivable } from '../../src/domain/customers.js';
import { createCustomer, updateCustomer, setCustomerStatus, ensureWalkIn, saveContact, removeContact } from '../../src/data/customerService.js';
import { loadSampleData } from '../../src/data/sampleData.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const form = (o = {}) => validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567', creditLimit: '5000', ...o });

test('validation: contact number required (A-008), reserved Walk-in name, type list, credit limit', () => {
  assert.deepEqual(form().errors, {});
  assert.equal(form().data.creditLimitC, 500000);
  assert.equal(form({ creditLimit: '' }).data.creditLimitC, null);
  assert.equal(form({ contactNumber: '' }).errors.contactNumber, 'Required.');
  assert.ok(form({ contactNumber: 'abc' }).errors.contactNumber);
  assert.ok(form({ contactNumber: '12' }).errors.contactNumber);
  assert.ok(form({ name: 'walk-in' }).errors.name);
  assert.ok(form({ name: '  ' }).errors.name);
  assert.ok(form({ type: 'Nope' }).errors.type);
  assert.ok(form({ creditLimit: '-1' }).errors.creditLimit);
  assert.ok(form({ creditLimit: '1.234' }).errors.creditLimit);
  assert.ok(form({ email: 'not-an-email' }).errors.email);
});

test('alternate contacts: need a name and a way to reach them; only one primary', () => {
  assert.ok(validateContactForm({ name: 'Only name' }).errors.contactNumber);
  assert.ok(validateContactForm({ contactNumber: '09171234567' }).errors.name);
  assert.deepEqual(validateContactForm({ name: 'Liza', facebook: 'fb.com/liza' }).errors, {});
  let list = upsertContact([], { id: 'a', name: 'A', isPrimary: true });
  list = upsertContact(list, { id: 'b', name: 'B', isPrimary: true });
  assert.deepEqual(list.filter((c) => c.isPrimary).map((c) => c.id), ['b']);
  list = upsertContact(list, { id: 'a', name: 'A2', isPrimary: false });
  assert.deepEqual(list.map((c) => c.name), ['A2', 'B']); // edit keeps position
});

test('search matches name, phone digits, address and alternate contact names', () => {
  const c = { name: 'Aling Nena', contactNumber: '0917-123-4567', address: 'Purok 3', alternateContacts: [{ name: 'Mario' }] };
  assert.ok(matchesCustomer(c, 'nena'));
  assert.ok(matchesCustomer(c, '1234567'));
  assert.ok(matchesCustomer(c, 'purok'));
  assert.ok(matchesCustomer(c, 'mario'));
  assert.ok(!matchesCustomer(c, 'pedro'));
});

test('reliability label from counters (BR-025, A-007) and archive rule (BR-026)', () => {
  assert.equal(customerReliability({ paidInstallments: 2, paidOnTime: 2 }).label, 'New');
  assert.equal(customerReliability({ paidInstallments: 10, paidOnTime: 9 }).label, 'Good');
  assert.equal(customerReliability({ paidInstallments: 10, paidOnTime: 7 }).label, 'Fair');
  assert.equal(customerReliability({ paidInstallments: 10, paidOnTime: 6 }).label, 'Poor');
  assert.throws(() => assertArchivable({ name: 'X', outstandingC: 1 }), (e) => e.code === 'HAS_BALANCE');
  assert.throws(() => assertArchivable({ id: 'WALK_IN', system: true, outstandingC: 0 }), (e) => e.code === 'SYSTEM_CUSTOMER');
});

test('create and edit: summary fields start at zero; credit-limit change logged with before/after', async () => {
  const db = createMockAdapter();
  const id = await createCustomer(db, actor, form().data);
  const c = await db.get('customers', id);
  assert.equal(c.outstandingC, 0);
  assert.equal(c.totalPurchasesC, 0);
  assert.equal(c.status, 'ACTIVE');
  assert.deepEqual(c.alternateContacts, []);
  assert.deepEqual(await updateCustomer(db, actor, id, form().data), { changed: false });
  await updateCustomer(db, actor, id, form({ creditLimit: '', address: 'Market Road' }).data);
  const after = await db.get('customers', id);
  assert.equal(after.creditLimitC, null);
  assert.equal(after.address, 'Market Road');
  const [log] = await db.query('activityLogs', { where: [['action', '==', 'CUSTOMER_UPDATE']] });
  assert.match(log.summary, /credit limit ₱5,000.00 → none/);
  assert.deepEqual(log.changes.creditLimitC, { from: 500000, to: null });
});

test('contacts: add, edit, remove; each change logged', async () => {
  const db = createMockAdapter();
  const id = await createCustomer(db, actor, form().data);
  const a = await saveContact(db, actor, id, validateContactForm({ name: 'Mario', relationship: 'Son', contactNumber: '0918 000 1111', isPrimary: true }).data);
  await saveContact(db, actor, id, validateContactForm({ name: 'Liza', relationship: 'Neighbor', facebook: 'fb.com/liza', isPrimary: true }).data);
  let c = await db.get('customers', id);
  assert.equal(c.alternateContacts.length, 2);
  assert.deepEqual(c.alternateContacts.filter((x) => x.isPrimary).map((x) => x.name), ['Liza']);
  await saveContact(db, actor, id, { ...validateContactForm({ name: 'Mario S.', contactNumber: '0918 000 1111' }).data, id: a });
  c = await db.get('customers', id);
  assert.equal(c.alternateContacts.find((x) => x.id === a).name, 'Mario S.');
  await removeContact(db, actor, id, a);
  c = await db.get('customers', id);
  assert.deepEqual(c.alternateContacts.map((x) => x.name), ['Liza']);
  await assert.rejects(saveContact(db, actor, id, { ...validateContactForm({ name: 'Ghost', contactNumber: '0918 000 1111' }).data, id: 'nope' }), (e) => e.code === 'CONTACT_MISSING');
  assert.equal((await db.query('activityLogs', { where: [['entityId', '==', id]] })).length, 5);
});

test('archive: blocked while a balance is outstanding; restore works', async () => {
  const db = createMockAdapter();
  const id = await createCustomer(db, actor, form().data);
  await db.update('customers', id, { outstandingC: 100 }); // as a later sale would leave it
  await assert.rejects(setCustomerStatus(db, actor, id, 'ARCHIVED'), (e) => e.code === 'HAS_BALANCE');
  await db.update('customers', id, { outstandingC: 0 });
  await setCustomerStatus(db, actor, id, 'ARCHIVED');
  assert.equal((await db.get('customers', id)).status, 'ARCHIVED');
  await setCustomerStatus(db, actor, id, 'ACTIVE');
  assert.equal((await db.get('customers', id)).status, 'ACTIVE');
});

test('Walk-in: created once, cannot be edited, archived or given contacts (BR-020)', async () => {
  const db = createMockAdapter();
  assert.equal(await ensureWalkIn(db, actor), true);
  assert.equal(await ensureWalkIn(db, actor), false);
  const w = await db.get('customers', 'WALK_IN');
  assert.equal(w.system, true);
  assert.equal(w.name, 'Walk-in');
  await assert.rejects(setCustomerStatus(db, actor, 'WALK_IN', 'ARCHIVED'), (e) => e.code === 'SYSTEM_CUSTOMER');
  await assert.rejects(updateCustomer(db, actor, 'WALK_IN', form().data), (e) => e.code === 'SYSTEM_CUSTOMER');
  await assert.rejects(saveContact(db, actor, 'WALK_IN', validateContactForm({ name: 'X', contactNumber: '09171234567' }).data), (e) => e.code === 'SYSTEM_CUSTOMER');
});

test('sample data adds customers with contacts once', async () => {
  const db = createMockAdapter();
  const first = await loadSampleData(db, actor);
  assert.equal(first.customers, 5);
  const second = await loadSampleData(db, actor);
  assert.equal(second.customers, 0);
  const all = await db.query('customers', {});
  assert.equal(all.length, 6); // 5 + Walk-in
  assert.ok(all.some((c) => c.alternateContacts.length === 2));
});
