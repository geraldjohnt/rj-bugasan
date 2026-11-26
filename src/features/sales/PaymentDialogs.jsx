/* Record payment, void payment and reschedule dialogs (Phase 7). */
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Banner } from '../../components/Feedback.jsx';
import { TextField, Segmented, TextAreaField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useDoc, useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { recordPayment, voidPayment, reviseSchedule } from '../../data/paymentService.js';
import { formatMoney, parseMoney, centavosToPlain, sum } from '../../domain/money.js';
import { formatDate, today } from '../../domain/dates.js';
import { allocatePayment, outstandingOf, remainingOf } from '../../domain/allocation.js';
import { METHODS, METHOD_LABELS } from '../../domain/sales.js';
import { byNo } from './SaleTables.jsx';

export const METHOD_OPTIONS = Object.keys(METHODS).map((m) => ({ value: m, label: METHOD_LABELS[m] }));

/** Live sale + receivable rows for a sale id. */
export function useSaleRows(adapter, saleId) {
  const { doc: sale } = useDoc(adapter, 'sales', saleId || '_none');
  const { rows } = useQuery(adapter, 'installments', { where: [['saleId', '==', saleId || '_none']] }, `rows-${saleId}`);
  return { sale: saleId ? sale : null, rows: rows ? [...rows].sort(byNo) : null };
}

export function RecordPaymentDialog({ open, onClose, adapter, saleId, onRecorded }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const { sale, rows } = useSaleRows(adapter, open ? saleId : null);
  const [form, setForm] = React.useState({ amount: '', date: today(), method: 'CASH', reference: '', note: '' });
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const ready = sale && rows;
  const balanceC = ready ? outstandingOf(rows) : 0;
  const nextDue = ready ? rows.find((r) => remainingOf(r) > 0) : null;

  React.useEffect(() => { if (open) { setForm({ amount: '', date: today(), method: 'CASH', reference: '', note: '' }); setErrors({}); setError(null); } }, [open, saleId]);
  React.useEffect(() => { if (open && nextDue && form.amount === '') setForm((f) => ({ ...f, amount: centavosToPlain(remainingOf(nextDue)) })); }, [open, !!nextDue]);
  const set = (k) => (e) => { const v = e && e.target ? e.target.value : e; setForm((f) => ({ ...f, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })); };

  let amountC = null, amountErr = null, preview = null, changeC = 0;
  try { amountC = parseMoney(form.amount); } catch (e) { amountErr = e.message; }
  if (ready && amountC > 0) {
    if (amountC > balanceC) changeC = amountC - balanceC;
    else { try { preview = allocatePayment(rows, amountC, form.date).allocations; } catch (e) { amountErr = e.message; } }
  }

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (amountErr) errs.amount = amountErr;
    else if (!amountC || amountC <= 0) errs.amount = 'Enter the amount received.';
    else if (changeC) errs.amount = `More than the balance of ${formatMoney(balanceC)}. Record ${formatMoney(balanceC)} and give ${formatMoney(changeC)} back as change.`;
    if (!form.date) errs.date = 'Enter a date.';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try {
      const r = await recordPayment(adapter, actorOf(auth.user), { saleId, date: form.date, amountC, method: form.method, reference: form.reference, note: form.note });
      toast({ message: `Payment ${r.paymentId} recorded: ${formatMoney(amountC)}.` + (r.balanceC ? ` Balance ${formatMoney(r.balanceC)}.` : ' Fully paid.') });
      onRecorded && onRecorded(r.paymentId);
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  const rowLabel = (id) => { const r = rows.find((x) => x.id === id); return r.kind === 'OPEN_BALANCE' ? 'Balance' : `Installment ${r.no}${r.dueDate ? ` (due ${formatDate(r.dueDate)})` : ''}`; };
  return (
    <Dialog open={open} onClose={onClose} title={sale ? `Record payment — ${sale.id}` : 'Record payment'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="payment-form" loading={busy} disabled={!online || !ready || sale.status !== 'ACTIVE' || balanceC <= 0}>Record payment</Button></>}>
      {!ready ? <p className="muted">Loading…</p> : (
        <form id="payment-form" onSubmit={submit} noValidate className="form-stack">
          {error && <Banner tone="danger">{error}</Banner>}
          {sale.status !== 'ACTIVE' && <Banner tone="warning">This sale is cancelled.</Banner>}
          <div className="summary-box">
            <div className="row"><span>Customer</span><strong>{sale.customerName}</strong></div>
            <div className="row"><span>Balance</span><strong>{formatMoney(balanceC)}</strong></div>
            {nextDue && <div className="row"><span>Next due</span><strong>{formatMoney(remainingOf(nextDue))}{nextDue.dueDate ? ` on ${formatDate(nextDue.dueDate)}` : ''}</strong></div>}
          </div>
          <div className="form-grid">
            <TextField label="Amount received" required value={form.amount} onChange={set('amount')} error={errors.amount} inputMode="decimal" prefix="₱" inputClassName="num" data-autofocus />
            <TextField label="Payment date" type="date" required value={form.date} onChange={set('date')} error={errors.date} />
          </div>
          <Segmented label="Method" value={form.method} onChange={set('method')} options={METHOD_OPTIONS} />
          <div className="form-grid">
            <TextField label="Reference no." value={form.reference} onChange={set('reference')} placeholder={form.method === 'CASH' ? 'Optional' : 'e.g. GCash or bank reference'} />
            <TextField label="Note" value={form.note} onChange={set('note')} />
          </div>
          {preview && preview.length > 0 && (
            <div className="summary-box" aria-live="polite">
              <div className="row muted"><span>Applied to (oldest first)</span></div>
              {preview.map((a) => <div className="row" key={a.installmentId}><span>{rowLabel(a.installmentId)}</span><strong>{formatMoney(a.amountC)}</strong></div>)}
              <div className="row"><span>Balance after</span><strong>{formatMoney(balanceC - amountC)}</strong></div>
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}

export function VoidPaymentDialog({ open, onClose, adapter, payment }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [reason, setReason] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setReason(''); setErr(null); } }, [open]);
  if (!payment) return null;
  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { setErr('Enter the reason for voiding.'); return; }
    setBusy(true); setErr(null);
    try { await voidPayment(adapter, actorOf(auth.user), payment.id, reason); toast({ message: `Payment ${payment.id} voided.` }); onClose(); }
    catch (x) { setErr(errorMessage(x)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={`Void payment ${payment.id}?`}
      footer={<><Button onClick={onClose}>Keep payment</Button><Button variant="danger" type="submit" form="void-form" loading={busy} disabled={!online}>Void payment</Button></>}>
      <form id="void-form" onSubmit={submit} noValidate className="form-stack">
        <p>Voiding removes {formatMoney(payment.amountC)} from {payment.saleId}; the balance goes back up by the same amount. The payment stays in the history marked as voided. Record the correct payment afterwards if needed.</p>
        <TextField label="Reason" required value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} error={err} data-autofocus placeholder="e.g. Wrong amount entered" />
      </form>
    </Dialog>
  );
}

/** Reschedule (BR-045): edit due dates and unpaid amounts of open rows; the total must stay the same. */
export function RescheduleDialog({ open, onClose, adapter, sale, rows }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const editable = (rows || []).filter((r) => r.status === 'PENDING' || r.status === 'PARTIAL');
  const [values, setValues] = React.useState({});
  const [reason, setReason] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) { setValues(Object.fromEntries(editable.map((r) => [r.no, { dueDate: r.dueDate || '', amount: centavosToPlain(r.amountC) }]))); setReason(''); setErr(null); }
  }, [open]);
  if (!sale) return null;

  const parsed = editable.map((r) => {
    const v = values[r.no] || { dueDate: r.dueDate || '', amount: centavosToPlain(r.amountC) };
    let amountC = null; try { amountC = parseMoney(v.amount); } catch (e) { /* shown below */ }
    return { row: r, dueDate: v.dueDate, amountC, raw: v };
  });
  const before = sum(editable.map((r) => r.amountC));
  const after = sum(parsed.map((p) => p.amountC || 0));
  // Start from the row's current values: rows can arrive after the dialog opened, so values[no] may be missing.
  const setRow = (no, k) => (e) => {
    const v = e.target.value;
    const base = (parsed.find((p) => p.row.no === no) || {}).raw || {};
    setValues((x) => ({ ...x, [no]: { ...base, ...x[no], [k]: v } })); setErr(null);
  };

  async function submit(e) {
    e.preventDefault();
    if (parsed.some((p) => p.amountC === null || !p.dueDate)) { setErr('Every open installment needs a due date and an amount.'); return; }
    if (!reason.trim()) { setErr('Enter the reason for the change.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await reviseSchedule(adapter, actorOf(auth.user), sale.id, parsed.map((p) => ({ no: p.row.no, dueDate: p.dueDate, amountC: p.amountC })), reason);
      toast({ message: `Schedule updated: ${r.changed} installment(s) changed.` });
      onClose();
    } catch (x) { setErr(errorMessage(x)); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" title={`Reschedule ${sale.id}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="reschedule-form" loading={busy} disabled={!online || !editable.length}>Save new schedule</Button></>}>
      <form id="reschedule-form" onSubmit={submit} noValidate className="form-stack">
        <p className="muted">Change due dates and how the unpaid amount is split. Paid installments cannot change; a partly paid one cannot go below what is already paid. The old values and your reason are kept.</p>
        {err && <Banner tone="danger">{err}</Banner>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Already paid</th><th>Due date</th><th className="num-col">Amount</th></tr></thead>
            <tbody>{parsed.map((p) => (
              <tr key={p.row.no}>
                <td>{p.row.kind === 'OPEN_BALANCE' ? 'Balance' : `${p.row.no} of ${p.row.count}`}</td>
                <td className="num">{formatMoney(p.row.paidC || 0)}</td>
                <td><input className="input input-sm" type="date" aria-label={`Due date ${p.row.no}`} value={p.raw.dueDate} onChange={setRow(p.row.no, 'dueDate')} /></td>
                <td className="num"><div className="input-wrap has-prefix cell-input"><span className="input-affix input-prefix">₱</span>
                  <input className="input input-sm num" inputMode="decimal" aria-label={`Amount ${p.row.no}`} aria-invalid={p.amountC === null || undefined} value={p.raw.amount} onChange={setRow(p.row.no, 'amount')} /></div></td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="summary-box">
          <div className="row"><span>Open installments must total</span><strong>{formatMoney(before)}</strong></div>
          <div className="row"><span>New total</span><strong className={after !== before ? 'delta-out' : ''}>{formatMoney(after)}{after !== before && ` (${after > before ? '+' : '−'}${formatMoney(Math.abs(after - before))})`}</strong></div>
        </div>
        <TextAreaField label="Reason" required value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} rows={2} placeholder="e.g. Customer asked to move to end of month" />
      </form>
    </Dialog>
  );
}
