/*
 * Opening balances (Phase 11, RQ-007, BR-081, D-045): enter what customers still owe from the Excel records.
 * Each entry gets an OB-YYYY-NNNNN number and is collected like a sale (Collections, Record payment, statement),
 * but it does not count as revenue, profit or a purchase. Opening STOCK is entered on the item form (Phase 4).
 */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField, TextAreaField, Segmented } from '../../components/Field.jsx';
import { Combobox } from '../../components/Combobox.jsx';
import { useToast } from '../../components/Toast.jsx';
import { navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { createOpeningBalance } from '../../data/openingBalanceService.js';
import { validateOpeningBalanceForm, splitEvenly, OB_MAX_ROWS } from '../../domain/openingBalance.js';
import { formatMoney, parseMoney, centavosToPlain } from '../../domain/money.js';
import { today, addMonths, toDateString, daysInMonth } from '../../domain/dates.js';
import { SalesTable } from './SaleTables.jsx';

const nextMonth = (date, n) => {
  const { y, m } = addMonths(date, n);
  const d = Math.min(Number(date.slice(8, 10)), daysInMonth(y, m));
  return toDateString(y, m, d);
};

export function OpeningBalanceDialog({ open, onClose, adapter, customerId: presetCustomer = '' }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const { rows: customers } = useQuery(adapter, 'customers', open ? { orderBy: [['nameLower', 'asc']] } : null, `ob-customers-${open}`);
  const blank = () => ({ customerId: presetCustomer, originalDate: '', description: '', total: '', rows: [{ dueDate: '', amount: '' }] });
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setForm(blank()); setErrors({}); setError(null); } }, [open, presetCustomer]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const setRow = (i, k, v) => { setForm((f) => ({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) })); setErrors((x) => ({ ...x, rows: undefined })); };

  // Number of payments: 1 (one balance) or 2–5 installments; "Split" fills the amounts and monthly dates.
  function setCount(n) {
    setForm((f) => {
      const rows = Array.from({ length: n }, (_, i) => f.rows[i] || { dueDate: '', amount: '' });
      return { ...f, rows };
    });
    setErrors((x) => ({ ...x, rows: undefined, count: undefined }));
  }
  let totalC = null;
  try { totalC = parseMoney(form.total); } catch (e) { totalC = null; }
  function split() {
    const parts = splitEvenly(totalC || 0, form.rows.length);
    if (!parts.length) { setErrors((x) => ({ ...x, total: 'Enter the remaining balance to split it.' })); return; }
    const first = form.rows[0].dueDate || '';
    setForm((f) => ({ ...f, rows: f.rows.map((r, i) => ({ amount: centavosToPlain(parts[i]), dueDate: first ? (i === 0 ? first : nextMonth(first, i)) : r.dueDate })) }));
  }
  const live = validateOpeningBalanceForm(form, today());
  async function submit(e) {
    e.preventDefault();
    const { errors: errs } = validateOpeningBalanceForm(form, today());
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try {
      const r = await createOpeningBalance(adapter, actorOf(auth.user), form);
      toast({ message: `Opening balance ${r.saleId} of ${formatMoney(r.totalC)} added.` });
      onClose(r.saleId);
    } catch (x) { setError(errorMessage(x)); }
    setBusy(false);
  }
  const options = (customers || []).filter((c) => !c.system && c.status === 'ACTIVE').map((c) => ({
    value: c.id, label: c.name, search: `${c.name} ${c.contactNumber} ${c.address}`,
    detail: [c.contactNumber, c.outstandingC ? `owes ${formatMoney(c.outstandingC)}` : null].filter(Boolean).join(' · '),
  }));
  const rowErr = errors.rows || [];
  return (
    <Dialog open={open} onClose={() => onClose(null)} title="Add opening balance" size="lg"
      footer={<><Button onClick={() => onClose(null)}>Cancel</Button><Button variant="primary" type="submit" form="ob-form" loading={busy} disabled={!online}>Add opening balance</Button></>}>
      <form id="ob-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <p className="muted">For a customer who still owes from before you started using this system. It is collected like a sale but is not counted as a sale, revenue or profit, and does not change stock.</p>
        <Combobox label="Customer" required options={options} value={form.customerId} onChange={(v) => { setForm((f) => ({ ...f, customerId: v })); setErrors((x) => ({ ...x, customerId: undefined })); }} error={errors.customerId} placeholder="Search name or phone" />
        <div className="form-grid">
          <TextField label="Original sale date" type="date" required value={form.originalDate} onChange={set('originalDate')} error={errors.originalDate} />
          <TextField label="Remaining balance" value={form.total} onChange={set('total')} error={errors.total} inputMode="decimal" prefix="₱" inputClassName="num" help="Optional: fill in and press Split to divide it." />
        </div>
        <TextAreaField label="Description" required rows={2} value={form.description} onChange={set('description')} error={errors.description} placeholder="e.g. 3 sacks Sinandomeng, Aug 2026 (Excel ledger row 14)" />
        <div className="button-row">
          <Segmented label="Payments still to make" value={String(form.rows.length)} onChange={(v) => setCount(Number(v))}
            options={Array.from({ length: OB_MAX_ROWS }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1 (balance)' : String(i + 1) }))} />
          <Button size="sm" onClick={split}>Split evenly</Button>
        </div>
        {errors.count && <Banner tone="danger">{errors.count}</Banner>}
        <div className="stack">
          {form.rows.map((r, i) => (
            <div key={i} className="form-grid ob-row">
              <TextField label={form.rows.length === 1 ? 'Due date (optional)' : `Installment ${i + 1} due`} type="date" required={form.rows.length > 1} value={r.dueDate} onChange={(e) => setRow(i, 'dueDate', e.target.value)} error={rowErr[i] && rowErr[i].dueDate} />
              <TextField label={form.rows.length === 1 ? 'Amount still owed' : `Installment ${i + 1} amount`} required value={r.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} error={rowErr[i] && rowErr[i].amount} inputMode="decimal" prefix="₱" inputClassName="num" />
            </div>
          ))}
        </div>
        <div className="summary-box"><div className="row"><span>Total opening balance</span><strong>{formatMoney(live.data.totalC)}</strong></div>
          {totalC > 0 && totalC !== live.data.totalC && <div className="row"><span className="field-error">Differs from the remaining balance by</span><strong>{formatMoney(Math.abs(totalC - live.data.totalC))}</strong></div>}</div>
      </form>
    </Dialog>
  );
}

export function OpeningBalancesPage({ adapter }) {
  const online = useOnline();
  const [adding, setAdding] = React.useState(false);
  const { rows, error } = useQuery(adapter, 'sales', { where: [['kind', '==', 'OPENING_BALANCE']] }, 'opening-balances');
  const all = (rows || []).slice().sort((a, b) => (a.saleDate < b.saleDate ? 1 : a.saleDate > b.saleDate ? -1 : b.id.localeCompare(a.id)));
  const active = all.filter((s) => s.status === 'ACTIVE');
  const sum = (k) => active.reduce((a, s) => a + s[k], 0);
  return (
    <div className="page stack">
      <PageHeader title="Opening balances" description="Amounts customers still owed from your old records when you started using this system. Collect them from Collections like any balance. Opening stock is entered on each item."
        actions={<Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add opening balance</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Entries</div><div className="stat-value">{rows ? active.length : '—'}</div></div>
        <div className="stat"><div className="stat-label">Carried over</div><div className="stat-value">{rows ? formatMoney(sum('totalC')) : '—'}</div></div>
        <div className="stat"><div className="stat-label">Collected since</div><div className="stat-value">{rows ? formatMoney(sum('paidC')) : '—'}</div></div>
        <div className="stat"><div className="stat-label">Still to collect</div><div className={`stat-value ${sum('balanceC') ? 'is-warning' : ''}`}>{rows ? formatMoney(sum('balanceC')) : '—'}</div></div>
      </div>
      <Panel flush>
        {!rows ? <LoadingRows label="Loading opening balances" /> : (
          <SalesTable rows={all}
            empty={<EmptyState icon="statement" title="No opening balances yet" action={<Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add opening balance</Button>}>
              Enter each customer who still owes from before, with the remaining amount and due dates.</EmptyState>} />
        )}
      </Panel>
      <OpeningBalanceDialog open={adding} adapter={adapter} onClose={(id) => { setAdding(false); if (id) navigate(`/sales/${id}`); }} />
    </div>
  );
}
