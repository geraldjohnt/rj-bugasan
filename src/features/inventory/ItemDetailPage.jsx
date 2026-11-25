/* Item detail (Phase 4): summary, actions (edit, adjust, open sack, archive) and movement history. */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows, Badge } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/Icon.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDoc, useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { setItemStatus } from '../../data/inventoryService.js';
import { formatQty, UNITS } from '../../domain/quantity.js';
import { formatMoney } from '../../domain/money.js';
import { stockValueC } from '../../domain/inventory.js';
import { useItems } from './ItemsPage.jsx';
import { MovementsTable } from './MovementsPage.jsx';
import { ItemFormDialog, AdjustStockDialog, OpenSackDialog, ConfirmDialog, StockBadge } from './InventoryDialogs.jsx';

export function ItemDetailPage({ adapter, id }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const { doc: item, error } = useDoc(adapter, 'items', id);
  const { items } = useItems(adapter);
  const [limit, setLimit] = React.useState(50);
  const history = useQuery(adapter, 'inventoryMovements',
    { where: [['itemId', '==', id]], orderBy: [['createdAt', 'desc']], limit }, `item-history-${id}-${limit}`);
  const [dialog, setDialog] = React.useState(null); // 'edit' | 'adjust' | 'open' | 'archive'

  if (error) return <div className="page"><Banner tone="danger">{errorMessage(error)}</Banner></div>;
  if (item === undefined) return <div className="page"><LoadingRows label="Loading item" /></div>;
  if (item === null) {
    return <div className="page"><PageHeader title="Item not found" /><Panel><EmptyState icon="warning" title="This item does not exist"><Link to="/items">Back to items</Link></EmptyState></Panel></div>;
  }

  const all = items || [];
  const byId = Object.fromEntries(all.map((i) => [i.id, i]));
  const linked = item.unit === UNITS.SACK ? byId[item.linkedKgItemId] : byId[item.linkedSackItemId];
  const active = item.status === 'ACTIVE';
  const canOpen = item.unit === UNITS.SACK && linked && active && linked.status === 'ACTIVE';
  const sackForOpen = item.unit === UNITS.SACK ? item : linked;
  const kgForOpen = item.unit === UNITS.SACK ? linked : item;
  const canOpenFromKg = item.unit === UNITS.KG && linked && active && linked.status === 'ACTIVE';

  return (
    <div className="page stack">
      <div>
        <Link to="/items" className="back-link"><Icon name="back" size={16} />Items</Link>
        <PageHeader
          title={<span className="page-title-row">{item.name} <StockBadge item={item} /></span>}
          description={[item.unit === UNITS.SACK ? `Sack of ${item.sackWeightKg} kg` : 'Sold per kg', item.variety, item.category].filter(Boolean).join(' · ')}
          actions={<div className="button-row">
            {active && <Button icon="adjust" onClick={() => setDialog('adjust')} disabled={!online}>Adjust stock</Button>}
            {(canOpen || canOpenFromKg) && <Button icon="openSack" onClick={() => setDialog('open')} disabled={!online}>Open sack</Button>}
            <Button icon="edit" onClick={() => setDialog('edit')} disabled={!online}>Edit</Button>
            <Button icon={active ? 'archive' : 'restore'} onClick={() => setDialog('archive')} disabled={!online}>{active ? 'Archive' : 'Restore'}</Button>
          </div>} />
      </div>
      {!active && <Banner tone="info">This item is archived. It cannot be sold or restocked, and its history is kept.</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">In stock</div><div className="stat-value">{formatQty(item.qtyH, item.unit)}</div></div>
        <div className="stat"><div className="stat-label">Selling price</div><div className="stat-value">{formatMoney(item.priceC)}</div></div>
        <div className="stat"><div className="stat-label">Cost</div><div className="stat-value">{formatMoney(item.costC)}</div></div>
        <div className="stat"><div className="stat-label">Stock value</div><div className="stat-value">{formatMoney(stockValueC(item))}</div></div>
      </div>
      <Panel title="Details">
        <dl className="detail-list">
          <div><dt>Low-stock level</dt><dd>{item.minStockH ? formatQty(item.minStockH, item.unit) : 'Not set'}</dd></div>
          <div><dt>{item.unit === UNITS.SACK ? 'Linked per-kg item' : 'Linked sack item'}</dt>
            <dd>{linked ? <Link to={`/items/${linked.id}`}>{linked.name}</Link> : 'Not linked'}</dd></div>
          <div><dt>SKU / code</dt><dd>{item.sku || '—'}</dd></div>
          <div><dt>Margin per {item.unit === UNITS.SACK ? 'sack' : 'kg'}</dt>
            <dd>{formatMoney(item.priceC - item.costC)} {item.priceC < item.costC && <Badge tone="danger">Below cost</Badge>}</dd></div>
          {item.description && <div className="span-2"><dt>Description</dt><dd>{item.description}</dd></div>}
        </dl>
      </Panel>
      <Panel title="Stock history" flush>
        {history.error ? <div className="panel-body"><Banner tone="danger">{errorMessage(history.error)}</Banner></div>
          : !history.rows ? <LoadingRows label="Loading history" />
          : <MovementsTable rows={history.rows} showItem={false}
              empty={<EmptyState icon="movements" title="No stock changes yet">Opening stock, sales, restocks and adjustments appear here.</EmptyState>} />}
        {history.rows && history.rows.length >= limit && <div className="list-more"><Button size="sm" onClick={() => setLimit(limit + 50)}>Show more</Button></div>}
      </Panel>

      <ItemFormDialog open={dialog === 'edit'} onClose={() => setDialog(null)} adapter={adapter} item={item} items={all} />
      <AdjustStockDialog open={dialog === 'adjust'} onClose={() => setDialog(null)} adapter={adapter} item={item} />
      <OpenSackDialog open={dialog === 'open'} onClose={() => setDialog(null)} adapter={adapter} sack={sackForOpen} kg={kgForOpen} />
      <ConfirmDialog open={dialog === 'archive'} onClose={() => setDialog(null)}
        title={active ? `Archive ${item.name}?` : `Restore ${item.name}?`} confirmLabel={active ? 'Archive item' : 'Restore item'}
        onConfirm={async () => { await setItemStatus(adapter, actorOf(auth.user), item.id, active ? 'ARCHIVED' : 'ACTIVE'); toast({ message: active ? 'Item archived.' : 'Item restored.' }); }}>
        {active
          ? <p>Archived items cannot be sold or restocked. All history is kept and you can restore the item later.{item.qtyH > 0 && <> It still has <strong>{formatQty(item.qtyH, item.unit)}</strong> in stock.</>}</p>
          : <p>The item becomes available for sales and restocks again.</p>}
      </ConfirmDialog>
    </div>
  );
}
