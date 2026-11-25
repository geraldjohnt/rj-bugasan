/* Customers list (Phase 5): search, type/status/balance filters, outstanding balances and reliability. */
import { PageHeader, Panel, DataTable, EmptyState, Banner, LoadingRows, Badge } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, SelectField } from '../../components/Field.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { ensureWalkIn } from '../../data/customerService.js';
import { formatMoney } from '../../domain/money.js';
import { formatDate } from '../../domain/dates.js';
import { CUSTOMER_TYPES, matchesCustomer } from '../../domain/customers.js';
import { CustomerFormDialog } from './CustomerDialogs.jsx';
import { ReliabilityBadge } from './CustomerBadges.jsx';
import { SampleDataButton } from '../system/SampleData.jsx';

/** All customers, live, sorted by name. Creates the built-in Walk-in customer the first time (owner, online). */
export function useCustomers(adapter) {
  const auth = useAuth();
  const online = useOnline();
  const { rows, error } = useQuery(adapter, 'customers', { orderBy: [['nameLower', 'asc']] }, 'customers-by-name');
  const tried = React.useRef(false);
  React.useEffect(() => {
    if (!rows || tried.current || !online || rows.some((c) => c.id === 'WALK_IN')) return;
    tried.current = true;
    ensureWalkIn(adapter, actorOf(auth.user)).catch(() => {});
  }, [rows, online]);
  return { customers: rows, error };
}

const overLimit = (c) => c.creditLimitC != null && (c.outstandingC || 0) > c.creditLimitC;

export function CustomersPage({ adapter }) {
  const online = useOnline();
  const { customers, error } = useCustomers(adapter);
  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState('');
  const [status, setStatus] = React.useState('ACTIVE');
  const [balance, setBalance] = React.useState('');
  const [adding, setAdding] = React.useState(false);

  const all = customers || [];
  const registered = all.filter((c) => !c.system);
  const rows = all.filter((c) => (status ? c.status === status : true) && (type ? c.type === type : true)
    && (balance === 'OWING' ? c.outstandingC > 0 : balance === 'OVER' ? overLimit(c) : true) && matchesCustomer(c, search))
    .sort((a, b) => (a.system - b.system) || a.nameLower.localeCompare(b.nameLower));
  const active = registered.filter((c) => c.status === 'ACTIVE');

  const columns = [
    { key: 'name', header: 'Customer', className: 'key-col', render: (c) => <><Link to={`/customers/${c.id}`}>{c.name}</Link><span className="cell-sub">{c.system ? 'Built-in' : c.type}</span></> },
    { key: 'contact', header: 'Contact', render: (c) => <>{c.contactNumber || '—'}{(c.alternateContacts || []).length > 0 && <span className="cell-sub">+{c.alternateContacts.length} alternate</span>}</> },
    { key: 'outstanding', header: 'Outstanding', align: 'right', render: (c) => (c.outstandingC ? <strong>{formatMoney(c.outstandingC)}</strong> : formatMoney(0)) },
    { key: 'limit', header: 'Credit limit', align: 'right', render: (c) => (c.creditLimitC == null ? '—' : <>{formatMoney(c.creditLimitC)}{overLimit(c) && <span className="cell-sub delta-out">Over limit</span>}</>) },
    { key: 'purchases', header: 'Total purchases', align: 'right', render: (c) => formatMoney(c.totalPurchasesC || 0) },
    { key: 'last', header: 'Last sale', render: (c) => (c.lastSaleDate ? formatDate(c.lastSaleDate) : '—') },
    { key: 'rel', header: 'Payments', render: (c) => (c.status === 'ARCHIVED' ? <Badge>Archived</Badge> : <ReliabilityBadge customer={c} />) },
  ];

  return (
    <div className="page stack">
      <PageHeader title="Customers" description="Registered customers, their balances and how reliably they pay."
        actions={<Button variant="primary" icon="addCustomer" onClick={() => setAdding(true)} disabled={!online}>Add customer</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Active customers</div><div className="stat-value">{customers ? active.length : '—'}</div></div>
        <div className="stat"><div className="stat-label">Total receivables</div><div className="stat-value">{customers ? formatMoney(active.reduce((s, c) => s + (c.outstandingC || 0), 0)) : '—'}</div></div>
        <div className="stat"><div className="stat-label">Customers with a balance</div><div className="stat-value">{customers ? active.filter((c) => c.outstandingC > 0).length : '—'}</div></div>
        <div className="stat"><div className="stat-label">Over credit limit</div><div className={`stat-value ${active.some(overLimit) ? 'is-danger' : ''}`}>{customers ? active.filter(overLimit).length : '—'}</div></div>
      </div>
      <Panel flush>
        <div className="toolbar">
          <TextField label="Search" className="toolbar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, address or contact" />
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: 'All types' }, ...CUSTOMER_TYPES.map((t) => ({ value: t, label: t }))]} />
          <SelectField label="Balance" value={balance} onChange={(e) => setBalance(e.target.value)} options={[{ value: '', label: 'Any balance' }, { value: 'OWING', label: 'With balance' }, { value: 'OVER', label: 'Over credit limit' }]} />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'ARCHIVED', label: 'Archived' }, { value: '', label: 'All' }]} />
          <span className="toolbar-end">{customers ? `${rows.length} shown` : ''}</span>
        </div>
        {!customers ? <LoadingRows label="Loading customers" /> : (
          <DataTable caption="Customers" columns={columns} rows={registered.length ? rows : []} rowClassName={(c) => (c.status === 'ARCHIVED' || c.system ? 'is-muted' : '')}
            empty={registered.length
              ? <EmptyState icon="search" title="No matching customers">Change the search or filters.</EmptyState>
              : <EmptyState icon="customers" title="No customers yet" action={<div className="button-row"><Button variant="primary" icon="addCustomer" onClick={() => setAdding(true)} disabled={!online}>Add customer</Button><SampleDataButton adapter={adapter} /></div>}>
                  Add your first customer, or load sample data to try the system.
                </EmptyState>} />
        )}
      </Panel>
      <CustomerFormDialog open={adding} onClose={() => setAdding(false)} adapter={adapter} customer={null} customers={all} onSaved={(id) => navigate(`/customers/${id}`)} />
    </div>
  );
}
