/*
 * Calendar (Phase 9, RQ-035): Month and Agenda views, category filters, custom events. Clicking an entry opens a
 * details modal (no navigation); it offers an optional "Open sale/restock" button. Entries are derived live from sales (sale dates, deliveries), open installments (due / overdue) and
 * restocks (expected and received); only custom events are stored. URL: #/calendar/{month|agenda}?m=YYYY-MM
 */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows, Badge } from '../../components/Feedback.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField, TextAreaField, Segmented } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { createEvent, updateEvent, deleteEvent } from '../../data/calendarService.js';
import { today, parseDate, toDateString, daysInMonth, formatDate, daysBetween } from '../../domain/dates.js';
import { formatMoney } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { remainingOf } from '../../domain/allocation.js';
import { TERMS_LABELS, METHOD_LABELS, FULFILLMENT_LABELS, PAYMENT_STATUS_LABELS } from '../../domain/sales.js';
import { RESTOCK_STATUS_LABELS } from '../../domain/purchasing.js';
import {
  CAL, CAL_LABELS, CAL_ORDER, monthGrid, gridRange, buildEvents, eventsByDate, monthTitle, monthKey, parseMonthKey, shiftMonth, validateEventForm, eventDateLabel,
} from '../../domain/calendar.js';

const TONE = { SALE: 'info', PAYMENT_DUE: 'warning', OVERDUE: 'danger', RESTOCK: 'success', DELIVERY: 'neutral', OTHER: 'neutral' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_ON = Object.fromEntries(Object.values(CAL).map((c) => [c, true]));
const FILTER_KEY = 'rj-calendar-filters';
const loadFilters = () => { try { return { ...ALL_ON, ...(JSON.parse(localStorage.getItem(FILTER_KEY) || 'null') || {}) }; } catch (e) { return { ...ALL_ON }; } };
const saveFilters = (f) => { try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch (e) { /* private mode */ } };

function EventDialog({ open, onClose, adapter, event, date }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const init = () => (event ? { title: event.title, date: event.date, time: event.time || '', note: event.note || '' } : { title: '', date: date || today(), time: '', note: '' });
  const [form, setForm] = React.useState(init);
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setForm(init()); setErrors({}); setError(null); } }, [open, event && event.id, date]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  async function run(fn, msg) { setBusy(true); setError(null); try { await fn(); toast({ message: msg }); onClose(); } catch (x) { setError(errorMessage(x)); } setBusy(false); }
  function submit(e) {
    e.preventDefault();
    const { data, errors: errs } = validateEventForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const actor = actorOf(auth.user);
    run(() => (event ? updateEvent(adapter, actor, event.id, data) : createEvent(adapter, actor, data)), event ? 'Event saved.' : 'Event added.');
  }
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={event ? 'Edit event' : 'Add event'}
      footer={<>
        {event && <Button variant="danger" icon="trash" onClick={() => run(() => deleteEvent(adapter, actorOf(auth.user), event.id), 'Event deleted.')} disabled={!online || busy} className="dialog-footer-start">Delete</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="event-form" loading={busy} disabled={!online}>{event ? 'Save' : 'Add event'}</Button>
      </>}>
      <form id="event-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <TextField label="Title" required value={form.title} onChange={set('title')} error={errors.title} data-autofocus placeholder="e.g. Pay store rent" />
        <div className="form-grid">
          <TextField label="Date" type="date" required value={form.date} onChange={set('date')} error={errors.date} />
          <TextField label="Time" type="time" value={form.time} onChange={set('time')} error={errors.time} help="Optional" />
        </div>
        <TextAreaField label="Note" value={form.note} onChange={set('note')} error={errors.note} rows={2} />
      </form>
    </Dialog>
  );
}

const lineList = (lines, key = 'qtyH') => (lines || []).map((l) => `${formatQty(l[key], l.unit)} ${l.itemName}`).join(', ');
const Item = ({ label, wide, children }) => (children === null || children === undefined || children === '' ? null
  : <div className={wide ? 'span-2' : undefined}><dt>{label}</dt><dd>{children}</dd></div>);

/** The important facts of one calendar entry, from its source record (attached by buildEvents). */
function EventDetails({ e, now }) {
  const s = e.sale, r = e.row, rs = e.restock;
  const late = (d) => { const n = daysBetween(d, now); return n > 0 ? ` · ${n} day${n === 1 ? '' : 's'} late` : ''; };
  let items;
  if (e.custom) {
    items = <>
      <Item label="Date">{formatDate(e.custom.date)}</Item>
      <Item label="Time">{e.custom.time || 'Any time'}</Item>
      <Item label="Note" wide>{e.custom.note}</Item>
    </>;
  } else if (r) {
    items = <>
      <Item label="Customer">{r.customerName}</Item>
      <Item label="Sale">{r.saleId}</Item>
      <Item label={r.kind === 'OPEN_BALANCE' ? 'Balance' : 'Installment'}>{r.kind === 'OPEN_BALANCE' ? 'Pay-later balance' : `${r.no} of ${r.count}`}</Item>
      <Item label="Due date">{formatDate(r.dueDate)}{e.category === CAL.OVERDUE ? late(r.dueDate) : ''}</Item>
      <Item label="Amount due">{formatMoney(r.amountC)}</Item>
      <Item label="Paid so far">{formatMoney(r.paidC || 0)}</Item>
      <Item label="Still to pay"><strong>{formatMoney(remainingOf(r))}</strong></Item>
    </>;
  } else if (s) {
    items = <>
      <Item label="Customer">{s.customerName}{s.customerContact ? ` · ${s.customerContact}` : ''}</Item>
      <Item label="Sale">{s.id}{s.saleDate ? ` · ${formatDate(s.saleDate)}` : ''}</Item>
      {e.category === CAL.DELIVERY && <Item label="Delivery">{FULFILLMENT_LABELS[s.fulfillment]}{s.deliveryDate ? ` · ${formatDate(s.deliveryDate)}` : ''}{e.late ? late(s.deliveryDate) : ''}</Item>}
      <Item label="Items" wide>{lineList(s.lines)}</Item>
      <Item label="Total">{formatMoney(s.totalC)}</Item>
      <Item label="Payment">{TERMS_LABELS[s.terms]}{s.terms !== 'INSTALLMENT' && METHOD_LABELS[s.paymentMethod] ? ` · ${METHOD_LABELS[s.paymentMethod]}` : ''}</Item>
      <Item label="Paid">{formatMoney(s.paidC || 0)}{PAYMENT_STATUS_LABELS[s.paymentStatus] ? ` · ${PAYMENT_STATUS_LABELS[s.paymentStatus]}` : ''}</Item>
      <Item label="Balance"><strong>{formatMoney(s.balanceC || 0)}</strong></Item>
      <Item label="Notes" wide>{s.notes}</Item>
    </>;
  } else if (rs) {
    const rc = e.receipt;
    items = <>
      <Item label="Supplier">{rs.supplierName}</Item>
      <Item label="Order">{rs.id} · {RESTOCK_STATUS_LABELS[rs.status] || rs.status}</Item>
      <Item label="Ordered on">{rs.orderDate ? formatDate(rs.orderDate) : null}</Item>
      {rc ? <Item label="Received on">{formatDate(rc.date)}</Item>
        : <Item label="Expected">{rs.expectedDate ? `${formatDate(rs.expectedDate)}${e.late ? late(rs.expectedDate) : ''}` : null}</Item>}
      <Item label={rc ? 'Received items' : 'Ordered items'} wide>{rc ? lineList(rc.lines) : lineList(rs.lines, 'qtyOrderedH')}</Item>
      {!rc && <Item label="Order total">{rs.totalCostC !== undefined ? formatMoney(rs.totalCostC) : null}</Item>}
      <Item label="Notes" wide>{rs.notes}</Item>
    </>;
  } else {
    items = <Item label="Details" wide>{e.detail}</Item>;
  }
  return (
    <div className="form-stack">
      <div><Badge tone={TONE[e.category]}>{CAL_LABELS[e.category]}{e.late ? ' · late' : ''}{e.done && e.category === CAL.DELIVERY ? ' · done' : ''}</Badge></div>
      <dl className="detail-list cal-detail">{items}</dl>
    </div>
  );
}

function EventChip({ e, onOpen }) {
  const label = `${CAL_LABELS[e.category]}: ${e.title}`;
  const cls = `cal-chip cal-${e.category.toLowerCase()} ${e.done ? 'is-done' : ''} ${e.late ? 'is-late' : ''}`;
  return <button type="button" className={cls} title={e.detail ? `${label} — ${e.detail}` : label} onClick={() => onOpen(e)}><span className="cal-chip-title">{e.time ? `${e.time} ` : ''}{e.title}</span></button>;
}

function EventRow({ e, onOpen }) {
  return (
    <div className="agenda-row">
      <Badge tone={TONE[e.category]}>{CAL_LABELS[e.category]}{e.late ? ' · late' : ''}</Badge>
      <div className="agenda-main">
        <button type="button" className="link-button" onClick={() => onOpen(e)}>{e.time ? `${e.time} · ` : ''}{e.title}</button>
        {e.detail && <span className="muted small">{e.detail}</span>}
      </div>
    </div>
  );
}

export function CalendarPage({ adapter, view: viewParam, monthParam }) {
  const now = today();
  const view = viewParam === 'agenda' ? 'agenda' : 'month';
  const ym = parseMonthKey(monthParam, now);
  const { from, to } = gridRange(ym.y, ym.m);
  const monthFrom = toDateString(ym.y, ym.m, 1), monthTo = toDateString(ym.y, ym.m, daysInMonth(ym.y, ym.m));
  const k = `${from}-${to}`;
  const range = (f) => ({ where: [[f, '>=', from], [f, '<=', to]] });
  const sales = useQuery(adapter, 'sales', range('saleDate'), `cal-sales-${k}`);
  const deliveries = useQuery(adapter, 'sales', range('deliveryDate'), `cal-del-${k}`);
  const rows = useQuery(adapter, 'installments', range('dueDate'), `cal-rows-${k}`);
  const restocks = useQuery(adapter, 'restocks', { orderBy: [['orderDate', 'desc']], limit: 500 }, 'cal-restocks');
  const custom = useQuery(adapter, 'calendarEvents', range('date'), `cal-custom-${k}`);
  const overdueRows = useQuery(adapter, 'installments', { where: [['status', 'in', ['PENDING', 'PARTIAL']]] }, 'collections-open');
  const [filters, setFilters] = React.useState(loadFilters);
  const [dialog, setDialog] = React.useState(null); // { event } | { date }
  const [dayOpen, setDayOpen] = React.useState(null);
  const [shown, setShown] = React.useState(null); // event in the details modal
  const online = useOnline();
  const loading = [sales, deliveries, rows, restocks, custom].some((q) => !q.rows);
  const error = [sales, deliveries, rows, restocks, custom].map((q) => q.error).find(Boolean);

  const saleMap = new Map([...(sales.rows || []), ...(deliveries.rows || [])].map((s) => [s.id, s]));
  const events = buildEvents({ sales: [...saleMap.values()], rows: rows.rows || [], restocks: restocks.rows || [], custom: custom.rows || [] }, now)
    .filter((e) => e.date >= from && e.date <= to);
  const byDate = eventsByDate(events, filters);
  const counts = Object.fromEntries(CAL_ORDER.map((c) => [c, events.filter((e) => e.category === c && e.date >= monthFrom && e.date <= monthTo).length]));
  const overdueCount = (overdueRows.rows || []).filter((r) => r.dueDate && r.dueDate < now).length;

  const go = (v, m) => navigate(`/calendar/${v}?m=${monthKey(m.y, m.m)}`, { replace: true });
  const toggle = (c) => { const f = { ...filters, [c]: !filters[c] }; setFilters(f); saveFilters(f); };
  const openEvent = (e) => setShown(e);
  const thisMonth = parseDate(now);

  const agendaDays = Object.keys(byDate).filter((d) => d >= monthFrom && d <= monthTo).sort();

  return (
    <div className="page stack">
      <PageHeader title="Calendar" description="Sales, payments due, deliveries, restocks and your own reminders. Click an entry to see its details."
        actions={<Button variant="primary" icon="addEvent" onClick={() => setDialog({ date: now >= monthFrom && now <= monthTo ? now : monthFrom })} disabled={!online}>Add event</Button>} />
      {error && <Banner tone="danger">{errorMessage(error)}</Banner>}
      {overdueCount > 0 && <Banner tone="warning" action={<Link to="/collections/overdue">Open collections</Link>}>{overdueCount} installment(s) or balance(s) are overdue.</Banner>}
      <Panel flush>
        <div className="toolbar cal-toolbar">
          <div className="button-row">
            <IconButton icon="prev" label="Previous month" onClick={() => go(view, shiftMonth(ym, -1))} />
            <h2 className="cal-title" aria-live="polite">{monthTitle(ym.y, ym.m)}</h2>
            <IconButton icon="next" label="Next month" onClick={() => go(view, shiftMonth(ym, 1))} />
            <Button size="sm" onClick={() => go(view, thisMonth)} disabled={ym.y === thisMonth.y && ym.m === thisMonth.m}>Today</Button>
          </div>
          <Segmented label="View" value={view} onChange={(v) => go(v, ym)} options={[{ value: 'month', label: 'Month', icon: 'month' }, { value: 'agenda', label: 'Agenda', icon: 'agenda' }]} />
        </div>
        <div className="cal-filters" role="group" aria-label="Show on calendar">
          {CAL_ORDER.map((c) => (
            <label key={c} className={`cal-filter cal-${c.toLowerCase()} ${filters[c] ? 'is-on' : ''}`}>
              <input type="checkbox" checked={!!filters[c]} onChange={() => toggle(c)} />
              <span className="cal-dot" aria-hidden="true" />{CAL_LABELS[c]} <span className="muted">({counts[c]})</span>
            </label>
          ))}
        </div>
        {loading ? <LoadingRows label="Loading calendar" /> : view === 'month' ? (
          <div className="cal-month" role="grid" aria-label={monthTitle(ym.y, ym.m)}>
            <div className="cal-row cal-head" role="row">{WEEKDAYS.map((d) => <div key={d} role="columnheader" className="cal-weekday">{d}</div>)}</div>
            {monthGrid(ym.y, ym.m).map((week) => (
              <div className="cal-row" role="row" key={week[0]}>
                {week.map((d) => {
                  const list = byDate[d] || [];
                  const out = d < monthFrom || d > monthTo;
                  return (
                    <div key={d} role="gridcell" className={`cal-cell ${out ? 'is-outside' : ''} ${d === now ? 'is-today' : ''}`} data-date={d}>
                      <button type="button" className="cal-daynum" onClick={() => setDayOpen(d)} aria-label={`${formatDate(d)}: ${list.length} entr${list.length === 1 ? 'y' : 'ies'}`}>{parseDate(d).d}</button>
                      <div className="cal-chips">
                        {list.slice(0, 3).map((e) => <EventChip key={e.id} e={e} onOpen={openEvent} />)}
                        {list.length > 3 && <button type="button" className="cal-more" onClick={() => setDayOpen(d)}>+{list.length - 3} more</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="agenda">
            {agendaDays.length === 0 ? <EmptyState icon="calendar" title="Nothing this month">Change the filters or go to another month.</EmptyState>
              : agendaDays.map((d) => (
                <section key={d} className={`agenda-day ${d === now ? 'is-today' : ''}`}>
                  <h3 className="agenda-date">{eventDateLabel(d, now)}</h3>
                  {byDate[d].map((e) => <EventRow key={e.id} e={e} onOpen={openEvent} />)}
                </section>
              ))}
          </div>
        )}
      </Panel>
      <Dialog open={!!dayOpen} onClose={() => setDayOpen(null)} size="sm" title={dayOpen ? formatDate(dayOpen) : ''}
        footer={<><Button icon="addEvent" onClick={() => { const d = dayOpen; setDayOpen(null); setDialog({ date: d }); }} disabled={!online}>Add event on this day</Button><Button variant="primary" onClick={() => setDayOpen(null)}>Close</Button></>}>
        {dayOpen && ((byDate[dayOpen] || []).length ? <div className="agenda">{byDate[dayOpen].map((e) => <EventRow key={e.id} e={e} onOpen={(x) => { setDayOpen(null); openEvent(x); }} />)}</div>
          : <p className="muted">Nothing on this day{Object.values(filters).some((v) => !v) ? ' (some categories are hidden)' : ''}.</p>)}
      </Dialog>
      <Dialog open={!!shown} onClose={() => setShown(null)} size="md" title={shown ? shown.title : ''}
        footer={shown && <>
          {shown.custom ? <Button icon="edit" onClick={() => { const c = shown.custom; setShown(null); setDialog({ event: c }); }} disabled={!online}>Edit</Button>
            : shown.to && <Button onClick={() => { const to = shown.to; setShown(null); navigate(to); }}>{shown.restock ? 'Open restock' : 'Open sale'}</Button>}
          <Button variant="primary" onClick={() => setShown(null)}>Close</Button>
        </>}>
        {shown && <EventDetails e={shown} now={now} />}
      </Dialog>
      <EventDialog open={!!dialog} onClose={() => setDialog(null)} adapter={adapter} event={dialog && dialog.event} date={dialog && dialog.date} />
    </div>
  );
}
