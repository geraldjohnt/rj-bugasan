/*
 * Customer service (Phase 5). Every write runs in a transaction together with its activity-log entry (BR-093).
 * Summary fields (outstandingC, totalPurchasesC, lastSaleDate, reliability counters) are maintained by the sale
 * and payment services, never by the customer form (BR-023).
 */
import { DomainError } from '../domain/errors.js';
import { formatMoney } from '../domain/money.js';
import { WALK_IN, WALK_IN_ID, assertEditable, assertArchivable, upsertContact } from '../domain/customers.js';
import { logWrite } from './activityLog.js';
import { assertOnline } from './inventoryService.js';

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });
const EDITABLE = ['name', 'nameLower', 'type', 'contactNumber', 'email', 'address', 'facebook', 'notes', 'creditLimitC'];

async function readCustomer(tx, id) {
  const s = await tx.get('customers', id);
  if (!s.exists) throw new DomainError('CUSTOMER_MISSING', 'This customer no longer exists.');
  return { id, ...s.data };
}

/** The Walk-in document, as stored for a new database (BR-020). */
export const walkInDoc = (adapter, actor) => ({ ...WALK_IN, createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor) });

/** Create the built-in Walk-in customer if it does not exist yet. Safe to call any time. */
export async function ensureWalkIn(adapter, actor) {
  const existing = await adapter.get('customers', WALK_IN_ID);
  if (existing) return false;
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const s = await tx.get('customers', WALK_IN_ID);
    if (s.exists) return false;
    tx.set('customers', WALK_IN_ID, walkInDoc(adapter, actor));
    return true;
  });
}

/** data: output of validateCustomerForm. Returns the new id. */
export async function createCustomer(adapter, actor, data) {
  assertOnline();
  const id = adapter.newId();
  return adapter.runTransaction(async (tx) => {
    const doc = {
      name: data.name, nameLower: data.nameLower, type: data.type, system: false,
      contactNumber: data.contactNumber, email: data.email || '', address: data.address || '', facebook: data.facebook || '', notes: data.notes || '',
      creditLimitC: data.creditLimitC ?? null, alternateContacts: [],
      outstandingC: 0, totalPurchasesC: 0, lastSaleDate: null, paidInstallments: 0, paidOnTime: 0, status: 'ACTIVE',
      createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
    };
    tx.set('customers', id, doc);
    logWrite(tx, adapter, actor, { action: 'CUSTOMER_CREATE', entityType: 'customer', entityId: id, summary: `Added customer ${doc.name} (${doc.type})` });
    return id;
  });
}

export async function updateCustomer(adapter, actor, id, data) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const c = await readCustomer(tx, id);
    assertEditable(c);
    const patch = {}, changes = {};
    for (const k of EDITABLE) {
      const v = k === 'creditLimitC' ? (data[k] ?? null) : data[k];
      if (v === undefined) continue;
      if (v !== (c[k] ?? (k === 'creditLimitC' ? null : ''))) { patch[k] = v; if (k !== 'nameLower') changes[k] = { from: c[k] ?? null, to: v }; }
    }
    if (!Object.keys(patch).length) return { changed: false };
    tx.update('customers', id, { ...patch, ...stamp(adapter, actor) });
    const limit = changes.creditLimitC
      ? `: credit limit ${changes.creditLimitC.from == null ? 'none' : formatMoney(changes.creditLimitC.from)} → ${changes.creditLimitC.to == null ? 'none' : formatMoney(changes.creditLimitC.to)}` : '';
    logWrite(tx, adapter, actor, { action: 'CUSTOMER_UPDATE', entityType: 'customer', entityId: id, summary: `Edited customer ${data.name || c.name}${limit}`, changes });
    return { changed: true };
  });
}

/** Archive or restore. BR-026: not while a balance is outstanding. Walk-in can never be archived. */
export async function setCustomerStatus(adapter, actor, id, status) {
  assertOnline();
  if (status !== 'ACTIVE' && status !== 'ARCHIVED') throw new DomainError('INVALID_STATUS', 'Invalid status.');
  return adapter.runTransaction(async (tx) => {
    const c = await readCustomer(tx, id);
    if (status === 'ARCHIVED') assertArchivable(c); else assertEditable(c);
    if (c.status === status) return;
    tx.update('customers', id, { status, ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: status === 'ARCHIVED' ? 'CUSTOMER_ARCHIVE' : 'CUSTOMER_RESTORE', entityType: 'customer', entityId: id,
      summary: `${status === 'ARCHIVED' ? 'Archived' : 'Restored'} customer ${c.name}`,
    });
  });
}

/** Add (no id) or edit an alternate contact (BR-022). contact: output of validateContactForm (+ id when editing). */
export async function saveContact(adapter, actor, customerId, contact) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const c = await readCustomer(tx, customerId);
    assertEditable(c);
    const isNew = !contact.id;
    const saved = { ...contact, id: contact.id || adapter.newId() };
    if (!isNew && !(c.alternateContacts || []).some((x) => x.id === saved.id)) throw new DomainError('CONTACT_MISSING', 'This contact no longer exists.');
    if (isNew && (c.alternateContacts || []).length >= 20) throw new DomainError('TOO_MANY', 'A customer can have at most 20 alternate contacts.');
    tx.update('customers', customerId, { alternateContacts: upsertContact(c.alternateContacts, saved), ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, {
      action: isNew ? 'CONTACT_ADD' : 'CONTACT_UPDATE', entityType: 'customer', entityId: customerId,
      summary: `${isNew ? 'Added' : 'Edited'} alternate contact ${saved.name}${saved.relationship ? ` (${saved.relationship})` : ''} for ${c.name}`,
    });
    return saved.id;
  });
}

export async function removeContact(adapter, actor, customerId, contactId) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const c = await readCustomer(tx, customerId);
    assertEditable(c);
    const gone = (c.alternateContacts || []).find((x) => x.id === contactId);
    if (!gone) return;
    tx.update('customers', customerId, { alternateContacts: c.alternateContacts.filter((x) => x.id !== contactId), ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, { action: 'CONTACT_REMOVE', entityType: 'customer', entityId: customerId, summary: `Removed alternate contact ${gone.name} from ${c.name}` });
  });
}
