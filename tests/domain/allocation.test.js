import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocatePayment, reverseAllocations, isOverdue, outstandingOf, reliability, agingBucket, paidOnTime } from '../../src/domain/allocation.js';

const rows = () => [
  { id: 'S-1', no: 1, dueDate: '2026-12-15', amountC: 83300, paidC: 0, status: 'PENDING' },
  { id: 'S-2', no: 2, dueDate: '2027-01-15', amountC: 83300, paidC: 0, status: 'PENDING' },
  { id: 'S-3', no: 3, dueDate: '2027-02-15', amountC: 83400, paidC: 0, status: 'PENDING' },
];

test('overpayment of current installment flows to the next ones (₱1,500 when ₱833 due)', () => {
  const r = allocatePayment(rows(), 150000, '2026-12-10');
  assert.deepEqual(r.allocations, [{ installmentId: 'S-1', amountC: 83300 }, { installmentId: 'S-2', amountC: 66700 }]);
  assert.equal(r.rows[0].status, 'PAID');
  assert.equal(r.rows[0].paidDate, '2026-12-10');
  assert.equal(r.rows[1].status, 'PARTIAL');
  assert.equal(r.rows[2].status, 'PENDING');
  assert.equal(outstandingOf(r.rows), 100000);
});

test('payment above the outstanding balance is rejected', () => {
  assert.throws(() => allocatePayment(rows(), 250001, '2026-12-10'), { code: 'OVERPAYMENT' });
  const r = allocatePayment(rows(), 250000, '2026-12-10');
  assert.ok(r.rows.every((x) => x.status === 'PAID'));
});

test('void restores installments exactly', () => {
  const start = rows();
  const first = allocatePayment(start, 50000, '2026-12-01');
  const second = allocatePayment(first.rows, 100000, '2026-12-20');
  const undone = reverseAllocations(second.rows, second.allocations);
  assert.deepEqual(undone, first.rows);
  const all = reverseAllocations(undone, first.allocations);
  assert.deepEqual(all.map((r) => [r.paidC, r.status, r.paidDate]), start.map(() => [0, 'PENDING', null]));
});

test('cancelled rows are skipped', () => {
  const rs = rows(); rs[0].status = 'CANCELLED';
  const r = allocatePayment(rs, 1000, '2026-12-01');
  assert.equal(r.allocations[0].installmentId, 'S-2');
});

test('overdue is derived from today', () => {
  const r = rows()[0];
  assert.equal(isOverdue(r, '2026-12-15'), false); // due today is not overdue
  assert.equal(isOverdue(r, '2026-12-16'), true);
  assert.equal(isOverdue({ ...r, status: 'PAID' }, '2027-06-01'), false);
  assert.equal(isOverdue({ ...r, dueDate: null }, '2027-06-01'), false); // open balance without due date
});

test('aging buckets', () => {
  const r = rows()[0];
  assert.equal(agingBucket(r, '2026-12-15'), 'CURRENT');
  assert.equal(agingBucket(r, '2027-01-14'), 'D1_30');
  assert.equal(agingBucket(r, '2027-01-15'), 'D31_60');
  assert.equal(agingBucket(r, '2027-02-14'), 'D61_PLUS');
});

test('reliability thresholds (A-007)', () => {
  assert.equal(reliability(2, 2).label, 'New');
  assert.equal(reliability(10, 9).label, 'Good');
  assert.equal(reliability(10, 7).label, 'Fair');
  assert.equal(reliability(10, 6).label, 'Poor');
  assert.equal(paidOnTime({ status: 'PAID', dueDate: '2026-12-15', paidDate: '2026-12-15' }), true);
  assert.equal(paidOnTime({ status: 'PAID', dueDate: '2026-12-15', paidDate: '2026-12-16' }), false);
});
