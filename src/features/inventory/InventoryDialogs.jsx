/* Item form, stock adjustment, open sack and confirmation dialogs (Phase 4). */
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Banner, Badge } from '../../components/Feedback.jsx';
import { TextField, SelectField, TextAreaField, Segmented } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOnline } from '../../app/useOnline.js';
import { actorOf, errorMessage } from '../../data/useData.js';
import { UNITS, parseQty, formatQty, qtyToPlain } from '../../domain/quantity.js';
import { formatMoney, centavosToPlain, parseMoney } from '../../domain/money.js';
import { today } from '../../domain/dates.js';
import {
  validateItemForm, priceBelowCost, ADJUSTMENT_REASONS, ITEM_CATEGORIES, unitLabel, defaultKgCostC, stockStatus, sackWeightH,
} from '../../domain/inventory.js';
import { createItem, updateItem, adjustStock, openSack, updateBatch } from '../../data/inventoryService.js';
import { batchesOf, displayPrice } from '../../domain/batches.js';

export function StockBadge({ item }) {
  if (item.status === 'ARCHIVED') return <Badge>Archived</Badge>;
  const s = stockStatus(item);
  if (s === 'OUT') return <Badge tone="danger">Out of stock</Badge>;
  if (s === 'LOW') return <Badge tone="warning">Low stock</Badge>;
  return null;
}

function focusFirstError(formEl) {
  setTimeout(() => { const el = formEl && formEl.querySelector('[aria-invalid="true"]'); if (el) el.focus(); }, 0);
}

/* ------------------------------------------------------------------ item form */

function initialForm(item) {
  if (!item) {
    return { name: '', unit: UNITS.SACK, sackWeightKg: '50', variety: '', category: '', sku: '', description: '', priceC: '', installmentPriceC: '', costC: '',
      minStock: '', linkedSackItemId: '', openingQty: '', openingDate: today() };
  }
  return {
    name: item.name, unit: item.unit, sackWeightKg: item.sackWeightKg ? String(item.sackWeightKg) : '', variety: item.variety || '',
    category: item.category || '', sku: item.sku || '', description: item.description || '',
    priceC: centavosToPlain(item.priceC),
    installmentPriceC: Number.isInteger(item.installmentPriceC) ? centavosToPlain(item.installmentPriceC) : '', costC: centavosToPlain(item.costC), minStock: qtyToPlain(item.minStockH || 0),
    linkedSackItemId: item.linkedSackItemId || '',
  };
}

export function ItemFormDialog({ open, onClose, adapter, item, items, onSaved }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const isNew = !item;
  const [form, setForm] = React.useState(() => initialForm(item));
  const [applyToBatches, setApplyToBatches] = React.useState(true);
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const formRef = React.useRef(null);
  React.useEffect(() => { if (open) { setForm(initialForm(item)); setErrors({}); setError(null); setApplyToBatches(true); } }, [open, item && item.id]);

  const set = (k) => (e) => { const v = e && e.target ? e.target.value : e; setForm((f) => ({ ...f, [k]: v })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };
  const existingNames = React.useMemo(() => new Set(items.filter((i) => i.status === 'ACTIVE' && (!item || i.id !== item.id)).map((i) => i.nameLower)), [items, item]);
  const sackOptions = items.filter((i) => i.unit === UNITS.SACK && i.status === 'ACTIVE' && (!i.linkedKgItemId || (item && i.linkedKgItemId === item.id)));
  const preview = validateItemForm(form, { isNew, existingNames }).data;
  const unitWord = form.unit === UNITS.SACK ? 'sacks' : 'kg';

  async function submit(e) {
    e.preventDefault();
    const { data, errors: errs } = validateItemForm(form, { isNew, existingNames });
    setErrors(errs);
    if (Object.keys(errs).length) { focusFirstError(formRef.current); return; }
    setBusy(true); setError(null);
    try {
      const actor = actorOf(auth.user);
      if (isNew) { const id = await createItem(adapter, actor, data); toast({ message: `${data.name} added.` }); onSaved && onSaved(id); }
      else { await updateItem(adapter, actor, item.id, data, { applyPriceToBatches: applyToBatches }); toast({ message: 'Changes saved.' }); onSaved && onSaved(item.id); }
      onClose();
    } catch (err) {
      if (err.details && err.details.field) { setErrors({ [err.details.field]: err.message }); focusFirstError(formRef.current); }
      else setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" title={isNew ? 'Add item' : `Edit ${item.name}`}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="item-form" loading={busy} disabled={!online}>{isNew ? 'Add item' : 'Save changes'}</Button>
      </>}>
      <form id="item-form" ref={formRef} onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        {isNew
          ? <Segmented label="Sold by" value={form.unit} onChange={set('unit')} options={[{ value: UNITS.SACK, label: 'Sack' }, { value: UNITS.KG, label: 'Kilo (per kg)' }]} />
          : <p className="muted">Sold by {form.unit === UNITS.SACK ? 'sack' : 'kilo'}. The unit cannot be changed after the item is created.</p>}
        <div className="form-grid">
          <TextField label="Item name" required value={form.name} onChange={set('name')} error={errors.name} data-autofocus
            placeholder={form.unit === UNITS.SACK ? 'e.g. Dinorado 50kg Sack' : 'e.g. Dinorado per KG'} className="span-2" />
          <TextField label="Variety" value={form.variety} onChange={set('variety')} help="Groups the sack and per-kg items, e.g. Dinorado." />
          <SelectField label="Category" value={form.category} onChange={set('category')}
            options={[{ value: '', label: 'No category' }, ...ITEM_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
          {form.unit === UNITS.SACK
            ? <TextField label="Sack weight" required value={form.sackWeightKg} onChange={set('sackWeightKg')} error={errors.sackWeightKg} inputMode="decimal" suffix="kg" inputClassName="num" />
            : <SelectField label="Linked sack item" value={form.linkedSackItemId} onChange={set('linkedSackItemId')} error={errors.linkedSackItemId}
                help="Lets you open sacks of that item into this one."
                options={[{ value: '', label: 'Not linked' }, ...sackOptions.map((s) => ({ value: s.id, label: `${s.name} (${s.sackWeightKg} kg)` }))]} />}
          <TextField label="SKU" value={form.sku} onChange={set('sku')} error={errors.sku} help={item ? 'Leave blank to keep the current SKU.' : 'Leave blank for an automatic SKU (e.g. RJ-DIN-001).'} />
          <TextField label={`Cash price per ${form.unit === UNITS.SACK ? 'sack' : 'kg'} (default for new batches)`} required value={form.priceC} onChange={set('priceC')} error={errors.priceC} inputMode="decimal" prefix="₱" inputClassName="num"
            help="Pre-fills the price of new batches. Each batch keeps its own cash price (change it under Batches)." />
          <TextField label={`Credit price per ${form.unit === UNITS.SACK ? 'sack' : 'kg'}`} value={form.installmentPriceC} onChange={set('installmentPriceC')} error={errors.installmentPriceC} inputMode="decimal" prefix="₱" inputClassName="num"
            help="Used for open-balance and installment sales. Leave empty to use the cash price." />
          <TextField label={`Cost per ${form.unit === UNITS.SACK ? 'sack' : 'kg'} (default for new batches)`} required value={form.costC} onChange={set('costC')} error={errors.costC} inputMode="decimal" prefix="₱" inputClassName="num"
            help="Pre-fills the cost of new batches. Profit uses each batch's own cost." />
          <TextField label="Low-stock level" value={form.minStock} onChange={set('minStock')} error={errors.minStock} inputMode="decimal" suffix={unitWord} inputClassName="num"
            help="Flag the item when stock is at or below this." />
          {isNew && <TextField label="Opening stock" value={form.openingQty} onChange={set('openingQty')} error={errors.openingQty} inputMode="decimal" suffix={unitWord} inputClassName="num"
            help="Stock on hand today. Leave empty for none." />}
          {isNew && Number(form.openingQty) > 0 && <TextField label="Opening stock date" type="date" required value={form.openingDate} onChange={set('openingDate')} error={errors.openingDate} />}
          <TextAreaField label="Description" value={form.description} onChange={set('description')} className="span-2" rows={2} />
        </div>
        {!isNew && Number.isInteger(preview.priceC) && preview.priceC !== item.priceC && batchesOf(item).some((b) => b.priceC !== preview.priceC) && (
          <label className="checkbox"><input type="checkbox" checked={applyToBatches} onChange={(e) => setApplyToBatches(e.target.checked)} />
            Also change the cash price of the {batchesOf(item).length} batch(es) in stock to {formatMoney(preview.priceC)}</label>)}
        {priceBelowCost(preview) && <Banner tone="warning">The cash price is below the cost. Every cash sale of this item would lose money.</Banner>}
        {Number.isInteger(preview.installmentPriceC) && Number.isInteger(preview.priceC) && preview.installmentPriceC < preview.priceC
          && <Banner tone="warning">The credit price is lower than the cash price. Customers who pay later would pay less.</Banner>}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ adjust stock */

export function AdjustStockDialog({ open, onClose, adapter, item }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const blank = { direction: 'OUT', qty: '', reason: '', note: '', date: today(), batchId: '' };
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { if (open) { setForm(blank); setErrors({}); setError(null); } }, [open]);
  if (!item) return null;
  const set = (k) => (e) => { const v = e && e.target ? e.target.value : e; setForm((f) => ({ ...f, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })); };

  let qtyH = null, qtyErr = null;
  try { qtyH = parseQty(form.qty, item.unit); } catch (e) { qtyErr = e.message; }
  const after = qtyH ? item.qtyH + (form.direction === 'OUT' ? -qtyH : qtyH) : item.qtyH;

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (qtyErr) errs.qty = qtyErr; else if (!qtyH) errs.qty = 'Enter a quantity.';
    else if (after < 0) errs.qty = `Only ${formatQty(item.qtyH, item.unit)} in stock.`;
    if (!form.reason) errs.reason = 'Choose a reason.';
    if (form.reason === 'Other' && !form.note.trim()) errs.note = 'Describe the reason.';
    if (!form.date) errs.date = 'Enter a date.';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try {
      await adjustStock(adapter, actorOf(auth.user), { itemId: item.id, direction: form.direction, qtyH, reason: form.reason, note: form.note, date: form.date, batchId: form.batchId || null });
      toast({ message: `Stock updated: ${item.name} now ${formatQty(after, item.unit)}.` });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Adjust stock — ${item.name}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="adjust-form" loading={busy} disabled={!online}>Save adjustment</Button></>}>
      <form id="adjust-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <Segmented label="Change" value={form.direction} onChange={set('direction')} options={[{ value: 'OUT', label: 'Remove stock' }, { value: 'IN', label: 'Add stock' }]} />
        <div className="form-grid">
          <TextField label="Quantity" required value={form.qty} onChange={set('qty')} error={errors.qty} inputMode="decimal" suffix={unitLabel(item.unit)} inputClassName="num" data-autofocus />
          <TextField label="Date" type="date" required value={form.date} onChange={set('date')} error={errors.date} />
          <SelectField label="Reason" required value={form.reason} onChange={set('reason')} error={errors.reason}
            options={[{ value: '', label: 'Choose a reason' }, ...ADJUSTMENT_REASONS.map((r) => ({ value: r, label: r }))]} />
          <TextField label="Note" required={form.reason === 'Other'} value={form.note} onChange={set('note')} error={errors.note} />
          {batchesOf(item).length > 0 && <SelectField label="Batch" value={form.batchId} onChange={set('batchId')} className="span-2"
            help={form.direction === 'OUT' ? 'Automatic: oldest batch first.' : 'Automatic: newest batch.'}
            options={[{ value: '', label: 'Automatic' }, ...batchesOf(item).map((b) => ({ value: b.id, label: `${b.id} — ${formatQty(b.qtyH, item.unit)} at ${formatMoney(b.priceC)}` }))]} />}
        </div>
        <div className="summary-box" aria-live="polite">
          <div className="row"><span>Current stock</span><strong>{formatQty(item.qtyH, item.unit)}</strong></div>
          <div className="row"><span>After this adjustment</span><strong className={after < 0 ? 'delta-out' : ''}>{formatQty(after, item.unit)}</strong></div>
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ open sack */

export function OpenSackDialog({ open, onClose, adapter, sack, kg }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const defaultCost = sack ? defaultKgCostC(sack.costC, sack.sackWeightKg) : 0;
  const blank = { sacks: '1', cost: '', date: today() };
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { if (open) { setForm(blank); setErrors({}); setError(null); } }, [open, defaultCost]);
  if (!sack || !kg) return null;
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const sacks = /^\d+$/.test(form.sacks.trim()) ? Number(form.sacks.trim()) : null;
  const kgAddedH = sacks ? sacks * sackWeightH(sack.sackWeightKg) : 0;

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!sacks) errs.sacks = 'Enter a whole number of sacks (at least 1).';
    else if (sacks * 100 > sack.qtyH) errs.sacks = `Only ${formatQty(sack.qtyH, UNITS.SACK)} in stock.`;
    let costC = null;
    try { costC = parseMoney(form.cost); if (costC !== null && costC < 0) errs.cost = 'Cost cannot be negative.'; } catch (err) { errs.cost = err.message; }
    if (!form.date) errs.date = 'Enter a date.';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try {
      await openSack(adapter, actorOf(auth.user), { sackItemId: sack.id, sacks, kgCostC: costC, date: form.date });
      toast({ message: `Opened ${formatQty(sacks * 100, UNITS.SACK)}: +${formatQty(kgAddedH, UNITS.KG)} ${kg.name}.` });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Open sack"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="open-sack-form" loading={busy} disabled={!online}>Open sack</Button></>}>
      <form id="open-sack-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <p className="muted">Moves whole sacks of <strong>{sack.name}</strong> into <strong>{kg.name}</strong> as kilos.</p>
        <div className="form-grid">
          <TextField label="Sacks to open" required value={form.sacks} onChange={set('sacks')} error={errors.sacks} inputMode="numeric" suffix="sacks" inputClassName="num" data-autofocus />
          <TextField label="Date" type="date" required value={form.date} onChange={set('date')} error={errors.date} />
          <TextField label={`Cost per kg for ${kg.name}`} value={form.cost} onChange={set('cost')} error={errors.cost} inputMode="decimal" prefix="₱" inputClassName="num"
            placeholder="Automatic"
            help={`Leave empty: each sack batch's cost ÷ ${sack.sackWeightKg} kg (oldest batch ${batchesOf(sack)[0] ? `${formatMoney(defaultKgCostC(batchesOf(sack)[0].unitCostC, sack.sackWeightKg))}/kg` : `${formatMoney(defaultCost)}/kg`}). Opened sacks keep their batch number; kilos sell at ${formatMoney(kg.priceC)}/kg.`} className="span-2" />
        </div>
        <div className="summary-box" aria-live="polite">
          <div className="row"><span>{sack.name}</span><strong>{formatQty(sack.qtyH, UNITS.SACK)} → {formatQty(sack.qtyH - (sacks || 0) * 100, UNITS.SACK)}</strong></div>
          <div className="row"><span>{kg.name}</span><strong>{formatQty(kg.qtyH, UNITS.KG)} → {formatQty(kg.qtyH + kgAddedH, UNITS.KG)}</strong></div>
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ batch cost / price (D-050) */

export function BatchEditDialog({ open, onClose, adapter, item, batch }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [form, setForm] = React.useState({ unitCost: '', price: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { if (open && batch) { setForm({ unitCost: centavosToPlain(batch.unitCostC), price: centavosToPlain(batch.priceC) }); setError(null); } }, [open, batch]);
  if (!item || !batch) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await updateBatch(adapter, actorOf(auth.user), item.id, batch.id, form);
      toast({ message: r.changed ? `Batch ${batch.id} updated.` : 'Nothing changed.' });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={`Batch ${batch.id}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="batch-form" loading={busy} disabled={!online}>Save</Button></>}>
      <form id="batch-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <p className="muted">{item.name} · {formatQty(batch.qtyH, item.unit)} in stock. Changes apply to later sales only.</p>
        <div className="form-grid">
          <TextField label="Cost" required value={form.unitCost} onChange={set('unitCost')} inputMode="decimal" prefix="₱" inputClassName="num" data-autofocus />
          <TextField label="Cash price" required value={form.price} onChange={set('price')} inputMode="decimal" prefix="₱" inputClassName="num" />
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ confirm */

export function ConfirmDialog({ open, onClose, title, children, confirmLabel, tone = 'primary', onConfirm }) {
  const online = useOnline();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { if (open) setError(null); }, [open]);
  async function go() {
    setBusy(true); setError(null);
    try { await onConfirm(); onClose(); } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={title}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={tone} onClick={go} loading={busy} disabled={!online}>{confirmLabel}</Button></>}>
      {error && <Banner tone="danger">{error}</Banner>}
      {children}
    </Dialog>
  );
}
