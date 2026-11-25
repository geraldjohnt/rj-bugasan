/* Phase 9 (calendar) and Phase 10 (report aggregation) domain tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, gridRange, buildEvents, eventsByDate, validateEventForm, parseMonthKey, shiftMonth, CAL } from '../../src/domain/calendar.js';
import {
  salesSummary, profitByItem, netLineRevenue, cashCollected, expensesSummary, profitAndLoss, receivablesAging, inventoryValuation,
  movementReport, restocksBySupplier, dailySeries, toCsv, csvMoney, presets, marginBp,
} from '../../src/domain/reports.js';

const TODAY = '2026-11-25';

test('month grid: whole weeks, Sunday first, covers the month (incl. Feb leap year)', () => {
  const nov = monthGrid(2026, 11); // Nov 1, 2026 is a Sunday
  assert.equal(nov[0][0], '2026-11-01');
  assert.equal(nov.length, 5);
  assert.equal(nov[4][6], '2026-12-05');
  const feb = monthGrid(2028, 2); // Feb 1, 2028 is a Tuesday; 29 days
  assert.equal(feb[0][0], '2028-01-30');
  assert.ok(feb.flat().includes('2028-02-29'));
  assert.deepEqual(gridRange(2026, 11), { from: '2026-11-01', to: '2026-12-05' });
  assert.deepEqual(parseMonthKey('2026-02', TODAY), { y: 2026, m: 2 });
  assert.deepEqual(parseMonthKey('bad', TODAY), { y: 2026, m: 11 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 });
});

test('calendar events derived from sales, rows, deliveries, restocks and custom events (RQ-035)', () => {
  const ev = buildEvents({
    sales: [
      { id: 'RJ-2026-00001', status: 'ACTIVE', kind: 'SALE', saleDate: '2026-11-10', customerName: 'Nena', totalC: 100000, fulfillment: 'PENDING', deliveryDate: '2026-11-24' },
      { id: 'RJ-2026-00002', status: 'CANCELLED', kind: 'SALE', saleDate: '2026-11-11', customerName: 'X', totalC: 1, fulfillment: 'PENDING', deliveryDate: '2026-11-12' },
      { id: 'OB-2026-00001', status: 'ACTIVE', kind: 'OPENING_BALANCE', saleDate: '2026-11-01', customerName: 'Y', totalC: 5, fulfillment: 'PICKED_UP' },
    ],
    rows: [
      { id: 'RJ-2026-00001-1', saleId: 'RJ-2026-00001', customerName: 'Nena', kind: 'INSTALLMENT', no: 1, count: 3, dueDate: '2026-11-20', amountC: 30000, paidC: 10000, status: 'PARTIAL' },
      { id: 'RJ-2026-00001-2', saleId: 'RJ-2026-00001', customerName: 'Nena', kind: 'INSTALLMENT', no: 2, count: 3, dueDate: '2026-11-30', amountC: 30000, paidC: 0, status: 'PENDING' },
      { id: 'RJ-2026-00001-3', saleId: 'RJ-2026-00001', customerName: 'Nena', kind: 'INSTALLMENT', no: 3, count: 3, dueDate: '2026-12-15', amountC: 40000, paidC: 40000, status: 'PAID' },
      { id: 'Z-1', saleId: 'Z', customerName: 'Q', kind: 'OPEN_BALANCE', no: 1, count: 1, dueDate: null, amountC: 5, paidC: 0, status: 'PENDING' },
    ],
    restocks: [
      { id: 'RS-2026-00001', status: 'PARTIALLY_RECEIVED', supplierName: 'Golden', expectedDate: '2026-11-28', receipts: [{ date: '2026-11-21', lines: [] }] },
      { id: 'RS-2026-00002', status: 'CANCELLED', supplierName: 'Gone', expectedDate: '2026-11-28', receipts: [] },
    ],
    custom: [{ id: 'e1', title: 'Pay rent', date: '2026-11-30', time: '09:00', note: '' }],
  }, TODAY);
  const cats = (d) => ev.filter((e) => e.date === d).map((e) => e.category);
  assert.deepEqual(cats('2026-11-10'), [CAL.SALE]);
  assert.deepEqual(cats('2026-11-24'), [CAL.DELIVERY]);
  assert.equal(ev.find((e) => e.category === CAL.DELIVERY).late, true);
  assert.deepEqual(cats('2026-11-20'), [CAL.OVERDUE]);
  assert.match(ev.find((e) => e.date === '2026-11-20').title, /₱200\.00/); // remaining, not the full amount
  assert.deepEqual(cats('2026-11-30'), [CAL.PAYMENT_DUE, CAL.OTHER]);
  assert.equal(cats('2026-12-15').length, 0, 'paid rows are not shown');
  assert.deepEqual(cats('2026-11-21'), [CAL.RESTOCK]);
  assert.deepEqual(cats('2026-11-28'), [CAL.RESTOCK], 'cancelled restock hidden');
  assert.equal(cats('2026-11-11').length + cats('2026-11-12').length + cats('2026-11-01').length, 0, 'cancelled sale and opening balance hidden');
  const byDate = eventsByDate(ev, { ...Object.fromEntries(Object.values(CAL).map((c) => [c, true])), SALE: false });
  assert.equal(byDate['2026-11-10'], undefined);
  assert.equal(byDate['2026-11-30'].length, 2);
});

test('custom event form', () => {
  assert.deepEqual(validateEventForm({ title: 'Rent', date: '2026-11-30', time: '09:30' }).errors, {});
  assert.ok(validateEventForm({ title: '', date: '2026-11-30' }).errors.title);
  assert.ok(validateEventForm({ title: 'x', date: '2026-02-30' }).errors.date);
  assert.ok(validateEventForm({ title: 'x', date: '2026-11-30', time: '25:00' }).errors.time);
});

const sale = (o) => ({ status: 'ACTIVE', kind: 'SALE', discountC: 0, paidC: 0, balanceC: 0, ...o });
const SALES = [
  sale({ id: 'A', saleDate: '2026-11-02', totalC: 9000, discountC: 1000, costC: 6000, paidC: 9000,
    lines: [{ itemId: 'x', itemName: 'X', unit: 'KG', qtyH: 100, unitCostC: 2000, lineTotalC: 3333 }, { itemId: 'y', itemName: 'Y', unit: 'SACK', qtyH: 100, unitCostC: 4000, lineTotalC: 6667 }] }),
  sale({ id: 'B', saleDate: '2026-11-20', totalC: 5000, costC: 3000, balanceC: 5000, lines: [{ itemId: 'x', itemName: 'X', unit: 'KG', qtyH: 150, unitCostC: 2000, lineTotalC: 5000 }] }),
  sale({ id: 'C', saleDate: '2026-11-21', status: 'CANCELLED', totalC: 99999, costC: 1, lines: [] }),
  sale({ id: 'D', saleDate: '2026-10-31', totalC: 7777, costC: 1, lines: [] }),
  sale({ id: 'OB', kind: 'OPENING_BALANCE', saleDate: '2026-11-05', totalC: 50000, costC: 0, lines: [] }),
];

test('sales summary: revenue, COGS, gross profit; cancelled and opening balances excluded (RQ-036, BR-038)', () => {
  const s = salesSummary(SALES, '2026-11-01', '2026-11-30');
  assert.equal(s.count, 2);
  assert.equal(s.revenueC, 14000);
  assert.equal(s.cogsC, 9000);
  assert.equal(s.grossProfitC, 5000);
  assert.equal(s.cancelledCount, 1);
  assert.equal(marginBp(5000, 14000), 3571);
});

test('profit by item spreads the sale discount so item revenue adds up to revenue', () => {
  assert.deepEqual(netLineRevenue(SALES[0]), [3000, 6000]);
  const odd = netLineRevenue({ discountC: 100, lines: [{ lineTotalC: 3333 }, { lineTotalC: 3333 }, { lineTotalC: 3334 }] });
  assert.equal(odd.reduce((a, b) => a + b, 0), 10000 - 100, 'discount fully spread, never lost to rounding');
  assert.ok(odd.every((v) => v >= 3299 && v <= 3301));
  const rows = profitByItem(SALES, '2026-11-01', '2026-11-30');
  const x = rows.find((r) => r.itemId === 'x');
  assert.equal(x.qtyH, 250);
  assert.equal(x.revenueC, 3000 + 5000);
  assert.equal(x.cogsC, 2000 + 3000);
  assert.equal(rows.reduce((a, r) => a + r.revenueC, 0), salesSummary(SALES, '2026-11-01', '2026-11-30').revenueC);
});

test('cash collected, expenses and net profit (RQ-037)', () => {
  const pays = [
    { status: 'ACTIVE', date: '2026-11-02', amountC: 9000, method: 'CASH' },
    { status: 'ACTIVE', date: '2026-11-22', amountC: 1000, method: 'EWALLET' },
    { status: 'VOIDED', date: '2026-11-22', amountC: 555, method: 'CASH' },
    { status: 'ACTIVE', date: '2026-12-01', amountC: 1, method: 'CASH' },
  ];
  const c = cashCollected(pays, '2026-11-01', '2026-11-30');
  assert.equal(c.totalC, 10000);
  assert.equal(c.byMethod.EWALLET, 1000);
  const ex = [
    { status: 'ACTIVE', date: '2026-11-03', category: 'Rent', amountC: 2000 },
    { status: 'ACTIVE', date: '2026-11-04', category: 'Delivery/Fuel', amountC: 500 },
    { status: 'VOIDED', date: '2026-11-04', category: 'Rent', amountC: 2000 },
  ];
  const e = expensesSummary(ex, '2026-11-01', '2026-11-30');
  assert.equal(e.totalC, 2500);
  assert.equal(e.voidedCount, 1);
  const pl = profitAndLoss(SALES, ex, '2026-11-01', '2026-11-30');
  assert.equal(pl.netProfitC, 5000 - 2500);
});

test('receivables aging buckets (BR §7): current incl. no due date, 1–30, 31–60, 61+', () => {
  const row = (o) => ({ status: 'PENDING', paidC: 0, customerId: 'c1', customerName: 'Nena', ...o });
  const a = receivablesAging([
    row({ dueDate: '2026-11-25', amountC: 100 }), // due today → current
    row({ dueDate: null, amountC: 50 }),
    row({ dueDate: '2026-11-24', amountC: 200 }), // 1 day
    row({ dueDate: '2026-10-26', amountC: 300, status: 'PARTIAL', paidC: 100 }), // 30 days → 1–30, remaining 200
    row({ dueDate: '2026-10-25', amountC: 400, customerId: 'c2', customerName: 'Bong' }), // 31
    row({ dueDate: '2026-09-25', amountC: 500, customerId: 'c2', customerName: 'Bong' }), // 61
    row({ dueDate: '2026-09-25', amountC: 999, status: 'PAID', paidC: 999 }),
    row({ dueDate: '2026-09-25', amountC: 999, status: 'CANCELLED' }),
  ], TODAY);
  assert.deepEqual(a.totals, { CURRENT: 150, D1_30: 400, D31_60: 400, D61_PLUS: 500 });
  assert.equal(a.totalC, 1450);
  assert.equal(a.overdueC, 1300);
  assert.equal(a.customers[0].customerName, 'Bong');
  assert.equal(a.customers[0].daysOverdue, 61);
});

test('inventory valuation, movements & losses, restocks by supplier', () => {
  const v = inventoryValuation([{ id: 'i', name: 'A', status: 'ACTIVE', qtyH: 250, costC: 4000, priceC: 5000, minStockH: 0 }, { id: 'j', name: 'B', status: 'ARCHIVED', qtyH: 100, costC: 1, priceC: 1, minStockH: 0 }]);
  assert.equal(v.valueC, 10000);
  assert.equal(v.retailC, 12500);
  assert.equal(v.rows.length, 1);
  const m = movementReport([
    { businessDate: '2026-11-03', type: 'ADJUSTMENT', qtyDeltaH: -150, unitCostC: 5800, itemId: 'k', itemName: 'KG', unit: 'KG', reason: 'Spillage' },
    { businessDate: '2026-11-04', type: 'COUNT_ADJUSTMENT', qtyDeltaH: -100, unitCostC: 5800, itemId: 'k', itemName: 'KG', unit: 'KG', reason: 'Stock count' },
    { businessDate: '2026-11-05', type: 'ADJUSTMENT', qtyDeltaH: 100, unitCostC: 5800, itemId: 'k', itemName: 'KG', unit: 'KG', reason: 'Count correction' },
    { businessDate: '2026-11-06', type: 'RESTOCK_RECEIPT', qtyDeltaH: 1000, unitCostC: 290000, itemId: 's', itemName: 'S', unit: 'SACK' },
    { businessDate: '2026-12-01', type: 'ADJUSTMENT', qtyDeltaH: -100, unitCostC: 1, itemId: 'k', itemName: 'KG', unit: 'KG', reason: 'Spillage' },
  ], '2026-11-01', '2026-11-30');
  assert.equal(m.lossC, 8700 + 5800);
  assert.equal(m.losses.length, 2);
  assert.equal(m.byType.find((t) => t.type === 'RESTOCK_RECEIPT').valueInC, 2900000);
  const r = restocksBySupplier([
    { id: 'R1', supplierId: 'g', supplierName: 'Golden', receipts: [{ date: '2026-11-10', lines: [{ unit: 'SACK', qtyH: 500, unitCostC: 290000 }] }, { date: '2026-12-02', lines: [{ unit: 'SACK', qtyH: 500, unitCostC: 1 }] }] },
    { id: 'R2', supplierId: 'g', supplierName: 'Golden', receipts: [{ date: '2026-11-12', lines: [{ unit: 'KG', qtyH: 2500, unitCostC: 5000 }] }] },
  ], '2026-11-01', '2026-11-30');
  assert.equal(r.rows[0].receipts, 2);
  assert.equal(r.rows[0].orders, 2);
  assert.equal(r.rows[0].valueC, 1450000 + 125000);
});

test('daily series, presets and CSV escaping (RQ-039)', () => {
  const d = dailySeries(SALES, [{ status: 'ACTIVE', date: '2026-11-20', amountC: 700 }], TODAY, 7);
  assert.equal(d.length, 7);
  assert.equal(d[6].date, TODAY);
  assert.equal(d.find((x) => x.date === '2026-11-20').revenueC, 5000);
  assert.equal(d.find((x) => x.date === '2026-11-20').cashC, 700);
  const p = Object.fromEntries(presets(TODAY).map((x) => [x.value, x]));
  assert.deepEqual([p.month.from, p.month.to], ['2026-11-01', '2026-11-30']);
  assert.deepEqual([p.lastMonth.from, p.lastMonth.to], ['2026-10-01', '2026-10-31']);
  assert.deepEqual([presets('2026-01-10').find((x) => x.value === 'lastMonth').from], ['2025-12-01']);
  const csv = toCsv([{ header: 'Name', value: (r) => r.n }, { header: 'Amount', value: (r) => csvMoney(r.c) }], [{ n: 'Aling "Nena", Store', c: 123456 }, { n: 'B', c: -5 }]);
  assert.equal(csv, 'Name,Amount\r\n"Aling ""Nena"", Store",1234.56\r\nB,-0.05\r\n');
});
