/*
 * Reports (Phase 10, RQ-036 … RQ-039): Sales, Profit by item, Profit & loss (net profit), Cash collected,
 * Receivables aging, Inventory valuation, Movements & losses, Restocks by supplier. The customer statement lives on
 * each customer's page (Statement tab). Every report has a date range (where it applies), Print / Save as PDF and
 * CSV export. URL: #/reports/{tab}?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows, Tabs, DataTable } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, SelectField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useQuery, errorMessage } from '../../data/useData.js';
import { formatMoney } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate, today, isValidDate } from '../../domain/dates.js';
import { TERMS_LABELS, METHOD_LABELS, PAYMENT_STATUS_LABELS } from '../../domain/sales.js';
import { EXPENSE_CATEGORIES } from '../../domain/purchasing.js';
import {
  presets, monthBounds, periodLabel, salesSummary, profitByItem, profitAndLoss, cashCollected, receivablesAging, inventoryValuation,
  movementReport, restocksBySupplier, AGING, AGING_LABELS, METHOD_ORDER, formatPct, toCsv, csvMoney, csvQty, saleCostC,
} from '../../domain/reports.js';
import { usePrint, useBusiness } from '../sales/Print.jsx';

export const REPORTS = [
  { value: 'sales', label: 'Sales' },
  { value: 'profit', label: 'Profit by item' },
  { value: 'pnl', label: 'Profit & loss' },
  { value: 'cash', label: 'Cash collected' },
  { value: 'aging', label: 'Receivables aging', noRange: true },
  { value: 'inventory', label: 'Inventory valuation', noRange: true },
  { value: 'movements', label: 'Movements & losses' },
  { value: 'restocks', label: 'Restocks by supplier' },
];

/** Download text as a file (works from file:// in Chromium, Edge and Firefox). */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type }); // BOM so Excel reads ₱ and ñ correctly
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Each report: data needs + build(data, range) → { stats: [[label, value]], sections: [{ title, columns, rows, footer, csv }] }.
 * columns: [{ key, header, align, render(row), csv(row) }] — csv() gives the plain value for export. */
const money = (k) => ({ align: 'right', render: (r) => formatMoney(r[k]), csv: (r) => csvMoney(r[k]) });

function buildReport(tab, d, from, to, now) {
  if (tab === 'sales') {
    const s = salesSummary(d.sales, from, to);
    const rows = s.rows.slice().sort((a, b) => (a.saleDate < b.saleDate ? -1 : a.saleDate > b.saleDate ? 1 : a.id.localeCompare(b.id))).map((x) => ({ ...x, chargesC0: x.chargesC || 0, cogs: saleCostC(x), profit: x.totalC - saleCostC(x) }));
    return {
      stats: [['Sales', s.count], ['Revenue', formatMoney(s.revenueC)], ['Gross profit', `${formatMoney(s.grossProfitC)} (${formatPct(s.marginBp)})`], ['Still to collect', formatMoney(s.balanceC)]],
      note: [s.cancelledCount ? `${s.cancelledCount} cancelled sale(s) in this period are not counted.` : null, s.chargesC ? `Revenue includes ${formatMoney(s.chargesC)} of other charges (delivery fee …).` : null].filter(Boolean).join(' ') || null,
      sections: [{
        title: 'Sales', rows,
        columns: [
          { key: 'date', header: 'Date', render: (r) => formatDate(r.saleDate), csv: (r) => r.saleDate },
          { key: 'id', header: 'Sale', render: (r) => <Link to={`/sales/${r.id}`}>{r.id}</Link>, csv: (r) => r.id },
          { key: 'cust', header: 'Customer', className: 'wrap', render: (r) => r.customerName, csv: (r) => r.customerName },
          { key: 'terms', header: 'Terms', render: (r) => TERMS_LABELS[r.terms], csv: (r) => TERMS_LABELS[r.terms] },
          { key: 'pay', header: 'Payment', render: (r) => PAYMENT_STATUS_LABELS[r.paymentStatus] || '', csv: (r) => PAYMENT_STATUS_LABELS[r.paymentStatus] || '' },
          { key: 'chg', header: 'Other charges', ...money('chargesC0') },
          { key: 'total', header: 'Revenue', ...money('totalC') },
          { key: 'cogs', header: 'Cost', ...money('cogs') },
          { key: 'profit', header: 'Gross profit', ...money('profit') },
          { key: 'bal', header: 'Balance', ...money('balanceC') },
        ],
        footer: ['Total', '', '', '', '', formatMoney(s.chargesC), formatMoney(s.revenueC), formatMoney(s.cogsC), formatMoney(s.grossProfitC), formatMoney(s.balanceC)],
      }],
    };
  }
  if (tab === 'profit') {
    const rows = profitByItem(d.sales, from, to).map((r) => ({ ...r, id: r.itemId }));
    const t = rows.reduce((a, r) => ({ rev: a.rev + r.revenueC, cogs: a.cogs + r.cogsC }), { rev: 0, cogs: 0 });
    return {
      stats: [['Items sold', rows.length], ['Revenue', formatMoney(t.rev)], ['Cost of goods', formatMoney(t.cogs)], ['Gross profit', formatMoney(t.rev - t.cogs)], ['Other charges', formatMoney(salesSummary(d.sales, from, to).chargesC)]],
      note: 'Sale discounts are spread over the items of each sale in proportion to their amounts. Cost is the cost of the batches each sale took (oldest first). Other charges (delivery fee …) are not item revenue; see Profit & loss.',
      sections: [{
        title: 'Profit by item', rows,
        columns: [
          { key: 'item', header: 'Item', className: 'wrap', render: (r) => <Link to={`/items/${r.itemId}`}>{r.itemName}</Link>, csv: (r) => r.itemName },
          { key: 'qty', header: 'Quantity sold', align: 'right', render: (r) => formatQty(r.qtyH, r.unit), csv: (r) => csvQty(r.qtyH) },
          { key: 'unit', header: 'Unit', render: (r) => (r.unit === 'SACK' ? 'sack' : 'kg'), csv: (r) => (r.unit === 'SACK' ? 'sack' : 'kg') },
          { key: 'rev', header: 'Revenue', ...money('revenueC') },
          { key: 'cogs', header: 'Cost', ...money('cogsC') },
          { key: 'profit', header: 'Gross profit', ...money('profitC') },
          { key: 'm', header: 'Margin', align: 'right', render: (r) => formatPct(r.marginBp), csv: (r) => (r.marginBp === null ? '' : (r.marginBp / 100).toFixed(2)) },
        ],
        footer: ['Total', '', '', formatMoney(t.rev), formatMoney(t.cogs), formatMoney(t.rev - t.cogs), ''],
      }],
    };
  }
  if (tab === 'pnl') {
    const p = profitAndLoss(d.sales, d.expenses, from, to);
    const lines = [
      { id: 'prod', label: 'Product sales (after discounts)', v: p.productRevenueC },
      { id: 'chg', label: 'Other charges (delivery fee …)', v: p.chargesC },
      { id: 'rev', label: 'Revenue (sales at sale date)', v: p.revenueC, strong: true },
      { id: 'cogs', label: 'Cost of goods sold', v: -p.cogsC },
      { id: 'gross', label: 'Gross profit', v: p.grossProfitC, strong: true },
      ...EXPENSE_CATEGORIES.filter((c) => p.byCategory[c]).map((c) => ({ id: 'e-' + c, label: `Expense: ${c}`, v: -p.byCategory[c] })),
      { id: 'exp', label: 'Total expenses', v: -p.expensesC },
      { id: 'net', label: 'Net profit', v: p.netProfitC, strong: true },
    ];
    return {
      stats: [['Revenue', formatMoney(p.revenueC)], ['Gross profit', formatMoney(p.grossProfitC)], ['Expenses', formatMoney(p.expensesC)], ['Net profit', formatMoney(p.netProfitC)]],
      note: 'Profit is counted on the sale date, also for installment sales (D-010). Cash collected is a separate report.',
      sections: [{
        title: 'Profit & loss', rows: lines, rowClassName: (r) => (r.strong ? 'is-strong' : undefined),
        columns: [
          { key: 'l', header: 'Line', render: (r) => (r.strong ? <strong>{r.label}</strong> : r.label), csv: (r) => r.label },
          { key: 'v', header: 'Amount', align: 'right', render: (r) => (r.strong ? <strong>{formatMoney(r.v)}</strong> : formatMoney(r.v)), csv: (r) => csvMoney(r.v) },
        ],
      }],
    };
  }
  if (tab === 'cash') {
    const c = cashCollected(d.payments, from, to);
    const rows = c.rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
    return {
      stats: [['Cash collected', formatMoney(c.totalC)], ...METHOD_ORDER.map((m) => [METHOD_LABELS[m], formatMoney(c.byMethod[m] || 0)])],
      note: 'Payments by the day they were received. Voided payments are not counted.',
      sections: [{
        title: 'Payments', rows,
        columns: [
          { key: 'date', header: 'Date', render: (r) => formatDate(r.date), csv: (r) => r.date },
          { key: 'id', header: 'Payment', render: (r) => r.id, csv: (r) => r.id },
          { key: 'sale', header: 'Sale', render: (r) => <Link to={`/sales/${r.saleId}`}>{r.saleId}</Link>, csv: (r) => r.saleId },
          { key: 'cust', header: 'Customer', className: 'wrap', render: (r) => r.customerName, csv: (r) => r.customerName },
          { key: 'method', header: 'Method', render: (r) => METHOD_LABELS[r.method] + (r.reference ? ` · ${r.reference}` : ''), csv: (r) => METHOD_LABELS[r.method] },
          { key: 'kind', header: 'Type', render: (r) => (r.isDownPayment ? 'Down payment' : r.atSale ? 'At sale' : 'Payment'), csv: (r) => (r.isDownPayment ? 'Down payment' : r.atSale ? 'At sale' : 'Payment') },
          { key: 'amt', header: 'Amount', ...money('amountC') },
        ],
        footer: ['Total', '', '', '', '', '', formatMoney(c.totalC)],
      }],
    };
  }
  if (tab === 'aging') {
    const a = receivablesAging(d.rows, now);
    const rows = a.customers.map((c) => ({ ...c, id: c.customerId }));
    return {
      stats: [['Receivables', formatMoney(a.totalC)], ['Overdue', formatMoney(a.overdueC)], ['61+ days', formatMoney(a.totals.D61_PLUS)], ['Customers', rows.length]],
      note: `As of ${formatDate(now)}. Balances without a due date count as Current.`,
      sections: [{
        title: 'Receivables aging', rows,
        columns: [
          { key: 'c', header: 'Customer', className: 'wrap', render: (r) => <Link to={`/customers/${r.customerId}/statement`}>{r.customerName}</Link>, csv: (r) => r.customerName },
          ...AGING.map((b) => ({ key: b, header: AGING_LABELS[b], ...money(b) })),
          { key: 'total', header: 'Total', ...money('totalC') },
          { key: 'days', header: 'Oldest overdue', align: 'right', render: (r) => (r.daysOverdue ? `${r.daysOverdue} days` : '—'), csv: (r) => r.daysOverdue || 0 },
        ],
        footer: ['Total', ...AGING.map((b) => formatMoney(a.totals[b])), formatMoney(a.totalC), ''],
      }],
    };
  }
  if (tab === 'inventory') {
    const v = inventoryValuation(d.items);
    return {
      stats: [['Active items', v.rows.length], ['Value at cost', formatMoney(v.valueC)], ['Value at selling price', formatMoney(v.retailC)], ['Potential margin', formatMoney(v.retailC - v.valueC)]],
      note: `Current stock as of now, valued at each item's current cost (BR-015).`,
      sections: [{
        title: 'Inventory valuation', rows: v.rows,
        columns: [
          { key: 'n', header: 'Item', className: 'wrap', render: (r) => <Link to={`/items/${r.id}`}>{r.name}</Link>, csv: (r) => r.name },
          { key: 'q', header: 'In stock', align: 'right', render: (r) => formatQty(r.qtyH, r.unit), csv: (r) => csvQty(r.qtyH) },
          { key: 'u', header: 'Unit', render: (r) => (r.unit === 'SACK' ? 'sack' : 'kg'), csv: (r) => (r.unit === 'SACK' ? 'sack' : 'kg') },
          { key: 'cost', header: 'Unit cost', ...money('costC') },
          { key: 'val', header: 'Value at cost', ...money('valueC') },
          { key: 'price', header: 'Price', ...money('priceC') },
          { key: 'ret', header: 'Value at price', ...money('retailC') },
        ],
        footer: ['Total', '', '', '', formatMoney(v.valueC), '', formatMoney(v.retailC)],
      }],
    };
  }
  if (tab === 'movements') {
    const m = movementReport(d.movements, from, to);
    return {
      stats: [['Movements', m.rows.length], ['Stock losses', formatMoney(m.lossC)], ['Loss entries', m.losses.reduce((s, l) => s + l.count, 0)], ['Types', m.byType.length]],
      note: 'Losses are stock removed by adjustments and stock-count differences, valued at the cost on the movement.',
      sections: [
        {
          title: 'Losses by item and reason', rows: m.losses.map((l) => ({ ...l, id: l.key })),
          columns: [
            { key: 'n', header: 'Item', className: 'wrap', render: (r) => <Link to={`/items/${r.itemId}`}>{r.itemName}</Link>, csv: (r) => r.itemName },
            { key: 'r', header: 'Reason', render: (r) => r.reason, csv: (r) => r.reason },
            { key: 'q', header: 'Quantity lost', align: 'right', render: (r) => formatQty(r.qtyH, r.unit), csv: (r) => csvQty(r.qtyH) },
            { key: 'c', header: 'Entries', align: 'right', render: (r) => r.count, csv: (r) => r.count },
            { key: 'v', header: 'Value', ...money('valueC') },
          ],
          footer: ['Total', '', '', '', formatMoney(m.lossC)],
          empty: 'No losses in this period.',
        },
        {
          title: 'Movements by type', rows: m.byType.map((t) => ({ ...t, id: t.type })),
          columns: [
            { key: 't', header: 'Type', render: (r) => r.label, csv: (r) => r.label },
            { key: 'c', header: 'Count', align: 'right', render: (r) => r.count, csv: (r) => r.count },
            { key: 'in', header: 'Value in', ...money('valueInC') },
            { key: 'out', header: 'Value out', ...money('valueOutC') },
          ],
        },
      ],
    };
  }
  if (tab === 'restocks') {
    const r = restocksBySupplier(d.restocks, from, to);
    return {
      stats: [['Suppliers', r.rows.length], ['Deliveries', r.rows.reduce((s, x) => s + x.receipts, 0)], ['Value received', formatMoney(r.valueC)], ['Orders', r.rows.reduce((s, x) => s + x.orders, 0)]],
      note: 'Goods received in the period, by delivery date, at the received cost.',
      sections: [{
        title: 'Restocks by supplier', rows: r.rows.map((x) => ({ ...x, id: x.supplierId })),
        columns: [
          { key: 's', header: 'Supplier', className: 'wrap', render: (x) => <Link to={`/suppliers/${x.supplierId}`}>{x.supplierName}</Link>, csv: (x) => x.supplierName },
          { key: 'o', header: 'Orders', align: 'right', render: (x) => x.orders, csv: (x) => x.orders },
          { key: 'd', header: 'Deliveries', align: 'right', render: (x) => x.receipts, csv: (x) => x.receipts },
          { key: 'sk', header: 'Sacks', align: 'right', render: (x) => (x.sacksH ? formatQty(x.sacksH, 'SACK') : '—'), csv: (x) => csvQty(x.sacksH) },
          { key: 'kg', header: 'Kilos', align: 'right', render: (x) => (x.kgH ? formatQty(x.kgH, 'KG') : '—'), csv: (x) => csvQty(x.kgH) },
          { key: 'v', header: 'Value', ...money('valueC') },
        ],
        footer: ['Total', '', '', '', '', formatMoney(r.valueC)],
      }],
    };
  }
  return null;
}

/** Which collections a report needs; range-filtered with single-field queries (no composite index needed). */
function useReportData(adapter, tab, from, to) {
  const need = (t) => (t === tab || (Array.isArray(t) && t.includes(tab)));
  const range = (f) => ({ where: [[f, '>=', from], [f, '<=', to]] });
  // Hooks run in a fixed order; a report that does not need a collection passes a null query (no listener).
  const q = (cond, col, query, key) => useQuery(adapter, col, cond ? query : null, cond ? key : `${col}-off`);
  const sales = q(need(['sales', 'profit', 'pnl']), 'sales', range('saleDate'), `rep-sales-${from}-${to}`);
  const expenses = q(need('pnl'), 'expenses', range('date'), `rep-exp-${from}-${to}`);
  const payments = q(need('cash'), 'payments', range('date'), `rep-pay-${from}-${to}`);
  const rows = q(need('aging'), 'installments', { where: [['status', 'in', ['PENDING', 'PARTIAL']]] }, 'collections-open');
  const items = q(need('inventory'), 'items', { orderBy: [['nameLower', 'asc']] }, 'rep-items');
  const movements = q(need('movements'), 'inventoryMovements', range('businessDate'), `rep-mov-${from}-${to}`);
  const restocks = q(need('restocks'), 'restocks', { orderBy: [['orderDate', 'desc']], limit: 1000 }, 'rep-restocks');
  const all = { sales, expenses, payments, rows, items, movements, restocks };
  return {
    data: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.rows || []])),
    loading: Object.values(all).some((v) => !v.rows),
    error: Object.values(all).map((v) => v.error).find(Boolean),
  };
}

function ReportDoc({ business, title, period, report }) {
  const g = business.general;
  return (
    <article className="doc doc-wide">
      <header className="doc-header">
        <div><div className="doc-business">{g.businessName}</div>{g.address && <div>{g.address}</div>}</div>
        <div className="doc-title-block"><div className="doc-title">{title}</div><div>{period}</div><div>Printed {formatDate(today())}</div></div>
      </header>
      <div className="doc-meta">{report.stats.map(([l, v]) => <div key={l}><span>{l}</span>{v}</div>)}</div>
      {report.sections.map((s) => (
        <section key={s.title}>
          {report.sections.length > 1 && <h3 className="doc-subtitle">{s.title}</h3>}
          <table className="doc-table">
            <thead><tr>{s.columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'num' : undefined}>{c.header}</th>)}</tr></thead>
            <tbody>{s.rows.map((r, i) => <tr key={r.id || i}>{s.columns.map((c) => <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>{c.render(r)}</td>)}</tr>)}</tbody>
            {s.footer && <tfoot><tr className="doc-total">{s.footer.map((f, i) => <td key={i} className={s.columns[i].align === 'right' ? 'num' : undefined}>{f}</td>)}</tr></tfoot>}
          </table>
        </section>
      ))}
      {report.note && <p className="doc-note">{report.note}</p>}
    </article>
  );
}

export function ReportsPage({ adapter, tab: tabParam, query }) {
  const now = today();
  const tab = REPORTS.some((r) => r.value === tabParam) ? tabParam : 'sales';
  const meta = REPORTS.find((r) => r.value === tab);
  const month = monthBounds(now);
  const from = isValidDate(query.from) ? query.from : month.from;
  const to = isValidDate(query.to) ? query.to : month.to;
  const ps = presets(now);
  const preset = (ps.find((p) => p.from === from && p.to === to) || { value: 'custom' }).value;
  const go = (t, f = from, tt = to) => navigate(`/reports/${t}?from=${f}&to=${tt}`, { replace: true });
  const { data, loading, error } = useReportData(adapter, tab, from, to);
  const business = useBusiness(adapter);
  const [printNode, print] = usePrint();
  const toast = useToast();
  const report = loading ? null : buildReport(tab, data, from, to, now);
  const period = meta.noRange ? `As of ${formatDate(now)}` : periodLabel(from, to);
  const badRange = !meta.noRange && from > to;

  function exportCsv() {
    const parts = report.sections.map((s) => (report.sections.length > 1 ? `${s.title}\r\n` : '') + toCsv(s.columns.map((c) => ({ header: c.header, value: c.csv })), s.rows));
    const name = `${meta.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${meta.noRange ? now : `${from}_to_${to}`}.csv`;
    downloadText(name, parts.join('\r\n'));
    toast({ message: `Exported ${name}` });
  }

  return (
    <div className="page stack">
      <PageHeader title="Reports" description={<>Revenue and profit by sale date, cash by payment date; cancelled sales and voided payments are left out. Customer statements are on each <Link to="/customers">customer</Link>’s page.</>}
        actions={<div className="button-row">
          <Button icon="print" onClick={() => print(<ReportDoc business={business} title={meta.label} period={period} report={report} />)} disabled={!report || badRange}>Print / PDF</Button>
          <Button icon="download" onClick={exportCsv} disabled={!report || badRange}>Export CSV</Button>
        </div>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <Panel flush>
        <Tabs label="Reports" tabs={REPORTS.map((r) => ({ value: r.value, label: r.label }))} value={tab} onChange={(t) => go(t)} />
        <div className="toolbar">
          {meta.noRange ? <span className="muted">{period}</span> : <>
            <SelectField label="Period" value={preset} onChange={(e) => { const p = ps.find((x) => x.value === e.target.value); if (p) go(tab, p.from, p.to); }}
              options={[...ps.map((p) => ({ value: p.value, label: p.label })), { value: 'custom', label: 'Custom' }]} />
            <TextField label="From" type="date" value={from} onChange={(e) => isValidDate(e.target.value) && go(tab, e.target.value, to)} />
            <TextField label="To" type="date" value={to} onChange={(e) => isValidDate(e.target.value) && go(tab, from, e.target.value)} />
          </>}
          <span className="toolbar-end">{!meta.noRange && period}</span>
        </div>
        {badRange && <div className="panel-body"><Banner tone="warning">“From” is after “To”.</Banner></div>}
      </Panel>
      {!report ? <LoadingRows label="Loading report" /> : <>
        <div className="stat-strip">{report.stats.map(([l, v]) => <div className="stat" key={l}><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>)}</div>
        {report.note && <p className="muted small report-note">{report.note}</p>}
        {report.sections.map((s) => (
          <Panel key={s.title} title={s.title} flush>
            <DataTable caption={s.title} columns={s.columns} rows={s.rows} rowClassName={s.rowClassName} footer={s.rows.length ? s.footer : null}
              empty={<EmptyState icon="reports" title={s.empty || 'Nothing in this period'}>{meta.noRange ? null : 'Choose another period.'}</EmptyState>} />
          </Panel>
        ))}
      </>}
      {printNode}
    </div>
  );
}
