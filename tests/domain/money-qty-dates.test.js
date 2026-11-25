import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulDivRound, parseMoney, formatMoney, centavosToPlain } from '../../src/domain/money.js';
import { parseQty, validateQty, formatQty, qtyToPlain } from '../../src/domain/quantity.js';
import { addDays, daysBetween, lastDayOfMonth, formatDate, today, isValidDate } from '../../src/domain/dates.js';

test('mulDivRound rounds half up, sign-aware', () => {
  assert.equal(mulDivRound(1, 50, 100), 1);   // 0.5 → 1
  assert.equal(mulDivRound(1, 49, 100), 0);
  assert.equal(mulDivRound(-1, 50, 100), -1);
  assert.equal(mulDivRound(275, 5200, 100), 14300); // 2.75 kg × ₱52.00 = ₱143.00
  assert.equal(mulDivRound(333, 4999, 100), 16647); // 3.33 × 49.99 = 166.4667 → 166.47
});

test('parseMoney / formatMoney', () => {
  assert.equal(parseMoney('1,234.5'), 123450);
  assert.equal(parseMoney('₱ 99'), 9900);
  assert.equal(parseMoney('0.05'), 5);
  assert.equal(parseMoney(''), null);
  assert.throws(() => parseMoney('1.234'), { code: 'INVALID_AMOUNT' });
  assert.throws(() => parseMoney('abc'), { code: 'INVALID_AMOUNT' });
  assert.equal(formatMoney(123450), '₱1,234.50');
  assert.equal(formatMoney(5), '₱0.05');
  assert.equal(formatMoney(123456789), '₱1,234,567.89');
  assert.equal(formatMoney(-2500), '−₱25.00');
  assert.equal(centavosToPlain(123405), '1234.05');
});

test('quantities: sacks whole, kilos 0.01', () => {
  assert.equal(parseQty('3', 'SACK'), 300);
  assert.throws(() => parseQty('1.5', 'SACK'), { code: 'INVALID_QTY' });
  assert.equal(parseQty('2.75', 'KG'), 275);
  assert.equal(parseQty('0.5', 'KG'), 50);
  assert.throws(() => parseQty('0.125', 'KG'), { code: 'INVALID_QTY' });
  assert.throws(() => validateQty(0, 'KG'), { code: 'QTY_NOT_POSITIVE' });
  assert.throws(() => validateQty(150, 'SACK'), { code: 'INVALID_QTY' });
  assert.equal(formatQty(275, 'KG'), '2.75 kg');
  assert.equal(formatQty(250, 'KG'), '2.5 kg');
  assert.equal(formatQty(100, 'SACK'), '1 sack');
  assert.equal(formatQty(300, 'SACK'), '3 sacks');
  assert.equal(qtyToPlain(5), '0.05');
});

test('dates: month lengths, leap years, year change', () => {
  assert.equal(lastDayOfMonth(2028, 2), '2028-02-29');
  assert.equal(lastDayOfMonth(2027, 2), '2027-02-28');
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(daysBetween('2026-11-25', '2026-12-25'), 30);
  assert.equal(formatDate('2026-11-25'), 'Nov 25, 2026');
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-02-28'), true);
});

test('today() uses Asia/Manila, not the machine time zone', () => {
  // 2026-11-25 17:30 UTC = 2026-11-26 01:30 in Manila (UTC+8)
  assert.equal(today('Asia/Manila', new Date('2026-11-25T17:30:00Z')), '2026-11-26');
  assert.equal(today('Asia/Manila', new Date('2026-11-25T15:59:00Z')), '2026-11-25');
});
