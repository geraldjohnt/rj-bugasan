import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, discountAmount, stockShortages, validateTerms, creditLimitWarning, formatDocNo, DISCOUNT, TERMS } from '../../src/domain/saleTotals.js';

const lines = [
  { itemId: 'sack', unit: 'SACK', qtyH: 200, unitPriceC: 245000, unitCostC: 210000 },  // 2 sacks × ₱2,450
  { itemId: 'kg', unit: 'KG', qtyH: 275, unitPriceC: 5200, unitCostC: 4400 },          // 2.75 kg × ₱52
];

test('totals, cost and gross profit', () => {
  const t = computeTotals(lines, { type: DISCOUNT.NONE });
  assert.equal(t.subtotalC, 490000 + 14300);
  assert.equal(t.totalC, 504300);
  assert.equal(t.costC, 420000 + 12100);
  assert.equal(t.grossProfitC, 504300 - 432100);
});

test('percent and fixed discounts; never negative', () => {
  assert.equal(discountAmount(504300, { type: DISCOUNT.PERCENT, value: 550 }), 27737); // 5.5% → 277.365 → 277.37
  assert.equal(discountAmount(504300, { type: DISCOUNT.FIXED, value: 4300 }), 4300);
  assert.equal(discountAmount(1000, { type: DISCOUNT.PERCENT, value: 10000 }), 1000);
  assert.throws(() => discountAmount(1000, { type: DISCOUNT.PERCENT, value: 10001 }), { code: 'INVALID_DISCOUNT' });
  assert.throws(() => discountAmount(1000, { type: DISCOUNT.FIXED, value: 1001 }), { code: 'INVALID_DISCOUNT' });
  assert.throws(() => discountAmount(1000, { type: DISCOUNT.FIXED, value: -1 }), { code: 'INVALID_DISCOUNT' });
});

test('price below cost is flagged, not blocked', () => {
  const t = computeTotals([{ ...lines[0], unitPriceC: 200000 }], null);
  assert.equal(t.lines[0].belowCost, true);
});

test('stock check sums the same item across lines (BR-031)', () => {
  const two = [{ itemId: 'kg', qtyH: 300 }, { itemId: 'kg', qtyH: 250 }];
  assert.deepEqual(stockShortages(two, new Map([['kg', 500]])), [{ itemId: 'kg', requestedH: 550, availableH: 500 }]);
  assert.deepEqual(stockShortages(two, new Map([['kg', 550]])), []);
});

test('payment terms rules', () => {
  assert.deepEqual(validateTerms({ terms: TERMS.FULL, totalC: 1000, paidNowC: 1000, customerId: 'WALK_IN' }), { paidNowC: 1000, balanceC: 0 });
  assert.throws(() => validateTerms({ terms: TERMS.FULL, totalC: 1000, paidNowC: 900 }), { code: 'NOT_FULLY_PAID' });
  assert.throws(() => validateTerms({ terms: TERMS.OPEN_BALANCE, totalC: 1000, paidNowC: 500, customerId: 'WALK_IN' }), { code: 'WALK_IN_BALANCE' });
  assert.deepEqual(validateTerms({ terms: TERMS.OPEN_BALANCE, totalC: 1000, paidNowC: 400, customerId: 'c1' }), { paidNowC: 400, balanceC: 600 });
  assert.throws(() => validateTerms({ terms: TERMS.INSTALLMENT, totalC: 1000, customerId: 'c1', plan: { count: 6 } }), { code: 'INVALID_COUNT' });
  assert.throws(() => validateTerms({ terms: TERMS.INSTALLMENT, totalC: 1000, customerId: undefined, plan: { count: 3 } }), { code: 'WALK_IN_BALANCE' });
  assert.throws(() => validateTerms({ terms: TERMS.FULL, totalC: 1000, paidNowC: 1200 }), { code: 'OVERPAYMENT' });
});

test('credit limit warns only when exceeded', () => {
  assert.equal(creditLimitWarning({ outstandingC: 0 }, 5000), null);
  assert.equal(creditLimitWarning({ outstandingC: 3000, creditLimitC: 10000 }, 7000), null);
  assert.deepEqual(creditLimitWarning({ outstandingC: 3000, creditLimitC: 10000 }, 7001), { limitC: 10000, afterC: 10001 });
});

test('document numbers', () => {
  assert.equal(formatDocNo('RJ-', 2026, 12), 'RJ-2026-00012');
  assert.equal(formatDocNo('PAY-', 2027, 1), 'PAY-2027-00001');
});
