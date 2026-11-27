/* Suppliers (Phase 8, RQ-032): list, add/edit, archive/restore, detail with the supplier's restocks. */
import { PageHeader, Panel, EmptyState, Banner, LoadingRows, Badge, DataTable } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, SelectField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, useDoc, actorOf, errorMessage } from '../../data/useData.js';
import { setSupplierStatus, ensureSupplierCodes } from '../../data/purchasingService.js';
import { formatMoney } from '../../domain/money.js';
import { formatDate, today } from '../../domain/dates.js';
import { isOpenRestock, receivedValueC } from '../../domain/purchasing.js';
import { SupplierFormDialog, RestocksTable } from './PurchasingParts.jsx';
import { ConfirmDialog } from '../inventory/InventoryDialogs.jsx';

function supplierStats(restocks) {
  const by = new Map();
  for (const r of restocks || []) {
    const s = by.get(r.supplierId) || { open: 0, receivedC: 0, lastReceipt: null, orders: 0 };
    s.orders += 1;
    if (isOpenRestock(r)) s.open += 1;
    s.receivedC += receivedValueC(r);
    for (const rc of r.receipts || []) if (!s.lastReceipt || rc.date > s.lastReceipt) s.lastReceipt = rc.date;
    by.set(r.supplierId, s);
  }
  return by;
}

export function SuppliersPage({ adapter }) {
  const { rows, error } = useQuery(adapter, 'suppliers', { orderBy: [['nameLower', 'asc']] }, 'suppliers');
  const auth = useAuth();
  const online = useOnline();
  const tried = React.useRef(false);
  // D-051: suppliers made before codes existed get SUP001, SUP002 … once (owner, online).
  React.useEffect(() => {
    if (!rows || tried.current || !online || !auth.user || !rows.some((x) => !x.code)) return;
    tried.current = true;
    ensureSupplierCodes(adapter, actorOf(auth.user)).catch(() => {});
  }, [rows, online]);
  const { rows: restocks } = useQuery(adapter, 'restocks', { orderBy: [['orderDate', 'desc']], limit: 1000 }, 'suppliers-restocks');
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('ACTIVE');
  const [adding, setAdding] = React.useState(false);
  const stats = supplierStats(restocks);
  const q = search.trim().toLowerCase();
  const shown = (rows || []).filter((s) => (!status || s.status === status)
    && (!q || [s.name, s.contactPerson, s.contactNumber, s.address].some((v) => String(v || '').toLowerCase().includes(q))));
  const columns = [
    { key: 'name', header: 'Supplier', className: 'key-col wrap', render: (s) => <><Link to={`/suppliers/${s.id}`}>{s.name}</Link>{s.code && <span className="cell-sub">{s.code}</span>}{s.status === 'ARCHIVED' && <span className="cell-sub"><Badge>Archived</Badge></span>}</> },
    { key: 'contact', header: 'Contact', className: 'wrap', render: (s) => <>{s.contactPerson || '—'}{s.contactNumber && <span className="cell-sub">{s.contactNumber}</span>}</> },
    { key: 'open', header: 'Open orders', align: 'right', render: (s) => (stats.get(s.id) || {}).open || 0 },
    { key: 'last', header: 'Last delivery', render: (s) => { const d = (stats.get(s.id) || {}).lastReceipt; return d ? formatDate(d) : <span className="muted">—</span>; } },
    { key: 'value', header: 'Received (all time)', align: 'right', render: (s) => formatMoney((stats.get(s.id) || {}).receivedC || 0) },
  ];
  return (
    <div className="page stack">
      <PageHeader title="Suppliers" description="Where your rice comes from. Open a supplier to see its orders and deliveries."
        actions={<Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add supplier</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <Panel flush>
        <div className="toolbar">
          <TextField label="Search" className="toolbar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, contact or address" />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'ARCHIVED', label: 'Archived' }, { value: '', label: 'All' }]} />
          <span className="toolbar-end">{rows ? `${shown.length} shown` : ''}</span>
        </div>
        {!rows ? <LoadingRows label="Loading suppliers" /> : (
          <DataTable caption="Suppliers" columns={columns} rows={shown}
            empty={rows.length
              ? <EmptyState icon="search" title="No matching suppliers">Change the search or filters.</EmptyState>
              : <EmptyState icon="suppliers" title="No suppliers yet" action={<div className="button-row"><Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add supplier</Button></div>}>
                  Add the suppliers you buy rice from, then record restock orders.</EmptyState>} />
        )}
      </Panel>
      <SupplierFormDialog open={adding} onClose={() => setAdding(false)} adapter={adapter} suppliers={rows || []} onSaved={(id) => navigate(`/suppliers/${id}`)} />
    </div>
  );
}

export function SupplierDetailPage({ adapter, id }) {
  const { doc: s, error } = useDoc(adapter, 'suppliers', id);
  const { rows: restocks } = useQuery(adapter, 'restocks', { where: [['supplierId', '==', id]] }, `supplier-restocks-${id}`);
  const { rows: suppliers } = useQuery(adapter, 'suppliers', { orderBy: [['nameLower', 'asc']] }, 'suppliers');
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  if (s === undefined) return <div className="page"><LoadingRows label="Loading supplier" /></div>;
  if (!s) return <div className="page stack"><Link to="/suppliers" className="back-link">← Suppliers</Link><EmptyState icon="suppliers" title="Supplier not found">{error ? errorMessage(error) : 'It may have been removed.'}</EmptyState></div>;
  const list = (restocks || []).slice().sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id.localeCompare(a.id)));
  const st = supplierStats(list).get(id) || { open: 0, receivedC: 0, lastReceipt: null, orders: 0 };
  const archived = s.status === 'ARCHIVED';
  return (
    <div className="page stack">
      <Link to="/suppliers" className="back-link">← Suppliers</Link>
      <PageHeader title={<span className="page-title-row">{s.name}{archived && <Badge>Archived</Badge>}</span>} description={[s.code, s.contactPerson, s.contactNumber].filter(Boolean).join(' · ') || null}
        actions={<div className="button-row">
          {!archived && <Button variant="primary" icon="restocks" onClick={() => navigate(`/restocks/new?supplier=${id}`)} disabled={!online}>New restock</Button>}
          <Button icon="edit" onClick={() => setEditing(true)} disabled={!online}>Edit</Button>
          <Button icon={archived ? 'restore' : 'archive'} onClick={() => setConfirm(true)} disabled={!online}>{archived ? 'Restore' : 'Archive'}</Button>
        </div>} />
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Orders</div><div className="stat-value">{st.orders}</div></div>
        <div className="stat"><div className="stat-label">Open orders</div><div className="stat-value">{st.open}</div></div>
        <div className="stat"><div className="stat-label">Last delivery</div><div className="stat-value">{st.lastReceipt ? formatDate(st.lastReceipt) : '—'}</div></div>
        <div className="stat"><div className="stat-label">Received (all time)</div><div className="stat-value">{formatMoney(st.receivedC)}</div></div>
      </div>
      <Panel title="Details">
        <dl className="detail-list">
          <div><dt>Contact person</dt><dd>{s.contactPerson || '—'}</dd></div>
          <div><dt>Contact number</dt><dd>{s.contactNumber || '—'}</dd></div>
          <div><dt>Email</dt><dd>{s.email || '—'}</dd></div>
          <div><dt>Address</dt><dd>{s.address || '—'}</dd></div>
          {s.notes && <div className="span-2"><dt>Notes</dt><dd>{s.notes}</dd></div>}
        </dl>
      </Panel>
      <Panel title="Restocks" flush>
        {!restocks ? <LoadingRows /> : <RestocksTable rows={list} today={today()} showSupplier={false} empty={<EmptyState icon="restocks" title="No orders yet">Orders from this supplier appear here.</EmptyState>} />}
      </Panel>
      <SupplierFormDialog open={editing} onClose={() => setEditing(false)} adapter={adapter} supplier={s} suppliers={suppliers || []} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={archived ? `Restore ${s.name}?` : `Archive ${s.name}?`} confirmLabel={archived ? 'Restore' : 'Archive'}
        onConfirm={async () => { await setSupplierStatus(adapter, actorOf(auth.user), id, archived ? 'ACTIVE' : 'ARCHIVED'); toast({ message: archived ? 'Supplier restored.' : 'Supplier archived.' }); }}>
        <p>{archived ? 'The supplier can receive new orders again.' : 'Archived suppliers keep their history but cannot get new orders. Open orders can still be received.'}</p>
      </ConfirmDialog>
    </div>
  );
}
