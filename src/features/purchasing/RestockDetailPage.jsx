/*
 * Restock detail (Phase 8): order lines with ordered / received / remaining, receipts history, and actions:
 * Receive (BR-061, with the pre-checked "Update item cost" when the cost differs — BR-062, RQ-033), Edit, Cancel
 * (only while nothing was received — BR-060) and Close (a short delivery, D-038).
 */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows, DataTable } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDoc, useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { receiveRestock, cancelRestock, closeRestock } from '../../data/purchasingService.js';
import { formatMoney, parseMoney, centavosToPlain } from '../../domain/money.js';
import { formatQty, parseQty, qtyToPlain } from '../../domain/quantity.js';
import { formatDate, today } from '../../domain/dates.js';
import { unitLabel } from '../../domain/inventory.js';
import { lineCost } from '../../domain/saleTotals.js';
import { remainingH, isOpenRestock, receivedValueC, costDiffers, planReceipt } from '../../domain/purchasing.js';
import { RestockStatusBadge } from './PurchasingParts.jsx';

function ReceiveDialog({ open, onClose, adapter, restock, itemsById }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const open_ = restock.lines.filter((l) => remainingH(l) > 0);
  const init = () => Object.fromEntries(open_.map((l) => [l.itemId, { qty: qtyToPlain(remainingH(l)), cost: centavosToPlain(l.unitCostC), price: itemsById[l.itemId] ? centavosToPlain(itemsById[l.itemId].priceC) : '', update: true }]));
  const [date, setDate] = React.useState(today());
  const [vals, setVals] = React.useState(init);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setVals(init()); setDate(today()); setErr(null); } }, [open]);
  const set = (id, patch) => { setVals((v) => ({ ...v, [id]: { ...v[id], ...patch } })); setErr(null); };

  const parsed = open_.map((l) => {
    const v = vals[l.itemId] || { qty: '', cost: '', price: '', update: true };
    let qtyH = null, costC = null, priceC = null, qErr = null, cErr = null, pErr = null;
    try { qtyH = parseQty(v.qty, l.unit) ?? 0; } catch (x) { qErr = x.message; }
    try { costC = parseMoney(v.cost); if (costC === null) cErr = 'Required.'; } catch (x) { cErr = x.message; }
    try { priceC = parseMoney(v.price); if (priceC === null) pErr = 'Enter the selling price.'; else if (priceC < 0) pErr = 'Cannot be negative.'; } catch (x) { pErr = x.message; }
    if (!qErr && qtyH > remainingH(l)) qErr = `Only ${formatQty(remainingH(l), l.unit)} left on the order.`;
    return { l, v, qtyH, costC, priceC, qErr, cErr, pErr, item: itemsById[l.itemId] };
  });
  const totalC = parsed.reduce((s, p) => s + (p.qtyH && p.costC !== null ? lineCost(p.qtyH, p.costC) : 0), 0);

  async function submit(e) {
    e.preventDefault();
    const bad = parsed.find((p) => p.qErr || (p.qtyH > 0 && (p.cErr || p.pErr)));
    if (bad) { setErr(`${bad.l.itemName}: ${bad.qErr || bad.cErr || bad.pErr}`); return; }
    const input = { date, lines: parsed.map((p) => ({ itemId: p.l.itemId, qtyH: p.qtyH || 0, unitCostC: p.costC ?? 0, priceC: p.priceC ?? null, updateCost: !!p.v.update })) };
    try { planReceipt(restock, input); } catch (x) { setErr(x.message); return; }
    setBusy(true); setErr(null);
    try {
      const r = await receiveRestock(adapter, actorOf(auth.user), restock.id, input);
      toast({ message: r.status === 'RECEIVED' ? `Received as batch ${r.batchId}. ${restock.id} is complete.` : `Received ${formatMoney(r.valueC)} as batch ${r.batchId}. The rest is still to come.` });
      onClose();
    } catch (x) { setErr(errorMessage(x)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={`Receive goods — ${restock.id}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="receive-form" icon="receive" loading={busy} disabled={!online}>Receive and add to stock</Button></>}>
      <form id="receive-form" onSubmit={submit} noValidate className="form-stack">
        {err && <Banner tone="danger">{err}</Banner>}
        <p className="muted">Enter what actually arrived, its cost and its cash selling price. Leave 0 for items that did not come yet. This delivery becomes one batch (number given on saving); older batches are sold first.</p>
        <TextField label="Date received" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="receive-date" />
        <div className="list-rows">
          {parsed.map((p) => {
            const differs = p.item && p.costC !== null && costDiffers(p.item, p.costC);
            return (
              <div className="receive-row" key={p.l.itemId}>
                <div className="receive-item"><strong>{p.l.itemName}</strong><span className="muted small">{formatQty(remainingH(p.l), p.l.unit)} to receive{p.item ? ` · in stock ${formatQty(p.item.qtyH, p.item.unit)}` : ''}</span></div>
                <TextField label="Received" aria-label={`Received ${p.l.itemName}`} value={p.v.qty} onChange={(e) => set(p.l.itemId, { qty: e.target.value })} inputMode="decimal" suffix={unitLabel(p.l.unit)} inputClassName="num" error={p.qErr} />
                <TextField label="Unit cost" aria-label={`Unit cost ${p.l.itemName}`} value={p.v.cost} onChange={(e) => set(p.l.itemId, { cost: e.target.value })} inputMode="decimal" prefix="₱" inputClassName="num" error={p.qtyH ? p.cErr : null} />
                <TextField label="Cash price" aria-label={`Cash price ${p.l.itemName}`} value={p.v.price} onChange={(e) => set(p.l.itemId, { price: e.target.value })} inputMode="decimal" prefix="₱" inputClassName="num" error={p.qtyH ? p.pErr : null} />
                <div className="receive-cost">
                  {(differs || (p.item && p.priceC !== null && p.priceC !== p.item.priceC)) && p.qtyH > 0 ? (
                    <label className="checkbox"><input type="checkbox" checked={!!p.v.update} onChange={(e) => set(p.l.itemId, { update: e.target.checked })} />
                      Make these the item's default cost and price</label>
                  ) : <span className="muted small">{p.item ? `Defaults: cost ${formatMoney(p.item.costC)}, price ${formatMoney(p.item.priceC)}` : ''}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="summary-box"><div className="row"><span>Value received</span><strong>{formatMoney(totalC)}</strong></div></div>
      </form>
    </Dialog>
  );
}

function ReasonDialog({ open, onClose, title, intro, label, confirmLabel, tone = 'danger', onConfirm }) {
  const online = useOnline();
  const [reason, setReason] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setReason(''); setErr(null); } }, [open]);
  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { setErr('Enter the reason.'); return; }
    setBusy(true); setErr(null);
    try { await onConfirm(reason); onClose(); } catch (x) { setErr(errorMessage(x)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={title}
      footer={<><Button onClick={onClose}>Back</Button><Button variant={tone} type="submit" form="reason-form" loading={busy} disabled={!online}>{confirmLabel}</Button></>}>
      <form id="reason-form" onSubmit={submit} noValidate className="form-stack">
        <p>{intro}</p>
        <TextField label={label} required value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} error={err} data-autofocus />
      </form>
    </Dialog>
  );
}

export { ReasonDialog };

export function RestockDetailPage({ adapter, id }) {
  const { doc: r, error } = useDoc(adapter, 'restocks', id);
  const { rows: items } = useQuery(adapter, 'items', { orderBy: [['nameLower', 'asc']] }, 'restock-items');
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [dialog, setDialog] = React.useState(null);
  if (r === undefined) return <div className="page"><LoadingRows label="Loading restock" /></div>;
  if (!r) return <div className="page stack"><Link to="/restocks" className="back-link">← Restocks</Link><EmptyState icon="restocks" title="Restock not found">{error ? errorMessage(error) : 'Check the restock number.'}</EmptyState></div>;
  const itemsById = Object.fromEntries((items || []).map((i) => [i.id, i]));
  const open = isOpenRestock(r);
  const actor = () => actorOf(auth.user);
  const lineCols = [
    { key: 'item', header: 'Item', className: 'key-col wrap', render: (l) => <Link to={`/items/${l.itemId}`}>{l.itemName}</Link> },
    { key: 'ordered', header: 'Ordered', align: 'right', render: (l) => formatQty(l.qtyOrderedH, l.unit) },
    { key: 'received', header: 'Received', align: 'right', render: (l) => formatQty(l.qtyReceivedH || 0, l.unit) },
    { key: 'remaining', header: 'To receive', align: 'right', render: (l) => (remainingH(l) && r.status !== 'CANCELLED' && !r.closed ? <strong>{formatQty(remainingH(l), l.unit)}</strong> : '—') },
    { key: 'cost', header: 'Unit cost', align: 'right', render: (l) => formatMoney(l.unitCostC) },
    { key: 'amount', header: 'Amount', align: 'right', render: (l) => formatMoney(lineCost(l.qtyOrderedH, l.unitCostC)) },
  ];
  const receipts = (r.receipts || []).map((rc, i) => ({ ...rc, id: String(i) }));
  const receiptCols = [
    { key: 'date', header: 'Date', render: (rc) => formatDate(rc.date) },
    { key: 'batch', header: 'Batch', render: (rc) => rc.batchId || '—' },
    { key: 'lines', header: 'Received', className: 'wrap', render: (rc) => rc.lines.map((l) => `${formatQty(l.qtyH, l.unit)} ${l.itemName} @ ${formatMoney(l.unitCostC)}` + (Number.isInteger(l.priceC) ? ` (sells ${formatMoney(l.priceC)})` : '')).join(', ') },
    { key: 'by', header: 'By', render: (rc) => rc.byName || '—' },
    { key: 'value', header: 'Value', align: 'right', render: (rc) => formatMoney(rc.lines.reduce((s, l) => s + lineCost(l.qtyH, l.unitCostC), 0)) },
  ];
  return (
    <div className="page stack">
      <Link to="/restocks" className="back-link">← Restocks</Link>
      <PageHeader title={<span className="page-title-row">{r.id}<RestockStatusBadge restock={r} today={today()} /></span>}
        description={<>From <Link to={`/suppliers/${r.supplierId}`}>{r.supplierName}</Link> · ordered {formatDate(r.orderDate)}{r.expectedDate ? ` · expected ${formatDate(r.expectedDate)}` : ''}</>}
        actions={open && <div className="button-row">
          <Button variant="primary" icon="receive" onClick={() => setDialog('receive')} disabled={!online || !items}>Receive goods</Button>
          <Button icon="edit" onClick={() => navigate(`/restocks/${id}/edit`)} disabled={!online}>Edit order</Button>
          {r.status === 'ORDERED' && <Button icon="cancel" onClick={() => setDialog('cancel')} disabled={!online}>Cancel order</Button>}
          {r.status === 'PARTIALLY_RECEIVED' && <Button icon="close2" onClick={() => setDialog('close')} disabled={!online}>Close order</Button>}
        </div>} />
      {r.status === 'CANCELLED' && <Banner tone="warning">Cancelled: {r.cancel && r.cancel.reason}</Banner>}
      {r.closed && <Banner tone="info">Closed without the rest of the goods: {r.closed.reason}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Order total</div><div className="stat-value">{formatMoney(r.totalCostC)}</div></div>
        <div className="stat"><div className="stat-label">Received value</div><div className="stat-value">{formatMoney(receivedValueC(r))}</div></div>
        <div className="stat"><div className="stat-label">Deliveries</div><div className="stat-value">{receipts.length}</div></div>
        <div className="stat"><div className="stat-label">Lines</div><div className="stat-value">{r.lines.length}</div></div>
      </div>
      <Panel title="Order" flush><DataTable caption="Order lines" columns={lineCols} rows={r.lines.map((l) => ({ ...l, id: l.itemId }))} /></Panel>
      <Panel title="Deliveries received" flush>
        <DataTable caption="Deliveries" columns={receiptCols} rows={receipts} empty={<EmptyState icon="receive" title="Nothing received yet">{open ? 'Use “Receive goods” when the delivery arrives.' : null}</EmptyState>} />
      </Panel>
      {r.notes && <Panel title="Notes"><p>{r.notes}</p></Panel>}
      {dialog === 'receive' && <ReceiveDialog open onClose={() => setDialog(null)} adapter={adapter} restock={r} itemsById={itemsById} />}
      <ReasonDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title={`Cancel ${r.id}?`} label="Reason" confirmLabel="Cancel order"
        intro="Nothing was received on this order, so stock does not change. A cancelled order cannot be reopened."
        onConfirm={async (why) => { await cancelRestock(adapter, actor(), id, why); toast({ message: `Order ${id} cancelled.` }); }} />
      <ReasonDialog open={dialog === 'close'} onClose={() => setDialog(null)} title={`Close ${r.id}?`} label="Reason" confirmLabel="Close order" tone="primary"
        intro="Use this when the rest of the order will not arrive. What was received stays in stock; the remaining quantities are no longer expected."
        onConfirm={async (why) => { await closeRestock(adapter, actor(), id, why); toast({ message: `Order ${id} closed.` }); }} />
    </div>
  );
}
