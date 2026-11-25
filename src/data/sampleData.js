/*
 * Sample data for testing (D-025). Created through the real services, so stock, movements and the activity log
 * stay consistent. Safe to run more than once: records whose name already exists are skipped.
 * Each phase adds its own set here.
 */
import { UNITS } from '../domain/quantity.js';
import { today, addDays } from '../domain/dates.js';
import { createItem, adjustStock, openSack } from './inventoryService.js';

const P = (pesos) => Math.round(pesos * 100);

// Phase 4 — items. linkTo = name of the sack item a per-kg item is linked to.
const ITEMS = [
  { name: 'Dinorado 50kg Sack', variety: 'Dinorado', category: 'Premium', unit: UNITS.SACK, sackWeightKg: 50, price: 3250, cost: 2900, min: 5, opening: 20 },
  { name: 'Dinorado per KG', variety: 'Dinorado', category: 'Premium', unit: UNITS.KG, linkTo: 'Dinorado 50kg Sack', price: 68, cost: 58, min: 25, opening: 40.5 },
  { name: 'Jasmine 25kg Sack', variety: 'Jasmine', category: 'Premium', unit: UNITS.SACK, sackWeightKg: 25, price: 1650, cost: 1450, min: 4, opening: 3 },
  { name: 'Jasmine per KG', variety: 'Jasmine', category: 'Premium', unit: UNITS.KG, linkTo: 'Jasmine 25kg Sack', price: 70, cost: 58, min: 10, opening: 0 },
  { name: 'Sinandomeng 50kg Sack', variety: 'Sinandomeng', category: 'Regular', unit: UNITS.SACK, sackWeightKg: 50, price: 2600, cost: 2300, min: 5, opening: 12 },
  { name: 'Sinandomeng per KG', variety: 'Sinandomeng', category: 'Regular', unit: UNITS.KG, linkTo: 'Sinandomeng 50kg Sack', price: 54, cost: 46, min: 25, opening: 55 },
  { name: 'Malagkit per KG', variety: 'Malagkit', category: 'Glutinous', unit: UNITS.KG, price: 80, cost: 65, min: 10, opening: 8 },
  { name: 'Brown Rice 25kg Sack', variety: 'Brown', category: 'Brown', unit: UNITS.SACK, sackWeightKg: 25, price: 1900, cost: 1650, min: 2, opening: 6 },
  { name: 'NFA Well-milled 50kg Sack', variety: 'NFA', category: 'Well-milled', unit: UNITS.SACK, sackWeightKg: 50, price: 2150, cost: 1900, min: 3, opening: 0 },
];

/** Returns { created, skipped } counts. */
export async function loadSampleData(adapter, actor) {
  const existing = await adapter.query('items', {});
  const byName = new Map(existing.map((i) => [i.nameLower, i.id]));
  const ids = {};
  let created = 0, skipped = 0;
  const start = addDays(today(), -14);

  for (const s of ITEMS) {
    const key = s.name.toLowerCase();
    if (byName.has(key)) { ids[s.name] = byName.get(key); skipped++; continue; }
    ids[s.name] = await createItem(adapter, actor, {
      name: s.name, nameLower: key, variety: s.variety, category: s.category, unit: s.unit,
      sackWeightKg: s.sackWeightKg || null, linkedSackItemId: s.linkTo ? ids[s.linkTo] : null,
      sku: '', description: '', priceC: P(s.price), costC: P(s.cost), minStockH: s.min * 100,
      openingQtyH: Math.round(s.opening * 100), openingDate: start,
    });
    created++;
  }

  // A little history so the movement screens have something to show (only on a fresh load).
  if (created === ITEMS.length) {
    await openSack(adapter, actor, { sackItemId: ids['Sinandomeng 50kg Sack'], sacks: 1, kgCostC: P(46), date: addDays(start, 3) });
    await adjustStock(adapter, actor, { itemId: ids['Dinorado per KG'], direction: 'OUT', qtyH: 150, reason: 'Spillage', note: '', date: addDays(start, 5) });
    await adjustStock(adapter, actor, { itemId: ids['Malagkit per KG'], direction: 'OUT', qtyH: 200, reason: 'Spoilage/Pests', note: '', date: addDays(start, 8) });
  }
  return { created, skipped };
}
