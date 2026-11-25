/* Customer badges (Phase 5). Reliability is derived from paid-installment counters (BR-025), kept by the payment service (Phase 7). */
import { Badge } from '../../components/Feedback.jsx';
import { customerReliability } from '../../domain/customers.js';

const TONE = { Good: 'success', Fair: 'warning', Poor: 'danger', New: 'neutral' };

export function ReliabilityBadge({ customer }) {
  if (!customer || customer.system) return null;
  const r = customerReliability(customer);
  const title = r.ratio === null ? 'Fewer than 3 installments paid so far' : `${Math.round(r.ratio * 100)}% of ${customer.paidInstallments} paid installments were on time`;
  return <span title={title}><Badge tone={TONE[r.label]}>{r.label === 'New' ? 'New payer' : `${r.label} payer`}</Badge></span>;
}
