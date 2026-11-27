/* Phase 13 domain: batches oldest first (D-050), ids (D-051), weighted price (D-052), first batch for old stock (D-055), charges (D-054). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  supplierCode, batchIdFor, coveredH, uncoveredH, displayPrice, batchStockValueC, blendedPriceC, takenCostC, avgUnitCostC,
  takeFromBatches, addBatch, returnToBatches, removeStock, addFoundStock, allocateLines, coverUncovered, needsNewBatch, validateBatchEdit, defaultKgCost,
} from '../../src/domain/batches.js';
import { planSale, suggestedPrices } from '../../src/domain/sales.js';
import { computeTotals, validateCharges } from '../../src/domain/saleTotals.js';

const B = (id, date, qtyH, unitCostC, priceC) => ({ id, date, qtyH, receivedQtyH: qtyH, unitCostC, priceC, source: 'RESTOCK' });
const sack = (o = {}) => ({
  id: 's', name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: 50, status: 'ACTIVE', qtyH: 500, costC: 290000, priceC: 150000,
  batches: [B('RJ-RS-SUP001-0001', '2026-11-01', 200, 140000, 150000), B('RJ-RS-SUP001-0002', '2026-11-10', 300, 145000, 155000)], ...o,
});

test('ids: SUP001 and RJ-RS-SUP001-0001', () => {
  assert.equal(supplierCode(1), 'SUP001');
  assert.equal(supplierCode(12), 'SUP012');
  assert.equal(batchIdFor('SUP001', 1), 'RJ-RS-SUP001-0001');
  assert.equal(batchIdFor('OLD', 23), 'RJ-RS-OLD-0023');
});

test('covered / uncovered stock and shown price (oldest batch, hint for next)', () => {
  const it = sack({ qtyH: 700 });
  assert.equal(coveredH(it), 500);
  assert.equal(uncoveredH(it), 200);
  assert.deepEqual(displayPrice(it), { priceC: 150000, nextPriceC: 155000 });
  assert.deepEqual(displayPrice({ priceC: 999, batches: [] }), { priceC: 999, nextPriceC: null });
  // 2 × 1400 + 3 × 1450 + 2 uncovered × item cost 2900
  assert.equal(batchStockValueC(it), 280000 + 435000 + 580000);
});

test('D-052 weighted average: 2 × ₱1,500 + 3 × ₱1,550 = ₱1,530', () => {
  const r = takeFromBatches(sack(), 500);
  assert.equal(blendedPriceC(r.taken), 153000);
  assert.equal(takenCostC(r.taken), 2 * 140000 + 3 * 145000);
  assert.equal(avgUnitCostC(r.taken), 143000);
  assert.equal(r.batches.length, 0);
});

test('take: oldest first; override takes only the named batch; not enough → NOT_ENOUGH_BATCH', () => {
  const r = takeFromBatches(sack(), 300);
  assert.deepEqual(r.taken.map((t) => [t.batchId, t.qtyH]), [['RJ-RS-SUP001-0001', 200], ['RJ-RS-SUP001-0002', 100]]);
  assert.deepEqual(r.batches.map((b) => [b.id, b.qtyH]), [['RJ-RS-SUP001-0002', 200]]);
  const o = takeFromBatches(sack(), 100, { batchId: 'RJ-RS-SUP001-0002' });
  assert.deepEqual(o.taken.map((t) => t.batchId), ['RJ-RS-SUP001-0002']);
  assert.throws(() => takeFromBatches(sack(), 300, { batchId: 'RJ-RS-SUP001-0001' }), { code: 'NOT_ENOUGH_BATCH' });
  assert.throws(() => takeFromBatches(sack(), 600), { code: 'NOT_ENOUGH_BATCH' });
  assert.throws(() => takeFromBatches(sack(), 100, { batchId: 'nope' }), { code: 'BATCH_MISSING' });
});

test('return: same batch gets the quantity back; a used-up batch comes back in date order', () => {
  const it = sack();
  const r = takeFromBatches(it, 300);
  const back = returnToBatches({ ...it, batches: r.batches }, r.taken);
  assert.deepEqual(back.map((b) => [b.id, b.qtyH]), [['RJ-RS-SUP001-0001', 200], ['RJ-RS-SUP001-0002', 300]]);
});

test('add: merge on same id+cost+price, suffix on same id with another cost, date order kept', () => {
  const it = sack();
  const m = addBatch(it, { id: 'RJ-RS-SUP001-0002', date: '2026-11-10', qtyH: 100, unitCostC: 145000, priceC: 155000 });
  assert.equal(m.batches.find((b) => b.id === 'RJ-RS-SUP001-0002').qtyH, 400);
  const d = addBatch(it, { id: 'RJ-RS-SUP001-0002', date: '2026-11-10', qtyH: 100, unitCostC: 1, priceC: 2 });
  assert.equal(d.id, 'RJ-RS-SUP001-0002/2');
  const early = addBatch(it, { id: 'X', date: '2026-10-01', qtyH: 100, unitCostC: 1, priceC: 2 });
  assert.equal(early.batches[0].id, 'X');
});

test('adjustments: out takes stock not in a batch first, then oldest; in goes to newest batch or stays outside', () => {
  const r = removeStock(sack({ qtyH: 600 }), 200);
  assert.equal(r.fromUncoveredH, 100);
  assert.deepEqual(r.taken.map((t) => [t.batchId, t.qtyH]), [['RJ-RS-SUP001-0001', 100]]);
  const a = addFoundStock(sack(), 100);
  assert.equal(a.batchId, 'RJ-RS-SUP001-0002');
  assert.deepEqual(addFoundStock({ name: 'x', batches: [] }, 100), { batches: [], batchId: null });
});

test('D-055: stock not in a batch belongs to the first batch', () => {
  const it = sack({ qtyH: 700 });
  const c = coverUncovered(it, null, '2026-11-27');
  assert.equal(c.batches[0].qtyH, 400);
  assert.equal(uncoveredH(c), 0);
  const old = { id: 'k', name: 'Old', unit: 'SACK', qtyH: 1000, costC: 2900, priceC: 3250 };
  assert.ok(needsNewBatch(old));
  const n = coverUncovered(old, 'RJ-RS-OLD-0001', '2026-11-27');
  assert.deepEqual(n.batches.map((b) => [b.id, b.qtyH, b.unitCostC, b.priceC, b.source]), [['RJ-RS-OLD-0001', 1000, 2900, 3250, 'OLD']]);
  assert.throws(() => coverUncovered(old, null, '2026-11-27'), { code: 'BATCH_ID_NEEDED' });
  const full = sack();
  assert.equal(coverUncovered(full, null, 'x'), full);
});

test('allocateLines: picked batches are served before automatic lines', () => {
  const items = { s: sack() };
  const r = allocateLines([{ itemId: 's', qtyH: 200 }, { itemId: 's', qtyH: 200, batchId: 'RJ-RS-SUP001-0001' }], items);
  assert.deepEqual(r.taken[1].map((t) => t.batchId), ['RJ-RS-SUP001-0001']);
  assert.deepEqual(r.taken[0].map((t) => t.batchId), ['RJ-RS-SUP001-0002']);
  assert.throws(() => allocateLines([{ itemId: 's', qtyH: 300 }, { itemId: 's', qtyH: 300 }], items), { code: 'NOT_ENOUGH_BATCH' });
});

test('planSale: weighted list price, exact batch cost, batches on the line, payday price on pay-later terms', () => {
  const customer = { id: 'c1', name: 'Ana', status: 'ACTIVE' };
  const items = { s: sack({ installmentPriceC: 160000 }) };
  const p = planSale({ saleDate: '2026-11-20', customerId: 'c1', lines: [{ itemId: 's', qtyH: 500 }], terms: 'FULL', method: 'CASH', discount: { type: 'NONE' } },
    { itemsById: items, customer, today: '2026-11-27' });
  const l = p.saleLines[0];
  assert.equal(l.listPriceC, 153000);
  assert.equal(l.unitPriceC, 153000);
  assert.equal(l.costC, 715000);
  assert.equal(l.batches.length, 2);
  assert.equal(p.totals.totalC, 765000);
  assert.deepEqual(p.batchesByItem.s, []);
  assert.deepEqual(suggestedPrices([{ itemId: 's', qtyH: 100 }], items, 'INSTALLMENT'), [160000]);
  assert.deepEqual(suggestedPrices([{ itemId: 's', qtyH: 100 }], { s: sack() }, 'OPEN_BALANCE'), [150000]);
});

test('D-054 charges: validated, added after discount, not in profit', () => {
  assert.deepEqual(validateCharges([{ name: ' Delivery  fee ', amountC: 5000 }, { name: '', amountC: null }]), [{ name: 'Delivery fee', amountC: 5000 }]);
  assert.throws(() => validateCharges([{ name: '', amountC: 100 }]), { code: 'INVALID_CHARGE' });
  assert.throws(() => validateCharges([{ name: 'Fee', amountC: 0 }]), { code: 'INVALID_CHARGE' });
  const t = computeTotals([{ itemId: 's', unit: 'SACK', qtyH: 100, unitPriceC: 100000, unitCostC: 80000 }], { type: 'PERCENT', value: 1000 }, [{ name: 'Delivery fee', amountC: 5000 }]);
  assert.equal(t.subtotalC, 100000);
  assert.equal(t.discountC, 10000);
  assert.equal(t.chargesC, 5000);
  assert.equal(t.totalC, 95000);
  assert.equal(t.grossProfitC, 10000);
});

test('batch edit form and kg cost from a sack batch', () => {
  assert.deepEqual(validateBatchEdit({ unitCost: '1400', price: '1500' }).data, { unitCostC: 140000, priceC: 150000 });
  assert.ok(validateBatchEdit({ unitCost: '', price: '-1' }).errors.price);
  assert.equal(defaultKgCost(140000, 50), 2800);
});
