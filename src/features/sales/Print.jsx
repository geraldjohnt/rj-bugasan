/*
 * Printable documents (RQ-023, BR-054): sale receipt, payment receipt, customer statement. Printed with the browser's
 * print dialog (Save as PDF works too). Only the .print-root content is printed; the app is hidden by @media print.
 */
import { formatMoney } from '../../domain/money.js';
import { formatQty } from '../../domain/quantity.js';
import { formatDate, today } from '../../domain/dates.js';
import { METHOD_LABELS, TERMS_LABELS } from '../../domain/sales.js';
import { FREQUENCY_LABELS as FREQ } from '../../domain/schedule.js';
import { loadGeneralSettings, loadSalesSettings, DEFAULT_GENERAL, DEFAULT_SALES_SETTINGS } from '../../data/settingsRepo.js';
import { remainingOf } from '../../domain/allocation.js';

/** Business + sales settings for headers and footers. */
export function useBusiness(adapter) {
  const [b, setB] = React.useState({ general: DEFAULT_GENERAL, sales: DEFAULT_SALES_SETTINGS });
  React.useEffect(() => {
    let live = true;
    Promise.all([loadGeneralSettings(adapter), loadSalesSettings(adapter)]).then(([general, sales]) => live && setB({ general, sales }));
    return () => { live = false; };
  }, [adapter]);
  return b;
}

/** const [printNode, print] = usePrint(); print(<SaleReceipt …/>); render {printNode} somewhere in the page. */
export function usePrint() {
  const [content, setContent] = React.useState(null);
  React.useEffect(() => {
    if (!content) return undefined;
    const done = () => setContent(null);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => { window.print(); }, 50);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [content]);
  const node = content ? ReactDOM.createPortal(<div className="print-root">{content}</div>, document.body) : null;
  return [node, setContent];
}

function Header({ general, title, number, date }) {
  return (
    <header className="doc-header">
      <div className="doc-brand">
        <img className="doc-logo" src="assets/brand/logo.png" alt="" width="72" height="72" />
        <div>
        <div className="doc-business">{general.businessName}</div>
        {general.address && <div>{general.address}</div>}
        {(general.contactNumber || general.email) && <div>{[general.contactNumber, general.email].filter(Boolean).join(' · ')}</div>}
        </div>
      </div>
      <div className="doc-title-block">
        <div className="doc-title">{title}</div>
        {number && <div className="doc-number">{number}</div>}
        {date && <div>{formatDate(date)}</div>}
      </div>
    </header>
  );
}

export function SaleReceipt({ sale, rows = [], payments = [], business, skus = {} }) {
  const { general, sales } = business;
  const active = payments.filter((p) => p.status === 'ACTIVE');
  return (
    <article className="doc">
      <Header general={general} title={sale.status === 'CANCELLED' ? 'Sales receipt — CANCELLED' : 'Sales receipt'} number={sale.id} date={sale.saleDate} />
      <div className="doc-meta">
        <div><span>Customer</span>{sale.customerName}{sale.customerContact && ` · ${sale.customerContact}`}</div>
        <div><span>Terms</span>{TERMS_LABELS[sale.terms]}{sale.plan && ` · ${sale.plan.count} installments, ${FREQ[sale.plan.frequency]}`}</div>
      </div>
      <table className="doc-table">
        <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
        <tbody>{sale.lines.map((l, i) => <tr key={i}><td>{l.itemName}{(l.sku || skus[l.itemId]) && <span className="doc-sku"> · {l.sku || skus[l.itemId]}</span>}</td><td className="num">{formatQty(l.qtyH, l.unit)}</td><td className="num">{formatMoney(l.unitPriceC)}</td><td className="num">{formatMoney(l.lineTotalC)}</td></tr>)}</tbody>
        <tfoot>
          <tr><td colSpan="3">Subtotal</td><td className="num">{formatMoney(sale.subtotalC)}</td></tr>
          {sale.discountC > 0 && <tr><td colSpan="3">Discount{sale.discountType === 'PERCENT' ? ` (${sale.discountValue / 100}%)` : ''}</td><td className="num">−{formatMoney(sale.discountC)}</td></tr>}
          {(sale.charges || []).map((c, i) => <tr key={`c${i}`}><td colSpan="3">{c.name}</td><td className="num">{formatMoney(c.amountC)}</td></tr>)}
          <tr className="doc-total"><td colSpan="3">Total</td><td className="num">{formatMoney(sale.totalC)}</td></tr>
          {active.map((p) => <tr key={p.id}><td colSpan="3">{p.isDownPayment ? 'Down payment' : 'Paid'} {formatDate(p.date)} · {METHOD_LABELS[p.method]} · {p.id}</td><td className="num">−{formatMoney(p.amountC)}</td></tr>)}
          {sale.status === 'ACTIVE' && <tr className="doc-total"><td colSpan="3">Balance</td><td className="num">{formatMoney(sale.balanceC)}</td></tr>}
        </tfoot>
      </table>
      {sale.status === 'ACTIVE' && rows.filter((r) => r.status !== 'CANCELLED').length > 0 && (
        <>
          <h3 className="doc-subtitle">Payment schedule</h3>
          <table className="doc-table">
            <thead><tr><th>#</th><th>Due date</th><th className="num">Amount</th><th className="num">Remaining</th></tr></thead>
            <tbody>{rows.filter((r) => r.status !== 'CANCELLED').map((r) => <tr key={r.id}><td>{r.kind === 'OPEN_BALANCE' ? 'Balance' : `${r.no} of ${r.count}`}</td><td>{r.dueDate ? formatDate(r.dueDate) : '—'}</td><td className="num">{formatMoney(r.amountC)}</td><td className="num">{formatMoney(remainingOf(r))}</td></tr>)}</tbody>
          </table>
        </>
      )}
      {sale.status === 'CANCELLED' && <p className="doc-note">Cancelled: {sale.cancel && sale.cancel.reason}</p>}
      <footer className="doc-footer">{sales.receiptFooter}</footer>
    </article>
  );
}

export function PaymentReceipt({ payment, sale, business }) {
  const { general, sales } = business;
  return (
    <article className="doc">
      <Header general={general} title={payment.status === 'VOIDED' ? 'Payment receipt — VOIDED' : 'Payment receipt'} number={payment.id} date={payment.date} />
      <div className="doc-meta">
        <div><span>Received from</span>{payment.customerName}</div>
        <div><span>For sale</span>{payment.saleId}{sale && ` of ${formatDate(sale.saleDate)} (total ${formatMoney(sale.totalC)})`}</div>
        <div><span>Method</span>{METHOD_LABELS[payment.method]}{payment.reference && ` · Ref. ${payment.reference}`}</div>
      </div>
      <table className="doc-table">
        <tbody>
          <tr className="doc-total"><td>Amount received</td><td className="num">{formatMoney(payment.amountC)}</td></tr>
          {sale && sale.status === 'ACTIVE' && <tr><td>Remaining balance of {sale.id} (as of printing)</td><td className="num">{formatMoney(sale.balanceC)}</td></tr>}
        </tbody>
      </table>
      {payment.note && <p className="doc-note">{payment.note}</p>}
      <footer className="doc-footer">{sales.receiptFooter}</footer>
    </article>
  );
}

/** promises (D-069): currentPromises() of the customer's open rows. */
export function StatementDoc({ customer, statement, business, promises = [] }) {
  return (
    <article className="doc">
      <Header general={business.general} title="Statement of account" date={today()} />
      <div className="doc-meta">
        <div><span>Customer</span>{customer.name}{customer.contactNumber && ` · ${customer.contactNumber}`}</div>
        {customer.address && <div><span>Address</span>{customer.address}</div>}
      </div>
      <table className="doc-table">
        <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="num">Charges</th><th className="num">Payments</th><th className="num">Balance</th></tr></thead>
        <tbody>{statement.entries.map((e) => (
          <tr key={e.kind + e.ref}><td>{formatDate(e.date)}</td><td>{e.ref}</td><td>{e.description}{e.saleId ? ` (${e.saleId})` : ''}</td>
            <td className="num">{e.chargeC ? formatMoney(e.chargeC) : ''}</td><td className="num">{e.creditC ? formatMoney(e.creditC) : ''}</td><td className="num">{formatMoney(e.balanceC)}</td></tr>))}</tbody>
        <tfoot><tr className="doc-total"><td colSpan="3">Balance due</td><td className="num">{formatMoney(statement.totalChargesC)}</td><td className="num">{formatMoney(statement.totalCreditsC)}</td><td className="num">{formatMoney(statement.balanceC)}</td></tr></tfoot>
      </table>
      {promises.length > 0 && <>
        <h3 className="doc-subtitle">Promised payments</h3>
        <table className="doc-table">
          <thead><tr><th>Promised date</th><th>Sale</th><th>For</th><th>Status</th><th className="num">Amount</th></tr></thead>
          <tbody>{promises.map(({ row, promise }) => (
            <tr key={row.id}><td>{formatDate(promise.date)}</td><td>{row.saleId}</td><td>{row.kind === 'OPEN_BALANCE' ? 'Balance' : `Installment ${row.no}`}{row.dueDate ? ` (due ${formatDate(row.dueDate)})` : ''}</td>
              <td>{promise.status === 'MISSED' ? 'Missed' : 'Promised'}</td><td className="num">{formatMoney(promise.amountC)}</td></tr>))}</tbody>
        </table>
      </>}
    </article>
  );
}
