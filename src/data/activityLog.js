/*
 * Activity log entries (BR-093). Written inside the same transaction as the action they describe; never edited.
 * actor: { uid, displayName }
 */
export function logWrite(tx, adapter, actor, { action, entityType, entityId, summary, changes = null }) {
  tx.set('activityLogs', adapter.newId(), {
    at: adapter.serverTime(),
    by: actor.uid,
    byName: actor.displayName || actor.username || '',
    action, entityType, entityId, summary, changes,
  });
}
