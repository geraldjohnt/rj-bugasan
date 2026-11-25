import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockAdapter, TransactionConflictError } from '../../src/data/mockAdapter.js';

test('set / get / query with where, orderBy, limit', async () => {
  const db = createMockAdapter();
  await db.set('items', 'a', { name: 'Dinorado', qtyH: 500 });
  await db.set('items', 'b', { name: 'Jasmine', qtyH: 0 });
  await db.set('items', 'c', { name: 'Sinandomeng', qtyH: 1200 });
  assert.deepEqual(await db.get('items', 'a'), { id: 'a', name: 'Dinorado', qtyH: 500 });
  const inStock = await db.query('items', { where: [['qtyH', '>', 0]], orderBy: [['qtyH', 'desc']], limit: 1 });
  assert.deepEqual(inStock.map((r) => r.id), ['c']);
});

test('returned documents are copies (no accidental mutation of stored data)', async () => {
  const db = createMockAdapter();
  await db.set('items', 'a', { qtyH: 1 });
  const doc = await db.get('items', 'a');
  doc.qtyH = 999;
  assert.equal((await db.get('items', 'a')).qtyH, 1);
});

test('transaction is all-or-nothing when the function throws', async () => {
  const db = createMockAdapter();
  await db.set('items', 'a', { qtyH: 100 });
  await assert.rejects(db.runTransaction(async (tx) => {
    const s = await tx.get('items', 'a');
    tx.update('items', 'a', { qtyH: s.data.qtyH - 100 });
    tx.set('movements', 'm1', { qtyDeltaH: -100 });
    throw new Error('validation failed');
  }), /validation failed/);
  assert.equal((await db.get('items', 'a')).qtyH, 100);
  assert.equal(await db.get('movements', 'm1'), null);
});

test('reads after writes are rejected (Firestore rule)', async () => {
  const db = createMockAdapter();
  await assert.rejects(db.runTransaction(async (tx) => {
    tx.set('x', '1', {});
    await tx.get('x', '2');
  }), /reads before any writes/);
});

test('two concurrent transactions selling the last stock: exactly one succeeds', async () => {
  const db = createMockAdapter();
  await db.set('items', 'a', { qtyH: 100 });
  const sell = () => db.runTransaction(async (tx) => {
    const s = await tx.get('items', 'a');
    await new Promise((r) => setTimeout(r, 5)); // let the other transaction interleave
    if (s.data.qtyH < 100) throw new Error('Insufficient stock');
    tx.update('items', 'a', { qtyH: s.data.qtyH - 100 });
    return 'sold';
  });
  const results = await Promise.allSettled([sell(), sell()]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /Insufficient stock/);
  assert.equal((await db.get('items', 'a')).qtyH, 0);
});

test('persistent conflicts give up with TransactionConflictError', async () => {
  const db = createMockAdapter({ maxRetries: 2 });
  await db.set('c', 'n', { v: 0 });
  await assert.rejects(db.runTransaction(async (tx) => {
    await tx.get('c', 'n');
    await db.update('c', 'n', { v: Math.random() }); // outside write always invalidates the read
    tx.update('c', 'n', { v: -1 });
  }), TransactionConflictError);
});

test('subscribe receives updates after commits', async () => {
  const db = createMockAdapter();
  const seen = [];
  const unsub = db.subscribe('items', {}, (rows) => seen.push(rows.length));
  await db.add('items', { name: 'x' });
  unsub();
  await db.add('items', { name: 'y' });
  assert.deepEqual(seen, [0, 1]);
});

test('storage persistence round-trip', async () => {
  let saved = null;
  const storage = { load: () => saved && JSON.parse(saved), save: (d) => { saved = JSON.stringify(d); } };
  const a = createMockAdapter({ storage });
  await a.set('customers', 'WALK_IN', { name: 'Walk-in' });
  const b = createMockAdapter({ storage });
  assert.equal((await b.get('customers', 'WALK_IN')).name, 'Walk-in');
});
