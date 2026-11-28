/*
 * New sale (Phase 6, UI_UX_GUIDELINES §6). Left: customer + lines. Right: sticky summary with discount, terms,
 * payment and a live installment preview. The form validates live with planSale(), the same function the sale
 * service runs inside the transaction, so what the owner sees is what gets saved.
 */
import { PageHeader, Panel, Banner } from '../../components/Feedback.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { TextField, SelectField, Segmented, TextAreaField } from '../../components/Field.jsx';
import { Combobox } from '../../components/Combobox.jsx';
import { useToast } from '../../components/Toast.jsx';
import { navigate, useLocation } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { actorOf, errorMessage } from '../../data/useData.js';
import { createSale } from '../../data/salesService.js';
import { loadSalesSettings, DEFAULT_SALES_SETTINGS } from '../../data/settingsRepo.js';
import { formatMoney, parseMoney, centavosToPlain } from '../../domain/money.js';
import { UNITS, parseQty, formatQty } from '../../domain/quantity.js';
import { formatDate, today } from '../../domain/dates.js';
import { unitLabel } from '../../domain/inventory.js';
import { planSale, suggestedPrices, TERMS_LABELS, FULFILLMENT_LABELS } from '../../domain/sales.js';
import { displayPriceC, batchesOf, takenText } from '../../domain/batches.js';
import { useQuery } from '../../data/useData.js';
import { TERMS, DISCOUNT, WALK_IN_ID, requestedByItem, MAX_CHARGES } from '../../domain/saleTotals.js';
import { FREQUENCY_LABELS, ALLOWED_COUNTS } from '../../domain/schedule.js';
import { useItems } from '../inventory/ItemsPage.jsx';
import { useCustomers } from '../customers/CustomersPage.jsx';
import { CustomerFormDialog } from '../customers/CustomerDialogs.jsx';
import { METHOD_OPTIONS } from './PaymentDialogs.jsx';

let lineSeq = 0;
const newLine = () => ({ key: ++lineSeq, itemId: '', qty: '', price: '', auto: true, batchId: '' });
const newCharge = () => ({ key: ++lineSeq, name: '', amount: '' });

/** D-054: charge names used on recent sales, with the last amount, for quick entry. */
function useChargeSuggestions(adapter) {
  const { rows } = useQuery(adapter, 'sales', { orderBy: [['createdAt', 'desc']], limit: 200 }, 'recent-sales-charges');
  const m = new Map();
  for (const s of rows || []) for (const c of s.charges || []) if (!m.has(c.name.toLowerCase())) m.set(c.name.toLowerCase(), c);
  return [...m.values()];
}

function parseLine(l, item) {
  const out = { qtyH: null, priceC: null, qtyErr: null, priceErr: null };
  if (!item) return out;
  try { out.qtyH = parseQty(l.qty, item.unit); } catch (e) { out.qtyErr = e.message; }
  try { out.priceC = parseMoney(l.price); if (out.priceC !== null && out.priceC < 0) out.priceErr = 'Price cannot be negative.'; } catch (e) { out.priceErr = e.message; }
  return out;
}

export function NewSalePage({ adapter }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const { query } = useLocation();
  const { items } = useItems(adapter);
  const { customers } = useCustomers(adapter);
  const [settings, setSettings] = React.useState(DEFAULT_SALES_SETTINGS);
  React.useEffect(() => { loadSalesSettings(adapter).then(setSettings); }, [adapter]);

  const [customerId, setCustomerId] = React.useState(query.customer || WALK_IN_ID);
  const [saleDate, setSaleDate] = React.useState(today());
  const [lines, setLines] = React.useState(() => [newLine()]);
  const [charges, setCharges] = React.useState([]);
  const chargeSuggestions = useChargeSuggestions(adapter);
  const [discount, setDiscount] = React.useState({ type: DISCOUNT.NONE, value: '' });
  const [terms, setTerms] = React.useState(TERMS.FULL);
  const [method, setMethod] = React.useState('CASH');
  const [reference, setReference] = React.useState('');
  const [paidNow, setPaidNow] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [plan, setPlan] = React.useState({ count: 2, frequency: 'MONTHLY_15', downPayment: '' });
  const [dueDates, setDueDates] = React.useState([]);
  const [fulfillment, setFulfillment] = React.useState('PICKED_UP');
  const [deliveryDate, setDeliveryDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [creditOk, setCreditOk] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [addingCustomer, setAddingCustomer] = React.useState(false);

  React.useEffect(() => { setPlan((p) => ({ ...p, count: settings.defaultInstallmentCount || 2, frequency: settings.defaultFrequency || 'MONTHLY_15' })); }, [settings]);
  React.useEffect(() => { setDueDates([]); }, [plan.count, plan.frequency, saleDate]);
  React.useEffect(() => { if (customerId === WALK_IN_ID) setTerms(TERMS.FULL); setCreditOk(false); }, [customerId]);

  const itemsById = Object.fromEntries((items || []).map((i) => [i.id, i]));
  const customer = (customers || []).find((c) => c.id === customerId) || (customerId === WALK_IN_ID ? { id: WALK_IN_ID, name: 'Walk-in', status: 'ACTIVE', system: true } : null);
  const isWalkIn = customerId === WALK_IN_ID;

  // ---- parse the form
  const parsed0 = lines.map((l) => ({ ...l, item: itemsById[l.itemId], ...parseLine(l, itemsById[l.itemId]) }));
  // D-050/D-052: lines whose price was not typed follow the batches they take (weighted cash price) or the payday price.
  const priced = parsed0.filter((l) => l.item && l.qtyH);
  const sugg = suggestedPrices(priced.map((l) => ({ itemId: l.itemId, qtyH: l.qtyH, batchId: l.batchId || null })), itemsById, terms);
  const suggByKey = new Map(priced.map((l, i) => [l.key, sugg[i]]));
  const parsed = parsed0.map((l) => {
    if (!l.item || !l.auto) return l;
    const p = suggByKey.has(l.key) ? suggByKey.get(l.key) : suggestedPrices([{ itemId: l.itemId, qtyH: 1, batchId: l.batchId || null }], itemsById, terms)[0];
    return { ...l, priceC: p, priceErr: null, listC: p };
  });
  const filled = parsed.filter((l) => l.item);
  const requested = requestedByItem(filled.filter((l) => l.qtyH).map((l) => ({ itemId: l.itemId, qtyH: l.qtyH })));
  let discountValue = 0, discountErr = null;
  try { discountValue = discount.type === DISCOUNT.NONE ? 0 : (parseMoney(discount.value) ?? 0); } catch (e) { discountErr = e.message; }
  let paidNowC = 0, paidErr = null;
  try { paidNowC = parseMoney(paidNow) ?? 0; } catch (e) { paidErr = e.message; }
  let downC = 0, downErr = null;
  try { downC = parseMoney(plan.downPayment) ?? 0; } catch (e) { downErr = e.message; }
  let chargeErr = null;
  const chargeInput = charges.map((c) => {
    let amountC = null;
    try { amountC = parseMoney(c.amount); } catch (e) { chargeErr = chargeErr || e.message; }
    return { name: c.name, amountC };
  });

  const fieldErr = filled.find((l) => l.qtyErr || l.priceErr || l.qtyH === null || l.priceC === null);
  const input = {
    saleDate, customerId, lines: filled.map((l) => ({ itemId: l.itemId, qtyH: l.qtyH, unitPriceC: l.priceC, batchId: l.batchId || null })),
    charges: chargeInput,
    discount: { type: discount.type, value: discountValue }, terms, method, reference, paidNowC, dueDate: dueDate || null,
    plan: { count: plan.count, frequency: plan.frequency, downPaymentC: downC, dueDates }, fulfillment, deliveryDate: deliveryDate || null, notes, creditOverride: true,
  };
  let result = null, planError = null;
  if (!fieldErr && !discountErr && !paidErr && !downErr && !chargeErr && customer) {
    try { result = planSale(input, { itemsById, customer, settings, today: today() }); } catch (e) { planError = e; }
  }
  const formError = (!filled.length && 'Add at least one item.') || (fieldErr && (fieldErr.qtyErr || fieldErr.priceErr || 'Enter a quantity and price for every line.'))
    || discountErr || paidErr || downErr || chargeErr || (planError && planError.message) || null;
  const creditWarning = result && result.creditWarning;
  const canSave = online && result && !formError && (!creditWarning || creditOk) && !busy;

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function pickItem(key, itemId) {
    const it = itemsById[itemId];
    setLine(key, { itemId, price: '', auto: true, batchId: '', qty: it && it.unit === UNITS.SACK ? '1' : '' });
  }
  const setCharge = (key, patch) => setCharges((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  function chargeName(key, name) {
    const known = chargeSuggestions.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    setCharges((cs) => cs.map((c) => (c.key === key ? { ...c, name, amount: c.amount || !known ? c.amount : centavosToPlain(known.amountC) } : c)));
  }

  async function save() {
    setTried(true);
    if (!canSave) return;
    setBusy(true); setSaveError(null);
    try {
      const r = await createSale(adapter, actorOf(auth.user), { ...input, creditOverride: creditOk }, settings);
      toast({ message: `Sale ${r.saleId} saved.` });
      navigate(`/sales/${r.saleId}`);
    } catch (err) { setSaveError(errorMessage(err)); setBusy(false); }
  }

  const itemOptions = (items || []).filter((i) => i.status === 'ACTIVE').map((i) => ({
    value: i.id, label: i.name, disabled: i.qtyH <= 0,
    detail: `${i.sku ? `${i.sku} · ` : ''}${formatQty(i.qtyH, i.unit)} in stock · cash ${formatMoney(displayPriceC(i))}${Number.isInteger(i.installmentPriceC) ? ` · credit ${formatMoney(i.installmentPriceC)}` : ''} /${i.unit === UNITS.SACK ? 'sack' : 'kg'}`,
  }));
  const customerOptions = [
    { value: WALK_IN_ID, label: 'Walk-in', detail: 'Paid in full at the counter' },
    ...(customers || []).filter((c) => !c.system && c.status === 'ACTIVE').map((c) => ({
      value: c.id, label: c.name, search: `${c.name} ${c.contactNumber} ${c.address}`,
      detail: [c.contactNumber, c.outstandingC ? `owes ${formatMoney(c.outstandingC)}` : null].filter(Boolean).join(' · '),
    })),
  ];
  const termOptions = Object.values(TERMS).map((t) => ({ value: t, label: TERMS_LABELS[t] }));

  return (
    <div className="page stack">
      <PageHeader title="New sale" description="Saved sales cannot be edited. To correct one, cancel it and create it again." />
      {saveError && <Banner tone="danger">{saveError}</Banner>}
      <div className="sale-layout">
        <div className="stack">
          <Panel title="Customer">
            <div className="form-grid">
              <Combobox label="Customer" required options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Search name or phone" />
              <TextField label="Sale date" type="date" required value={saleDate} max={today()} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
            <div className="button-row">
              <Button size="sm" icon="addCustomer" onClick={() => setAddingCustomer(true)} disabled={!online}>New customer</Button>
              {customer && !isWalkIn && <span className="muted">{customer.contactNumber}{customer.outstandingC ? ` · currently owes ${formatMoney(customer.outstandingC)}` : ''}{customer.creditLimitC != null ? ` · limit ${formatMoney(customer.creditLimitC)}` : ''}</span>}
              {isWalkIn && <span className="muted">Walk-in sales must be paid in full. Choose a registered customer to leave a balance.</span>}
            </div>
          </Panel>

          <Panel title="Items" flush>
            <div className="sale-lines">
              {parsed.map((l, idx) => {
                const it = l.item;
                const over = it && l.qtyH && requested.get(it.id) > it.qtyH;
                const fi = filled.indexOf(l);
                const planned = result && fi >= 0 ? result.saleLines[fi] : null;
                const listC = planned ? planned.listPriceC : l.listC;
                const shown = l.auto ? (l.priceC !== null && l.priceC !== undefined ? centavosToPlain(l.priceC) : '') : l.price;
                const bs = it ? batchesOf(it) : [];
                return (
                  <div key={l.key} className="sale-line-wrap">
                  <div className="sale-line">
                    <Combobox label={idx === 0 ? 'Item' : undefined} inputLabel={`Item ${idx + 1}`} className="sale-line-item" options={itemOptions} value={l.itemId} onChange={(v) => pickItem(l.key, v)} placeholder="Search rice item" />
                    <TextField label={idx === 0 ? 'Quantity' : undefined} aria-label={`Quantity ${idx + 1}`} className="sale-line-qty" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      inputMode="decimal" suffix={it ? unitLabel(it.unit) : ''} inputClassName="num" error={tried || l.qty ? l.qtyErr || (over ? `Only ${formatQty(it.qtyH, it.unit)} in stock` : null) : null} disabled={!it} />
                    <TextField label={idx === 0 ? 'Unit price' : undefined} aria-label={`Unit price ${idx + 1}`} className="sale-line-price" value={shown} onChange={(e) => setLine(l.key, { price: e.target.value, auto: false })}
                      inputMode="decimal" prefix="₱" inputClassName="num" error={l.priceErr} disabled={!it}
                      help={it && l.priceC !== null && l.priceC !== undefined ? (planned && l.priceC < planned.unitCostC ? <span className="delta-out">Below cost ({formatMoney(planned.unitCostC)})</span>
                        : !l.auto && listC !== undefined && l.priceC !== listC ? <>{terms === TERMS.FULL ? 'Cash' : 'Credit'} price {formatMoney(listC)} · <button type="button" className="link-button" onClick={() => setLine(l.key, { auto: true, price: '' })}>use it</button></> : null) : null} />
                    <div className="sale-line-total">{idx === 0 && <div className="field-label">Amount</div>}<strong className="num">{it && l.qtyH && l.priceC !== null && l.priceC !== undefined ? formatMoney(Math.round(l.qtyH * l.priceC / 100)) : '—'}</strong></div>
                    <IconButton icon="trash" label={`Remove line ${idx + 1}`} size="sm" className="sale-line-remove" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} />
                  </div>
                  {it && bs.length > 0 && (
                    <div className="sale-line-batch">
                      {it.sku && <span className="sku" title="SKU">{it.sku}</span>}
                      <SelectField aria-label={`Batch ${idx + 1}`} value={l.batchId} onChange={(e) => setLine(l.key, { batchId: e.target.value })}
                        options={[{ value: '', label: 'Batch: automatic (oldest first)' }, ...bs.map((b) => ({ value: b.id, label: `${b.id} — ${formatQty(b.qtyH, it.unit)} at ${formatMoney(b.priceC)}` }))]} />
                      {planned && <span className="muted small">From {takenText(planned.batches, it.unit)}</span>}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
            <div className="panel-footer"><Button size="sm" icon="plus" onClick={() => setLines((ls) => [...ls, newLine()])}>Add line</Button></div>
          </Panel>

          <Panel title="Other charges" flush>
            <datalist id="charge-names">{chargeSuggestions.map((c) => <option key={c.name} value={c.name}>{formatMoney(c.amountC)}</option>)}</datalist>
            {charges.length > 0 && <div className="sale-lines">
              {charges.map((c, idx) => (
                <div key={c.key} className="sale-line charge-line">
                  <TextField label={idx === 0 ? 'Charge' : undefined} aria-label={`Charge ${idx + 1}`} className="sale-line-item" value={c.name} list="charge-names" maxLength={60}
                    placeholder="e.g. Delivery fee" onChange={(e) => chargeName(c.key, e.target.value)} />
                  <TextField label={idx === 0 ? 'Amount' : undefined} aria-label={`Charge amount ${idx + 1}`} className="sale-line-price" value={c.amount} onChange={(e) => setCharge(c.key, { amount: e.target.value })}
                    inputMode="decimal" prefix="₱" inputClassName="num" />
                  <IconButton icon="trash" label={`Remove charge ${idx + 1}`} size="sm" className="sale-line-remove" onClick={() => setCharges((cs) => cs.filter((x) => x.key !== c.key))} />
                </div>
              ))}
            </div>}
            <div className="panel-footer">
              <Button size="sm" icon="plus" onClick={() => setCharges((cs) => [...cs, newCharge()])} disabled={charges.length >= MAX_CHARGES}>Add charge</Button>
              {!charges.length && <span className="muted small">Delivery fee or other fees. Not discounted; part of the balance.</span>}
            </div>
          </Panel>

          <Panel title="Delivery and notes">
            <div className="form-grid">
              <SelectField label="Delivery status" value={fulfillment} onChange={(e) => setFulfillment(e.target.value)} options={Object.entries(FULFILLMENT_LABELS).map(([value, label]) => ({ value, label }))} />
              <TextField label={fulfillment === 'PENDING' ? 'Delivery date (planned)' : 'Delivery / pick-up date'} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              <TextAreaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="span-2" />
            </div>
          </Panel>
        </div>

        <aside className="sale-summary">
          <Panel title="Summary">
            <div className="summary-box">
              <div className="row"><span>Subtotal</span><strong>{formatMoney(result ? result.totals.subtotalC : 0)}</strong></div>
              {result && result.totals.discountC > 0 && <div className="row"><span>Discount</span><strong>−{formatMoney(result.totals.discountC)}</strong></div>}
              {result && result.totals.charges.map((c, i) => <div key={i} className="row"><span>{c.name}</span><strong>{formatMoney(c.amountC)}</strong></div>)}
              <div className="row total-row"><span>Total</span><strong>{formatMoney(result ? result.totals.totalC : 0)}</strong></div>
            </div>
            <Segmented label="Discount" value={discount.type} onChange={(type) => setDiscount({ type, value: '' })} options={[{ value: 'NONE', label: 'None' }, { value: 'PERCENT', label: '%' }, { value: 'FIXED', label: '₱' }]} />
            {discount.type !== 'NONE' && <TextField label={discount.type === 'PERCENT' ? 'Discount (%)' : 'Discount amount'} value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value })}
              inputMode="decimal" prefix={discount.type === 'FIXED' ? '₱' : undefined} suffix={discount.type === 'PERCENT' ? '%' : undefined} inputClassName="num" error={discountErr} />}

            <SelectField label="Payment terms" value={terms} onChange={(e) => setTerms(e.target.value)} options={termOptions.map((o) => ({ ...o, label: isWalkIn && o.value !== TERMS.FULL ? `${o.label} (registered customers)` : o.label }))} disabled={isWalkIn} />
            {terms === TERMS.OPEN_BALANCE && (
              <div className="form-grid">
                <TextField label="Amount paid now" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} inputMode="decimal" prefix="₱" inputClassName="num" error={paidErr} help="Leave empty if nothing is paid yet." />
                <TextField label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} help="Optional." />
              </div>
            )}
            {terms === TERMS.INSTALLMENT && (
              <>
                <Segmented label="Number of installments" value={String(plan.count)} onChange={(v) => setPlan({ ...plan, count: Number(v) })} options={ALLOWED_COUNTS.map((n) => ({ value: String(n), label: String(n) }))} />
                <SelectField label="Due dates" value={plan.frequency} onChange={(e) => setPlan({ ...plan, frequency: e.target.value })} options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))} />
                <TextField label="Down payment" value={plan.downPayment} onChange={(e) => setPlan({ ...plan, downPayment: e.target.value })} inputMode="decimal" prefix="₱" inputClassName="num" error={downErr} help="Optional. Paid today." />
              </>
            )}
            {(terms === TERMS.FULL || (terms === TERMS.OPEN_BALANCE && paidNowC > 0) || (terms === TERMS.INSTALLMENT && downC > 0)) && (
              <>
                <Segmented label="Paid by" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
                {method !== 'CASH' && <TextField label="Reference no." value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank or e-wallet reference" />}
              </>
            )}
            {result && result.receivables.length > 0 && terms === TERMS.INSTALLMENT && (
              <div className="schedule-preview">
                <div className="field-label">Schedule — dates can be changed</div>
                {result.receivables.map((r, i) => (
                  <div key={r.no} className="schedule-row">
                    <span>{r.no} of {result.receivables.length}</span>
                    <input className="input input-sm" type="date" aria-label={`Due date ${r.no}`} value={r.dueDate}
                      onChange={(e) => { const d = result.receivables.map((x) => x.dueDate); d[i] = e.target.value; setDueDates(d); }} />
                    <strong className="num">{formatMoney(r.amountC)}</strong>
                  </div>
                ))}
              </div>
            )}
            {result && (
              <div className="summary-box">
                <div className="row"><span>Paid now</span><strong>{formatMoney(result.paidNowC)}</strong></div>
                <div className="row"><span>Balance</span><strong>{formatMoney(result.balanceC)}</strong></div>
                {terms === TERMS.FULL && <div className="row muted"><span>Gross profit (items)</span><span>{formatMoney(result.totals.grossProfitC)}</span></div>}
              </div>
            )}
            {creditWarning && (
              <Banner tone="warning">
                This sale takes {customer.name} to {formatMoney(creditWarning.afterC)}, over the credit limit of {formatMoney(creditWarning.limitC)}.
                <label className="checkbox"><input type="checkbox" checked={creditOk} onChange={(e) => setCreditOk(e.target.checked)} />Proceed anyway (recorded in the activity log)</label>
              </Banner>
            )}
            {tried && formError && <Banner tone="danger">{formError}</Banner>}
            {!online && <Banner tone="warning">You are offline. Sales can be saved once the connection returns.</Banner>}
            <Button variant="primary" size="lg" icon="check" onClick={save} loading={busy} disabled={!online || busy || (tried && !canSave)} className="btn-block">Save sale</Button>
            {result && <p className="muted small">Saving records stock out for {filled.length} line(s){result.paidNowC ? `, a payment of ${formatMoney(result.paidNowC)}` : ''}{result.balanceC ? ` and a balance of ${formatMoney(result.balanceC)}${terms === TERMS.OPEN_BALANCE && dueDate ? ` due ${formatDate(dueDate)}` : ''}` : ''}.</p>}
          </Panel>
        </aside>
      </div>
      <CustomerFormDialog open={addingCustomer} onClose={() => setAddingCustomer(false)} adapter={adapter} customer={null} customers={customers || []} onSaved={(id) => setCustomerId(id)} />
    </div>
  );
}
