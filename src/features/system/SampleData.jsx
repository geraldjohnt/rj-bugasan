/* "Load sample data" (D-025): lets the owner try each finished phase with realistic records. */
import { Button } from '../../components/Button.jsx';
import { Panel, Banner } from '../../components/Feedback.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOnline } from '../../app/useOnline.js';
import { actorOf, errorMessage } from '../../data/useData.js';
import { loadSampleData } from '../../data/sampleData.js';
import { ConfirmDialog } from '../inventory/InventoryDialogs.jsx';

export function SampleDataButton({ adapter, variant = 'secondary' }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} icon="sample" onClick={() => setOpen(true)} disabled={!online}>Load sample data</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} title="Load sample data?" confirmLabel="Load sample data"
        onConfirm={async () => {
          const r = await loadSampleData(adapter, actorOf(auth.user));
          const any = r.created || r.customers || r.sales || r.suppliers || r.restocks || r.expenses;
          toast({ message: any ? `Sample data loaded: ${r.created} item(s), ${r.customers} customer(s), ${r.sales || 0} sale(s), ${r.openingBalances || 0} opening balance(s), ${r.suppliers || 0} supplier(s), ${r.restocks || 0} restock(s) and ${r.expenses || 0} expense(s) added.` : 'Sample data is already loaded.' });
        }}>
        <p>Adds sample rice items with opening stock, an opened sack and two adjustments, sample customers with alternate contacts, sample sales with installments, payments (one voided) and a cancelled sale, two opening balances carried over from old records, suppliers with restock orders (received, partly received, ordered, cancelled), expenses and calendar reminders, so you can try the system.</p>
        {adapter.kind === 'firestore'
          ? <Banner tone="warning">This writes to your real database. Use it only for testing; sample records are kept like any other record.</Banner>
          : <p className="muted">Demo mode: the data stays in this browser only.</p>}
        <p className="muted">Items and customers that already exist (same name) are skipped. Sales, restocks, expenses and reminders are added only on a first, complete load.</p>
      </ConfirmDialog>
    </>
  );
}

export function SampleDataPanel({ adapter }) {
  return (
    <Panel title="Sample data" actions={<SampleDataButton adapter={adapter} />}>
      <p className="muted">Fills the system with realistic test records for the modules built so far (currently: Inventory, Customers, Sales, Payments, Collections, Opening balances, Restocks, Suppliers, Expenses and Calendar; the Dashboard and Reports use all of it).</p>
    </Panel>
  );
}
