/* Phase 8 domain: suppliers, restock orders, receipts, expenses (BR-060 … BR-063). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSupplierForm, validateRestockForm, planReceipt, statusFromLines, restockTotalC, remainingH, costDiffers, validateExpenseForm,
} from '../../src/domain/purchasing.js';

const items = {
  s: { id: 's', name: 'Dinorado 50kg Sack', unit: 'SACK', status: 'ACTIVE', costC: 290000 },
  k: { id: 'k', name: 'Dinorado per KG', unit: 'KG', status: 'ACTIVE', costC: 5800 },
  a: { id: 'a', name: 'Old rice', unit: 'KG', status: 'ARCHIVED', costC: 100 },
};
const form = (lines, o = {}) => ({ supplierId: 'sup1', orderDate: '2026-11-10', expectedDate: '2026-11-15', notes: '', lines, ...o });

test('supplier form: name required, email/phone shape', () => {
  assert.equal(validateSupplierForm({ name: '' }).errors.name, 'Required.');
  const { data, errors } = validateSupplierForm({ name: ' Golden Grains ', email: 'x@y.ph', contactNumber: '0917 555 1234' });
  assert.deepEqual(errors, {});
  assert.equal(data.nameLower, 'golden grains');
  assert.ok(validateSupplierForm({ name: 'A', email: 'nope' }).errors.email);
  assert.ok(validateSupplierForm({ name: 'A', contactNumber: 'abc' }).errors.contactNumber);
});

test('restock form: lines, whole sacks, duplicates, archived items, dates, total', () => {
  const ok = validateRestockForm(form([{ itemId: 's', qty: '10', unitCost: '2900' }, { itemId: 'k', qty: '25.5', unitCost: '58' }]), items);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.data.lines[0].qtyOrderedH, 1000);
  assert.equal(ok.data.lines[1].qtyOrderedH, 2550);
  assert.equal(ok.data.totalCostC, 10 * 290000 + 147900); // 25.5 × 58.00 = 1,479.00
  assert.equal(restockTotalC(ok.data.lines), ok.data.totalCostC);

  const bad = validateRestockForm(form([{ itemId: 's', qty: '1.5', unitCost: '2900' }, { itemId: 's', qty: '1', unitCost: '1' }, { itemId: 'a', qty: '1', unitCost: '1' }], { expectedDate: '2026-11-01' }), items);
  assert.ok(bad.errors.lineErrors[0].qty);
  assert.ok(bad.errors.lineErrors[1].itemId.includes('already'));
  assert.ok(bad.errors.lineErrors[2].itemId.includes('Archived'));
  assert.ok(bad.errors.expectedDate);
  assert.equal(validateRestockForm(form([]), items).errors.lines, 'Add at least one item.');
  assert.equal(validateRestockForm(form([{ itemId: '', qty: '', unitCost: '' }]), items).errors.lines, 'Add at least one item.'); // empty row ignored
  assert.ok(validateRestockForm(form([{ itemId: 's', qty: '1', unitCost: '' }]), items).errors.lineErrors[0].unitCost);
});

test('editing an order cannot go below what was received, nor drop a received line', () => {
  const existing = { lines: [{ itemId: 's', itemName: 'Dinorado 50kg Sack', unit: 'SACK', qtyOrderedH: 1000, qtyReceivedH: 400, unitCostC: 290000 }] };
  const low = validateRestockForm(form([{ itemId: 's', qty: '3', unitCost: '2900' }]), items, existing);
  assert.match(low.errors.lineErrors[0].qty, /Already received 4 sacks/);
  const ok = validateRestockForm(form([{ itemId: 's', qty: '6', unitCost: '2950' }]), items, existing);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.data.lines[0].qtyReceivedH, 400);
  const dropped = validateRestockForm(form([{ itemId: 'k', qty: '1', unitCost: '1' }]), items, existing);
  assert.match(dropped.errors.lines, /cannot be removed/);
});

test('receipt plan: partial then full; over-receive rejected; status follows (BR-060, BR-061)', () => {
  const r = { status: 'ORDERED', orderDate: '2026-11-10', lines: [
    { itemId: 's', itemName: 'Dinorado 50kg Sack', unit: 'SACK', qtyOrderedH: 1000, qtyReceivedH: 0, unitCostC: 290000 },
    { itemId: 'k', itemName: 'Dinorado per KG', unit: 'KG', qtyOrderedH: 2550, qtyReceivedH: 0, unitCostC: 5800 },
  ] };
  const p1 = planReceipt(r, { date: '2026-11-12', lines: [{ itemId: 's', qtyH: 600, unitCostC: 295000 }, { itemId: 'k', qtyH: 0, unitCostC: 5800 }] });
  assert.equal(p1.status, 'PARTIALLY_RECEIVED');
  assert.equal(p1.receiptLines.length, 1);
  assert.equal(p1.valueC, 6 * 295000);
  assert.equal(remainingH(p1.lines[0]), 400);
  const r2 = { ...r, status: p1.status, lines: p1.lines };
  assert.throws(() => planReceipt(r2, { date: '2026-11-13', lines: [{ itemId: 's', qtyH: 500, unitCostC: 1 }] }), { code: 'OVER_RECEIVE' });
  assert.throws(() => planReceipt(r2, { date: '2026-11-13', lines: [{ itemId: 's', qtyH: 150, unitCostC: 1 }] }), { code: 'INVALID_QTY' });
  assert.throws(() => planReceipt(r2, { date: '2026-11-13', lines: [{ itemId: 's', qtyH: 0, unitCostC: 1 }] }), { code: 'NOTHING_RECEIVED' });
  assert.throws(() => planReceipt(r2, { date: '2026-11-01', lines: [{ itemId: 's', qtyH: 100, unitCostC: 1 }] }), { code: 'INVALID_DATE' });
  const p2 = planReceipt(r2, { date: '2026-11-14', lines: [{ itemId: 's', qtyH: 400, unitCostC: 290000 }, { itemId: 'k', qtyH: 2550, unitCostC: 5800 }] });
  assert.equal(p2.status, 'RECEIVED');
  assert.throws(() => planReceipt({ ...r2, status: 'RECEIVED', lines: p2.lines }, { date: '2026-11-15', lines: [{ itemId: 's', qtyH: 100, unitCostC: 1 }] }), { code: 'RESTOCK_CLOSED' });
  assert.throws(() => planReceipt({ ...r, status: 'CANCELLED' }, { date: '2026-11-15', lines: [] }), { code: 'RESTOCK_CLOSED' });
  assert.equal(statusFromLines(r.lines), 'ORDERED');
});

test('cost update prompt only when the received cost differs (BR-062)', () => {
  assert.equal(costDiffers(items.s, 290000), false);
  assert.equal(costDiffers(items.s, 295000), true);
});

test('expense form (BR-063): category, amount > 0, note for Other', () => {
  const ok = validateExpenseForm({ date: '2026-11-20', category: 'Rent', amount: '5,000', note: '' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.data.amountC, 500000);
  assert.ok(validateExpenseForm({ date: '2026-11-20', category: 'Rent', amount: '0' }).errors.amount);
  assert.ok(validateExpenseForm({ date: '2026-11-20', category: 'Food', amount: '1' }).errors.category);
  assert.ok(validateExpenseForm({ date: '2026-11-20', category: 'Other', amount: '1', note: '' }).errors.note);
  assert.ok(validateExpenseForm({ date: 'x', category: 'Rent', amount: '1' }).errors.date);
});
