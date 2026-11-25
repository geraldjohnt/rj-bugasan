/* Activity log (Phase 11, RQ-043, BR-093): owner-only, read-only, searchable list of every significant action. */
import { PageHeader, Panel, EmptyState, Banner, LoadingRows, Badge, DataTable } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, SelectField } from '../../components/Field.jsx';
import { Link } from '../../app/router.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, errorMessage } from '../../data/useData.js';
import { formatDateTime, toJsDate } from '../../app/format.js';

export const ENTITY_LABELS = {
  sale: 'Sales', payment: 'Payments', customer: 'Customers', item: 'Items', stockCount: 'Stock counts', restock: 'Restocks',
  supplier: 'Suppliers', expense: 'Expenses', calendarEvent: 'Calendar', backup: 'Backup and restore',
};
const ENTITY_TONE = { sale: 'info', payment: 'success', customer: 'neutral', item: 'neutral', stockCount: 'warning', restock: 'info', supplier: 'neutral', expense: 'warning', calendarEvent: 'neutral', backup: 'danger' };

/** Where an entry's record lives, if it has its own screen. */
export function entityLink(e) {
  const id = e.entityId;
  switch (e.entityType) {
    case 'sale': return `/sales/${id}`;
    case 'customer': return `/customers/${id}`;
    case 'item': return `/items/${id}`;
    case 'restock': return `/restocks/${id}`;
    case 'supplier': return `/suppliers/${id}`;
    case 'stockCount': return `/stock-count/${id}`;
    case 'expense': return '/expenses';
    case 'calendarEvent': return '/calendar';
    case 'backup': return '/backup';
    default: return null;
  }
}
export const actionLabel = (a) => String(a || '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Local (Asia/Manila) date of an entry's time, YYYY-MM-DD. */
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (v) => { const d = toJsDate(v); return d ? DAY.format(d) : ''; };

export function ActivityLogPage({ adapter }) {
  const auth = useAuth();
  const isOwner = auth.user && auth.user.role === 'owner';
  const [limit, setLimit] = React.useState(200);
  const [type, setType] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const query = !isOwner ? null : { where: type ? [['entityType', '==', type]] : [], orderBy: [['at', 'desc']], limit };
  const { rows, error } = useQuery(adapter, 'activityLogs', query, `log-${type}-${limit}-${isOwner}`);

  if (!isOwner) {
    return <div className="page stack"><PageHeader title="Activity log" /><Panel><EmptyState icon="lock" title="Only the owner can see the activity log" /></Panel></div>;
  }
  const q = search.trim().toLowerCase();
  const shown = (rows || []).filter((e) => {
    const d = dayOf(e.at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return !q || [e.summary, e.byName, e.entityId, actionLabel(e.action)].some((x) => String(x || '').toLowerCase().includes(q));
  });
  const columns = [
    { key: 'at', header: 'When', render: (e) => <span className="nowrap">{formatDateTime(e.at)}</span> },
    { key: 'what', header: 'What happened', className: 'wrap', render: (e) => {
      const to2 = entityLink(e);
      return <>{e.summary}<span className="cell-sub">{actionLabel(e.action)}{e.entityId && e.entityType !== 'backup' ? <> · {to2 ? <Link to={to2}>{e.entityId}</Link> : e.entityId}</> : null}</span></>;
    } },
    { key: 'type', header: 'Area', render: (e) => <Badge tone={ENTITY_TONE[e.entityType] || 'neutral'}>{ENTITY_LABELS[e.entityType] || e.entityType}</Badge> },
    { key: 'by', header: 'By', render: (e) => e.byName || <span className="muted">—</span> },
  ];
  return (
    <div className="page stack">
      <PageHeader title="Activity log" description="Every sale, payment, stock change, price change, restore and other important action, newest first. Entries cannot be edited or deleted." />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <Panel flush>
        <div className="toolbar">
          <TextField label="Search" className="toolbar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Text, record no. or person" />
          <SelectField label="Area" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: 'All' }, ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))]} />
          <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="toolbar-end">{rows ? `${shown.length} shown` : ''}</span>
        </div>
        {!rows ? <LoadingRows label="Loading activity" /> : (
          <DataTable caption="Activity log" columns={columns} rows={shown}
            empty={rows.length
              ? <EmptyState icon="search" title="No matching entries">Change the search or filters{rows.length >= limit ? ', or show more' : ''}.</EmptyState>
              : <EmptyState icon="activity" title="Nothing recorded yet">Actions appear here as soon as you add items, customers or sales.</EmptyState>} />
        )}
        {rows && rows.length >= limit && <div className="list-more"><Button size="sm" onClick={() => setLimit(limit + 200)}>Show older entries</Button></div>}
      </Panel>
    </div>
  );
}
