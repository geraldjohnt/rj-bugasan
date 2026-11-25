/* Sale detail (Phases 6–7): lines, totals, schedule, payments, delivery, receipts, cancel, record payment, reschedule. */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows, Badge, DataTable } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField, SelectField, TextAreaField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDoc, useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { cancelSale, updateFulfillment } from '../../data/salesService.js';
import { formatMoney } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate, today } from '../../domain/dates.js';
import { formatDateTime } from '../../app/format.js';
import { TERMS_LABELS, METHOD_LABELS, FULFILLMENT_LABELS, linesText } from '../../domain/sales.js';
import { FREQUENCY_LABELS } from '../../domain/schedule.js';
import { PaymentStatusBadge, FulfillmentBadge, PaymentsTable, ScheduleTable, byNo } from './SaleTables.jsx';
import { RecordPaymentDialog, VoidPaymentDialog, RescheduleDialog } from './PaymentDialogs.jsx';
import { usePrint, useBusiness, SaleReceipt, PaymentReceipt } from './Print.jsx';

function CancelSaleDialog({ open, onClose, adapter, sale, activePayments }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [reason, setReason] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setReason(''); setErr(null); } }, [open]);
  const paidC = activePayments.reduce((s, p) => s + p.amountC, 0);
  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { setErr('Enter the reason for cancelling.'); return; }
    setBusy(true); setErr(null);
    try { await cancelSale(adapter, actorOf(auth.user), sale.id, reason); toast({ message: `Sale ${sale.id} cancelled.` }); onClose(); }
    catch (x) { setErr(errorMessage(x)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} title={`Cancel ${sale.id}?`}
      footer={<><Button onClick={onClose}>Keep sale</Button><Button variant="danger" type="submit" form="cancel-form" loading={busy} disabled={!online}>Cancel sale</Button></>}>
      <form id="cancel-form" onSubmit={submit} noValidate className="form-stack">
        <p>Cancelling {sale.id} {sale.lines.length ? <>returns <strong>{linesText(sale.lines)}</strong> to stock</> : 'removes this opening balance'}
          {activePayments.length ? <> and voids <strong>{activePayments.length} payment(s) totalling {formatMoney(paidC)}</strong> as a refund to the customer</> : null}.
          {sale.balanceC > 0 && <> The unpaid balance of {formatMoney(sale.balanceC)} is removed from {sale.customerName}'s account.</>}</p>
        <p className="muted">This cannot be undone. To correct a sale, cancel it and create a new one.</p>
        <TextField label="Reason" required value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} error={err} data-autofocus placeholder="e.g. Wrong quantity entered" />
      </form>
    </Dialog>
  );
}

function DeliveryDialog({ open, onClose, adapter, sale }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [form, setForm] = React.useState({ fulfillment: sale.fulfillment, deliveryDate: sale.deliveryDate || '', notes: sale.notes || '' });
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setForm({ fulfillment: sale.fulfillment, deliveryDate: sale.deliveryDate || (sale.fulfillment === 'PENDING' ? '' : ''), notes: sale.notes || '' }); setErr(null); } }, [open]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await updateFulfillment(adapter, actorOf(auth.user), sale.id, form); toast({ message: 'Delivery updated.' }); onClose(); }
    catch (x) { setErr(errorMessage(x)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Delivery and notes"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="delivery-form" loading={busy} disabled={!online}>Save</Button></>}>
      <form id="delivery-form" onSubmit={submit} noValidate className="form-stack">
        {err && <Banner tone="danger">{err}</Banner>}
        <SelectField label="Delivery status" value={form.fulfillment} onChange={(e) => setForm({ ...form, fulfillment: e.target.value, deliveryDate: form.deliveryDate || (e.target.value !== 'PENDING' ? today() : '') })}
          options={Object.entries(FULFILLMENT_LABELS).map(([value, label]) => ({ value, label }))} />
        <TextField label="Date" type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} help="Planned or actual delivery / pick-up date." />
        <TextAreaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
      </form>
    </Dialog>
  );
}

export function SaleDetailPage({ adapter, id }) {
  const online = useOnline();
  const business = useBusiness(adapter);
  const [printNode, print] = usePrint();
  const { doc: sale, error } = useDoc(adapter, 'sales', id);
  const rowsQ = useQuery(adapter, 'installments', { where: [['saleId', '==', id]] }, `sale-rows-${id}`);
  const paysQ = useQuery(adapter, 'payments', { where: [['saleId', '==', id]] }, `sale-pays-${id}`);
  const [dialog, setDialog] = React.useState(null);
  const now = today();

  if (error) return <div className="page"><Banner tone="danger">{errorMessage(error)}</Banner></div>;
  if (sale === undefined) return <div className="page"><LoadingRows label="Loading sale" /></div>;
  if (sale === null) return <div className="page"><PageHeader title="Sale not found" /><Panel><EmptyState icon="warning" title="This sale does not exist"><Link to="/sales">Back to sales</Link></EmptyState></Panel></div>;

  const rows = (rowsQ.rows || []).slice().sort(byNo);
  const payments = (paysQ.rows || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
  const activePayments = payments.filter((p) => p.status === 'ACTIVE');
  const active = sale.status === 'ACTIVE';
  const isOB = sale.kind === 'OPENING_BALANCE';
  const hasOpenRows = rows.some((r) => r.status === 'PENDING' || r.status === 'PARTIAL');
  const marginC = sale.totalC - (sale.costC ?? sale.lines.reduce((s, l) => s + Math.round(l.qtyH * l.unitCostC / 100), 0));

  const lineColumns = [
    { key: 'item', header: 'Item', className: 'key-col', render: (l) => <Link to={`/items/${l.itemId}`}>{l.itemName}</Link> },
    { key: 'qty', header: 'Quantity', align: 'right', render: (l) => formatQty(l.qtyH, l.unit) },
    { key: 'price', header: 'Unit price', align: 'right', render: (l) => <>{formatMoney(l.unitPriceC)}{l.priceOverridden && <span className="cell-sub">List {formatMoney(l.listPriceC)}</span>}</> },
    { key: 'cost', header: 'Unit cost', align: 'right', render: (l) => <>{formatMoney(l.unitCostC)}{l.unitPriceC < l.unitCostC && <span className="cell-sub delta-out">Below cost</span>}</> },
    { key: 'total', header: 'Amount', align: 'right', render: (l) => formatMoney(l.lineTotalC) },
  ];
  const lineFooter = ['Subtotal', '', '', '', formatMoney(sale.subtotalC)];
  const printReceipt = () => print(<SaleReceipt sale={sale} rows={rows} payments={payments} business={business} />);

  return (
    <div className="page stack">
      <div>
        {isOB ? <Link to="/opening-balances" className="back-link"><Icon name="back" size={16} />Opening balances</Link>
          : <Link to="/sales" className="back-link"><Icon name="back" size={16} />Sales</Link>}
        <PageHeader
          title={<span className="page-title-row">{sale.id} <PaymentStatusBadge sale={sale} />{isOB ? <Badge tone="info">Opening balance</Badge> : <FulfillmentBadge sale={sale} />}</span>}
          description={<>{formatDate(sale.saleDate)} · {sale.customerId === 'WALK_IN' ? 'Walk-in' : <Link to={`/customers/${sale.customerId}`}>{sale.customerName}</Link>} · {TERMS_LABELS[sale.terms]}</>}
          actions={<div className="button-row">
            {active && sale.balanceC > 0 && <Button variant="primary" icon="payment" onClick={() => setDialog({ kind: 'pay' })} disabled={!online}>Record payment</Button>}
            {!isOB && <Button icon="print" onClick={printReceipt}>Print receipt</Button>}
            {active && hasOpenRows && <Button icon="reschedule" onClick={() => setDialog({ kind: 'reschedule' })} disabled={!online}>Reschedule</Button>}
            {active && !isOB && <Button icon="items" onClick={() => setDialog({ kind: 'delivery' })} disabled={!online}>Delivery</Button>}
            {active && <Button icon="cancel" variant="ghost" onClick={() => setDialog({ kind: 'cancel' })} disabled={!online}>{isOB ? 'Cancel entry' : 'Cancel sale'}</Button>}
          </div>} />
      </div>
      {!active && <Banner tone="info">Cancelled {sale.cancel && sale.cancel.at ? formatDateTime(sale.cancel.at) : ''}: {sale.cancel && sale.cancel.reason}. {isOB ? 'It no longer counts in the customer\'s balance' : 'Stock was returned'}{sale.cancel && sale.cancel.refundedC ? ` and ${formatMoney(sale.cancel.refundedC)} refunded` : ''}. {isOB ? '.' : ' This sale no longer counts in sales or profit.'}</Banner>}
      {isOB && active && <Banner tone="info">Opening balance carried over from earlier records: {sale.description}. It is collected like a sale but does not count as revenue or profit.</Banner>}
      {sale.creditLimitOverride && active && <Banner tone="warning">This sale was saved over the customer's credit limit.</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Total</div><div className={`stat-value ${active ? '' : 'strike'}`}>{formatMoney(sale.totalC)}</div>{sale.discountC > 0 && <div className="stat-sub">after {formatMoney(sale.discountC)} discount</div>}</div>
        <div className="stat"><div className="stat-label">Paid</div><div className="stat-value">{formatMoney(active ? sale.paidC : 0)}</div></div>
        <div className="stat"><div className="stat-label">Balance</div><div className={`stat-value ${active && sale.balanceC ? 'is-warning' : ''}`}>{formatMoney(active ? sale.balanceC : 0)}</div></div>
        {isOB ? <div className="stat"><div className="stat-label">Original date</div><div className="stat-value">{formatDate(sale.saleDate)}</div></div>
          : <div className="stat"><div className="stat-label">Gross profit</div><div className={`stat-value ${marginC < 0 ? 'is-danger' : ''}`}>{active ? formatMoney(marginC) : '—'}</div></div>}
      </div>

      {!isOB && <Panel title="Items" flush>
        <DataTable caption="Sale lines" columns={lineColumns} rows={sale.lines.map((l, i) => ({ ...l, id: i }))} footer={lineFooter} />
        {sale.discountC > 0 && <div className="panel-footer totals-line"><span>Discount{sale.discountType === 'PERCENT' ? ` (${sale.discountValue / 100}%)` : ''}</span><strong>−{formatMoney(sale.discountC)}</strong><span>Total</span><strong>{formatMoney(sale.totalC)}</strong></div>}
      </Panel>}

      {rows.length > 0 && (
        <Panel title={sale.terms === 'INSTALLMENT' ? 'Installment schedule' : 'Balance'} flush>
          <ScheduleTable rows={rows} today={now} />
        </Panel>
      )}

      <Panel title="Payments" flush>
        {!paysQ.rows ? <LoadingRows /> : <PaymentsTable rows={payments} showSale={false}
          onAction={(kind, p) => (kind === 'print' ? print(<PaymentReceipt payment={p} sale={sale} business={business} />) : setDialog({ kind: 'void', payment: p }))}
          empty={<EmptyState icon="payment" title="No payments yet">{active && sale.balanceC > 0 ? 'Record a payment when the customer pays.' : ''}</EmptyState>} />}
      </Panel>

      <Panel title="Details">
        <dl className="detail-list">
          <div><dt>Customer</dt><dd>{sale.customerName}{sale.customerContact && ` · ${sale.customerContact}`}</dd></div>
          {isOB && <div className="span-2"><dt>Description</dt><dd>{sale.description}</dd></div>}
          <div><dt>Payment</dt><dd>{TERMS_LABELS[sale.terms]}{sale.terms !== 'INSTALLMENT' && METHOD_LABELS[sale.paymentMethod] ? ` · ${METHOD_LABELS[sale.paymentMethod]}` : ''}</dd></div>
          {sale.plan && <div><dt>Plan</dt><dd>{sale.plan.count} installments · {FREQUENCY_LABELS[sale.plan.frequency]}{sale.plan.downPaymentC ? ` · down payment ${formatMoney(sale.plan.downPaymentC)}` : ''}</dd></div>}
          {!isOB && <div><dt>Delivery</dt><dd>{FULFILLMENT_LABELS[sale.fulfillment]}{sale.deliveryDate ? ` · ${formatDate(sale.deliveryDate)}` : ''}</dd></div>}
          <div><dt>Recorded</dt><dd>{formatDateTime(sale.createdAt)}</dd></div>
          {sale.notes && <div className="span-2"><dt>Notes</dt><dd>{sale.notes}</dd></div>}
        </dl>
      </Panel>

      <RecordPaymentDialog open={!!dialog && dialog.kind === 'pay'} onClose={() => setDialog(null)} adapter={adapter} saleId={sale.id} />
      <VoidPaymentDialog open={!!dialog && dialog.kind === 'void'} onClose={() => setDialog(null)} adapter={adapter} payment={dialog && dialog.payment} />
      <RescheduleDialog open={!!dialog && dialog.kind === 'reschedule'} onClose={() => setDialog(null)} adapter={adapter} sale={sale} rows={rows} />
      {active && <CancelSaleDialog open={!!dialog && dialog.kind === 'cancel'} onClose={() => setDialog(null)} adapter={adapter} sale={sale} activePayments={activePayments} />}
      {active && !isOB && <DeliveryDialog open={!!dialog && dialog.kind === 'delivery'} onClose={() => setDialog(null)} adapter={adapter} sale={sale} />}
      {printNode}
    </div>
  );
}
