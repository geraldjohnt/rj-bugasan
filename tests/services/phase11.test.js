/*
 * Phase 11 on the Mock adapter: opening balances (BR-081, D-045) and backup / restore (RQ-042, BR-094, D-044).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../src/data/mockAdapter.js';
import { validateCustomerForm } from '../../src/domain/customers.js';
import { createCustomer } from '../../src/data/customerService.js';
import { cancelSale } from '../../src/data/salesService.js';
import { recordPayment, reviseSchedule } from '../../src/data/paymentService.js';
import { createOpeningBalance } from '../../src/data/openingBalanceService.js';
import { validateOpeningBalanceForm, splitEvenly } from '../../src/domain/openingBalance.js';
import { exportBackup, restoreBackup } from '../../src/data/backupService.js';
import { parseBackup, buildBackup, planRestore, encodeValue, decodeValue, backupAge, backupIsDue, BACKUP_COLLECTIONS } from '../../src/domain/backup.js';
import { salesSummary, receivablesAging } from '../../src/domain/reports.js';
import { loadSampleData } from '../../src/data/sampleData.js';
import { outstandingOf } from '../../src/domain/allocation.js';

const actor = { uid: 'u1', displayName: 'Owner' };
const TODAY = '2026-11-25';
const ob = (o) => ({ originalDate: '2026-08-10', description: '2 sacks Dinorado (Excel ledger)', rows: [{ dueDate: '2026-11-15', amount: '1500' }, { dueDate: '2026-12-15', amount: '1500.50' }], ...o });

async function setup() {
  const db = createMockAdapter();
  const custId = await createCustomer(db, actor, validateCustomerForm({ name: 'Aling Nena', type: 'Store', contactNumber: '0917 123 4567' }).data);
  return { db, custId };
}

test('opening balance form: validation messages', () => {
  const bad = validateOpeningBalanceForm({ customerId: 'WALK_IN', originalDate: '2027-01-01', description: '', rows: [{ dueDate: '', amount: '0' }, { dueDate: '', amount: 'x' }] }, TODAY);
  assert.ok(bad.errors.customerId && bad.errors.originalDate && bad.errors.description);
  assert.ok(bad.errors.rows[0].amount && bad.errors.rows[0].dueDate && bad.errors.rows[1].amount);
  const one = validateOpeningBalanceForm({ customerId: 'c1', originalDate: '2026-05-01', description: 'Old balance', rows: [{ dueDate: '', amount: '2,000' }] }, TODAY);
  assert.deepEqual(one.errors, {});
  assert.equal(one.data.kind, 'OPEN_BALANCE');
  assert.equal(one.data.totalC, 200000);
  const order = validateOpeningBalanceForm(ob({ customerId: 'c1', rows: [{ dueDate: '2026-12-15', amount: '1' }, { dueDate: '2026-11-15', amount: '1' }] }), TODAY);
  assert.ok(order.errors.rows[1].dueDate);
  assert.deepEqual(splitEvenly(300050, 2), [150000, 150050]);
});

test('opening balance: receivable rows and customer balance, but no stock, no revenue, no purchase total', async () => {
  const { db, custId } = await setup();
  const r = await createOpeningBalance(db, actor, ob({ customerId: custId }), TODAY);
  assert.equal(r.saleId, 'OB-2026-00001');
  assert.equal(r.totalC, 300050);
  const sale = await db.get('sales', r.saleId);
  assert.equal(sale.kind, 'OPENING_BALANCE');
  assert.equal(sale.balanceC, 300050);
  const rows = await db.query('installments', { where: [['saleId', '==', r.saleId]] });
  assert.equal(rows.length, 2);
  assert.equal(outstandingOf(rows), 300050);
  let c = await db.get('customers', custId);
  assert.equal(c.outstandingC, 300050);
  assert.equal(c.totalPurchasesC || 0, 0);
  assert.equal((await db.query('inventoryMovements', {})).length, 0);
  // revenue excludes it; receivables include it (first row already overdue)
  const sales = await db.query('sales', {});
  assert.equal(salesSummary(sales, '2026-01-01', '2026-12-31').revenueC, 0);
  const aging = receivablesAging(rows, TODAY);
  assert.equal(aging.totalC, 300050);

  // payment, reschedule and cancel work through the normal services
  await recordPayment(db, actor, { saleId: r.saleId, date: TODAY, amountC: 100000, method: 'CASH' }, TODAY);
  await reviseSchedule(db, actor, r.saleId, [{ no: 1, dueDate: '2026-11-30', amountC: 150000 }, { no: 2, dueDate: '2027-01-15', amountC: 150050 }], 'Agreed with customer');
  c = await db.get('customers', custId);
  assert.equal(c.outstandingC, 200050);
  await cancelSale(db, actor, r.saleId, 'Entered for the wrong customer');
  c = await db.get('customers', custId);
  assert.equal(c.outstandingC, 0);
  assert.equal(c.totalPurchasesC || 0, 0);
  const second = await createOpeningBalance(db, actor, ob({ customerId: custId, rows: [{ dueDate: '', amount: '500' }] }), TODAY);
  assert.equal(second.saleId, 'OB-2026-00002');
  const logs = await db.query('activityLogs', { where: [['action', '==', 'OPENING_BALANCE_CREATE']] });
  assert.equal(logs.length, 2);
});

test('opening balance: refused for Walk-in, archived or missing customers', async () => {
  const { db, custId } = await setup();
  await assert.rejects(createOpeningBalance(db, actor, ob({ customerId: 'WALK_IN' }), TODAY), { code: 'INVALID_OPENING_BALANCE' });
  await assert.rejects(createOpeningBalance(db, actor, ob({ customerId: 'nope' }), TODAY), { code: 'CUSTOMER_MISSING' });
  await db.update('customers', custId, { status: 'ARCHIVED' });
  await assert.rejects(createOpeningBalance(db, actor, ob({ customerId: custId }), TODAY), { code: 'CUSTOMER_ARCHIVED' });
  assert.equal((await db.query('sales', {})).length, 0);
});

test('backup values: timestamps round-trip as {$ts}, plain strings stay strings', () => {
  const ts = { toDate: () => new Date('2026-11-25T01:02:03.000Z'), seconds: 1 };
  const isTs = (v) => v === ts;
  const enc = encodeValue({ at: ts, d: '2026-11-25', list: [{ at: ts }], n: 5, nil: null }, isTs);
  assert.deepEqual(enc, { at: { $ts: '2026-11-25T01:02:03.000Z' }, d: '2026-11-25', list: [{ at: { $ts: '2026-11-25T01:02:03.000Z' } }], n: 5, nil: null });
  const dec = decodeValue(enc, (iso) => `TS(${iso})`);
  assert.deepEqual(dec, { at: 'TS(2026-11-25T01:02:03.000Z)', d: '2026-11-25', list: [{ at: 'TS(2026-11-25T01:02:03.000Z)' }], n: 5, nil: null });
});

test('backup file checks: wrong app, newer version, damaged, incomplete', () => {
  const good = buildBackup({ items: [{ id: 'a', name: 'x' }], settings: [{ id: 'bootstrap', ownerUid: 'u' }, { id: 'general', businessName: 'RJ' }] }, { exportedAt: '2026-11-25T00:00:00.000Z' });
  assert.equal(good.counts.settings, 1, 'bootstrap is never exported');
  const parsed = parseBackup(JSON.stringify(good));
  assert.equal(parsed.total, 2);
  assert.throws(() => parseBackup('not json'), { code: 'BACKUP_NOT_JSON' });
  assert.throws(() => parseBackup(JSON.stringify({ app: 'other' })), { code: 'BACKUP_WRONG_APP' });
  assert.throws(() => parseBackup(JSON.stringify({ ...good, schemaVersion: 99 })), { code: 'BACKUP_TOO_NEW' });
  assert.throws(() => parseBackup(JSON.stringify({ ...good, collections: { ...good.collections, users: [] } })), { code: 'BACKUP_UNKNOWN' });
  assert.throws(() => parseBackup(JSON.stringify({ ...good, collections: { ...good.collections, items: [{ id: 'a/b', data: {} }] } })), { code: 'BACKUP_DAMAGED' });
  assert.throws(() => parseBackup(JSON.stringify({ ...good, collections: { ...good.collections, items: [] } })), { code: 'BACKUP_INCOMPLETE' });
  const ops = planRestore(good, { items: ['a', 'old'], settings: ['bootstrap', 'restore', 'general', 'sales'] });
  assert.deepEqual(ops.filter((o) => o.op === 'delete').map((o) => `${o.col}/${o.id}`).sort(), ['items/old', 'settings/sales']);
  assert.equal(backupAge(null), null);
  assert.equal(backupAge('2026-11-17T00:00:00Z', new Date('2026-11-25T01:00:00Z')), 8);
  assert.equal(backupIsDue(8), true);
  assert.equal(backupIsDue(7), false);
  assert.equal(backupIsDue(null), true);
});

test('backup → change everything → restore gives back exactly the backed-up data', async () => {
  const db = createMockAdapter();
  await loadSampleData(db, actor, TODAY);
  const snapshot = async () => {
    const out = {};
    for (const col of BACKUP_COLLECTIONS) out[col] = (await db.query(col, {})).filter((d) => !(col === 'settings' && ['restore', 'backup'].includes(d.id))).sort((a, b) => a.id.localeCompare(b.id));
    out.activityLogs = out.activityLogs.filter((l) => !String(l.action).startsWith('BACKUP_'));
    return out;
  };
  const before = await snapshot();
  const backup = await exportBackup(db, actor);
  assert.ok((await db.get('settings', 'backup')).lastBackupAt);
  const text = JSON.stringify(backup);
  const parsed = parseBackup(text);
  assert.ok(parsed.total > 100);

  // Changes after the backup: a new opening balance and a deleted-looking item edit.
  const custId = (await db.query('customers', {})).find((c) => c.id !== 'WALK_IN').id;
  await createOpeningBalance(db, actor, ob({ customerId: custId }), TODAY);
  const anyItem = (await db.query('items', {}))[0];
  await db.update('items', anyItem.id, { name: 'Changed' });

  await assert.rejects(restoreBackup(db, actor, parsed.backup, 'restore'), { code: 'CONFIRM_REQUIRED' });
  const progress = [];
  const res = await restoreBackup(db, actor, parsed.backup, 'RESTORE', { onProgress: (p) => progress.push(p) });
  assert.ok(res.written > 100 && res.deleted >= 3, JSON.stringify(res));
  assert.equal(progress[progress.length - 1].done, progress[progress.length - 1].total);
  const after = await snapshot();
  assert.deepEqual(after, before);
  assert.equal((await db.get('settings', 'restore')).active, false);
  const logs = await db.query('activityLogs', { where: [['action', '==', 'BACKUP_RESTORE']] });
  assert.equal(logs.length, 1);
});
