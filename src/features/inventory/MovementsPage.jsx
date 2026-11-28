/* Inventory movements (Phase 4): every stock change, newest first, with filters. */
import { PageHeader, Panel, DataTable, EmptyState, Banner, LoadingRows, Badge } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, SelectField } from '../../components/Field.jsx';
import { Link } from '../../app/router.jsx';
import { useQuery, errorMessage } from '../../data/useData.js';
import { useSkus } from './ItemsPage.jsx';
import { formatDateTime } from '../../app/format.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate } from '../../domain/dates.js';
import { MOVEMENT_LABELS } from '../../domain/inventory.js';

const TYPE_TONE = { OPENING: 'info', SALE: 'neutral', SALE_CANCEL: 'neutral', RESTOCK_RECEIPT: 'success', ADJUSTMENT: 'warning', COUNT_ADJUSTMENT: 'warning', SACK_OPEN_OUT: 'info', SACK_OPEN_IN: 'info' };

function refLink(m) {
  if (m.refType === 'STOCK_COUNT') return <Link to={`/stock-count/${m.refId}`}>Stock count</Link>;
  if (m.refType === 'SALE' && m.refId) return m.refId;
  if (m.refType === 'RESTOCK' && m.refId) return m.refId;
  return null;
}

export function MovementsTable({ rows, showItem = true, empty, skus = {} }) {
  const columns = [
    { key: 'date', header: 'Date', render: (m) => <>{formatDate(m.businessDate)}<span className="cell-sub">Recorded {formatDateTime(m.createdAt)}</span></> },
    ...(showItem ? [{ key: 'item', header: 'Item', className: 'key-col', render: (m) => <><Link to={`/items/${m.itemId}`}>{m.itemName}</Link>{skus[m.itemId] && <span className="cell-sub sku">{skus[m.itemId]}</span>}</> }] : []),
    { key: 'type', header: 'Type', render: (m) => <Badge tone={TYPE_TONE[m.type]}>{MOVEMENT_LABELS[m.type] || m.type}</Badge> },
    { key: 'delta', header: 'Change', align: 'right', render: (m) => (
      <span className={m.qtyDeltaH > 0 ? 'delta-in' : 'delta-out'}>{m.qtyDeltaH > 0 ? '+' : '−'}{formatQty(Math.abs(m.qtyDeltaH), m.unit)}</span>) },
    { key: 'after', header: 'Stock after', align: 'right', render: (m) => formatQty(m.qtyAfterH, m.unit) },
    { key: 'reason', header: 'Reason / note', className: 'wrap', render: (m) => {
      const ref = refLink(m);
      const text = [m.reason, m.note].filter(Boolean).join(' — ');
      return <>{text || (ref ? null : '—')}{ref && <span className={text ? 'cell-sub' : ''}>{ref}</span>}</>;
    } },
  ];
  return <DataTable caption="Stock movements" columns={columns} rows={rows} empty={empty} />;
}

export function MovementsPage({ adapter }) {
  const [type, setType] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [limit, setLimit] = React.useState(100);
  const skus = useSkus(adapter);
  const query = { where: type ? [['type', '==', type]] : [], orderBy: [['createdAt', 'desc']], limit };
  const { rows, error } = useQuery(adapter, 'inventoryMovements', query, `movements-${type}-${limit}`);

  const q = search.trim().toLowerCase();
  const shown = (rows || []).filter((m) => (!q || m.itemName.toLowerCase().includes(q) || (skus[m.itemId] || '').toLowerCase().includes(q))
    && (!from || m.businessDate >= from) && (!to || m.businessDate <= to));

  return (
    <div className="page stack">
      <PageHeader title="Movements" description="Every change to stock: opening stock, sales, restocks, adjustments, counts and opened sacks. Movements cannot be edited." />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <Panel flush>
        <div className="toolbar">
          <TextField label="Item" className="toolbar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item name" />
          <SelectField label="Type" value={type} onChange={(e) => { setType(e.target.value); setLimit(100); }}
            options={[{ value: '', label: 'All types' }, ...Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({ value, label }))]} />
          <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="toolbar-end">{rows ? `${shown.length} shown` : ''}</span>
        </div>
        {!rows ? <LoadingRows label="Loading movements" /> : (
          <MovementsTable rows={shown} skus={skus}
            empty={<EmptyState icon="movements" title={rows.length ? 'No matching movements' : 'No movements yet'}>
              {rows.length ? 'Change the filters.' : 'Stock changes appear here once items have opening stock or adjustments.'}</EmptyState>} />
        )}
        {rows && rows.length >= limit && <div className="list-more"><Button size="sm" onClick={() => setLimit(limit + 100)}>Show more</Button></div>}
      </Panel>
    </div>
  );
}
