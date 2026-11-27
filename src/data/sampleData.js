/*
 * Sample data for testing (D-025). Created through the real services, so stock, movements and the activity log
 * stay consistent. Safe to run more than once: records whose name already exists are skipped.
 * Each phase adds its own set here.
 */
import { UNITS } from '../domain/quantity.js';
import { listPriceFor } from '../domain/inventory.js';
import { today, addDays } from '../domain/dates.js';
import { createItem, adjustStock, openSack } from './inventoryService.js';
import { validateCustomerForm, validateContactForm } from '../domain/customers.js';
import { createCustomer, saveContact, ensureWalkIn } from './customerService.js';
import { createSale, cancelSale, updateFulfillment } from './salesService.js';
import { recordPayment, voidPayment } from './paymentService.js';
import { DEFAULT_SALES_SETTINGS } from '../domain/sales.js';
import { validateSupplierForm, validateRestockForm, validateExpenseForm } from '../domain/purchasing.js';
import { validateEventForm } from '../domain/calendar.js';
import { createSupplier, createRestock, receiveRestock, cancelRestock, createExpense, voidExpense } from './purchasingService.js';
import { createEvent } from './calendarService.js';
import { createOpeningBalance } from './openingBalanceService.js';

const P = (pesos) => Math.round(pesos * 100);

// Phase 4 — items (payday = installment / pay-later price, D-046). linkTo = name of the sack item a per-kg item is linked to.
const ITEMS = [
  { name: 'Dinorado 50kg Sack', variety: 'Dinorado', category: 'Premium', unit: UNITS.SACK, sackWeightKg: 50, price: 3250, payday: 3500, cost: 2900, min: 5, opening: 20 },
  { name: 'Dinorado per KG', variety: 'Dinorado', category: 'Premium', unit: UNITS.KG, linkTo: 'Dinorado 50kg Sack', price: 68, payday: 72, cost: 58, min: 25, opening: 40.5 },
  { name: 'Jasmine 25kg Sack', variety: 'Jasmine', category: 'Premium', unit: UNITS.SACK, sackWeightKg: 25, price: 1650, payday: 1800, cost: 1450, min: 4, opening: 3 },
  { name: 'Jasmine per KG', variety: 'Jasmine', category: 'Premium', unit: UNITS.KG, linkTo: 'Jasmine 25kg Sack', price: 70, payday: 75, cost: 58, min: 10, opening: 0 },
  { name: 'Sinandomeng 50kg Sack', variety: 'Sinandomeng', category: 'Regular', unit: UNITS.SACK, sackWeightKg: 50, price: 2600, payday: 2800, cost: 2300, min: 5, opening: 12 },
  { name: 'Sinandomeng per KG', variety: 'Sinandomeng', category: 'Regular', unit: UNITS.KG, linkTo: 'Sinandomeng 50kg Sack', price: 54, payday: 58, cost: 46, min: 25, opening: 55 },
  { name: 'Malagkit per KG', variety: 'Malagkit', category: 'Glutinous', unit: UNITS.KG, price: 80, payday: 85, cost: 65, min: 10, opening: 8 },
  { name: 'Brown Rice 25kg Sack', variety: 'Brown', category: 'Brown', unit: UNITS.SACK, sackWeightKg: 25, price: 1900, payday: 2050, cost: 1650, min: 2, opening: 6 },
  { name: 'NFA Well-milled 50kg Sack', variety: 'NFA', category: 'Well-milled', unit: UNITS.SACK, sackWeightKg: 50, price: 2150, payday: 2320, cost: 1900, min: 3, opening: 0 },
];

/** Returns { created, skipped, customers, sales, suppliers, restocks, expenses, events } counts. `asOf` = today's business date (tests pass a fixed one). */
export async function loadSampleData(adapter, actor, asOf = today()) {
  const existing = await adapter.query('items', {});
  const byName = new Map(existing.map((i) => [i.nameLower, i.id]));
  const ids = {};
  let created = 0, skipped = 0;
  const start = addDays(asOf, -90);

  for (const s of ITEMS) {
    const key = s.name.toLowerCase();
    if (byName.has(key)) { ids[s.name] = byName.get(key); skipped++; continue; }
    ids[s.name] = await createItem(adapter, actor, {
      name: s.name, nameLower: key, variety: s.variety, category: s.category, unit: s.unit,
      sackWeightKg: s.sackWeightKg || null, linkedSackItemId: s.linkTo ? ids[s.linkTo] : null,
      sku: '', description: '', priceC: P(s.price), installmentPriceC: s.payday ? P(s.payday) : null, costC: P(s.cost), minStockH: s.min * 100,
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
  const c = await loadCustomersAndSales(adapter, actor, asOf, ids);
  const p = await loadPurchasing(adapter, actor, asOf, ids);
  return { created, skipped, ...c, ...p };
}

// Phase 5 — customers (with alternate contacts). Phase 6/7 — sales, payments, a voided payment and a cancelled sale.
const CUSTOMERS = [
  { name: "Aling Nena's Sari-sari Store", type: 'Store', contactNumber: '0917 555 0101', address: 'Purok 3, Brgy. San Isidro', creditLimit: '10000',
    contacts: [{ name: 'Mario Santos', relationship: 'Son', contactNumber: '0918 555 0102', isPrimary: true }, { name: 'Liza Cruz', relationship: 'Neighbor', facebook: 'facebook.com/liza.cruz' }] },
  { name: 'Mang Tonyo Carinderia', type: 'Carinderia', contactNumber: '0920 555 0201', address: 'Market Road, Stall 12', notes: 'Pays every Saturday.' },
  { name: 'Josie Reyes', type: 'Household', contactNumber: '0915 555 0301', facebook: 'facebook.com/josie.reyes',
    contacts: [{ name: 'Ramon Reyes', relationship: 'Husband', contactNumber: '0916 555 0302', isPrimary: true }] },
  { name: "Bong's Rice Trading", type: 'Reseller', contactNumber: '0927 555 0401', email: 'bongs.rice@example.com', address: 'Highway, Km 5', creditLimit: '30000' },
  { name: 'Carmen Dela Cruz', type: 'Household', contactNumber: '0939 555 0501' },
];

async function loadCustomersAndSales(adapter, actor, asOf, itemIds) {
  await ensureWalkIn(adapter, actor);
  const existing = await adapter.query('customers', {});
  const byName = new Map(existing.map((c) => [c.nameLower, c.id]));
  const cid = {};
  let customers = 0;
  for (const s of CUSTOMERS) {
    const key = s.name.toLowerCase();
    if (byName.has(key)) { cid[s.name] = byName.get(key); continue; }
    const { data, errors } = validateCustomerForm(s);
    if (Object.keys(errors).length) throw new Error('Invalid sample customer ' + s.name);
    cid[s.name] = await createCustomer(adapter, actor, data);
    for (const ct of s.contacts || []) await saveContact(adapter, actor, cid[s.name], validateContactForm(ct).data);
    customers++;
  }
  // Sales only on a fresh load (all sample customers and items were just created), so a second run adds nothing.
  if (customers !== CUSTOMERS.length || Object.keys(itemIds).length !== ITEMS.length) return { customers, sales: 0, openingBalances: 0 };
  const it = async (name) => adapter.get('items', itemIds[name]);
  const line = async (name, qty, terms = 'FULL') => { const i = await it(name); return { itemId: i.id, qtyH: Math.round(qty * 100), unitPriceC: listPriceFor(i, terms) }; };
  const sell = (input) => createSale(adapter, actor, { discount: { type: 'NONE' }, method: 'CASH', fulfillment: 'PICKED_UP', ...input }, DEFAULT_SALES_SETTINGS, asOf);
  const rowsOf = async (saleId) => (await adapter.query('installments', { where: [['saleId', '==', saleId]] })).sort((a, b) => a.no - b.no);
  let sales = 0;

  // 1. Installment sale 75 days ago: first installment paid on time; a mistaken payment voided; later rows overdue.
  const d1 = addDays(asOf, -75);
  const s1 = await sell({ saleDate: d1, customerId: cid[CUSTOMERS[0].name], lines: [await line('Sinandomeng 50kg Sack', 3, 'INSTALLMENT')], terms: 'INSTALLMENT',
    plan: { count: 3, frequency: 'MONTHLY_15', downPaymentC: P(1000) }, fulfillment: 'DELIVERED', deliveryDate: addDays(d1, 1), notes: 'Deliver to the store.' });
  const r1 = await rowsOf(s1.saleId);
  await recordPayment(adapter, actor, { saleId: s1.saleId, date: r1[0].dueDate, amountC: r1[0].amountC, method: 'CASH' }, asOf);
  const dup = await recordPayment(adapter, actor, { saleId: s1.saleId, date: r1[0].dueDate, amountC: r1[0].amountC, method: 'CASH' }, asOf);
  await voidPayment(adapter, actor, dup.paymentId, 'Recorded twice by mistake');
  sales++;

  // 2. Open balance, partly paid, overdue.
  const d2 = addDays(asOf, -40);
  await sell({ saleDate: d2, customerId: cid[CUSTOMERS[1].name], lines: [await line('Dinorado 50kg Sack', 2, 'OPEN_BALANCE')], terms: 'OPEN_BALANCE', paidNowC: P(2000), dueDate: addDays(asOf, -10) });
  sales++;

  // 3. Installment, twice a month, with an e-wallet payment.
  const d3 = addDays(asOf, -20);
  const s3 = await sell({ saleDate: d3, customerId: cid[CUSTOMERS[2].name], lines: [await line('Jasmine 25kg Sack', 1, 'INSTALLMENT'), await line('Malagkit per KG', 2, 'INSTALLMENT')],
    terms: 'INSTALLMENT', plan: { count: 4, frequency: 'SEMI_MONTHLY', downPaymentC: 0 } });
  await recordPayment(adapter, actor, { saleId: s3.saleId, date: addDays(asOf, -2), amountC: P(300), method: 'EWALLET', reference: 'GCash 1029384756' }, asOf);
  sales++;

  // 4. Reseller, paid in full by bank transfer, discount, pending delivery.
  await sell({ saleDate: addDays(asOf, -5), customerId: cid[CUSTOMERS[3].name], lines: [await line('Brown Rice 25kg Sack', 3)], terms: 'FULL', method: 'BANK',
    reference: 'BPI 55120', discount: { type: 'PERCENT', value: 500 }, fulfillment: 'PENDING', deliveryDate: addDays(asOf, 2) });
  sales++;

  // 5. Walk-in cash sales (per kg and a sack).
  await sell({ saleDate: addDays(asOf, -3), customerId: 'WALK_IN', lines: [await line('Sinandomeng per KG', 5), await line('Dinorado per KG', 2.5)], terms: 'FULL' });
  await sell({ saleDate: asOf, customerId: 'WALK_IN', lines: [await line('Dinorado 50kg Sack', 1)], terms: 'FULL', method: 'EWALLET' });
  sales += 2;

  // 6. A cancelled sale (stock returned, payment refunded).
  const s6 = await sell({ saleDate: addDays(asOf, -1), customerId: cid[CUSTOMERS[4].name], lines: [await line('Sinandomeng per KG', 10, 'OPEN_BALANCE')], terms: 'OPEN_BALANCE', paidNowC: P(200) });
  await cancelSale(adapter, actor, s6.saleId, 'Customer changed the order');
  sales++;
  await updateFulfillment(adapter, actor, s1.saleId, { fulfillment: 'DELIVERED', deliveryDate: addDays(d1, 1), notes: 'Deliver to the store.' });

  // Phase 11 — opening balances carried over from the Excel records: one in 2 installments (first overdue), one plain balance.
  await createOpeningBalance(adapter, actor, { customerId: cid[CUSTOMERS[4].name], originalDate: addDays(asOf, -120), description: '4 sacks Sinandomeng (Excel ledger)',
    rows: [{ dueDate: addDays(asOf, -15), amount: '2600' }, { dueDate: addDays(asOf, 15), amount: '2600' }] }, asOf);
  const ob2 = await createOpeningBalance(adapter, actor, { customerId: cid[CUSTOMERS[1].name], originalDate: addDays(asOf, -100), description: 'Old balance from notebook', rows: [{ dueDate: '', amount: '1250' }] }, asOf);
  await recordPayment(adapter, actor, { saleId: ob2.saleId, date: addDays(asOf, -7), amountC: P(500), method: 'CASH' }, asOf);
  return { customers, sales, openingBalances: 2 };
}

// Phase 8 — suppliers, restocks (received with a cost change, partly received, ordered, cancelled) and expenses.
// Phase 9 — custom calendar events. Phase 10 (reports, dashboard) needs no data of its own: it reads all of the above.
const SUPPLIERS = [
  { name: 'Golden Grains Trading', contactPerson: 'Mr. Lim', contactNumber: '0917 555 9001', address: 'Nueva Ecija', email: 'orders@goldengrains.example.com' },
  { name: 'Nueva Ecija Rice Mill', contactPerson: 'Aling Cora', contactNumber: '0918 555 9002', address: 'Cabanatuan City' },
  { name: 'Bayanihan Farmers Coop', contactPerson: 'Tatay Ben', contactNumber: '0920 555 9003', notes: 'Cash on delivery only.' },
];

async function loadPurchasing(adapter, actor, asOf, itemIds) {
  const existing = await adapter.query('suppliers', {});
  const byName = new Map(existing.map((x) => [x.nameLower, x.id]));
  const sid = {};
  let suppliers = 0;
  for (const s of SUPPLIERS) {
    const key = s.name.toLowerCase();
    if (byName.has(key)) { sid[s.name] = byName.get(key); continue; }
    sid[s.name] = await createSupplier(adapter, actor, validateSupplierForm(s).data);
    suppliers++;
  }
  const none = { suppliers, restocks: 0, expenses: 0, events: 0 };
  if (suppliers !== SUPPLIERS.length || Object.keys(itemIds).length !== ITEMS.length) return none;

  const items = Object.fromEntries((await adapter.query('items', {})).map((i) => [i.id, i]));
  const order = async (supplier, orderDate, expectedDate, lines, notes = '') => {
    const { data, errors } = validateRestockForm({
      supplierId: sid[supplier], orderDate, expectedDate, notes,
      lines: lines.map(([name, qty, cost]) => ({ itemId: itemIds[name], qty: String(qty), unitCost: String(cost) })),
    }, items);
    if (Object.keys(errors).length) throw new Error('Invalid sample restock: ' + JSON.stringify(errors));
    return createRestock(adapter, actor, data);
  };
  const receive = (id, date, lines) => receiveRestock(adapter, actor, id, {
    date, lines: lines.map(([name, qty, cost, updateCost = true, price = null]) => ({ itemId: itemIds[name], qtyH: Math.round(qty * 100), unitCostC: P(cost), priceC: price === null ? null : P(price), updateCost })),
  });
  let restocks = 0;

  // 1. Fully received two months ago at the usual cost.
  const r1 = await order('Golden Grains Trading', addDays(asOf, -60), addDays(asOf, -57), [['Dinorado 50kg Sack', 10, 2900], ['Sinandomeng 50kg Sack', 8, 2300]]);
  await receive(r1, addDays(asOf, -57), [['Dinorado 50kg Sack', 10, 2900], ['Sinandomeng 50kg Sack', 8, 2300]]);
  restocks++;
  // 2. Received at a higher cost (item cost updated) — NFA had no stock until now.
  const r2 = await order('Nueva Ecija Rice Mill', addDays(asOf, -30), addDays(asOf, -26), [['NFA Well-milled 50kg Sack', 6, 1900], ['Jasmine 25kg Sack', 4, 1450]]);
  await receive(r2, addDays(asOf, -26), [['NFA Well-milled 50kg Sack', 6, 1950], ['Jasmine 25kg Sack', 4, 1500]]);
  restocks++;
  // 3. Partly received; the rest is expected in a few days.
  const r3 = await order('Golden Grains Trading', addDays(asOf, -6), addDays(asOf, 3), [['Dinorado 50kg Sack', 12, 2900], ['Malagkit per KG', 25, 65]], 'Rest of the Dinorado follows.');
  await receive(r3, addDays(asOf, -4), [['Dinorado 50kg Sack', 5, 2900], ['Malagkit per KG', 25, 65]]);
  restocks++;
  // 4. Ordered, expected next week. 5. Cancelled.
  await order('Bayanihan Farmers Coop', addDays(asOf, -1), addDays(asOf, 6), [['Brown Rice 25kg Sack', 5, 1650], ['Sinandomeng 50kg Sack', 10, 2300]]);
  const r5 = await order('Bayanihan Farmers Coop', addDays(asOf, -15), addDays(asOf, -10), [['Jasmine 25kg Sack', 3, 1450]]);
  await cancelRestock(adapter, actor, r5, 'Supplier could not deliver');
  restocks += 2;

  const EXPENSES = [
    [-58, 'Rent', 8000, 'Store rent'], [-55, 'Utilities', 1850.75, 'Electricity'], [-40, 'Delivery/Fuel', 650, 'Tricycle deliveries'],
    [-28, 'Rent', 8000, 'Store rent'], [-25, 'Wages', 4500, 'Helper (2 weeks)'], [-20, 'Supplies', 420, 'Sacks and twine'],
    [-12, 'Delivery/Fuel', 380, 'Gas for delivery'], [-11, 'Wages', 4500, 'Helper (2 weeks)'], [-3, 'Utilities', 1720.4, 'Electricity'],
    [-2, 'Other', 250, 'Barangay permit photocopies'],
  ];
  let expenses = 0, mistake = null;
  for (const [days, category, amount, note] of EXPENSES) {
    const id = await createExpense(adapter, actor, validateExpenseForm({ date: addDays(asOf, days), category, amount: String(amount), note }).data);
    if (days === -12) mistake = id;
    expenses++;
  }
  await createExpense(adapter, actor, validateExpenseForm({ date: addDays(asOf, -12), category: 'Delivery/Fuel', amount: '380', note: 'Gas for delivery' }).data);
  await voidExpense(adapter, actor, mistake, 'Entered twice');
  expenses++;

  // Phase 13 — batches (D-050 … D-055): a newer NFA batch at a higher cost and cash price (item defaults kept),
  // then a delivered walk-in sale that uses up the older batch and takes 1 sack of the new one (weighted price),
  // with a delivery fee as an other charge (D-054).
  const r6 = await order('Nueva Ecija Rice Mill', addDays(asOf, -2), addDays(asOf, -1), [['NFA Well-milled 50kg Sack', 6, 2000]], 'New harvest, higher price.');
  await receive(r6, addDays(asOf, -1), [['NFA Well-milled 50kg Sack', 6, 2000, false, 2350]]);
  restocks++;
  const din = await adapter.get('items', itemIds['NFA Well-milled 50kg Sack']);
  const older = (din.batches || []).slice(0, -1).reduce((a, b) => a + b.qtyH, 0);
  if (older > 0 && older <= 3000) {
    await createSale(adapter, actor, {
      saleDate: addDays(asOf, -1), customerId: 'WALK_IN', lines: [{ itemId: din.id, qtyH: older + 100 }], terms: 'FULL', method: 'CASH',
      discount: { type: 'NONE' }, fulfillment: 'DELIVERED', deliveryDate: addDays(asOf, -1), notes: 'Sample: spans two batches; delivery fee charged.',
      charges: [{ name: 'Delivery fee', amountC: P(150) }],
    }, DEFAULT_SALES_SETTINGS, asOf);
  }

  let events = 0;
  for (const e of [{ title: 'Pay store rent', date: addDays(asOf, 5), time: '09:00', note: 'Landlord: Mrs. Garcia' },
    { title: 'Business permit renewal', date: addDays(asOf, 12), time: '', note: 'Bring last year\'s permit' }]) {
    await createEvent(adapter, actor, validateEventForm(e).data);
    events++;
  }
  return { suppliers, restocks, expenses, events };
}
