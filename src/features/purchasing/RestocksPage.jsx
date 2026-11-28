/* Restocks list and order form (Phase 8, RQ-032, BR-060, BR-061). Stock changes only when goods are received. */
import { PageHeader, Panel, EmptyState, Banner, LoadingRows } from '../../components/Feedback.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { TextField, SelectField, TextAreaField } from '../../components/Field.jsx';
import { Combobox } from '../../components/Combobox.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, useDoc, actorOf, errorMessage } from '../../data/useData.js';
import { createRestock, updateRestock } from '../../data/purchasingService.js';
import { formatMoney, centavosToPlain, parseMoney } from '../../domain/money.js';
import { formatQty, parseQty, qtyToPlain } from '../../domain/quantity.js';
import { today } from '../../domain/dates.js';
import { unitLabel } from '../../domain/inventory.js';
import { lineCost } from '../../domain/saleTotals.js';
import { RESTOCK_STATUS_LABELS, validateRestockForm, isOpenRestock } from '../../domain/purchasing.js';
import { RestocksTable, SupplierFormDialog } from './PurchasingParts.jsx';
import { ItemFormDialog } from '../inventory/InventoryDialogs.jsx';

export function RestocksPage({ adapter }) {
  const [limit, setLimit] = React.useState(300);
  const { rows, error } = useQuery(adapter, 'restocks', { orderBy: [['orderDate', 'desc']], limit }, `restocks-${limit}`);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('OPEN');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const online = useOnline();
  const now = today();
  const q = search.trim().toLowerCase();
  const all = (rows || []).slice().sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id.localeCompare(a.id)));
  const shown = all.filter((r) => (status === 'OPEN' ? isOpenRestock(r) : !status || r.status === status)
    && (!from || r.orderDate >= from) && (!to || r.orderDate <= to)
    && (!q || r.id.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q) || r.lines.some((l) => l.itemName.toLowerCase().includes(q))));
  const open = all.filter(isOpenRestock);
  const late = open.filter((r) => r.expectedDate && r.expectedDate < now);
  const openValue = open.reduce((s, r) => s + r.lines.reduce((a, l) => a + lineCost(l.qtyOrderedH - (l.qtyReceivedH || 0), l.unitCostC), 0), 0);
  return (
    <div className="page stack">
      <PageHeader title="Restocks" description="Orders from suppliers. Stock goes up only when you receive the goods."
        actions={<Button variant="primary" icon="plus" onClick={() => navigate('/restocks/new')} disabled={!online}>New restock</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Open orders</div><div className="stat-value">{rows ? open.length : '—'}</div></div>
        <div className="stat"><div className="stat-label">Late</div><div className={`stat-value ${late.length ? 'is-danger' : ''}`}>{rows ? late.length : '—'}</div><div className="stat-sub">past the expected date</div></div>
        <div className="stat"><div className="stat-label">Still to receive</div><div className="stat-value">{rows ? formatMoney(openValue) : '—'}</div><div className="stat-sub">at order cost</div></div>
        <div className="stat"><div className="stat-label">Orders shown</div><div className="stat-value">{rows ? shown.length : '—'}</div></div>
      </div>
      <Panel flush>
        <div className="toolbar">
          <TextField label="Search" className="toolbar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Restock no., supplier or item" />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}
            options={[{ value: 'OPEN', label: 'Open (to receive)' }, ...Object.entries(RESTOCK_STATUS_LABELS).map(([value, label]) => ({ value, label })), { value: '', label: 'All' }]} />
          <TextField label="Ordered from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="Ordered to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="toolbar-end">{rows ? `${shown.length} shown` : ''}</span>
        </div>
        {!rows ? <LoadingRows label="Loading restocks" /> : (
          <RestocksTable rows={shown} today={now}
            empty={all.length
              ? <EmptyState icon="search" title="No matching restocks">Change the search or filters.</EmptyState>
              : <EmptyState icon="restocks" title="No restocks yet" action={<div className="button-row"><Button variant="primary" icon="plus" onClick={() => navigate('/restocks/new')} disabled={!online}>New restock</Button></div>}>
                  Record what you order from suppliers, then receive it when it arrives.</EmptyState>} />
        )}
        {rows && rows.length >= limit && <div className="list-more"><Button size="sm" onClick={() => setLimit(limit + 300)}>Show more</Button></div>}
      </Panel>
    </div>
  );
}

let lineKey = 0;
const newLine = (o = {}) => ({ key: ++lineKey, itemId: '', qty: '', unitCost: '', ...o });

/** New order (id absent) or edit an open order (BR-061). */
export function RestockFormPage({ adapter, id, supplierId: presetSupplier }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const { rows: items } = useQuery(adapter, 'items', { orderBy: [['nameLower', 'asc']] }, 'restock-items');
  const { rows: suppliers } = useQuery(adapter, 'suppliers', { orderBy: [['nameLower', 'asc']] }, 'suppliers');
  const { doc: existing } = useDoc(adapter, 'restocks', id || '_none');
  const [form, setForm] = React.useState({ supplierId: presetSupplier || '', orderDate: today(), expectedDate: '', notes: '' });
  const [lines, setLines] = React.useState([newLine()]);
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [addingSupplier, setAddingSupplier] = React.useState(false);
  const [addingItem, setAddingItem] = React.useState(false);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (!id || loaded.current || !existing) return;
    loaded.current = true;
    setForm({ supplierId: existing.supplierId, orderDate: existing.orderDate, expectedDate: existing.expectedDate || '', notes: existing.notes || '' });
    setLines(existing.lines.map((l) => newLine({ itemId: l.itemId, qty: qtyToPlain(l.qtyOrderedH), unitCost: centavosToPlain(l.unitCostC), received: l.qtyReceivedH || 0 })));
  }, [id, existing]);

  if (id && existing === undefined) return <div className="page"><LoadingRows label="Loading restock" /></div>;
  if (id && (!existing || !isOpenRestock(existing))) {
    return <div className="page stack"><Link to={`/restocks/${id}`} className="back-link">← Back</Link><EmptyState icon="restocks" title="This order cannot be edited">{existing ? `It is ${RESTOCK_STATUS_LABELS[existing.status].toLowerCase()}.` : 'It was not found.'}</EmptyState></div>;
  }

  const itemsById = Object.fromEntries((items || []).map((i) => [i.id, i]));
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key, itemId) => { const it = itemsById[itemId]; setLine(key, { itemId, unitCost: it ? centavosToPlain(it.costC) : '' }); };
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const { data, errors: live } = validateRestockForm({ ...form, lines }, itemsById, existing || null);
  const lineErrs = errors.lineErrors || {};
  const supplierOptions = (suppliers || []).filter((s) => s.status === 'ACTIVE' || s.id === form.supplierId)
    .map((s) => ({ value: s.id, label: s.name, detail: [s.contactPerson, s.contactNumber].filter(Boolean).join(' · ') }));
  const itemOptions = (items || []).filter((i) => i.status === 'ACTIVE' || lines.some((l) => l.itemId === i.id))
    .map((i) => ({ value: i.id, label: i.name, detail: `${i.sku ? `${i.sku} · ` : ''}${formatQty(i.qtyH, i.unit)} in stock · cost ${formatMoney(i.costC)}/${unitLabel(i.unit, false)}` }));

  async function submit(e) {
    e.preventDefault();
    setErrors(live);
    if (Object.keys(live).length) return;
    setBusy(true); setSaveError(null);
    try {
      const actor = actorOf(auth.user);
      if (id) { await updateRestock(adapter, actor, id, data); toast({ message: `Order ${id} updated.` }); navigate(`/restocks/${id}`); }
      else { const rid = await createRestock(adapter, actor, data); toast({ message: `Restock ${rid} saved.` }); navigate(`/restocks/${rid}`); }
    } catch (err) { setSaveError(errorMessage(err)); setBusy(false); }
  }

  return (
    <div className="page stack">
      <Link to={id ? `/restocks/${id}` : '/restocks'} className="back-link">← {id ? id : 'Restocks'}</Link>
      <PageHeader title={id ? `Edit order ${id}` : 'New restock'} description="Saving an order does not change stock. Receive the goods when they arrive." />
      {saveError && <Banner tone="danger">{saveError}</Banner>}
      <form onSubmit={submit} noValidate className="stack">
        <Panel title="Supplier and dates">
          <div className="form-grid">
            <Combobox label="Supplier" required options={supplierOptions} value={form.supplierId} onChange={(v) => { setForm((f) => ({ ...f, supplierId: v })); setErrors((x) => ({ ...x, supplierId: undefined })); }} error={errors.supplierId} placeholder="Search supplier" />
            <TextField label="Order date" type="date" required value={form.orderDate} onChange={set('orderDate')} error={errors.orderDate} />
            <TextField label="Expected delivery" type="date" value={form.expectedDate} onChange={set('expectedDate')} error={errors.expectedDate} help="Shown on the calendar." />
          </div>
          <div className="button-row"><Button size="sm" icon="plus" onClick={() => setAddingSupplier(true)} disabled={!online}>New supplier</Button></div>
        </Panel>
        <Panel title="Items" flush>
          <div className="sale-lines">
            {lines.map((l, idx) => {
              const it = itemsById[l.itemId];
              let qtyH = null, costC = null;
              try { qtyH = it ? parseQty(l.qty, it.unit) : null; } catch (x) { qtyH = null; }
              try { costC = parseMoney(l.unitCost); } catch (x) { costC = null; }
              const le = lineErrs[idx] || {};
              return (
                <div key={l.key} className="sale-line">
                  <Combobox label={idx === 0 ? 'Item' : undefined} inputLabel={`Item ${idx + 1}`} className="sale-line-item" options={itemOptions} value={l.itemId} onChange={(v) => pickItem(l.key, v)} placeholder="Search rice item" error={le.itemId} help={it && it.sku ? <span className="sku">{it.sku}</span> : null} />
                  <TextField label={idx === 0 ? 'Quantity' : undefined} aria-label={`Quantity ${idx + 1}`} className="sale-line-qty" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    inputMode="decimal" suffix={it ? unitLabel(it.unit) : ''} inputClassName="num" disabled={!it} error={le.qty} help={l.received ? `${formatQty(l.received, it ? it.unit : 'KG')} received` : null} />
                  <TextField label={idx === 0 ? 'Unit cost' : undefined} aria-label={`Unit cost ${idx + 1}`} className="sale-line-price" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: e.target.value })}
                    inputMode="decimal" prefix="₱" inputClassName="num" disabled={!it} error={le.unitCost}
                    help={it && costC !== null && costC !== it.costC ? `Current cost ${formatMoney(it.costC)}` : null} />
                  <div className="sale-line-total">{idx === 0 && <div className="field-label">Amount</div>}<strong className="num">{qtyH && costC !== null ? formatMoney(lineCost(qtyH, costC)) : '—'}</strong></div>
                  <IconButton icon="trash" label={`Remove line ${idx + 1}`} size="sm" className="sale-line-remove" disabled={!!l.received} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} />
                </div>
              );
            })}
          </div>
          {errors.lines && <div className="panel-body"><Banner tone="danger">{errors.lines}</Banner></div>}
          <div className="panel-footer">
            <Button size="sm" icon="plus" onClick={() => setLines((ls) => [...ls, newLine()])}>Add line</Button>
            <Button size="sm" icon="plus" onClick={() => setAddingItem(true)} disabled={!online || !items}>New item</Button>
            <span className="footer-total"><span>Order total</span><strong>{formatMoney(data.totalCostC)}</strong></span>
          </div>
        </Panel>
        <Panel title="Notes"><TextAreaField label="Notes" value={form.notes} onChange={set('notes')} error={errors.notes} rows={2} /></Panel>
        <div className="button-row">
          <Button variant="primary" type="submit" icon="save" loading={busy} disabled={!online || !items || !suppliers}>{id ? 'Save changes' : 'Save order'}</Button>
          <Button onClick={() => navigate(id ? `/restocks/${id}` : '/restocks')}>Cancel</Button>
        </div>
      </form>
      {/* D-064: the full Items → Add item form; the new item goes on the first empty line (or a new one). */}
      <ItemFormDialog open={addingItem} onClose={() => setAddingItem(false)} adapter={adapter} items={items || []}
        onSaved={async (newId) => {
          const it = await adapter.get('items', newId);
          const patch = { itemId: newId, unitCost: it ? centavosToPlain(it.costC) : '' };
          setLines((ls) => { const empty = ls.find((l) => !l.itemId); return empty ? ls.map((l) => (l.key === empty.key ? { ...l, ...patch } : l)) : [...ls, newLine(patch)]; });
        }} />
      <SupplierFormDialog open={addingSupplier} onClose={() => setAddingSupplier(false)} adapter={adapter} suppliers={suppliers || []} onSaved={(sid) => setForm((f) => ({ ...f, supplierId: sid }))} />
    </div>
  );
}
