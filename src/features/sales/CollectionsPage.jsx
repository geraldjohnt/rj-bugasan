/*
 * Collections (Phase 7, RQ-034, UI_UX_GUIDELINES §6): open receivable rows grouped as Overdue / Due today /
 * Next 7 days / Later / No due date. Each row shows the customer's contact and alternate contacts, a one-click
 * reminder message (template in Settings → Sales) and "Record payment". Overdue is derived (BR-044).
 * Phase 15 (D-069): a "Promised" tab lists open and missed promised dates; each row shows its promises.
 */
import { PageHeader, Panel, EmptyState, Banner, LoadingRows, Tabs, DataTable } from '../../components/Feedback.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { TextField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useQuery, errorMessage } from '../../data/useData.js';
import { formatMoney } from '../../domain/money.js';
import { formatDate, today } from '../../domain/dates.js';
import { BUCKETS, BUCKET_LABELS, groupCollections, reminderText } from '../../domain/collections.js';
import { sortContacts, matchesCustomer } from '../../domain/customers.js';
import { RowStatusBadge, PromiseLines } from './SaleTables.jsx';
import { currentPromises } from '../../domain/promises.js';
import { remainingOf } from '../../domain/allocation.js';
import { RecordPaymentDialog } from './PaymentDialogs.jsx';
import { useBusiness } from './Print.jsx';

const ORDER = [BUCKETS.OVERDUE, BUCKETS.TODAY, BUCKETS.WEEK, BUCKETS.UPCOMING, BUCKETS.NO_DATE];
const PROMISED = 'PROMISED';
const SLUG = { OVERDUE: 'overdue', TODAY: 'today', WEEK: 'week', UPCOMING: 'later', NO_DATE: 'no-date', PROMISED: 'promised' };
const FROM_SLUG = Object.fromEntries(Object.entries(SLUG).map(([k, v]) => [v, k]));

/** Copy text to the clipboard; falls back to a hidden textarea where the Clipboard API is unavailable. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

export function CollectionsPage({ adapter, tab }) {
  const toast = useToast();
  const online = useOnline();
  const business = useBusiness(adapter);
  const { rows, error } = useQuery(adapter, 'installments', { where: [['status', 'in', ['PENDING', 'PARTIAL']]] }, 'collections-open');
  const { rows: customers } = useQuery(adapter, 'customers', { orderBy: [['nameLower', 'asc']] }, 'collections-customers');
  const [search, setSearch] = React.useState('');
  const [paying, setPaying] = React.useState(null);
  const now = today();

  const byId = new Map((customers || []).map((c) => [c.id, c]));
  const filtered = (rows || []).filter((r) => {
    if (!search.trim()) return true;
    const c = byId.get(r.customerId);
    return r.saleId.toLowerCase().includes(search.trim().toLowerCase()) || (c ? matchesCustomer(c, search) : r.customerName.toLowerCase().includes(search.trim().toLowerCase()));
  });
  const groups = groupCollections(filtered, now);
  const promised = currentPromises(filtered, now).map(({ row, promise }) => ({ ...row, remainingC: remainingOf(row), promise }));
  groups[PROMISED] = { rows: promised, totalC: promised.reduce((t, r) => t + r.promise.amountC, 0) };
  const labels = { ...BUCKET_LABELS, [PROMISED]: 'Promised' };
  const firstNonEmpty = ORDER.find((b) => groups[b].rows.length) || BUCKETS.OVERDUE;
  const current = FROM_SLUG[tab] || (tab ? BUCKETS.OVERDUE : firstNonEmpty);
  const tabs = [...ORDER, PROMISED].map((b) => ({ value: b, label: `${labels[b]} (${groups[b].rows.length})` }));

  async function copyReminder(r) {
    const text = reminderText(business.sales.reminderTemplate, {
      customer: r.customerName, business: business.general.businessName, amountC: r.remainingC, saleNo: r.saleId,
      installment: r.kind === 'OPEN_BALANCE' ? 'balance' : r.no, count: r.kind === 'OPEN_BALANCE' ? null : r.count, dueDate: r.dueDate,
    });
    const ok = await copyText(text);
    toast(ok ? { message: 'Reminder copied. Paste it into SMS or Messenger.' } : { message: 'Could not copy automatically: ' + text, tone: 'danger' });
  }

  const columns = [
    { key: 'customer', header: 'Customer', className: 'key-col wrap', render: (r) => <Link to={`/customers/${r.customerId}`}>{r.customerName}</Link> },
    { key: 'sale', header: 'Sale', render: (r) => <><Link to={`/sales/${r.saleId}`}>{r.saleId}</Link><span className="cell-sub">{r.kind === 'OPEN_BALANCE' ? 'Balance' : `Installment ${r.no} of ${r.count}`}</span></> },
    ...(current === PROMISED ? [{ key: 'promised', header: 'Promised', render: (r) => <>{formatDate(r.promise.date)}<span className={`promise-line is-${r.promise.status.toLowerCase()}`}>{r.promise.status === 'MISSED' ? 'Missed' : `Promised on ${formatDate(r.promise.madeOn)}`}</span></> }] : []),
    { key: 'due', header: 'Due', render: (r) => <>{r.dueDate ? formatDate(r.dueDate) : <span className="muted">No due date</span>}<span className="cell-sub"><RowStatusBadge row={r} today={now} /></span>{current !== PROMISED && <PromiseLines row={r} today={now} />}</> },
    { key: 'remaining', header: 'To collect', align: 'right', render: (r) => <><strong>{formatMoney(current === PROMISED ? r.promise.amountC : r.remainingC)}</strong>{r.paidC > 0 && <span className="cell-sub">of {formatMoney(r.amountC)}</span>}</> },
    { key: 'contact', header: 'Contact', className: 'wrap', render: (r) => {
      const c = byId.get(r.customerId);
      const alts = c ? sortContacts(c.alternateContacts).slice(0, 2) : [];
      return (
        <div className="collect-row-contact">
          <span>{(c && c.contactNumber) || '—'}</span>
          {alts.map((a) => <span key={a.id} className="muted">{a.name}{a.relationship ? ` (${a.relationship})` : ''}{a.contactNumber ? ` · ${a.contactNumber}` : ''}</span>)}
        </div>
      );
    } },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <span className="row-actions">
        <IconButton size="sm" icon="copy" label={`Copy reminder for ${r.customerName}`} onClick={() => copyReminder(r)} />
        <Button size="sm" icon="payment" onClick={() => setPaying(r.saleId)} disabled={!online}>Record payment</Button>
      </span>) },
  ];
  const g = groups[current];

  return (
    <div className="page stack">
      <PageHeader title="Collections" description="Installments and balances to collect. Overdue amounts come first." />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Overdue</div><div className={`stat-value ${groups.OVERDUE.totalC ? 'is-danger' : ''}`}>{rows ? formatMoney(groups.OVERDUE.totalC) : '—'}</div><div className="stat-sub">{groups.OVERDUE.rows.length} installment(s)</div></div>
        <div className="stat"><div className="stat-label">Due today</div><div className="stat-value">{rows ? formatMoney(groups.TODAY.totalC) : '—'}</div><div className="stat-sub">{groups.TODAY.rows.length} installment(s)</div></div>
        <div className="stat"><div className="stat-label">Next 7 days</div><div className="stat-value">{rows ? formatMoney(groups.WEEK.totalC) : '—'}</div><div className="stat-sub">{groups.WEEK.rows.length} installment(s)</div></div>
        <div className="stat"><div className="stat-label">All receivables</div><div className="stat-value">{rows ? formatMoney(ORDER.reduce((s, b) => s + groups[b].totalC, 0)) : '—'}</div></div>
      </div>
      <Panel flush>
        <Tabs label="Collections" tabs={tabs} value={current} onChange={(b) => navigate(`/collections/${SLUG[b]}`, { replace: true })} />
        <div className="toolbar">
          <TextField label="Search" className="toolbar-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, phone or sale no." />
          <span className="toolbar-end">{rows ? `${g.rows.length} shown · ${formatMoney(g.totalC)}` : ''}</span>
        </div>
        {!rows ? <LoadingRows label="Loading collections" /> : (
          <DataTable caption={labels[current]} columns={columns} rows={g.rows}
            empty={<EmptyState icon="collections" title={current === PROMISED ? 'No promised dates' : `Nothing ${labels[current].toLowerCase()}`}>
              {rows.length ? 'Check the other tabs.' : 'Installment and unpaid sales appear here.'}</EmptyState>} />
        )}
      </Panel>
      <RecordPaymentDialog open={!!paying} onClose={() => setPaying(null)} adapter={adapter} saleId={paying} />
    </div>
  );
}
