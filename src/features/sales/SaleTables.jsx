/* Shared sale / payment / schedule tables and badges (Phases 5–7). */
import { DataTable, Badge } from '../../components/Feedback.jsx';
import { IconButton } from '../../components/Button.jsx';
import { Link } from '../../app/router.jsx';
import { formatMoney } from '../../domain/money.js';
import { formatDate, daysBetween } from '../../domain/dates.js';
import { isOverdue, remainingOf } from '../../domain/allocation.js';
import { METHOD_LABELS, FULFILLMENT_LABELS, PAYMENT_STATUS_LABELS, TERMS_LABELS } from '../../domain/sales.js';

export { ReliabilityBadge } from '../customers/CustomerBadges.jsx';

export function PaymentStatusBadge({ sale }) {
  if (sale.status === 'CANCELLED') return <Badge>Cancelled</Badge>;
  const tone = { PAID: 'success', PARTIAL: 'info', UNPAID: 'warning' }[sale.paymentStatus];
  return <Badge tone={tone}>{PAYMENT_STATUS_LABELS[sale.paymentStatus]}</Badge>;
}

export function FulfillmentBadge({ sale }) {
  if (sale.status === 'CANCELLED') return null;
  return <Badge tone={sale.fulfillment === 'PENDING' ? 'warning' : 'neutral'}>{FULFILLMENT_LABELS[sale.fulfillment]}</Badge>;
}

/** Status of a receivable row; Overdue is derived (BR-044). */
export function RowStatusBadge({ row, today }) {
  if (row.status === 'CANCELLED') return <Badge>Cancelled</Badge>;
  if (row.status === 'PAID') return <Badge tone="success">Paid</Badge>;
  if (isOverdue(row, today)) return <Badge tone="danger">Overdue {daysBetween(row.dueDate, today)}d</Badge>;
  return row.status === 'PARTIAL' ? <Badge tone="info">Partly paid</Badge> : <Badge>Pending</Badge>;
}

export function SalesTable({ rows, showCustomer = true, empty }) {
  const columns = [
    { key: 'no', header: 'Sale', className: 'key-col', render: (s) => <><Link to={`/sales/${s.id}`}>{s.id}</Link><span className="cell-sub">{formatDate(s.saleDate)}</span></> },
    ...(showCustomer ? [{ key: 'customer', header: 'Customer', render: (s) => (s.customerId === 'WALK_IN' ? <span className="muted">Walk-in</span> : <Link to={`/customers/${s.customerId}`}>{s.customerName}</Link>) }] : []),
    { key: 'items', header: 'Items', className: 'wrap', render: (s) => <span className="cell-clip">{s.lines.map((l) => l.itemName).join(', ')}</span> },
    { key: 'terms', header: 'Terms', render: (s) => TERMS_LABELS[s.terms] },
    { key: 'total', header: 'Total', align: 'right', render: (s) => <span className={s.status === 'CANCELLED' ? 'strike' : ''}>{formatMoney(s.totalC)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', render: (s) => (s.status === 'CANCELLED' ? '—' : s.balanceC ? <strong>{formatMoney(s.balanceC)}</strong> : formatMoney(0)) },
    { key: 'status', header: 'Status', render: (s) => <span className="badge-row"><PaymentStatusBadge sale={s} /><FulfillmentBadge sale={s} /></span> },
  ];
  return <DataTable caption="Sales" columns={columns} rows={rows} empty={empty} rowClassName={(s) => (s.status === 'CANCELLED' ? 'is-muted' : '')} />;
}

export function PaymentsTable({ rows, showSale = true, showCustomer = false, onAction, empty }) {
  const columns = [
    { key: 'no', header: 'Payment', className: 'key-col', render: (p) => <>{p.id}<span className="cell-sub">{formatDate(p.date)}</span></> },
    ...(showSale ? [{ key: 'sale', header: 'Sale', render: (p) => <Link to={`/sales/${p.saleId}`}>{p.saleId}</Link> }] : []),
    ...(showCustomer ? [{ key: 'customer', header: 'Customer', render: (p) => p.customerName }] : []),
    { key: 'method', header: 'Method', render: (p) => <>{METHOD_LABELS[p.method]}{p.reference && <span className="cell-sub">Ref. {p.reference}</span>}</> },
    { key: 'kind', header: 'Type', render: (p) => (p.isDownPayment ? 'Down payment' : p.atSale ? 'Paid at sale' : 'Payment') },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className={p.status === 'VOIDED' ? 'strike' : ''}>{formatMoney(p.amountC)}</span> },
    { key: 'status', header: 'Status', className: 'wrap', render: (p) => (p.status === 'VOIDED'
      ? <><Badge tone={p.void && p.void.refund ? 'neutral' : 'danger'}>{p.void && p.void.refund ? 'Refunded' : 'Voided'}</Badge><span className="cell-sub">{p.void && p.void.reason}</span></>
      : <Badge tone="success">Received</Badge>) },
    ...(onAction ? [{ key: 'actions', header: '', align: 'right', render: (p) => (p.status === 'ACTIVE'
      ? <span className="row-actions"><IconButton icon="print" label={`Print receipt ${p.id}`} size="sm" onClick={() => onAction('print', p)} />
          {!p.atSale && <IconButton icon="undo" label={`Void ${p.id}`} size="sm" onClick={() => onAction('void', p)} />}</span>
      : null) }] : []),
  ];
  return <DataTable caption="Payments" columns={columns} rows={rows} empty={empty} rowClassName={(p) => (p.status === 'VOIDED' ? 'is-muted' : '')} />;
}

export function ScheduleTable({ rows, today, showSale = false, showCustomer = false, empty }) {
  const columns = [
    { key: 'no', header: '#', render: (r) => (r.kind === 'OPEN_BALANCE' ? 'Balance' : `${r.no} of ${r.count}`) },
    ...(showSale ? [{ key: 'sale', header: 'Sale', render: (r) => <Link to={`/sales/${r.saleId}`}>{r.saleId}</Link> }] : []),
    ...(showCustomer ? [{ key: 'customer', header: 'Customer', render: (r) => <Link to={`/customers/${r.customerId}`}>{r.customerName}</Link> }] : []),
    { key: 'due', header: 'Due date', render: (r) => <>{r.dueDate ? formatDate(r.dueDate) : <span className="muted">No due date</span>}{(r.revisions || []).length > 0 && <span className="cell-sub">Rescheduled ×{r.revisions.length}</span>}</> },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => formatMoney(r.amountC) },
    { key: 'paid', header: 'Paid', align: 'right', render: (r) => formatMoney(r.paidC || 0) },
    { key: 'remaining', header: 'Remaining', align: 'right', render: (r) => (r.status === 'CANCELLED' ? '—' : <strong>{formatMoney(remainingOf(r))}</strong>) },
    { key: 'status', header: 'Status', render: (r) => <><RowStatusBadge row={r} today={today} />{r.paidDate && <span className="cell-sub">Paid {formatDate(r.paidDate)}</span>}</> },
  ];
  return <DataTable caption="Payment schedule" columns={columns} rows={rows} empty={empty} rowClassName={(r) => (r.status === 'CANCELLED' ? 'is-muted' : '')} />;
}

/** Sort helpers used by several pages. */
export const byNo = (a, b) => (a.saleId || '').localeCompare(b.saleId || '') || a.no - b.no;
export const byDateDesc = (field) => (a, b) => (a[field] < b[field] ? 1 : a[field] > b[field] ? -1 : (b.id || '').localeCompare(a.id || ''));
