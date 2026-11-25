/* Stock count (Phase 4, BR-017): list of counts, count sheet, finalize. */
import { PageHeader, Panel, DataTable, EmptyState, Banner, LoadingRows, Badge } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, useDoc, actorOf, errorMessage } from '../../data/useData.js';
import { formatDateTime } from '../../app/format.js';
import { formatQty, parseQty, qtyToPlain } from '../../domain/quantity.js';
import { formatDate, today } from '../../domain/dates.js';
import { unitLabel } from '../../domain/inventory.js';
import { createCount, saveCountDraft, finalizeCount, discardCount } from '../../data/inventoryService.js';
import { useItems } from './ItemsPage.jsx';
import { ConfirmDialog } from './InventoryDialogs.jsx';

/* ------------------------------------------------------------------ list */

export function StockCountListPage({ adapter }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const { rows, error } = useQuery(adapter, 'stockCounts', { orderBy: [['createdAt', 'desc']], limit: 100 }, 'counts');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ date: today(), note: '' });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  async function start(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const id = await createCount(adapter, actorOf(auth.user), form);
      toast({ message: 'Stock count started.' });
      setOpen(false);
      navigate(`/stock-count/${id}`);
    } catch (x) { setErr(errorMessage(x)); }
    setBusy(false);
  }

  const columns = [
    { key: 'date', header: 'Count date', className: 'key-col', render: (c) => <Link to={`/stock-count/${c.id}`}>{formatDate(c.date)}</Link> },
    { key: 'status', header: 'Status', render: (c) => (c.status === 'FINALIZED' ? <Badge tone="success">Finalized</Badge> : <Badge tone="info">Draft</Badge>) },
    { key: 'counted', header: 'Items counted', align: 'right', render: (c) => `${c.lines.filter((l) => l.countedQtyH !== null).length} of ${c.lines.length}` },
    { key: 'diff', header: 'Differences', align: 'right', render: (c) => (c.status === 'FINALIZED' ? c.lines.filter((l) => l.diffH).length : '—') },
    { key: 'note', header: 'Note', className: 'wrap', render: (c) => c.note || '—' },
    { key: 'at', header: 'Finalized', render: (c) => (c.finalizedAt ? formatDateTime(c.finalizedAt) : '—') },
  ];

  return (
    <div className="page stack">
      <PageHeader title="Stock count" description="Count what is physically on the shelves. Differences become stock adjustments when you finalize."
        actions={<Button variant="primary" icon="plus" onClick={() => { setForm({ date: today(), note: '' }); setErr(null); setOpen(true); }} disabled={!online}>New count</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <Panel flush>
        {!rows ? <LoadingRows label="Loading counts" /> : (
          <DataTable caption="Stock counts" columns={columns} rows={rows}
            empty={<EmptyState icon="stockCount" title="No stock counts yet">Start a count to compare the shelves with the system.</EmptyState>} />
        )}
      </Panel>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title="New stock count"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="new-count" loading={busy} disabled={!online}>Start count</Button></>}>
        <form id="new-count" onSubmit={start} className="form-stack">
          {err && <Banner tone="danger">{err}</Banner>}
          <p className="muted">The count sheet lists every active item. You can save it and continue later.</p>
          <TextField label="Count date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <TextField label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Month-end count" />
        </form>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ count sheet */

export function StockCountPage({ adapter, id }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const { doc: count, error } = useDoc(adapter, 'stockCounts', id);
  const { items } = useItems(adapter);
  const [inputs, setInputs] = React.useState({}); // itemId → typed string (only touched lines)
  const [dialog, setDialog] = React.useState(null); // 'finalize' | 'discard'
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  if (error) return <div className="page"><Banner tone="danger">{errorMessage(error)}</Banner></div>;
  if (count === undefined) return <div className="page"><LoadingRows label="Loading count" /></div>;
  if (count === null) {
    return <div className="page"><PageHeader title="Stock count not found" /><Panel><EmptyState icon="warning" title="This count does not exist">It may have been discarded. <Link to="/stock-count">Back to stock counts</Link></EmptyState></Panel></div>;
  }

  const final = count.status === 'FINALIZED';
  const itemsById = Object.fromEntries((items || []).map((i) => [i.id, i]));
  // For drafts compare with live stock (it may change while counting); finalized counts show what was recorded.
  const lines = count.lines.map((l) => {
    const live = itemsById[l.itemId];
    const typed = inputs[l.itemId];
    let countedH = l.countedQtyH, err = null;
    if (!final && typed !== undefined) { try { countedH = parseQty(typed, l.unit); } catch (e) { err = e.message; countedH = null; } }
    const systemH = final ? l.systemQtyH : (live ? live.qtyH : l.systemQtyH);
    return { ...l, systemH, countedH, err, diffH: countedH === null || countedH === undefined ? null : (final ? l.diffH : countedH - systemH) };
  });
  const counted = lines.filter((l) => l.countedH !== null && l.countedH !== undefined);
  const diffs = counted.filter((l) => l.diffH);
  const hasErrors = lines.some((l) => l.err);
  const countedMap = () => Object.fromEntries(lines.filter((l) => inputs[l.itemId] !== undefined).map((l) => [l.itemId, l.countedH]));

  async function save() {
    setBusy(true); setMsg(null);
    try { await saveCountDraft(adapter, actorOf(auth.user), id, countedMap()); setInputs({}); toast({ message: 'Count saved.' }); }
    catch (e) { setMsg(errorMessage(e)); }
    setBusy(false);
  }

  const columns = [
    { key: 'item', header: 'Item', className: 'key-col', render: (l) => <Link to={`/items/${l.itemId}`}>{l.itemName}</Link> },
    { key: 'system', header: final ? 'System (at finalize)' : 'System', align: 'right', render: (l) => formatQty(l.systemH, l.unit) },
    { key: 'counted', header: 'Counted', align: 'right', render: (l) => (final
      ? (l.countedH === null ? <span className="muted">Not counted</span> : formatQty(l.countedH, l.unit))
      : <div className={`count-input ${l.err ? 'has-error' : ''}`}>
          <div className="input-wrap has-suffix">
            <input className="input num" inputMode="decimal" aria-label={`Counted ${l.itemName}`} aria-invalid={!!l.err || undefined} title={l.err || undefined}
              value={inputs[l.itemId] !== undefined ? inputs[l.itemId] : (l.countedQtyH === null ? '' : qtyToPlain(l.countedQtyH))}
              onChange={(e) => setInputs({ ...inputs, [l.itemId]: e.target.value })} />
            <span className="input-affix input-suffix">{unitLabel(l.unit)}</span>
          </div>
        </div>) },
    { key: 'diff', header: 'Difference', align: 'right', render: (l) => (l.err ? <span className="delta-out">{l.err}</span>
      : l.diffH === null ? '—' : l.diffH === 0 ? <span className="muted">Matches</span>
      : <span className={l.diffH > 0 ? 'delta-in' : 'delta-out'}>{l.diffH > 0 ? '+' : '−'}{formatQty(Math.abs(l.diffH), l.unit)}</span>) },
  ];

  return (
    <div className="page stack">
      <div>
        <Link to="/stock-count" className="back-link"><Icon name="back" size={16} />Stock counts</Link>
        <PageHeader
          title={<span className="page-title-row">Count of {formatDate(count.date)} {final ? <Badge tone="success">Finalized</Badge> : <Badge tone="info">Draft</Badge>}</span>}
          description={count.note || (final ? `Finalized ${formatDateTime(count.finalizedAt)}` : 'Enter what you count. Leave a line empty if you did not count that item.')}
          actions={!final && <div className="button-row">
            <Button icon="trash" variant="ghost" onClick={() => setDialog('discard')} disabled={!online}>Discard</Button>
            <Button icon="save" onClick={save} loading={busy} disabled={!online || hasErrors || !Object.keys(inputs).length}>Save draft</Button>
            <Button icon="done" variant="primary" onClick={() => setDialog('finalize')} disabled={!online || hasErrors || !counted.length}>Finalize count</Button>
          </div>} />
      </div>
      {msg && <Banner tone="danger">{msg}</Banner>}
      {final && <Banner tone="info">This count is finalized and read-only. {count.lines.filter((l) => l.diffH).length} difference(s) were recorded as stock adjustments.</Banner>}
      <Panel flush>
        <div className="toolbar"><span className="toolbar-end">{counted.length} of {lines.length} counted · {diffs.length} difference(s)</span></div>
        <DataTable caption="Count sheet" columns={columns} rows={lines} rowKey="itemId" />
      </Panel>

      <ConfirmDialog open={dialog === 'finalize'} onClose={() => setDialog(null)} title="Finalize stock count?" confirmLabel="Finalize count"
        onConfirm={async () => {
          const r = await finalizeCount(adapter, actorOf(auth.user), id, countedMap());
          setInputs({});
          toast({ message: `Count finalized: ${r.adjusted} adjustment(s) recorded.` });
        }}>
        <p>{counted.length} item(s) counted. {diffs.length
          ? <>Stock will be set to the counted quantity for <strong>{diffs.length}</strong> item(s), each recorded as a stock-count adjustment.</>
          : 'All counted items match the system; no stock will change.'}</p>
        {diffs.length > 0 && <ul>{diffs.slice(0, 8).map((l) => <li key={l.itemId}>{l.itemName}: {formatQty(l.systemH, l.unit)} → {formatQty(l.countedH, l.unit)}</li>)}{diffs.length > 8 && <li>…and {diffs.length - 8} more</li>}</ul>}
        <p className="muted">A finalized count cannot be edited.</p>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'discard'} onClose={() => setDialog(null)} title="Discard this draft?" confirmLabel="Discard draft" tone="danger"
        onConfirm={async () => { await discardCount(adapter, actorOf(auth.user), id); toast({ message: 'Draft discarded.' }); navigate('/stock-count', { replace: true }); }}>
        <p>The counted quantities in this draft are deleted. Stock does not change.</p>
      </ConfirmDialog>
    </div>
  );
}
