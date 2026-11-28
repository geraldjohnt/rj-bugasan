/* Phase 14 domain: restock expense lines, split by value, cost incl. expenses, receipt edit plan (D-060 … D-063). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExpenseLines, splitByValue, expenseBreakdown, planReceiptEdit, expenseNameSuggestions, validateExpenseForm, ALL_EXPENSE_CATEGORIES,
} from '../../src/domain/purchasing.js';

test('owner example: 150 sacks × ₱2,500 with ₱6,000 expenses → ₱40 per sack, cost incl. expenses ₱2,540', () => {
  const [b] = expenseBreakdown([{ qtyH: 15000, unitCostC: 250000, priceC: 280000 }], 600000);
  assert.equal(b.shareC, 600000);
  assert.equal(b.perUnitC, 4000);
  assert.equal(b.landedC, 254000);
  assert.equal(b.profitC, 26000);
});

test('split by value: proportional, exact total, equal split when every value is 0', () => {
  assert.deepEqual(splitByValue([250000 * 100, 50000 * 50], 600000), [545455, 54545]);
  const s = splitByValue([1, 1, 1], 100);
  assert.equal(s.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(s, [34, 33, 33]);
  assert.deepEqual(splitByValue([0, 0], 1001), [501, 500]);
  assert.deepEqual(splitByValue([5, 5], 0), [0, 0]);
  // lines with qty 0 (not delivered) get no share
  const br = expenseBreakdown([{ qtyH: 100, unitCostC: 1000, priceC: null }, { qtyH: 0, unitCostC: 1000, priceC: null }], 500);
  assert.equal(br[0].shareC, 500); assert.equal(br[1].shareC, 0); assert.equal(br[0].profitC, null);
});

test('expense lines: free text, empty rows skipped, name and amount checked', () => {
  const r = parseExpenseLines([{ name: ' Trucking ', amount: '4,000' }, { name: '', amount: '' }, { name: 'Fuel', amount: '0' }, { name: '', amount: '50' }]);
  assert.deepEqual(r.lines, [{ name: 'Trucking', amountC: 400000 }]);
  assert.equal(r.errors[2].amount, 'Enter an amount greater than zero.');
  assert.equal(r.errors[3].name, 'Enter what it was for.');
  assert.equal(r.totalC, 400000);
});

test('Restock category cannot be chosen on the Expenses page but appears in filters/reports', () => {
  assert.ok(validateExpenseForm({ date: '2026-11-28', category: 'Restock', amount: '10' }).errors.category);
  assert.ok(ALL_EXPENSE_CATEGORIES.includes('Restock'));
});

test('suggestions: restock expense names, newest first with last amount, case-insensitive unique', () => {
  const s = expenseNameSuggestions([
    { category: 'Restock', status: 'ACTIVE', note: 'Trucking', amountC: 300000, date: '2026-11-01' },
    { category: 'Restock', status: 'ACTIVE', note: 'trucking', amountC: 350000, date: '2026-11-20' },
    { category: 'Restock', status: 'ACTIVE', note: 'Labor', amountC: 100000, date: '2026-11-10' },
    { category: 'Rent', status: 'ACTIVE', note: 'Rent', amountC: 1, date: '2026-11-25' },
  ]);
  assert.deepEqual(s, [{ name: 'trucking', amountC: 350000 }, { name: 'Labor', amountC: 100000 }]);
});

test('receipt edit plan: cost/price changes and expense create/update/void', () => {
  const restock = { id: 'RS-2026-00001', receipts: [{ batchId: 'B1', date: '2026-11-10', lines: [{ itemId: 'a', itemName: 'A', unit: 'SACK', qtyH: 100, unitCostC: 250000, priceC: 280000 }],
    expenses: [{ name: 'Trucking', amountC: 400000, expenseId: 'e1' }, { name: 'Labor', amountC: 200000, expenseId: 'e2' }] }] };
  const p = planReceiptEdit(restock, 'B1', { lines: [{ itemId: 'a', unitCostC: 255000, priceC: 280000 }], expenses: [{ name: 'Trucking', amountC: 450000, expenseId: 'e1' }, { name: 'Fuel', amountC: 50000 }] });
  assert.deepEqual(p.changes.map((c) => [c.costFrom, c.costTo]), [[250000, 255000]]);
  assert.equal(p.receipt.lines[0].unitCostC, 255000);
  assert.equal(p.receipt.lines[0].qtyH, 100);
  assert.deepEqual(p.expenseOps.create, [{ name: 'Fuel', amountC: 50000 }]);
  assert.deepEqual(p.expenseOps.update.map((u) => [u.expenseId, u.from.amountC, u.to.amountC]), [['e1', 400000, 450000]]);
  assert.deepEqual(p.expenseOps.void.map((e) => e.expenseId), ['e2']);
  assert.throws(() => planReceiptEdit(restock, 'NOPE', { lines: [], expenses: [] }), { code: 'RECEIPT_MISSING' });
  assert.throws(() => planReceiptEdit(restock, 'B1', { lines: [], expenses: [{ name: 'X', amountC: 1, expenseId: 'zzz' }] }), { code: 'EXPENSE_MISSING' });
});
