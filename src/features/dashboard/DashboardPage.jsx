/*
 * Dashboard (Phase 10, RQ-036, RQ-008): KPIs that keep revenue (at sale date) apart from cash collected (at payment
 * date), receivables and overdue, what needs attention (collections, low stock, deliveries, late restocks),
 * a 14-day revenue vs cash chart, upcoming collections and recent sales.
 */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows, Badge, DataTable } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useQuery, errorMessage } from '../../data/useData.js';
import { formatMoney } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate, today, addDays, parseDate } from '../../domain/dates.js';
import { groupCollections } from '../../domain/collections.js';
import { stockStatus, inventorySummary } from '../../domain/inventory.js';
import { isOpenRestock } from '../../domain/purchasing.js';
import { salesSummary, cashCollected, expensesSummary, dailySeries, monthBounds, receivablesAging, formatPct } from '../../domain/reports.js';
import { BackupReminder } from '../system/BackupPage.jsx';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d) => { const p = parseDate(d); return `${SHORT[p.m - 1]} ${p.d}`; };
const compact = (c) => { const p = c / 100; return p >= 1000000 ? `₱${(p / 1000000).toFixed(1)}M` : p >= 1000 ? `₱${(p / 1000).toFixed(p >= 10000 ? 0 : 1)}k` : `₱${Math.round(p)}`; };

/** Grouped bars: revenue vs cash per day. One axis (both pesos). Hover shows both values; a table view is offered. */
export function RevenueCashChart({ series }) {
  const [hover, setHover] = React.useState(null);
  const W = 640, H = 200, L = 44, B = 22, T = 8;
  const max = Math.max(1, ...series.flatMap((d) => [d.revenueC, d.cashC]));
  const step = [1, 2, 5].map((m) => m * 10 ** Math.floor(Math.log10(max / 3))).find((s) => max / s <= 4) || 10 ** Math.ceil(Math.log10(max / 3));
  const top = Math.ceil(max / step) * step;
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const plotW = W - L - 4, plotH = H - B - T;
  const slot = plotW / series.length, bw = Math.max(3, Math.min(14, (slot - 8) / 2));
  const y = (v) => T + plotH - (v / top) * plotH;
  const bar = (x, v, cls) => {
    const h = Math.max(0, (v / top) * plotH); if (h <= 0) return null;
    const r = Math.min(4, h, bw / 2);
    const yy = T + plotH - h;
    return <path className={cls} d={`M${x},${T + plotH} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${T + plotH} Z`} />;
  };
  const hv = hover !== null ? series[hover] : null;
  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><span className="chart-key chart-rev" />Revenue (sales)</span><span><span className="chart-key chart-cash" />Cash collected</span>
      </div>
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue and cash collected per day, last 14 days" onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => <g key={v}><line className="chart-grid" x1={L} x2={W - 4} y1={y(v)} y2={y(v)} /><text className="chart-tick" x={L - 6} y={y(v) + 4} textAnchor="end">{compact(v)}</text></g>)}
          {series.map((d, i) => {
            const x0 = L + i * slot + (slot - (bw * 2 + 2)) / 2;
            return (
              <g key={d.date}>
                {hover === i && <rect className="chart-hover" x={L + i * slot} y={T} width={slot} height={plotH} />}
                {bar(x0, d.revenueC, 'chart-rev')}
                {bar(x0 + bw + 2, d.cashC, 'chart-cash')}
                {(i % 2 === (series.length - 1) % 2) && <text className="chart-tick" x={L + i * slot + slot / 2} y={H - 6} textAnchor="middle">{short(d.date)}</text>}
                <rect className="chart-hit" x={L + i * slot} y={0} width={slot} height={H} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              </g>
            );
          })}
        </svg>
        {hv && (
          <div className="chart-tip" style={{ left: `${((L + hover * slot + slot / 2) / W) * 100}%` }} role="status">
            <strong>{formatDate(hv.date)}</strong>
            <span><span className="chart-key chart-rev" />Revenue {formatMoney(hv.revenueC)}</span>
            <span><span className="chart-key chart-cash" />Cash {formatMoney(hv.cashC)}</span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <DataTable caption="Revenue and cash per day" rowKey="date" rows={[...series].reverse()} columns={[
          { key: 'date', header: 'Date', render: (d) => formatDate(d.date) },
          { key: 'rev', header: 'Revenue', align: 'right', render: (d) => formatMoney(d.revenueC) },
          { key: 'cash', header: 'Cash collected', align: 'right', render: (d) => formatMoney(d.cashC) },
        ]} />
      </details>
    </div>
  );
}

function Kpi({ label, value, sub, tone, to }) {
  const body = <><div className="stat-label">{label}</div><div className={`stat-value ${tone ? 'is-' + tone : ''}`}>{value}</div>{sub && <div className="stat-sub">{sub}</div>}</>;
  return to ? <Link to={to} className="stat stat-link">{body}</Link> : <div className="stat">{body}</div>;
}

function Attention({ icon, tone, children, to }) {
  return <Link to={to} className={`attention attention-${tone}`}><Icon name={icon} size={18} /><span>{children}</span><Icon name="next" size={16} /></Link>;
}

export function DashboardPage({ adapter }) {
  const now = today();
  const month = monthBounds(now);
  const since = addDays(now, -13) < month.from ? addDays(now, -13) : month.from;
  const sales = useQuery(adapter, 'sales', { where: [['saleDate', '>=', since]] }, `dash-sales-${since}`);
  const payments = useQuery(adapter, 'payments', { where: [['date', '>=', since]] }, `dash-pay-${since}`);
  const expenses = useQuery(adapter, 'expenses', { where: [['date', '>=', month.from]] }, `dash-exp-${month.from}`);
  const rows = useQuery(adapter, 'installments', { where: [['status', 'in', ['PENDING', 'PARTIAL']]] }, 'collections-open');
  const items = useQuery(adapter, 'items', { orderBy: [['nameLower', 'asc']] }, 'dash-items');
  const pending = useQuery(adapter, 'sales', { where: [['fulfillment', '==', 'PENDING']] }, 'dash-pending');
  const restocks = useQuery(adapter, 'restocks', { where: [['status', 'in', ['ORDERED', 'PARTIALLY_RECEIVED']]] }, 'dash-restocks');
  const all = [sales, payments, expenses, rows, items, pending, restocks];
  const ready = all.every((q) => q.rows);
  const error = all.map((q) => q.error).find(Boolean);
  if (!ready) return <div className="page stack"><PageHeader title="Dashboard" /><LoadingRows label="Loading dashboard" /></div>;

  const todayS = salesSummary(sales.rows, now, now);
  const monthS = salesSummary(sales.rows, month.from, month.to);
  const monthCash = cashCollected(payments.rows, month.from, month.to);
  const todayCash = cashCollected(payments.rows, now, now);
  const monthExp = expensesSummary(expenses.rows, month.from, month.to);
  const groups = groupCollections(rows.rows, now);
  const aging = receivablesAging(rows.rows, now);
  const active = items.rows.filter((i) => i.status === 'ACTIVE');
  const inv = inventorySummary(items.rows);
  const low = active.filter((i) => stockStatus(i) !== 'OK').sort((a, b) => (stockStatus(a) === 'OUT' ? -1 : 0) - (stockStatus(b) === 'OUT' ? -1 : 0) || a.name.localeCompare(b.name));
  const deliveries = pending.rows.filter((s) => s.status === 'ACTIVE');
  const lateDeliveries = deliveries.filter((s) => s.deliveryDate && s.deliveryDate < now);
  const lateRestocks = restocks.rows.filter((r) => isOpenRestock(r) && r.expectedDate && r.expectedDate <= now);
  const upcoming = [...groups.OVERDUE.rows, ...groups.TODAY.rows, ...groups.WEEK.rows].slice(0, 6);
  const recent = sales.rows.filter((s) => s.kind !== 'OPENING_BALANCE').sort((a, b) => (a.saleDate < b.saleDate ? 1 : a.saleDate > b.saleDate ? -1 : b.id.localeCompare(a.id))).slice(0, 6);
  const empty = !items.rows.length && !sales.rows.length;
  const netC = monthS.grossProfitC - monthExp.totalC;

  return (
    <div className="page stack">
      <PageHeader title="Dashboard" description={`Today is ${formatDate(now)}. Revenue counts sales on their sale date; cash counts payments on the day they were received.`}
        actions={<div className="button-row"><Button variant="primary" icon="newSale" onClick={() => navigate('/sales/new')}>New sale</Button><Button icon="reports" onClick={() => navigate('/reports')}>Reports</Button></div>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      {!empty && <BackupReminder adapter={adapter} />}
      {empty && <EmptyState icon="dashboard" title="Nothing to show yet" >Add items and record sales (or load sample data under Settings → System) to see the dashboard filled in.</EmptyState>}

      <div className="stat-strip kpi-strip">
        <Kpi label="Sales today" value={formatMoney(todayS.revenueC)} sub={`${todayS.count} sale(s) · cash in ${formatMoney(todayCash.totalC)}`} to="/sales" />
        <Kpi label="Revenue this month" value={formatMoney(monthS.revenueC)} sub={`${monthS.count} sale(s)`} to="/reports/sales" />
        <Kpi label="Gross profit this month" value={formatMoney(monthS.grossProfitC)} sub={`margin ${formatPct(monthS.marginBp)}`} to="/reports/profit" />
        <Kpi label="Net profit this month" value={formatMoney(netC)} tone={netC < 0 ? 'danger' : null} sub={`after ${formatMoney(monthExp.totalC)} expenses`} to="/reports/pnl" />
        <Kpi label="Cash collected this month" value={formatMoney(monthCash.totalC)} sub={`${monthCash.count} payment(s)`} to="/reports/cash" />
        <Kpi label="Receivables" value={formatMoney(aging.totalC)} sub={`${rows.rows.length} open installment(s)`} to="/reports/aging" />
        <Kpi label="Overdue" value={formatMoney(groups.OVERDUE.totalC)} tone={groups.OVERDUE.totalC ? 'danger' : null} sub={`${groups.OVERDUE.rows.length} installment(s)`} to="/collections/overdue" />
        <Kpi label="Stock value" value={formatMoney(inv.valueC)} sub={`${inv.activeCount} item(s) at cost`} to="/reports/inventory" />
      </div>

      <div className="dash-grid">
        <Panel title="Needs attention">
          <div className="attention-list">
            {groups.OVERDUE.rows.length > 0 && <Attention icon="collections" tone="danger" to="/collections/overdue">{groups.OVERDUE.rows.length} overdue installment(s) · {formatMoney(groups.OVERDUE.totalC)}</Attention>}
            {groups.TODAY.rows.length > 0 && <Attention icon="collections" tone="warning" to="/collections/today">{groups.TODAY.rows.length} due today · {formatMoney(groups.TODAY.totalC)}</Attention>}
            {inv.outCount > 0 && <Attention icon="items" tone="danger" to="/items">{inv.outCount} item(s) out of stock</Attention>}
            {inv.lowCount > 0 && <Attention icon="items" tone="warning" to="/items">{inv.lowCount} item(s) low on stock</Attention>}
            {lateDeliveries.length > 0 && <Attention icon="restocks" tone="warning" to="/sales">{lateDeliveries.length} delivery(ies) past their date</Attention>}
            {deliveries.length > lateDeliveries.length && <Attention icon="restocks" tone="info" to="/sales">{deliveries.length - lateDeliveries.length} delivery(ies) pending</Attention>}
            {lateRestocks.length > 0 && <Attention icon="receive" tone="info" to="/restocks">{lateRestocks.length} restock(s) expected by today</Attention>}
            {!groups.OVERDUE.rows.length && !groups.TODAY.rows.length && !inv.outCount && !inv.lowCount && !deliveries.length && !lateRestocks.length && <p className="muted">All clear: nothing overdue, no low stock, no pending deliveries.</p>}
          </div>
        </Panel>
        <Panel title="Last 14 days"><RevenueCashChart series={dailySeries(sales.rows, payments.rows, now, 14)} /></Panel>
      </div>

      <div className="dash-grid">
        <Panel title="Collections coming up" actions={<Link to="/collections">All collections</Link>} flush>
          <DataTable caption="Collections coming up" rows={upcoming} columns={[
            { key: 'c', header: 'Customer', className: 'key-col wrap', render: (r) => <Link to={`/customers/${r.customerId}`}>{r.customerName}</Link> },
            { key: 'd', header: 'Due', render: (r) => <>{formatDate(r.dueDate)}{r.daysOverdue > 0 && <span className="cell-sub"><Badge tone="danger">{r.daysOverdue} day(s) late</Badge></span>}</> },
            { key: 'a', header: 'To collect', align: 'right', render: (r) => formatMoney(r.remainingC) },
          ]} empty={<EmptyState icon="collections" title="Nothing due this week" />} />
        </Panel>
        <Panel title="Recent sales" actions={<Link to="/sales">All sales</Link>} flush>
          <DataTable caption="Recent sales" rows={recent} rowClassName={(s) => (s.status === 'CANCELLED' ? 'is-muted' : undefined)} columns={[
            { key: 'id', header: 'Sale', className: 'key-col', render: (s) => <><Link to={`/sales/${s.id}`}>{s.id}</Link><span className="cell-sub">{formatDate(s.saleDate)}</span></> },
            { key: 'c', header: 'Customer', className: 'wrap', render: (s) => s.customerName },
            { key: 't', header: 'Total', align: 'right', render: (s) => <span className={s.status === 'CANCELLED' ? 'strike' : ''}>{formatMoney(s.totalC)}</span> },
          ]} empty={<EmptyState icon="sales" title="No sales in the last two weeks" />} />
        </Panel>
      </div>

      {low.length > 0 && (
        <Panel title="Low and out of stock" actions={<Link to="/items">Items</Link>} flush>
          <DataTable caption="Low stock" rows={low.slice(0, 8)} columns={[
            { key: 'n', header: 'Item', className: 'key-col wrap', render: (i) => <Link to={`/items/${i.id}`}>{i.name}</Link> },
            { key: 'q', header: 'In stock', align: 'right', render: (i) => formatQty(i.qtyH, i.unit) },
            { key: 'm', header: 'Minimum', align: 'right', render: (i) => formatQty(i.minStockH, i.unit) },
            { key: 's', header: '', render: (i) => <Badge tone={stockStatus(i) === 'OUT' ? 'danger' : 'warning'}>{stockStatus(i) === 'OUT' ? 'Out of stock' : 'Low'}</Badge> },
          ]} />
        </Panel>
      )}
    </div>
  );
}
