/*
 * Opening balances (Phase 11, RQ-007, BR-081, D-045): accounts carried over from the Excel records.
 * Stored as a sale document of kind OPENING_BALANCE (`OB-YYYY-NNNNN`) with no lines, so the existing payment,
 * reschedule, collections, statement and cancel logic works unchanged, while reports leave it out of revenue/profit.
 * Its receivable rows are the remaining schedule: one row (a plain balance, due date optional) or 2–5 installments.
 */
import { parseMoney, sum } from './money.js';
import { isValidDate, compareDates } from './dates.js';
import { WALK_IN_ID } from './saleTotals.js';

export const OB_PREFIX = 'OB-';
export const OB_MAX_ROWS = 5;
export const OB_KIND = 'OPENING_BALANCE';
export const isOpeningBalance = (sale) => !!sale && sale.kind === OB_KIND;

/**
 * form: { customerId, originalDate, description, rows: [{ dueDate, amount }] }, today = business date.
 * Returns { data: { customerId, originalDate, description, rows: [{ no, dueDate, amountC }], totalC, kind }, errors }.
 * errors.rows is an array of per-row messages ({ dueDate, amount }) when a row is wrong.
 */
export function validateOpeningBalanceForm(form, today) {
  const errors = {};
  const data = {};
  data.customerId = String(form.customerId || '');
  if (!data.customerId) errors.customerId = 'Choose the customer.';
  else if (data.customerId === WALK_IN_ID) errors.customerId = 'Walk-in sales are paid in full and cannot have a balance.';
  data.originalDate = String(form.originalDate || '');
  if (!isValidDate(data.originalDate)) errors.originalDate = 'Enter the date of the original sale.';
  else if (today && compareDates(data.originalDate, today) > 0) errors.originalDate = 'The original date cannot be in the future.';
  data.description = String(form.description || '').trim();
  if (!data.description) errors.description = 'Describe what the balance is for, e.g. "2 sacks Dinorado, from the Excel ledger".';
  else if (data.description.length > 200) errors.description = 'Keep it under 200 characters.';

  const rows = form.rows || [];
  if (!rows.length || rows.length > OB_MAX_ROWS) errors.count = `Enter 1 to ${OB_MAX_ROWS} amounts still to pay.`;
  const rowErrors = [];
  data.rows = rows.map((r, i) => {
    const e = {};
    let amountC = null;
    try { amountC = parseMoney(r.amount); } catch (err) { e.amount = err.message; }
    if (!e.amount && (amountC === null || amountC <= 0)) e.amount = 'Enter an amount greater than zero.';
    const dueDate = String(r.dueDate || '') || null;
    if (dueDate && !isValidDate(dueDate)) e.dueDate = 'Enter a valid date.';
    if (!dueDate && rows.length > 1) e.dueDate = 'Each installment needs a due date.';
    if (dueDate && !e.dueDate && isValidDate(data.originalDate) && compareDates(dueDate, data.originalDate) < 0) e.dueDate = 'Cannot be before the original date.';
    if (i > 0 && dueDate && rows[i - 1].dueDate && compareDates(dueDate, rows[i - 1].dueDate) < 0) e.dueDate = 'Due dates must be in order.';
    if (Object.keys(e).length) rowErrors[i] = e;
    return { no: i + 1, dueDate, amountC: amountC || 0 };
  });
  if (rowErrors.length) errors.rows = rowErrors;
  data.totalC = sum(data.rows.map((r) => r.amountC));
  data.kind = data.rows.length > 1 ? 'INSTALLMENT' : 'OPEN_BALANCE';
  return { data, errors };
}

/** Split a remaining balance into `count` rows (whole pesos, remainder last) for the form's "Split evenly" helper. */
export function splitEvenly(totalC, count) {
  if (!Number.isInteger(totalC) || totalC <= 0 || count < 1) return [];
  const base = Math.floor(totalC / count / 100) * 100;
  const out = Array(count).fill(base);
  out[count - 1] = totalC - base * (count - 1);
  return out;
}
