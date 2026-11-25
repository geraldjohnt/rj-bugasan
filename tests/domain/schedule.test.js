import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, splitAmount, firstDueDate, nextDueDates, validateRevision, FREQUENCIES as F } from '../../src/domain/schedule.js';

test('example from requirements: ₱2,500 in 3 → 833, 833, 834', () => {
  assert.deepEqual(splitAmount(250000, 3), [83300, 83300, 83400]);
});

test('installments always sum exactly to the amount financed (exhaustive sample)', () => {
  for (const count of [3, 4, 5]) {
    for (let c = 500; c <= 2000000; c += 7919) { // includes odd centavos
      const parts = splitAmount(c, count);
      assert.equal(parts.reduce((a, b) => a + b, 0), c, `${c} / ${count}`);
      parts.slice(0, -1).forEach((p) => assert.equal(p % 100, 0, 'whole pesos except last'));
      assert.ok(parts[count - 1] >= parts[0], 'remainder goes to the last installment');
    }
  }
});

test('centavo remainder goes to the last installment', () => {
  assert.deepEqual(splitAmount(250050, 3), [83300, 83300, 83450]);
});

test('rejects invalid counts and tiny installments', () => {
  assert.throws(() => splitAmount(10000, 6), { code: 'INVALID_COUNT' });
  assert.throws(() => splitAmount(10000, 2), { code: 'INVALID_COUNT' });
  assert.throws(() => splitAmount(250, 3), { code: 'INSTALLMENT_TOO_SMALL' });
  assert.throws(() => splitAmount(0, 3), { code: 'NOTHING_TO_FINANCE' });
});

test('first due date with 7-day gap (BR-042 examples)', () => {
  assert.equal(firstDueDate('2026-11-12', F.MONTHLY_15), '2026-12-15');   // Nov 15 is only 3 days away
  assert.equal(firstDueDate('2026-11-08', F.MONTHLY_15), '2026-11-15');   // exactly 7 days → allowed
  assert.equal(firstDueDate('2026-11-09', F.MONTHLY_15), '2026-12-15');
  assert.equal(firstDueDate('2026-11-12', F.MONTHLY_EOM), '2026-11-30');
  assert.equal(firstDueDate('2026-11-25', F.MONTHLY_EOM), '2026-12-31');
  assert.equal(firstDueDate('2026-11-12', F.SEMI_MONTHLY), '2026-11-30');
  assert.equal(firstDueDate('2026-11-02', F.SEMI_MONTHLY), '2026-11-15');
  assert.equal(firstDueDate('2026-12-28', F.MONTHLY_15), '2027-01-15');  // year change
  assert.equal(firstDueDate('2026-11-12', F.MONTHLY_15, 0), '2026-11-15'); // configurable gap
});

test('end-of-month and semi-monthly sequences respect February and leap years', () => {
  assert.deepEqual(nextDueDates('2028-01-20', F.MONTHLY_EOM, 3), ['2028-01-31', '2028-02-29', '2028-03-31']);
  assert.deepEqual(nextDueDates('2027-02-01', F.SEMI_MONTHLY, 4), ['2027-02-15', '2027-02-28', '2027-03-15', '2027-03-31']);
  assert.deepEqual(nextDueDates('2026-12-20', F.MONTHLY_15, 3), ['2027-01-15', '2027-02-15', '2027-03-15']);
});

test('buildSchedule with down payment', () => {
  const s = buildSchedule({ totalC: 500000, downPaymentC: 100000, count: 4, frequency: F.MONTHLY_15, saleDate: '2026-11-12' });
  assert.equal(s.financedC, 400000);
  assert.deepEqual(s.installments, [
    { no: 1, dueDate: '2026-12-15', amountC: 100000 },
    { no: 2, dueDate: '2027-01-15', amountC: 100000 },
    { no: 3, dueDate: '2027-02-15', amountC: 100000 },
    { no: 4, dueDate: '2027-03-15', amountC: 100000 },
  ]);
  assert.throws(() => buildSchedule({ totalC: 1000, downPaymentC: 1000, count: 3, frequency: F.MONTHLY_15, saleDate: '2026-11-12' }), { code: 'INVALID_DOWN_PAYMENT' });
});

test('revision: total must stay equal; paid rows locked; partial not below paid', () => {
  const cur = [
    { no: 1, dueDate: '2026-12-15', amountC: 83300, paidC: 83300, status: 'PAID' },
    { no: 2, dueDate: '2027-01-15', amountC: 83300, paidC: 20000, status: 'PARTIAL' },
    { no: 3, dueDate: '2027-02-15', amountC: 83400, paidC: 0, status: 'PENDING' },
  ];
  const ok = validateRevision(cur, [{ no: 2, dueDate: '2027-01-30', amountC: 50000 }, { no: 3, dueDate: '2027-02-28', amountC: 116700 }]);
  assert.equal(ok[1].dueDate, '2027-01-30');
  assert.equal(ok.reduce((a, r) => a + r.amountC, 0), 250000);
  assert.throws(() => validateRevision(cur, [{ no: 3, dueDate: '2027-02-15', amountC: 90000 }]), { code: 'TOTAL_CHANGED' });
  assert.throws(() => validateRevision(cur, [{ no: 1, dueDate: '2026-12-20', amountC: 83300 }]), { code: 'ROW_LOCKED' });
  assert.throws(() => validateRevision(cur, [{ no: 2, dueDate: '2027-01-15', amountC: 10000 }, { no: 3, dueDate: '2027-02-15', amountC: 156700 }]), { code: 'BELOW_PAID' });
  assert.throws(() => validateRevision(cur, [{ no: 3, dueDate: '2027-02-30', amountC: 83400 }]), { code: 'INVALID_DATE' });
});
