/* Customer detail (Phases 5–7): balance + reliability header; tabs Summary, Sales, Payments, Schedule, Contacts, Statement. */
import { PageHeader, Panel, Banner, EmptyState, LoadingRows, Badge, Tabs } from '../../components/Feedback.jsx';
import { Button, IconButton } from '../../components/Button.jsx';
import { Icon } from '../../components/Icon.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Link, navigate } from '../../app/router.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDoc, useQuery, actorOf, errorMessage } from '../../data/useData.js';
import { setCustomerStatus, removeContact } from '../../data/customerService.js';
import { formatMoney } from '../../domain/money.js';
import { formatDate, today } from '../../domain/dates.js';
import { sortContacts, customerReliability } from '../../domain/customers.js';
import { buildStatement } from '../../domain/collections.js';
import { CustomerFormDialog, ContactDialog } from './CustomerDialogs.jsx';
import { ConfirmDialog } from '../inventory/InventoryDialogs.jsx';
import { ReliabilityBadge, SalesTable, PaymentsTable, ScheduleTable, byDateDesc } from '../sales/SaleTables.jsx';
import { RecordPaymentDialog, VoidPaymentDialog } from '../sales/PaymentDialogs.jsx';
import { usePrint, useBusiness, PaymentReceipt, StatementDoc } from '../sales/Print.jsx';
import { useCustomers } from './CustomersPage.jsx';

const TABS = [
  { value: 'summary', label: 'Summary' }, { value: 'sales', label: 'Sales' }, { value: 'payments', label: 'Payments' },
  { value: 'schedule', label: 'Schedule' }, { value: 'contacts', label: 'Contacts' }, { value: 'statement', label: 'Statement' },
];

export function ContactCard({ c, onEdit, onRemove }) {
  return (
    <div className="contact-card">
      <div className="contact-head">
        <strong>{c.name}</strong>{c.relationship && <span className="muted">· {c.relationship}</span>}{c.isPrimary && <Badge tone="info">Primary</Badge>}
        {onEdit && <span className="row-actions"><IconButton icon="edit" size="sm" label={`Edit ${c.name}`} onClick={onEdit} /><IconButton icon="trash" size="sm" label={`Remove ${c.name}`} onClick={onRemove} /></span>}
      </div>
      <div className="contact-lines">
        {c.contactNumber && <span><Icon name="phone" size={14} />{c.contactNumber}</span>}
        {c.email && <span>{c.email}</span>}
        {c.facebook && <span>Facebook: {c.facebook}</span>}
        {c.address && <span>{c.address}</span>}
        {c.notes && <span className="muted">{c.notes}</span>}
      </div>
    </div>
  );
}

export function CustomerDetailPage({ adapter, id, tab = 'summary' }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const business = useBusiness(adapter);
  const [printNode, print] = usePrint();
  const { doc: c, error } = useDoc(adapter, 'customers', id);
  const { customers } = useCustomers(adapter);
  const sales = useQuery(adapter, 'sales', { where: [['customerId', '==', id]] }, `cust-sales-${id}`);
  const payments = useQuery(adapter, 'payments', { where: [['customerId', '==', id]] }, `cust-pay-${id}`);
  const rows = useQuery(adapter, 'installments', { where: [['customerId', '==', id]] }, `cust-rows-${id}`);
  const [dialog, setDialog] = React.useState(null); // { kind, contact?, payment?, saleId? }
  const current = TABS.some((t) => t.value === tab) ? tab : 'summary';
  const now = today();

  if (error) return <div className="page"><Banner tone="danger">{errorMessage(error)}</Banner></div>;
  if (c === undefined) return <div className="page"><LoadingRows label="Loading customer" /></div>;
  if (c === null) return <div className="page"><PageHeader title="Customer not found" /><Panel><EmptyState icon="warning" title="This customer does not exist"><Link to="/customers">Back to customers</Link></EmptyState></Panel></div>;

  const active = c.status === 'ACTIVE';
  const sortedSales = (sales.rows || []).slice().sort(byDateDesc('saleDate'));
  const sortedPayments = (payments.rows || []).slice().sort(byDateDesc('date'));
  const openRows = (rows.rows || []).filter((r) => r.status !== 'CANCELLED').sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
  const statement = buildStatement(sales.rows || [], payments.rows || []);
  const rel = customerReliability(c);
  const contacts = sortContacts(c.alternateContacts);
  const openSales = sortedSales.filter((s) => s.status === 'ACTIVE' && s.balanceC > 0);
  const loading = !sales.rows || !payments.rows || !rows.rows;
  const go = (t) => navigate(`/customers/${id}${t === 'summary' ? '' : '/' + t}`, { replace: true });

  return (
    <div className="page stack">
      <div>
        <Link to="/customers" className="back-link"><Icon name="back" size={16} />Customers</Link>
        <PageHeader
          title={<span className="page-title-row">{c.name} <ReliabilityBadge customer={c} />{!active && <Badge>Archived</Badge>}</span>}
          description={c.system ? 'Built-in customer for fully paid counter sales.' : [c.type, c.contactNumber, c.address].filter(Boolean).join(' · ')}
          actions={<div className="button-row">
            {active && <Button variant="primary" icon="newSale" onClick={() => navigate(`/sales/new?customer=${id}`)}>New sale</Button>}
            {!c.system && <Button icon="edit" onClick={() => setDialog({ kind: 'edit' })} disabled={!online}>Edit</Button>}
            {!c.system && <Button icon={active ? 'archive' : 'restore'} onClick={() => setDialog({ kind: 'archive' })} disabled={!online}>{active ? 'Archive' : 'Restore'}</Button>}
          </div>} />
      </div>
      {!active && <Banner tone="info">This customer is archived. Restore them to make new sales. History is kept.</Banner>}
      <div className="stat-strip">
        <div className="stat"><div className="stat-label">Outstanding balance</div><div className={`stat-value ${c.outstandingC ? 'is-warning' : ''}`}>{formatMoney(c.outstandingC || 0)}</div></div>
        <div className="stat"><div className="stat-label">Credit limit</div><div className="stat-value">{c.creditLimitC == null ? 'None' : formatMoney(c.creditLimitC)}</div>
          {c.creditLimitC != null && <div className={`stat-sub ${c.outstandingC > c.creditLimitC ? 'delta-out' : ''}`}>{c.outstandingC > c.creditLimitC ? `Over by ${formatMoney(c.outstandingC - c.creditLimitC)}` : `${formatMoney(c.creditLimitC - (c.outstandingC || 0))} available`}</div>}</div>
        <div className="stat"><div className="stat-label">Total purchases</div><div className="stat-value">{formatMoney(c.totalPurchasesC || 0)}</div></div>
        <div className="stat"><div className="stat-label">Paid on time</div><div className="stat-value">{rel.ratio === null ? '—' : `${Math.round(rel.ratio * 100)}%`}</div>
          <div className="stat-sub">{c.paidInstallments || 0} installment(s) fully paid</div></div>
      </div>

      <Panel flush>
        <Tabs label="Customer sections" tabs={TABS} value={current} onChange={go} />
        {current === 'summary' && (
          <div className="panel-body">
            <dl className="detail-list">
              <div><dt>Type</dt><dd>{c.type}</dd></div>
              <div><dt>Contact number</dt><dd>{c.contactNumber || '—'}</dd></div>
              <div><dt>Email</dt><dd>{c.email || '—'}</dd></div>
              <div><dt>Facebook</dt><dd>{c.facebook || '—'}</dd></div>
              <div className="span-2"><dt>Address</dt><dd>{c.address || '—'}</dd></div>
              <div><dt>Last sale</dt><dd>{c.lastSaleDate ? formatDate(c.lastSaleDate) : '—'}</dd></div>
              <div><dt>Primary alternate contact</dt><dd>{contacts[0] ? `${contacts[0].name}${contacts[0].contactNumber ? ' · ' + contacts[0].contactNumber : ''}` : '—'}</dd></div>
              {c.notes && <div className="span-2"><dt>Notes</dt><dd>{c.notes}</dd></div>}
            </dl>
            {openSales.length > 0 && (
              <>
                <h3 className="section-title">Unpaid sales</h3>
                <div className="list-rows">
                  {openSales.map((s) => (
                    <div key={s.id} className="list-row">
                      <span><Link to={`/sales/${s.id}`}>{s.id}</Link> <span className="muted">· {formatDate(s.saleDate)}</span></span>
                      <strong className="num">{formatMoney(s.balanceC)}</strong>
                      <Button size="sm" icon="payment" onClick={() => setDialog({ kind: 'pay', saleId: s.id })} disabled={!online}>Record payment</Button>
                    </div>))}
                </div>
              </>
            )}
          </div>
        )}
        {current === 'sales' && (loading ? <LoadingRows /> : <SalesTable rows={sortedSales} showCustomer={false} empty={<EmptyState icon="sales" title="No sales yet" />} />)}
        {current === 'payments' && (loading ? <LoadingRows /> : <PaymentsTable rows={sortedPayments}
          onAction={(kind, p) => (kind === 'print' ? print(<PaymentReceipt payment={p} sale={(sales.rows || []).find((s) => s.id === p.saleId)} business={business} />) : setDialog({ kind: 'void', payment: p }))}
          empty={<EmptyState icon="payment" title="No payments yet" />} />)}
        {current === 'schedule' && (loading ? <LoadingRows /> : <ScheduleTable rows={openRows} today={now} showSale
          empty={<EmptyState icon="reschedule" title="Nothing scheduled">Installments and open balances of this customer appear here.</EmptyState>} />)}
        {current === 'contacts' && (
          <div className="panel-body">
            {!c.system && <div><Button icon="plus" onClick={() => setDialog({ kind: 'contact' })} disabled={!online || !active}>Add contact</Button></div>}
            {!contacts.length ? <EmptyState icon="contact" title="No alternate contacts">Relatives or neighbors who can be reached about this account.</EmptyState>
              : <div className="contact-grid">{contacts.map((ct) => <ContactCard key={ct.id} c={ct}
                  onEdit={online && !c.system ? () => setDialog({ kind: 'contact', contact: ct }) : null}
                  onRemove={() => setDialog({ kind: 'removeContact', contact: ct })} />)}</div>}
          </div>
        )}
        {current === 'statement' && (
          <div className="panel-body">
            <div className="button-row"><Button icon="print" onClick={() => print(<StatementDoc customer={c} statement={statement} business={business} />)} disabled={loading}>Print statement</Button>
              <span className="muted">Cancelled sales and voided payments are left out.</span></div>
            {loading ? <LoadingRows /> : <StatementDoc customer={c} statement={statement} business={business} />}
          </div>
        )}
      </Panel>

      <CustomerFormDialog open={dialog && dialog.kind === 'edit'} onClose={() => setDialog(null)} adapter={adapter} customer={c} customers={customers || []} />
      {!c.system && <ContactDialog open={!!dialog && dialog.kind === 'contact'} onClose={() => setDialog(null)} adapter={adapter} customer={c} contact={dialog && dialog.contact} />}
      <RecordPaymentDialog open={!!dialog && dialog.kind === 'pay'} onClose={() => setDialog(null)} adapter={adapter} saleId={dialog && dialog.saleId} />
      <VoidPaymentDialog open={!!dialog && dialog.kind === 'void'} onClose={() => setDialog(null)} adapter={adapter} payment={dialog && dialog.payment} />
      <ConfirmDialog open={!!dialog && dialog.kind === 'removeContact'} onClose={() => setDialog(null)} title="Remove contact?" confirmLabel="Remove contact" tone="danger"
        onConfirm={async () => { await removeContact(adapter, actorOf(auth.user), id, dialog.contact.id); toast({ message: 'Contact removed.' }); }}>
        <p>{dialog && dialog.contact && dialog.contact.name} will no longer be listed for {c.name}.</p>
      </ConfirmDialog>
      <ConfirmDialog open={!!dialog && dialog.kind === 'archive'} onClose={() => setDialog(null)} title={active ? `Archive ${c.name}?` : `Restore ${c.name}?`} confirmLabel={active ? 'Archive customer' : 'Restore customer'}
        onConfirm={async () => { await setCustomerStatus(adapter, actorOf(auth.user), id, active ? 'ARCHIVED' : 'ACTIVE'); toast({ message: active ? 'Customer archived.' : 'Customer restored.' }); }}>
        {active ? <p>Archived customers are hidden from new sales. Their history is kept and they can be restored later.{c.outstandingC > 0 && <> They still owe <strong>{formatMoney(c.outstandingC)}</strong>, so archiving is not possible yet.</>}</p>
          : <p>The customer becomes available for new sales again.</p>}
      </ConfirmDialog>
      {printNode}
    </div>
  );
}
