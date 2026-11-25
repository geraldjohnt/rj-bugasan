import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateItemForm, applyDelta, validateAdjustment, planOpenSack, planCount, stockStatus, stockValueC,
  inventorySummary, defaultKgCostC, parseSackWeight,
} from '../../src/domain/inventory.js';

const form = (o = {}) => ({ name: 'Dinorado 50kg Sack', unit: 'SACK', sackWeightKg: '50', priceC: '3,250', costC: '2900.50', minStock: '5', openingQty: '20', openingDate: '2026-11-25', ...o });

test('item form: valid sack item parses money and quantities', () => {
  const { data, errors } = validateItemForm(form());
  assert.deepEqual(errors, {});
  assert.equal(data.priceC, 325000);
  assert.equal(data.costC, 290050);
  assert.equal(data.minStockH, 500);
  assert.equal(data.openingQtyH, 2000);
  assert.equal(data.sackWeightKg, 50);
  assert.equal(data.nameLower, 'dinorado 50kg sack');
});

test('item form: required fields, whole sacks, duplicate names, kg decimals', () => {
  let r = validateItemForm(form({ name: '  ', priceC: '', sackWeightKg: '0', openingQty: '1.5' }));
  assert.equal(r.errors.name, 'Required.');
  assert.equal(r.errors.priceC, 'Required.');
  assert.ok(r.errors.sackWeightKg);
  assert.match(r.errors.openingQty, /whole/);
  r = validateItemForm(form(), { existingNames: new Set(['dinorado 50kg sack']) });
  assert.match(r.errors.name, /already/);
  r = validateItemForm(form({ unit: 'KG', name: 'Dinorado per KG', openingQty: '40.25', minStock: '0.5' }));
  assert.deepEqual(r.errors, {});
  assert.equal(r.data.openingQtyH, 4025);
  assert.equal(r.data.sackWeightKg, null);
  r = validateItemForm(form({ unit: 'KG', openingQty: '1.234' }));
  assert.ok(r.errors.openingQty);
  r = validateItemForm(form({ costC: '-1' }));
  assert.match(r.errors.costC, /negative/);
});

test('stock can never go negative; sacks stay whole (BR-014)', () => {
  const sack = { name: 'S', unit: 'SACK', qtyH: 300 };
  assert.equal(applyDelta(sack, -300), 0);
  assert.throws(() => applyDelta(sack, -400), (e) => e.code === 'NEGATIVE_STOCK');
  assert.throws(() => applyDelta(sack, -50), (e) => e.code === 'INVALID_QTY');
  assert.equal(applyDelta({ unit: 'KG', qtyH: 100 }, -1), 99);
});

test('adjustment needs a reason, and a note for Other (BR-013)', () => {
  const base = { direction: 'OUT', qtyH: 100, reason: 'Spillage', note: '', date: '2026-11-25' };
  assert.deepEqual(validateAdjustment(base, 'KG').errors, {});
  assert.equal(validateAdjustment(base, 'KG').deltaH, -100);
  assert.ok(validateAdjustment({ ...base, reason: '' }, 'KG').errors.reason);
  assert.ok(validateAdjustment({ ...base, reason: 'Other' }, 'KG').errors.note);
  assert.deepEqual(validateAdjustment({ ...base, reason: 'Other', note: 'Gift' }, 'KG').errors, {});
  assert.ok(validateAdjustment({ ...base, qtyH: 0 }, 'KG').errors.qty);
});

test('open sack plan and default kg cost (BR-016)', () => {
  assert.equal(defaultKgCostC(290000, 50), 5800);
  assert.equal(defaultKgCostC(100000, 3), 33333); // ₱1,000 / 3 kg = 333.33
  assert.equal(parseSackWeight('25.5'), 25.5);
  const sack = { id: 's', name: 'S', unit: 'SACK', qtyH: 200, sackWeightKg: 25.5, linkedKgItemId: 'k', status: 'ACTIVE' };
  const kg = { id: 'k', name: 'K', unit: 'KG', qtyH: 150, linkedSackItemId: 's', status: 'ACTIVE' };
  const p = planOpenSack(sack, kg, 2, 6000);
  assert.deepEqual(p, { sackDeltaH: -200, kgDeltaH: 5100, kgCostC: 6000, sackAfterH: 0, kgAfterH: 5250 });
  assert.throws(() => planOpenSack(sack, kg, 3, 6000), (e) => e.code === 'NEGATIVE_STOCK');
  assert.throws(() => planOpenSack(sack, { ...kg, linkedSackItemId: 'x' }, 1, 6000), (e) => e.code === 'NOT_LINKED');
  assert.throws(() => planOpenSack(sack, { ...kg, status: 'ARCHIVED' }, 1, 6000), (e) => e.code === 'ARCHIVED');
});

test('count plan compares with current stock and skips uncounted lines (BR-017)', () => {
  const items = { a: { id: 'a', name: 'A', unit: 'KG', qtyH: 1000 }, b: { id: 'b', name: 'B', unit: 'SACK', qtyH: 500 } };
  const plan = planCount([{ itemId: 'a', countedQtyH: 950 }, { itemId: 'b', countedQtyH: null }], items);
  assert.deepEqual(plan, [{ itemId: 'a', systemQtyH: 1000, countedQtyH: 950, diffH: -50 }]);
  assert.throws(() => planCount([{ itemId: 'b', countedQtyH: 450 }], items), (e) => e.code === 'INVALID_QTY');
});

test('low stock, out of stock and valuation (BR-015)', () => {
  assert.equal(stockStatus({ qtyH: 0, minStockH: 0 }), 'OUT');
  assert.equal(stockStatus({ qtyH: 500, minStockH: 500 }), 'LOW');
  assert.equal(stockStatus({ qtyH: 501, minStockH: 500 }), 'OK');
  assert.equal(stockStatus({ qtyH: 1, minStockH: 0 }), 'OK');
  assert.equal(stockValueC({ qtyH: 4050, costC: 5800 }), 234900); // 40.5 kg × ₱58
  assert.equal(stockValueC({ qtyH: 333, costC: 3333 }), 11099); // 3.33 × 33.33 = 110.9889 → 110.99
  const s = inventorySummary([
    { status: 'ACTIVE', qtyH: 0, minStockH: 0, costC: 100 },
    { status: 'ACTIVE', qtyH: 200, minStockH: 300, costC: 100 },
    { status: 'ARCHIVED', qtyH: 999, minStockH: 0, costC: 100 },
  ]);
  assert.deepEqual(s, { activeCount: 2, valueC: 200, lowCount: 1, outCount: 1 });
});
