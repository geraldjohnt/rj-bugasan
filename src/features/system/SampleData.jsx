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
          toast({ message: r.created || r.customers || r.sales ? `Sample data loaded: ${r.created} item(s), ${r.customers} customer(s) and ${r.sales || 0} sale(s) added.` : 'Sample data is already loaded.' });
        }}>
        <p>Adds sample rice items with opening stock, an opened sack and two adjustments, sample customers with alternate contacts, and sample sales with installments, payments (one voided) and a cancelled sale, so you can try the system.</p>
        {adapter.kind === 'firestore'
          ? <Banner tone="warning">This writes to your real database. Use it only for testing; sample records are kept like any other record.</Banner>
          : <p className="muted">Demo mode: the data stays in this browser only.</p>}
        <p className="muted">Items and customers that already exist (same name) are skipped. Sample sales are added only on a first, complete load.</p>
      </ConfirmDialog>
    </>
  );
}

export function SampleDataPanel({ adapter }) {
  return (
    <Panel title="Sample data" actions={<SampleDataButton adapter={adapter} />}>
      <p className="muted">Fills the system with realistic test records for the modules built so far (currently: Inventory, Customers, Sales, Payments and Collections).</p>
    </Panel>
  );
}
