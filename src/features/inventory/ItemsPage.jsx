/* Items list (Phase 4): search, filters, low stock, valuation. */
import { PageHeader, Panel, DataTable, EmptyState, Banner, LoadingRows } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField, SelectField } from '../../components/Field.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useQuery, errorMessage, actorOf } from '../../data/useData.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ensureBatches } from '../../data/inventoryService.js';
import { displayPrice, uncoveredH, batchesOf } from '../../domain/batches.js';
import { today } from '../../domain/dates.js';
import { formatQty } from '../../domain/quantity.js';
import { formatMoney } from '../../domain/money.js';
import { stockStatus, stockValueC, inventorySummary } from '../../domain/inventory.js';
import { ItemFormDialog, StockBadge } from './InventoryDialogs.jsx';
import { SampleDataButton } from '../system/SampleData.jsx';
import { PricePosterDialog } from './PricePosterDialog.jsx';

/**
 * All items, live, sorted by name. Shared by inventory screens. D-055: the first time it sees stock that is not in
 * any batch (data from before batches existed) it registers that stock as the item's first batch (owner, online).
 */
export function useItems(adapter) {
  const auth = useAuth();
  const online = useOnline();
  const { rows, error } = useQuery(adapter, 'items', { orderBy: [['nameLower', 'asc']] }, 'items-by-name');
  const tried = React.useRef(false);
  React.useEffect(() => {
    if (!rows || tried.current || !online || !auth || !auth.user || !rows.some((i) => uncoveredH(i) > 0)) return;
    tried.current = true;
    ensureBatches(adapter, actorOf(auth.user), today()).catch(() => {});
  }, [rows, online]);
  return { items: rows, error };
}

/** Cash price cell: the oldest batch's price, with the next batch's price when it differs (D-052). */
export function PriceCell({ item }) {
  const p = displayPrice(item);
  return <>{formatMoney(p.priceC)}{p.nextPriceC !== null && <span className="cell-sub">next {formatMoney(p.nextPriceC)}</span>}</>;
}

export function ItemsPage({ adapter }) {
  const online = useOnline();
  const { items, error } = useItems(adapter);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('ACTIVE');
  const [unit, setUnit] = React.useState('');
  const [stock, setStock] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [poster, setPoster] = React.useState(false);

  const all = items || [];
  const q = search.trim().toLowerCase();
  const rows = all.filter((i) => (status ? i.status === status : true)
    && (unit ? i.unit === unit : true)
    && (stock === 'LOW' ? stockStatus(i) !== 'OK' : stock === 'OUT' ? stockStatus(i) === 'OUT' : true)
    && (!q || [i.name, i.variety, i.category, i.sku].some((v) => (v || '').toLowerCase().includes(q))));
  const summary = inventorySummary(all);

  const columns = [
    { key: 'name', header: 'Item', className: 'key-col', render: (i) => (
      <><Link to={`/items/${i.id}`}>{i.name}</Link><span className="cell-sub">{[i.variety, i.category].filter(Boolean).join(' · ') || '—'}</span></>) },
    { key: 'unit', header: 'Unit', render: (i) => (i.unit === 'SACK' ? `Sack (${i.sackWeightKg} kg)` : 'Per kg') },
    { key: 'qty', header: 'In stock', align: 'right', render: (i) => formatQty(i.qtyH, i.unit) },
    { key: 'status', header: 'Status', render: (i) => <StockBadge item={i} /> },
    { key: 'min', header: 'Low-stock level', align: 'right', render: (i) => (i.minStockH ? formatQty(i.minStockH, i.unit) : '—') },
    { key: 'price', header: 'Cash price', align: 'right', render: (i) => <PriceCell item={i} /> },
    { key: 'payday', header: 'Payday price', align: 'right', render: (i) => (Number.isInteger(i.installmentPriceC) ? formatMoney(i.installmentPriceC) : <span className="muted">Same</span>) },
    { key: 'cost', header: 'Batches', align: 'right', render: (i) => batchesOf(i).length || '—' },
    { key: 'value', header: 'Stock value', align: 'right', render: (i) => formatMoney(stockValueC(i)) },
  ];
  const footer = ['Total', '', '', '', '', '', '', '', formatMoney(rows.reduce((s, i) => s + stockValueC(i), 0))];

  return (
    <div className="page stack">
      <PageHeader title="Items" description="Rice products, stock on hand and value at cost. Prices shown are of the oldest batch in stock (sold first)."
        actions={<div className="button-row">
          <Button icon="image" onClick={() => setPoster(true)} disabled={!items || !all.some((i) => i.status === 'ACTIVE')}>Price poster</Button>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add item</Button>
        </div>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Active items</div><div className="stat-value">{items ? summary.activeCount : '—'}</div></div>
        <div className="stat"><div className="stat-label">Stock value (at cost)</div><div className="stat-value">{items ? formatMoney(summary.valueC) : '—'}</div></div>
        <div className="stat"><div className="stat-label">Low stock</div><div className={`stat-value ${summary.lowCount ? 'is-warning' : ''}`}>{items ? summary.lowCount : '—'}</div></div>
        <div className="stat"><div className="stat-label">Out of stock</div><div className={`stat-value ${summary.outCount ? 'is-danger' : ''}`}>{items ? summary.outCount : '—'}</div></div>
      </div>
      <Panel flush>
        <div className="toolbar">
          <TextField label="Search" className="toolbar-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, variety, category or SKU" type="search" />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'ARCHIVED', label: 'Archived' }, { value: '', label: 'All' }]} />
          <SelectField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} options={[{ value: '', label: 'All units' }, { value: 'SACK', label: 'Sacks' }, { value: 'KG', label: 'Per kg' }]} />
          <SelectField label="Stock" value={stock} onChange={(e) => setStock(e.target.value)} options={[{ value: '', label: 'Any stock' }, { value: 'LOW', label: 'Low or out of stock' }, { value: 'OUT', label: 'Out of stock' }]} />
          <span className="toolbar-end">{items ? `${rows.length} of ${all.length}` : ''}</span>
        </div>
        {!items ? <LoadingRows label="Loading items" /> : (
          <DataTable caption="Items" columns={columns} rows={rows} footer={rows.length ? footer : null}
            rowClassName={(i) => (i.status === 'ARCHIVED' ? 'is-muted' : '')}
            empty={all.length
              ? <EmptyState icon="search" title="No matching items">Change the search or filters.</EmptyState>
              : <EmptyState icon="items" title="No items yet" action={<div className="button-row"><Button variant="primary" icon="plus" onClick={() => setAdding(true)} disabled={!online}>Add item</Button><SampleDataButton adapter={adapter} /></div>}>
                  Add your first rice product, or load sample data to try the system.
                </EmptyState>} />
        )}
      </Panel>
      <PricePosterDialog open={poster} onClose={() => setPoster(false)} adapter={adapter} items={all} />
      <ItemFormDialog open={adding} onClose={() => setAdding(false)} adapter={adapter} item={null} items={all} onSaved={(id) => navigate(`/items/${id}`)} />
    </div>
  );
}
