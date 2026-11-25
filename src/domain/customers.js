/*
 * Customer rules (BUSINESS_RULES §2, BR-020 … BR-026). Pure functions: no I/O, no Firebase.
 */
import { DomainError } from './errors.js';
import { parseMoney } from './money.js';
import { reliability } from './allocation.js';
import { WALK_IN_ID } from './saleTotals.js';

export { WALK_IN_ID };
export const CUSTOMER_TYPES = ['Household', 'Store', 'Reseller', 'Carinderia', 'Other'];

/** The built-in Walk-in customer (BR-020). It cannot be edited or archived. */
export const WALK_IN = {
  name: 'Walk-in', nameLower: 'walk-in', type: 'Other', system: true,
  address: '', contactNumber: '', email: '', facebook: '', notes: 'Built-in customer for fully paid counter sales.',
  creditLimitC: null, alternateContacts: [],
  outstandingC: 0, totalPurchasesC: 0, lastSaleDate: null, paidInstallments: 0, paidOnTime: 0, status: 'ACTIVE',
};

const trim = (v) => String(v ?? '').trim();
const PHONE_RE = /^[+()\d][\d\s()+-]{5,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPhone(value, errors, key, required) {
  if (!value) { if (required) errors[key] = 'Required.'; return; }
  if (!PHONE_RE.test(value) || value.replace(/\D/g, '').length < 7) errors[key] = 'Enter a valid phone number, e.g. 0917 123 4567.';
}
function checkEmail(value, errors, key) {
  if (value && !EMAIL_RE.test(value)) errors[key] = 'Enter a valid email address.';
}

/**
 * Validate the customer form (strings as typed). Returns { data, errors }.
 * Contact number is required for registered customers (A-008). Credit limit is optional (BR-024).
 */
export function validateCustomerForm(form) {
  const errors = {};
  const data = {};
  data.name = trim(form.name);
  if (!data.name) errors.name = 'Required.';
  else if (data.name.length > 120) errors.name = 'Use 120 characters or fewer.';
  data.nameLower = data.name.toLowerCase();
  if (data.nameLower === WALK_IN.nameLower) errors.name = '"Walk-in" is reserved for the built-in customer.';

  data.type = trim(form.type);
  if (!CUSTOMER_TYPES.includes(data.type)) errors.type = 'Choose a customer type.';
  data.contactNumber = trim(form.contactNumber);
  checkPhone(data.contactNumber, errors, 'contactNumber', true);
  data.email = trim(form.email);
  checkEmail(data.email, errors, 'email');
  data.address = trim(form.address);
  data.facebook = trim(form.facebook);
  data.notes = trim(form.notes);

  try {
    const c = parseMoney(form.creditLimit);
    if (c !== null && c < 0) errors.creditLimit = 'Credit limit cannot be negative.';
    else data.creditLimitC = c; // null = no limit
  } catch (e) { errors.creditLimit = e.message; }
  return { data, errors };
}

/** Validate one alternate contact (BR-022, RQ-022). Name and at least one way to reach them are required. */
export function validateContactForm(form) {
  const errors = {};
  const data = {
    name: trim(form.name), relationship: trim(form.relationship), address: trim(form.address),
    contactNumber: trim(form.contactNumber), email: trim(form.email), facebook: trim(form.facebook),
    notes: trim(form.notes), isPrimary: !!form.isPrimary,
  };
  if (!data.name) errors.name = 'Required.';
  checkPhone(data.contactNumber, errors, 'contactNumber', false);
  checkEmail(data.email, errors, 'email');
  if (!data.contactNumber && !data.email && !data.facebook && !data.address && !errors.name) {
    errors.contactNumber = 'Add at least a phone number, email, Facebook or address.';
  }
  return { data, errors };
}

/** Insert or replace a contact; at most one contact is primary. */
export function upsertContact(contacts, contact) {
  let list = (contacts || []).filter((c) => c.id !== contact.id);
  if (contact.isPrimary) list = list.map((c) => ({ ...c, isPrimary: false }));
  const idx = (contacts || []).findIndex((c) => c.id === contact.id);
  if (idx < 0) list.push(contact); else list.splice(Math.min(idx, list.length), 0, contact);
  return list;
}

/** Primary first, then by name. */
export const sortContacts = (contacts) => [...(contacts || [])].sort((a, b) => (b.isPrimary - a.isPrimary) || a.name.localeCompare(b.name));

export function assertEditable(customer) {
  if (customer.system || customer.id === WALK_IN_ID) throw new DomainError('SYSTEM_CUSTOMER', 'The Walk-in customer is built in and cannot be changed.');
}

/** BR-026: customers with an outstanding balance cannot be archived. */
export function assertArchivable(customer) {
  assertEditable(customer);
  if ((customer.outstandingC || 0) > 0) throw new DomainError('HAS_BALANCE', `${customer.name} still has an outstanding balance. Collect or cancel it before archiving.`);
}

/** Reliability label for a customer (BR-025). */
export const customerReliability = (c) => reliability(c.paidInstallments || 0, c.paidOnTime || 0);

/** Case-insensitive match on name, contact number, address or alternate contact names. */
export function matchesCustomer(c, query) {
  const q = trim(query).toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return [c.name, c.address, c.type, ...(c.alternateContacts || []).map((a) => a.name)].some((v) => (v || '').toLowerCase().includes(q))
    || (digits.length >= 3 && (c.contactNumber || '').replace(/\D/g, '').includes(digits));
}
