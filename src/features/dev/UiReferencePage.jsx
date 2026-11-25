/* Development-only component reference ("kitchen sink"), route #/dev/ui. Not linked in the menu; excluded from release. */
import { PageHeader, Panel, Badge, Banner, EmptyState, Tabs, DataTable, Spinner } from '../../components/Feedback.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { TextField, PasswordField, SelectField, TextAreaField, Segmented } from '../../components/Field.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatMoney } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate } from '../../domain/dates.js';

const ROWS = [
  { id: 'RJ-2026-00012', customer: 'Maria Santos', date: '2026-11-24', qty: 300, unit: 'SACK', total: 735000, status: 'PAID' },
  { id: 'RJ-2026-00013', customer: 'Walk-in', date: '2026-11-25', qty: 575, unit: 'KG', total: 29900, status: 'PARTIAL' },
  { id: 'RJ-2026-00014', customer: 'Jun Reyes Store', date: '2026-11-25', qty: 1000, unit: 'SACK', total: 2450000, status: 'OVERDUE' },
];
const TONE = { PAID: ['success', 'Paid'], PARTIAL: ['info', 'Partially paid'], OVERDUE: ['danger', 'Overdue'] };

export function UiReferencePage() {
  const toast = useToast();
  const [tab, setTab] = React.useState('a');
  const [seg, setSeg] = React.useState('MONTHLY_15');
  const [open, setOpen] = React.useState(false);
  return (
    <div className="page">
      <PageHeader title="UI reference" description="Development only. Every shared component in one place." actions={<Button variant="primary" icon="plus">Primary action</Button>} />
      <div className="stack">
        <Panel title="Buttons">
          <div className="button-row">
            <Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button><Button loading>Saving</Button><Button disabled>Disabled</Button>
            <Button size="sm" icon="plus">Small</Button><IconButton icon="settings" label="Settings" />
          </div>
        </Panel>
        <Panel title="Feedback">
          <div className="stack-sm">
            <div className="button-row"><Badge>Pending</Badge><Badge tone="success">Paid</Badge><Badge tone="info">Partially paid</Badge><Badge tone="warning">Low stock</Badge><Badge tone="danger">Overdue</Badge><Spinner /></div>
            <Banner tone="info">Informational message.</Banner>
            <Banner tone="warning">Warning: this customer is above their credit limit.</Banner>
            <Banner tone="danger">Could not save. Check your connection and try again.</Banner>
            <div className="button-row">
              <Button onClick={() => toast({ message: 'Payment recorded.' })}>Success toast</Button>
              <Button onClick={() => toast({ tone: 'danger', message: 'Could not save.' })}>Error toast</Button>
              <Button onClick={() => setOpen(true)}>Open dialog</Button>
            </div>
          </div>
        </Panel>
        <Panel title="Form">
          <div className="form-grid">
            <TextField label="Customer name" required placeholder="e.g. Maria Santos" />
            <TextField label="Amount" prefix="₱" inputClassName="num align-right" defaultValue="1,250.00" help="Up to 2 decimal places." />
            <TextField label="Quantity" suffix="kg" inputClassName="num align-right" defaultValue="2.75" />
            <TextField label="With error" defaultValue="-5" error="Quantity must be greater than zero." />
            <SelectField label="Payment method" options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK', label: 'Bank transfer' }, { value: 'EWALLET', label: 'E-wallet' }]} />
            <PasswordField label="Password" />
            <TextAreaField label="Notes" className="span-2" rows={3} />
            <div className="span-2"><Segmented label="Frequency" value={seg} onChange={setSeg} options={[{ value: 'MONTHLY_15', label: 'Every 15th' }, { value: 'MONTHLY_EOM', label: 'End of month' }, { value: 'SEMI_MONTHLY', label: 'Twice a month' }]} /></div>
          </div>
        </Panel>
        <Panel title="Table" flush>
          <Tabs label="Example tabs" value={tab} onChange={setTab} tabs={[{ value: 'a', label: 'All' }, { value: 'b', label: 'Overdue' }]} />
          <DataTable caption="Example sales" rows={ROWS} columns={[
            { key: 'id', header: 'Sale', render: (r) => <span className="strong">{r.id}</span> },
            { key: 'customer', header: 'Customer' },
            { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
            { key: 'qty', header: 'Quantity', align: 'right', render: (r) => formatQty(r.qty, r.unit) },
            { key: 'total', header: 'Total', align: 'right', render: (r) => formatMoney(r.total) },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={TONE[r.status][0]}>{TONE[r.status][1]}</Badge> },
          ]} />
        </Panel>
        <Panel title="Empty state"><EmptyState icon="customers" title="No customers yet" action={<Button variant="primary" icon="plus">Add customer</Button>}>Add your first customer to start recording sales on credit.</EmptyState></Panel>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel sale RJ-2026-00012?" size="sm"
        footer={<><Button onClick={() => setOpen(false)}>Keep sale</Button><Button variant="danger" onClick={() => setOpen(false)}>Cancel sale</Button></>}>
        <p>This returns 3 sacks to stock and voids 2 payments totalling {formatMoney(150000)}.</p>
        <TextAreaField label="Reason" required rows={2} data-autofocus />
      </Dialog>
    </div>
  );
}
