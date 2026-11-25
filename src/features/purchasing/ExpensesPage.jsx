/* Expenses (Phase 8, RQ-037, BR-063): list with date/category filters and totals, add, void with reason (never deleted). */
import { PageHeader, Panel, EmptyState, Banner, LoadingRows, Badge, DataTable } from '../../components/Feedback.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField, SelectField, TextAreaField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { createExpense, voidExpense } from '../../data/purchasingService.js';
import { formatMoney } from '../../domain/money.js';
import { formatDate, today } from '../../domain/dates.js';
import { EXPENSE_CATEGORIES, validateExpenseForm } from '../../domain/purchasing.js';
import { monthBounds } from '../../domain/reports.js';
import { ReasonDialog } from './RestockDetailPage.jsx';
import { SampleDataButton } from '../system/SampleData.jsx';

function ExpenseDialog({ open, onClose, adapter }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const blank = () => ({ date: today(), category: 'Delivery/Fuel', amount: '', note: '' });
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setForm(blank()); setErrors({}); setError(null); } }, [open]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  async function submit(e) {
    e.preventDefault();
    const { data, errors: errs } = validateExpenseForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try { await createExpense(adapter, actorOf(auth.user), data); toast({ message: `Expense of ${formatMoney(data.amountC)} recorded.` }); onClose(); }
    catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add expense"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="expense-form" loading={busy} disabled={!online}>Add expense</Button></>}>
      <form id="expense-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="form-grid">
          <TextField label="Amount" required value={form.amount} onChange={set('amount')} error={errors.amount} inputMode="decimal" prefix="₱" inputClassName="num" data-autofocus />
          <TextField label="Date" type="date" required value={form.date} onChange={set('date')} error={errors.date} />
        </div>
        <SelectField label="Category" required value={form.category} onChange={set('category')} error={errors.category} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <TextAreaField label="Note" value={form.note} onChange={set('note')} error={errors.note} rows={2} help={form.category === 'Other' ? 'Required for Other.' : 'Optional, e.g. what it was for.'} />
      </form>
    </Dialog>
  );
}

export function ExpensesPage({ adapter }) {
  const month = monthBounds(today());
  const [from, setFrom] = React.useState(month.from);
  const [to, setTo] = React.useState(month.to);
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('ACTIVE');
  const [adding, setAdding] = React.useState(false);
  const [voiding, setVoiding] = React.useState(null);
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const where = [...(from ? [['date', '>=', from]] : []), ...(to ? [['date', '<=', to]] : [])];
  const { rows, error } = useQuery(adapter, 'expenses', { where, orderBy: [['date', 'desc']] }, `expenses-${from}-${to}`);
  const all = (rows || []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const shown = all.filter((e) => (!category || e.category === category) && (!status || e.status === status));
  const active = shown.filter((e) => e.status === 'ACTIVE');
  const totalC = active.reduce((s, e) => s + e.amountC, 0);
  const byCat = {};
  for (const e of all.filter((x) => x.status === 'ACTIVE')) byCat[e.category] = (byCat[e.category] || 0) + e.amountC;
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const columns = [
    { key: 'date', header: 'Date', render: (e) => formatDate(e.date) },
    { key: 'category', header: 'Category', render: (e) => <>{e.category}{e.status === 'VOIDED' && <span className="cell-sub"><Badge>Voided</Badge></span>}</> },
    { key: 'note', header: 'Note', className: 'wrap', render: (e) => <>{e.note || <span className="muted">—</span>}{e.void && <span className="cell-sub">Voided: {e.void.reason}</span>}</> },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => <span className={e.status === 'VOIDED' ? 'strike' : ''}>{formatMoney(e.amountC)}</span> },
    { key: 'actions', header: '', align: 'right', render: (e) => (e.status === 'ACTIVE' ? <IconButton size="sm" icon="cancel" label={`Void expense of ${formatDate(e.date)}`} onClick={() => setVoiding(e)} disabled={!online} /> : null) },
  ];
  return (
    <div className="page stack">
      <PageHeader title="Expenses" description="Store costs such as rent, wages and fuel. They are subtracted from gross profit to give net profit."
        actions={<Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add expense</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Expenses in period</div><div className="stat-value">{rows ? formatMoney(totalC) : '—'}</div><div className="stat-sub">{active.length} entr{active.length === 1 ? 'y' : 'ies'} shown</div></div>
        <div className="stat"><div className="stat-label">Largest category</div><div className="stat-value">{top ? top[0] : '—'}</div><div className="stat-sub">{top ? formatMoney(top[1]) : ''}</div></div>
        <div className="stat"><div className="stat-label">Categories used</div><div className="stat-value">{Object.keys(byCat).length}</div></div>
        <div className="stat"><div className="stat-label">Voided</div><div className="stat-value">{all.filter((e) => e.status === 'VOIDED').length}</div></div>
      </div>
      <Panel flush>
        <div className="toolbar">
          <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: 'All' }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'VOIDED', label: 'Voided' }, { value: '', label: 'All' }]} />
          <span className="toolbar-end">{rows ? `${shown.length} shown` : ''}</span>
        </div>
        {!rows ? <LoadingRows label="Loading expenses" /> : (
          <DataTable caption="Expenses" columns={columns} rows={shown} rowClassName={(e) => (e.status === 'VOIDED' ? 'is-muted' : undefined)}
            footer={active.length ? ['Total', '', '', formatMoney(totalC), ''] : null}
            empty={all.length
              ? <EmptyState icon="search" title="No matching expenses">Change the filters.</EmptyState>
              : <EmptyState icon="expenses" title="No expenses in this period" action={<div className="button-row"><Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add expense</Button><SampleDataButton adapter={adapter} /></div>}>
                  Change the dates, or record rent, wages, fuel and other costs.</EmptyState>} />
        )}
      </Panel>
      <ExpenseDialog open={adding} onClose={() => setAdding(false)} adapter={adapter} />
      <ReasonDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this expense?" label="Reason" confirmLabel="Void expense"
        intro={voiding ? `${voiding.category} ${formatMoney(voiding.amountC)} of ${formatDate(voiding.date)} will no longer count in net profit. It stays visible as voided.` : ''}
        onConfirm={async (why) => { await voidExpense(adapter, actorOf(auth.user), voiding.id, why); toast({ message: 'Expense voided.' }); }} />
    </div>
  );
}
