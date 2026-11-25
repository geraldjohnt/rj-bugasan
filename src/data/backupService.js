/*
 * Backup and restore (Phase 11, RQ-042, BR-094, D-044).
 * Export: every business collection to one JSON file; settings/backup remembers when (for the 7-day reminder).
 * Restore (owner only): makes the database equal to the backup — documents in the backup are written, documents
 * not in it are deleted. Firestore cannot do this in one atomic step (KI-005), so it runs in batches while
 * settings/restore.active is true; the security rules allow the restore writes only during that window, and the
 * Backup screen warns if a restore was interrupted so it can be run again.
 */
import { DomainError } from '../domain/errors.js';
import { BACKUP_COLLECTIONS, RESTORE_WORD, buildBackup, planRestore, chunk, COLLECTION_LABELS } from '../domain/backup.js';
import { assertOnline } from './inventoryService.js';

const BATCH_SIZE = 400; // Firestore allows 500 writes per batch

async function readAll(adapter) {
  const docsByCol = {};
  for (const col of BACKUP_COLLECTIONS) docsByCol[col] = await adapter.query(col, {});
  return docsByCol;
}

/**
 * Build a backup of the whole database. Records the time in settings/backup and logs it.
 * Returns the backup object (the caller turns it into a download).
 */
export async function exportBackup(adapter, actor, now = new Date()) {
  assertOnline();
  const docsByCol = await readAll(adapter);
  const exportedAt = now.toISOString();
  const backup = buildBackup(docsByCol, { exportedAt, exportedBy: actor.displayName || actor.uid, isTimestamp: (v) => adapter.isTimestamp(v) });
  const total = Object.values(backup.counts).reduce((a, b) => a + b, 0);
  await adapter.set('settings', 'backup', { lastBackupAt: exportedAt, lastBackupBy: actor.uid, lastBackupByName: actor.displayName || '', lastBackupRecords: total, updatedAt: adapter.serverTime(), updatedBy: actor.uid });
  await adapter.set('activityLogs', adapter.newId(), {
    at: adapter.serverTime(), by: actor.uid, byName: actor.displayName || '', action: 'BACKUP_EXPORT', entityType: 'backup', entityId: 'backup',
    summary: `Downloaded a backup of ${total} records`, changes: { counts: backup.counts },
  });
  return backup;
}

/**
 * Restore a parsed backup (see parseBackup). confirmWord must be RESTORE (BR-094).
 * onProgress({ done, total, col }) is called after each batch. Returns { written, deleted }.
 */
export async function restoreBackup(adapter, actor, backup, confirmWord, { onProgress = () => {}, now = () => new Date() } = {}) {
  assertOnline();
  if (String(confirmWord || '').trim() !== RESTORE_WORD) throw new DomainError('CONFIRM_REQUIRED', `Type ${RESTORE_WORD} to confirm.`);
  if (actor.role && actor.role !== 'owner') throw new DomainError('OWNER_ONLY', 'Only the owner can restore a backup.');
  const startedAt = now().toISOString();
  await adapter.set('settings', 'restore', { active: true, startedAt, finishedAt: null, by: actor.uid, byName: actor.displayName || '', backupExportedAt: backup.exportedAt || null });

  const existingIds = {};
  for (const col of BACKUP_COLLECTIONS) existingIds[col] = (await adapter.query(col, {})).map((d) => d.id);
  const ops = planRestore(backup, existingIds, (iso) => adapter.timestampFromISO(iso));
  let done = 0;
  for (const part of chunk(ops, BATCH_SIZE)) {
    await adapter.batchWrite(part);
    done += part.length;
    onProgress({ done, total: ops.length, col: COLLECTION_LABELS[part[part.length - 1].col] });
  }
  const written = ops.filter((o) => o.op === 'set').length;
  const deleted = ops.length - written;
  await adapter.set('settings', 'restore', { active: false, startedAt, finishedAt: now().toISOString(), by: actor.uid, byName: actor.displayName || '', backupExportedAt: backup.exportedAt || null, written, deleted });
  await adapter.set('activityLogs', adapter.newId(), {
    at: adapter.serverTime(), by: actor.uid, byName: actor.displayName || '', action: 'BACKUP_RESTORE', entityType: 'backup', entityId: 'backup',
    summary: `Restored the backup of ${backup.exportedAt ? backup.exportedAt.slice(0, 10) : 'unknown date'}: ${written} records written, ${deleted} removed`,
    changes: { written, deleted, backupExportedAt: backup.exportedAt || null },
  });
  return { written, deleted };
}
