/* Shared parts for Phase 8 screens: restock status badge, restocks table, supplier form dialog. */
import { Badge, DataTable, Banner } from '../../components/Feedback.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, TextAreaField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOnline } from '../../app/useOnline.js';
import { Link } from '../../app/router.jsx';
import { actorOf, errorMessage } from '../../data/useData.js';
import { createSupplier, updateSupplier } from '../../data/purchasingService.js';
import { formatMoney } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate, compareDates } from '../../domain/dates.js';
import { RESTOCK_STATUS_LABELS, validateSupplierForm, receivedValueC, isOpenRestock } from '../../domain/purchasing.js';

const TONE = { ORDERED: 'info', PARTIALLY_RECEIVED: 'warning', RECEIVED: 'success', CANCELLED: 'neutral' };

export function RestockStatusBadge({ restock, today }) {
  const late = today && isOpenRestock(restock) && restock.expectedDate && compareDates(restock.expectedDate, today) < 0;
  return (
    <span className="badge-row">
      <Badge tone={TONE[restock.status]}>{RESTOCK_STATUS_LABELS[restock.status]}{restock.closed ? ' (closed short)' : ''}</Badge>
      {late && <Badge tone="danger">Late</Badge>}
    </span>
  );
}

const itemsText = (lines) => lines.map((l) => `${formatQty(l.qtyOrderedH, l.unit)} ${l.itemName}`).join(', ');

export function RestocksTable({ rows, empty, today, showSupplier = true }) {
  const columns = [
    { key: 'id', header: 'Restock', className: 'key-col', render: (r) => <Link to={`/restocks/${r.id}`}>{r.id}</Link> },
    { key: 'orderDate', header: 'Ordered', render: (r) => formatDate(r.orderDate) },
    ...(showSupplier ? [{ key: 'supplier', header: 'Supplier', className: 'wrap', render: (r) => <Link to={`/suppliers/${r.supplierId}`}>{r.supplierName}</Link> }] : []),
    { key: 'items', header: 'Items', className: 'wrap', render: (r) => <span className="cell-clip" title={itemsText(r.lines)}>{itemsText(r.lines)}</span> },
    { key: 'expected', header: 'Expected', render: (r) => (r.expectedDate ? formatDate(r.expectedDate) : <span className="muted">—</span>) },
    { key: 'status', header: 'Status', render: (r) => <RestockStatusBadge restock={r} today={today} /> },
    { key: 'total', header: 'Order total', align: 'right', render: (r) => formatMoney(r.totalCostC) },
    { key: 'received', header: 'Received value', align: 'right', render: (r) => formatMoney(receivedValueC(r)) },
  ];
  return <DataTable caption="Restocks" columns={columns} rows={rows} empty={empty} rowClassName={(r) => (r.status === 'CANCELLED' ? 'is-muted' : undefined)} />;
}

const initialSupplier = (s) => ({
  name: s ? s.name : '', contactPerson: (s && s.contactPerson) || '', contactNumber: (s && s.contactNumber) || '',
  email: (s && s.email) || '', address: (s && s.address) || '', notes: (s && s.notes) || '',
});

export function SupplierFormDialog({ open, onClose, adapter, supplier, suppliers = [], onSaved }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const isNew = !supplier;
  const [form, setForm] = React.useState(() => initialSupplier(supplier));
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { if (open) { setForm(initialSupplier(supplier)); setErrors({}); setError(null); } }, [open, supplier && supplier.id]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const sameName = form.name.trim() && suppliers.find((s) => s.nameLower === form.name.trim().toLowerCase() && (!supplier || s.id !== supplier.id));

  async function submit(e) {
    e.preventDefault();
    const { data, errors: errs } = validateSupplierForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try {
      const actor = actorOf(auth.user);
      if (isNew) { const id = await createSupplier(adapter, actor, data); toast({ message: `${data.name} added.` }); onSaved && onSaved(id); }
      else { await updateSupplier(adapter, actor, supplier.id, data); toast({ message: 'Changes saved.' }); }
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} title={isNew ? 'Add supplier' : `Edit ${supplier.name}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="supplier-form" loading={busy} disabled={!online}>{isNew ? 'Add supplier' : 'Save changes'}</Button></>}>
      <form id="supplier-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <TextField label="Supplier name" required value={form.name} onChange={set('name')} error={errors.name} data-autofocus placeholder="e.g. Golden Grains Trading" />
        {sameName && <Banner tone="warning">Another supplier already has this name.</Banner>}
        <div className="form-grid">
          <TextField label="Contact person" value={form.contactPerson} onChange={set('contactPerson')} error={errors.contactPerson} />
          <TextField label="Contact number" value={form.contactNumber} onChange={set('contactNumber')} error={errors.contactNumber} inputMode="tel" />
          <TextField label="Email" value={form.email} onChange={set('email')} error={errors.email} type="email" />
          <TextField label="Address" value={form.address} onChange={set('address')} error={errors.address} />
        </div>
        <TextAreaField label="Notes" value={form.notes} onChange={set('notes')} error={errors.notes} rows={2} />
      </form>
    </Dialog>
  );
}
