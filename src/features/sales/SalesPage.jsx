/* Sales list (Phase 6): newest first, filters, totals of what is shown (cancelled sales excluded, BR-038). */
import { PageHeader, Panel, EmptyState, Banner, LoadingRows } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, SelectField } from '../../components/Field.jsx';
import { navigate } from '../../app/router.jsx';
import { useQuery, errorMessage } from '../../data/useData.js';
import { formatMoney } from '../../domain/money.js';
import { FULFILLMENT_LABELS, PAYMENT_STATUS_LABELS, TERMS_LABELS } from '../../domain/sales.js';
import { SalesTable } from './SaleTables.jsx';
import { SampleDataButton } from '../system/SampleData.jsx';

export function SalesPage({ adapter }) {
  const [limit, setLimit] = React.useState(200);
  const { rows, error } = useQuery(adapter, 'sales', { orderBy: [['saleDate', 'desc']], limit }, `sales-${limit}`);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('ACTIVE');
  const [pay, setPay] = React.useState('');
  const [terms, setTerms] = React.useState('');
  const [delivery, setDelivery] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const q = search.trim().toLowerCase();
  const all = (rows || []).slice().sort((a, b) => (a.saleDate < b.saleDate ? 1 : a.saleDate > b.saleDate ? -1 : b.id.localeCompare(a.id)));
  const shown = all.filter((s) => (!status || s.status === status) && (!pay || (s.status === 'ACTIVE' && s.paymentStatus === pay))
    && (!terms || s.terms === terms) && (!delivery || (s.status === 'ACTIVE' && s.fulfillment === delivery))
    && (!from || s.saleDate >= from) && (!to || s.saleDate <= to)
    && (!q || s.id.toLowerCase().includes(q) || s.customerName.toLowerCase().includes(q) || s.lines.some((l) => l.itemName.toLowerCase().includes(q))));
  const active = shown.filter((s) => s.status === 'ACTIVE');
  const total = (k) => active.reduce((a, s) => a + s[k], 0);

  return (
    <div className="page stack">
      <PageHeader title="Sales" description="Every sale, newest first. Cancelled sales stay visible but do not count in the totals."
        actions={<Button variant="primary" icon="newSale" onClick={() => navigate('/sales/new')}>New sale</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Sales shown</div><div className="stat-value">{rows ? active.length : '—'}</div></div>
        <div className="stat"><div className="stat-label">Sales total</div><div className="stat-value">{rows ? formatMoney(total('totalC')) : '—'}</div></div>
        <div className="stat"><div className="stat-label">Paid</div><div className="stat-value">{rows ? formatMoney(total('paidC')) : '—'}</div></div>
        <div className="stat"><div className="stat-label">Still to collect</div><div className={`stat-value ${total('balanceC') ? 'is-warning' : ''}`}>{rows ? formatMoney(total('balanceC')) : '—'}</div></div>
      </div>
      <Panel flush>
        <div className="toolbar">
          <TextField label="Search" className="toolbar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sale no., customer or item" />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: '', label: 'All' }]} />
          <SelectField label="Payment" value={pay} onChange={(e) => setPay(e.target.value)} options={[{ value: '', label: 'Any' }, ...Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))]} />
          <SelectField label="Terms" value={terms} onChange={(e) => setTerms(e.target.value)} options={[{ value: '', label: 'Any' }, ...Object.entries(TERMS_LABELS).map(([value, label]) => ({ value, label }))]} />
          <SelectField label="Delivery" value={delivery} onChange={(e) => setDelivery(e.target.value)} options={[{ value: '', label: 'Any' }, ...Object.entries(FULFILLMENT_LABELS).map(([value, label]) => ({ value, label }))]} />
          <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="toolbar-end">{rows ? `${shown.length} shown` : ''}</span>
        </div>
        {!rows ? <LoadingRows label="Loading sales" /> : (
          <SalesTable rows={shown}
            empty={all.length
              ? <EmptyState icon="search" title="No matching sales">Change the search or filters.</EmptyState>
              : <EmptyState icon="sales" title="No sales yet" action={<div className="button-row"><Button variant="primary" icon="newSale" onClick={() => navigate('/sales/new')}>New sale</Button><SampleDataButton adapter={adapter} /></div>}>
                  Record your first sale, or load sample data to try the system.</EmptyState>} />
        )}
        {rows && rows.length >= limit && <div className="list-more"><Button size="sm" onClick={() => setLimit(limit + 200)}>Show more</Button></div>}
      </Panel>
    </div>
  );
}
