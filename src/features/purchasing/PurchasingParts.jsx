/* Shared parts for Phase 8 screens: restock status badge, restocks table, supplier form dialog, restock expense lines (Phase 14). */
import { Badge, DataTable, Banner } from '../../components/Feedback.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { TextField, TextAreaField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOnline } from '../../app/useOnline.js';
import { Link } from '../../app/router.jsx';
import { actorOf, errorMessage, useQuery } from '../../data/useData.js';
import { createSupplier, updateSupplier } from '../../data/purchasingService.js';
import { formatMoney, centavosToPlain } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate, compareDates } from '../../domain/dates.js';
import { RESTOCK_STATUS_LABELS, validateSupplierForm, receivedValueC, isOpenRestock, RESTOCK_EXPENSE_CATEGORY, MAX_RECEIPT_EXPENSES, expenseNameSuggestions } from '../../domain/purchasing.js';

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

/* ------------------------------------------------------------------ restock expense lines (Phase 14, D-060, D-062) */

let expenseKey = 0;
export const newExpenseRow = (o = {}) => ({ key: ++expenseKey, name: '', amount: '', ...o });
export const expenseRowsFrom = (expenses) => (expenses || []).map((e) => newExpenseRow({ name: e.name, amount: centavosToPlain(e.amountC), expenseId: e.expenseId }));

/** Names used before on restock expenses (newest first, with the last amount). */
export function useRestockExpenseSuggestions(adapter) {
  const { rows } = useQuery(adapter, 'expenses', { where: [['category', '==', RESTOCK_EXPENSE_CATEGORY]] }, 'restock-expense-names');
  return React.useMemo(() => expenseNameSuggestions(rows || []), [rows]);
}

/**
 * Free-text expense lines (Fuel, Trucking, Labor…) with suggestions. rows: [{ key, name, amount, expenseId? }];
 * errors: { [index]: { name?, amount? } } from parseExpenseLines.
 */
export function ExpenseLinesEditor({ adapter, rows, setRows, errors = {} }) {
  const suggestions = useRestockExpenseSuggestions(adapter);
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  function setName(key, name) {
    const known = suggestions.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, name, amount: r.amount || !known ? r.amount : centavosToPlain(known.amountC) } : r)));
  }
  return (
    <div className="restock-expenses">
      <datalist id="restock-expense-names">{suggestions.map((c) => <option key={c.name} value={c.name}>{formatMoney(c.amountC)}</option>)}</datalist>
      {rows.length > 0 && <div className="sale-lines">
        {rows.map((r, idx) => {
          const e = errors[idx] || {};
          return (
            <div key={r.key} className="sale-line charge-line">
              <TextField label={idx === 0 ? 'Expense' : undefined} aria-label={`Expense ${idx + 1}`} className="sale-line-item" value={r.name} list="restock-expense-names" maxLength={60}
                placeholder="e.g. Trucking, Fuel, Labor" onChange={(ev) => setName(r.key, ev.target.value)} error={e.name} />
              <TextField label={idx === 0 ? 'Amount' : undefined} aria-label={`Expense amount ${idx + 1}`} className="sale-line-price" value={r.amount} onChange={(ev) => setRow(r.key, { amount: ev.target.value })}
                inputMode="decimal" prefix="₱" inputClassName="num" error={e.amount} />
              <IconButton icon="trash" label={`Remove expense ${idx + 1}`} size="sm" className="sale-line-remove" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
            </div>
          );
        })}
      </div>}
      {errors.all && <Banner tone="danger">{errors.all}</Banner>}
      <div className="panel-footer">
        <Button size="sm" icon="plus" onClick={() => setRows((rs) => [...rs, newExpenseRow()])} disabled={rows.length >= MAX_RECEIPT_EXPENSES}>Add expense</Button>
        {!rows.length && <span className="muted small">Shipping, trucking, fuel, labor… Saved to Expenses, linked to this restock.</span>}
      </div>
    </div>
  );
}
