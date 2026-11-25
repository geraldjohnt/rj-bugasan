/*
 * Backup file format (DATABASE_DESIGN §6, RQ-042, BR-094, D-044).
 *   { app: 'rj-ims', schemaVersion, exportedAt, exportedBy, counts: { col: n }, collections: { col: [ { id, data } ] } }
 * Database timestamps are written as { "$ts": "<ISO>" } so a restore can turn them back into timestamps; plain
 * strings (dates such as '2026-11-25', or ISO strings the app stores on purpose) stay strings.
 * Pure functions: the adapter-specific parts (is this a timestamp? make one from ISO) are passed in.
 */
import { DomainError } from './errors.js';

export const BACKUP_APP = 'rj-ims';
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_REMINDER_DAYS = 7;
export const RESTORE_WORD = 'RESTORE';

/** Business collections in a backup. users/usernames (sign-in) are never exported or restored. */
export const BACKUP_COLLECTIONS = [
  'settings', 'counters', 'items', 'inventoryMovements', 'stockCounts', 'customers', 'sales', 'installments',
  'payments', 'suppliers', 'restocks', 'expenses', 'calendarEvents', 'activityLogs',
];
/** Settings documents a restore never touches (the one-time owner flag and the restore flag itself). */
export const PROTECTED_SETTINGS = ['bootstrap', 'restore'];
export const isProtected = (col, id) => col === 'settings' && PROTECTED_SETTINGS.includes(id);

export const COLLECTION_LABELS = {
  settings: 'Settings', counters: 'Number counters', items: 'Items', inventoryMovements: 'Stock movements',
  stockCounts: 'Stock counts', customers: 'Customers', sales: 'Sales and opening balances', installments: 'Installments and balances',
  payments: 'Payments', suppliers: 'Suppliers', restocks: 'Restocks', expenses: 'Expenses', calendarEvents: 'Calendar reminders',
  activityLogs: 'Activity log entries',
};

export function encodeValue(v, isTimestamp) {
  if (v === null || v === undefined) return v ?? null;
  if (isTimestamp(v)) return { $ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map((x) => encodeValue(x, isTimestamp));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encodeValue(x, isTimestamp);
    return out;
  }
  return v;
}

export function decodeValue(v, fromISO) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, fromISO));
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === '$ts' && typeof v.$ts === 'string') return fromISO(v.$ts);
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = decodeValue(x, fromISO);
  return out;
}

/** Build the backup object. docsByCol: { col: [ { id, ...data } ] } as read from the adapter. */
export function buildBackup(docsByCol, { exportedAt, exportedBy, isTimestamp = () => false }) {
  const collections = {};
  const counts = {};
  for (const col of BACKUP_COLLECTIONS) {
    const docs = (docsByCol[col] || []).filter((d) => !isProtected(col, d.id));
    collections[col] = docs
      .map(({ id, ...data }) => ({ id, data: encodeValue(data, isTimestamp) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    counts[col] = collections[col].length;
  }
  return { app: BACKUP_APP, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt, exportedBy, counts, collections };
}

export const backupFileName = (exportedAt, businessName = 'rj') => {
  const slug = String(businessName || 'rj').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rj';
  const stamp = String(exportedAt).slice(0, 16).replace('T', '-').replace(':', '');
  return `${slug}-backup-${stamp}.json`;
};

/**
 * Parse and check a backup file's text. Returns { backup, counts, total, exportedAt }.
 * Throws DomainError with a plain-language message for anything that is not a usable backup of this app.
 */
export function parseBackup(text) {
  let b;
  try { b = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (e) { throw new DomainError('BACKUP_NOT_JSON', 'This file is not a backup file (it could not be read as JSON).'); }
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP) throw new DomainError('BACKUP_WRONG_APP', 'This file is not a backup from this system.');
  if (!Number.isInteger(b.schemaVersion) || b.schemaVersion < 1) throw new DomainError('BACKUP_BAD_VERSION', 'This backup file is damaged (no version).');
  if (b.schemaVersion > BACKUP_SCHEMA_VERSION) throw new DomainError('BACKUP_TOO_NEW', 'This backup was made by a newer version of the system. Update the system first.');
  if (!b.collections || typeof b.collections !== 'object') throw new DomainError('BACKUP_NO_DATA', 'This backup file is damaged (no data).');
  const counts = {};
  let total = 0;
  for (const [col, docs] of Object.entries(b.collections)) {
    if (!BACKUP_COLLECTIONS.includes(col)) throw new DomainError('BACKUP_UNKNOWN', `This backup contains unknown data ("${col}").`);
    if (!Array.isArray(docs)) throw new DomainError('BACKUP_DAMAGED', `This backup file is damaged (${col}).`);
    const seen = new Set();
    for (const d of docs) {
      if (!d || typeof d.id !== 'string' || !d.id || d.id.includes('/') || !d.data || typeof d.data !== 'object' || Array.isArray(d.data)) {
        throw new DomainError('BACKUP_DAMAGED', `This backup file is damaged (${col}).`);
      }
      if (seen.has(d.id)) throw new DomainError('BACKUP_DAMAGED', `This backup file is damaged (${col} ${d.id} appears twice).`);
      seen.add(d.id);
    }
    counts[col] = docs.length;
    total += docs.length;
  }
  if (b.counts) {
    for (const [col, n] of Object.entries(b.counts)) {
      if ((counts[col] || 0) !== n) throw new DomainError('BACKUP_INCOMPLETE', 'This backup file is incomplete (some records are missing). Use another backup.');
    }
  }
  return { backup: b, counts, total, exportedAt: b.exportedAt || null };
}

/**
 * Plan a restore: what to write and what to delete so the database equals the backup.
 * existingIds: { col: [id] }. Returns ops [{ op, col, id, data? }] in collection order (deletes first per collection).
 */
export function planRestore(backup, existingIds, fromISO = (s) => s) {
  const ops = [];
  for (const col of BACKUP_COLLECTIONS) {
    const docs = (backup.collections[col] || []).filter((d) => !isProtected(col, d.id));
    const keep = new Set(docs.map((d) => d.id));
    for (const id of existingIds[col] || []) {
      if (!keep.has(id) && !isProtected(col, id)) ops.push({ op: 'delete', col, id });
    }
    for (const d of docs) ops.push({ op: 'set', col, id: d.id, data: decodeValue(d.data, fromISO) });
  }
  return ops;
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Days since the last backup (null = never). BR-094 reminder when null or > 7. */
export function backupAge(lastBackupAtISO, now = new Date()) {
  if (!lastBackupAtISO) return null;
  const t = new Date(lastBackupAtISO).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}
export const backupIsDue = (age) => age === null || age > BACKUP_REMINDER_DAYS;
