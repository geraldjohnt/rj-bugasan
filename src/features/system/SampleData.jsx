/*
 * "Load sample data" (D-025): lets the owner try each finished phase with realistic records.
 * D-057: available only under Settings → System, and only after re-entering the signed-in user's password.
 */
import { PasswordField } from '../../components/Field.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Panel, Banner } from '../../components/Feedback.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOnline } from '../../app/useOnline.js';
import { actorOf, errorMessage } from '../../data/useData.js';
import { loadSampleData } from '../../data/sampleData.js';

function SampleDataButton({ adapter, variant = 'secondary' }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!password) { setError('Enter your password.'); return; }
    setBusy(true); setError(null);
    try {
      await auth.service.unlock(password); // re-checks the password of the signed-in user; changes nothing
      const r = await loadSampleData(adapter, actorOf(auth.user));
      const any = r.created || r.customers || r.sales || r.suppliers || r.restocks || r.expenses;
      toast({ message: any ? `Sample data loaded: ${r.created} item(s), ${r.customers} customer(s), ${r.sales || 0} sale(s), ${r.openingBalances || 0} opening balance(s), ${r.suppliers || 0} supplier(s), ${r.restocks || 0} restock(s) and ${r.expenses || 0} expense(s) added.` : 'Sample data is already loaded.' });
      setOpen(false);
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }
  return (
    <>
      <Button variant={variant} icon="sample" onClick={() => { setPassword(''); setError(null); setOpen(true); }} disabled={!online}>Load sample data</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title="Load sample data?"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="sample-form" loading={busy} disabled={!online}>Load sample data</Button></>}>
        <form id="sample-form" onSubmit={submit} noValidate className="form-stack">
          {error && <Banner tone="danger">{error}</Banner>}
          <p>Adds sample rice items with opening stock and batches, sample customers, sales with installments and charges, payments, opening balances, suppliers with restock orders, expenses and calendar reminders, so you can try the system.</p>
          {adapter.kind === 'firestore'
            ? <Banner tone="warning">This writes to your real database. Use it only for testing; sample records are kept like any other record.</Banner>
            : <p className="muted">Demo mode: the data stays in this browser only.</p>}
          <p className="muted">Items and customers that already exist (same name) are skipped. Sales, restocks, expenses and reminders are added only on a first, complete load.</p>
          <PasswordField label="Your password" required value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} autoComplete="current-password" data-autofocus />
        </form>
      </Dialog>
    </>
  );
}

export function SampleDataPanel({ adapter }) {
  return (
    <Panel title="Sample data" actions={<SampleDataButton adapter={adapter} />}>
      <p className="muted">Password protected. Fills the system with realistic test records for the modules built so far (currently: Inventory, Customers, Sales, Payments, Collections, Opening balances, Restocks, Suppliers, Expenses and Calendar; the Dashboard and Reports use all of it).</p>
    </Panel>
  );
}
