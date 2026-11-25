/*
 * Report aggregation (Phase 10, RQ-036 … RQ-039, BUSINESS_RULES §7). Pure functions over stored documents.
 *   Revenue       = Σ totals of ACTIVE sales (kind SALE, opening balances excluded) by sale date
 *   COGS          = Σ snapshot line cost of those sales
 *   Gross profit  = Revenue − COGS;  Net profit = Gross profit − ACTIVE expenses in the period
 *   Cash collected= Σ ACTIVE payments by payment date
 *   Receivables   = Σ unpaid amounts of open rows; aging by days past due (Current / 1–30 / 31–60 / 61+)
 */
import { addDays, compareDates, parseDate, toDateString, daysInMonth, formatDate, daysBetween } from './dates.js';
import { centavosToPlain, mulDivRound } from './money.js';
import { qtyToPlain } from './quantity.js';
import { lineCost } from './saleTotals.js';
import { remainingOf, agingBucket, STATUS } from './allocation.js';
import { MOVEMENT_LABELS } from './inventory.js';
import { stockValueC, stockStatus } from './inventory.js';

export const inRange = (d, from, to) => !!d && (!from || compareDates(d, from) >= 0) && (!to || compareDates(d, to) <= 0);
export const isRevenueSale = (s) => s.status === 'ACTIVE' && s.kind !== 'OPENING_BALANCE';
const sumBy = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
export const saleCostC = (s) => (Number.isInteger(s.costC) ? s.costC : sumBy(s.lines || [], (l) => lineCost(l.qtyH, l.unitCostC)));

/** Gross margin in hundredths of a percent (e.g. 1234 = 12.34%), or null without revenue. */
export const marginBp = (profitC, revenueC) => (revenueC > 0 ? mulDivRound(profitC, 10000, revenueC) : null);
export const formatPct = (bp) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toFixed(1)}%`);

/* ------------------------------------------------------------------ periods */

export function monthBounds(date) {
  const { y, m } = parseDate(date);
  return { from: toDateString(y, m, 1), to: toDateString(y, m, daysInMonth(y, m)) };
}

/** Preset date ranges for report filters. */
export function presets(today) {
  const { y, m } = parseDate(today);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return [
    { value: 'today', label: 'Today', from: today, to: today },
    { value: 'last7', label: 'Last 7 days', from: addDays(today, -6), to: today },
    { value: 'month', label: 'This month', ...monthBounds(today) },
    { value: 'lastMonth', label: 'Last month', from: toDateString(prev.y, prev.m, 1), to: toDateString(prev.y, prev.m, daysInMonth(prev.y, prev.m)) },
    { value: 'last30', label: 'Last 30 days', from: addDays(today, -29), to: today },
    { value: 'year', label: 'This year', from: toDateString(y, 1, 1), to: toDateString(y, 12, 31) },
  ];
}

export const periodLabel = (from, to) => (from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`);

/* ------------------------------------------------------------------ sales & profit */

export function salesSummary(sales, from, to) {
  const rows = sales.filter((s) => isRevenueSale(s) && inRange(s.saleDate, from, to));
  const revenueC = sumBy(rows, (s) => s.totalC);
  const cogsC = sumBy(rows, saleCostC);
  return {
    rows, count: rows.length, revenueC, cogsC, grossProfitC: revenueC - cogsC, marginBp: marginBp(revenueC - cogsC, revenueC),
    discountC: sumBy(rows, (s) => s.discountC || 0), paidC: sumBy(rows, (s) => s.paidC), balanceC: sumBy(rows, (s) => s.balanceC),
    cancelledCount: sales.filter((s) => s.status === 'CANCELLED' && s.kind !== 'OPENING_BALANCE' && inRange(s.saleDate, from, to)).length,
  };
}

/**
 * Spread a sale-level discount over its lines in proportion to line totals (largest remainder), so the
 * per-item revenue adds up to the sale total exactly. Returns net revenue per line.
 */
export function netLineRevenue(sale) {
  const lines = sale.lines || [];
  const subtotal = sumBy(lines, (l) => l.lineTotalC);
  const discount = sale.discountC || 0;
  if (!discount || !subtotal) return lines.map((l) => l.lineTotalC);
  const shares = lines.map((l, i) => {
    const exact = l.lineTotalC * discount;
    return { i, base: Math.floor(exact / subtotal), rem: exact % subtotal };
  });
  let left = discount - sumBy(shares, (s) => s.base);
  [...shares].sort((a, b) => b.rem - a.rem || a.i - b.i).forEach((s) => { if (left > 0) { s.base += 1; left -= 1; } });
  return lines.map((l, i) => l.lineTotalC - shares[i].base);
}

/** Profit by item over the period: [{ itemId, itemName, unit, qtyH, revenueC, cogsC, profitC, marginBp }], most profit first. */
export function profitByItem(sales, from, to) {
  const map = new Map();
  for (const s of sales) {
    if (!isRevenueSale(s) || !inRange(s.saleDate, from, to)) continue;
    const net = netLineRevenue(s);
    (s.lines || []).forEach((l, i) => {
      const r = map.get(l.itemId) || { itemId: l.itemId, itemName: l.itemName, unit: l.unit, qtyH: 0, revenueC: 0, cogsC: 0, sales: 0 };
      r.qtyH += l.qtyH; r.revenueC += net[i]; r.cogsC += lineCost(l.qtyH, l.unitCostC); r.sales += 1;
      map.set(l.itemId, r);
    });
  }
  return [...map.values()].map((r) => ({ ...r, profitC: r.revenueC - r.cogsC, marginBp: marginBp(r.revenueC - r.cogsC, r.revenueC) }))
    .sort((a, b) => b.profitC - a.profitC || a.itemName.localeCompare(b.itemName));
}

/* ------------------------------------------------------------------ cash, expenses, net profit */

export const METHOD_ORDER = ['CASH', 'BANK', 'EWALLET'];

export function cashCollected(payments, from, to) {
  const rows = payments.filter((p) => p.status === 'ACTIVE' && inRange(p.date, from, to));
  const byMethod = Object.fromEntries(METHOD_ORDER.map((m) => [m, 0]));
  for (const p of rows) byMethod[p.method] = (byMethod[p.method] || 0) + p.amountC;
  return { rows, totalC: sumBy(rows, (p) => p.amountC), byMethod, count: rows.length };
}

export function expensesSummary(expenses, from, to) {
  const rows = expenses.filter((e) => e.status === 'ACTIVE' && inRange(e.date, from, to));
  const byCategory = {};
  for (const e of rows) byCategory[e.category] = (byCategory[e.category] || 0) + e.amountC;
  return { rows, totalC: sumBy(rows, (e) => e.amountC), byCategory, voidedCount: expenses.filter((e) => e.status === 'VOIDED' && inRange(e.date, from, to)).length };
}

export function profitAndLoss(sales, expenses, from, to) {
  const s = salesSummary(sales, from, to);
  const e = expensesSummary(expenses, from, to);
  return { revenueC: s.revenueC, cogsC: s.cogsC, grossProfitC: s.grossProfitC, expensesC: e.totalC, netProfitC: s.grossProfitC - e.totalC, byCategory: e.byCategory, salesCount: s.count };
}

/* ------------------------------------------------------------------ receivables aging */

export const AGING = ['CURRENT', 'D1_30', 'D31_60', 'D61_PLUS'];
export const AGING_LABELS = { CURRENT: 'Current', D1_30: '1–30 days', D31_60: '31–60 days', D61_PLUS: '61+ days' };

/** Open rows as of `today` grouped by customer and bucket. Rows without a due date count as Current. */
export function receivablesAging(rows, today) {
  const totals = Object.fromEntries(AGING.map((b) => [b, 0]));
  const byCustomer = new Map();
  for (const r of rows) {
    if (r.status !== STATUS.PENDING && r.status !== STATUS.PARTIAL) continue;
    const amt = remainingOf(r);
    if (amt <= 0) continue;
    const b = agingBucket(r, today);
    totals[b] += amt;
    const c = byCustomer.get(r.customerId) || { customerId: r.customerId, customerName: r.customerName, CURRENT: 0, D1_30: 0, D31_60: 0, D61_PLUS: 0, totalC: 0, oldestDue: null, rows: 0 };
    c[b] += amt; c.totalC += amt; c.rows += 1;
    if (r.dueDate && compareDates(r.dueDate, today) < 0 && (!c.oldestDue || compareDates(r.dueDate, c.oldestDue) < 0)) c.oldestDue = r.dueDate;
    byCustomer.set(r.customerId, c);
  }
  const customers = [...byCustomer.values()].map((c) => ({ ...c, daysOverdue: c.oldestDue ? daysBetween(c.oldestDue, today) : 0 }))
    .sort((a, b) => b.D61_PLUS - a.D61_PLUS || b.D31_60 - a.D31_60 || b.D1_30 - a.D1_30 || b.totalC - a.totalC || a.customerName.localeCompare(b.customerName));
  return { totals, totalC: sumBy(AGING, (b) => totals[b]), overdueC: totals.D1_30 + totals.D31_60 + totals.D61_PLUS, customers };
}

/* ------------------------------------------------------------------ inventory */

export function inventoryValuation(items) {
  const rows = items.filter((i) => i.status === 'ACTIVE').map((i) => ({ ...i, valueC: stockValueC(i), retailC: mulDivRound(i.qtyH, i.priceC, 100), stock: stockStatus(i) }))
    .sort((a, b) => b.valueC - a.valueC || a.name.localeCompare(b.name));
  return { rows, valueC: sumBy(rows, (r) => r.valueC), retailC: sumBy(rows, (r) => r.retailC) };
}

const LOSS_TYPES = ['ADJUSTMENT', 'COUNT_ADJUSTMENT'];

/** Movement totals by type and stock losses (negative adjustments and count differences) valued at movement cost. */
export function movementReport(movements, from, to) {
  const rows = movements.filter((m) => inRange(m.businessDate, from, to));
  const byType = {};
  for (const m of rows) {
    const t = byType[m.type] || { type: m.type, label: MOVEMENT_LABELS[m.type] || m.type, count: 0, valueInC: 0, valueOutC: 0 };
    t.count += 1;
    const v = lineCost(Math.abs(m.qtyDeltaH), m.unitCostC || 0);
    if (m.qtyDeltaH > 0) t.valueInC += v; else t.valueOutC += v;
    byType[m.type] = t;
  }
  const lossMap = new Map();
  for (const m of rows) {
    if (!LOSS_TYPES.includes(m.type) || m.qtyDeltaH >= 0) continue;
    const key = `${m.itemId}|${m.reason || 'Stock count'}`;
    const l = lossMap.get(key) || { key, itemId: m.itemId, itemName: m.itemName, unit: m.unit, reason: m.reason || 'Stock count', qtyH: 0, valueC: 0, count: 0 };
    l.qtyH += -m.qtyDeltaH; l.valueC += lineCost(-m.qtyDeltaH, m.unitCostC || 0); l.count += 1;
    lossMap.set(key, l);
  }
  const losses = [...lossMap.values()].sort((a, b) => b.valueC - a.valueC || a.itemName.localeCompare(b.itemName));
  return { rows, byType: Object.values(byType).sort((a, b) => a.label.localeCompare(b.label)), losses, lossC: sumBy(losses, (l) => l.valueC) };
}

/** Goods received per supplier in the period (from restock receipts). */
export function restocksBySupplier(restocks, from, to) {
  const map = new Map();
  for (const r of restocks) {
    for (const rc of r.receipts || []) {
      if (!inRange(rc.date, from, to)) continue;
      const s = map.get(r.supplierId) || { supplierId: r.supplierId, supplierName: r.supplierName, receipts: 0, orders: new Set(), sacksH: 0, kgH: 0, valueC: 0 };
      s.receipts += 1; s.orders.add(r.id);
      for (const l of rc.lines) { if (l.unit === 'SACK') s.sacksH += l.qtyH; else s.kgH += l.qtyH; s.valueC += lineCost(l.qtyH, l.unitCostC); }
      map.set(r.supplierId, s);
    }
  }
  const rows = [...map.values()].map((s) => ({ ...s, orders: s.orders.size })).sort((a, b) => b.valueC - a.valueC || a.supplierName.localeCompare(b.supplierName));
  return { rows, valueC: sumBy(rows, (r) => r.valueC) };
}

/* ------------------------------------------------------------------ dashboard series */

/** Per-day revenue and cash for the last `days` days ending today: [{ date, revenueC, cashC }]. */
export function dailySeries(sales, payments, today, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ date: addDays(today, -i), revenueC: 0, cashC: 0 });
  const idx = new Map(out.map((d, i) => [d.date, i]));
  for (const s of sales) if (isRevenueSale(s) && idx.has(s.saleDate)) out[idx.get(s.saleDate)].revenueC += s.totalC;
  for (const p of payments) if (p.status === 'ACTIVE' && idx.has(p.date)) out[idx.get(p.date)].cashC += p.amountC;
  return out;
}

/* ------------------------------------------------------------------ CSV (RQ-039) */

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** columns: [{ header, value(row) }]. Money columns should return centavosToPlain(...) so spreadsheets read numbers. */
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

export const csvMoney = (c) => centavosToPlain(c || 0);
export const csvQty = (h) => qtyToPlain(h || 0);
