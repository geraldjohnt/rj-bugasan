/*
 * Data adapter selection. Both adapters implement the same interface:
 *   kind, get(col, id), query(col, {where, orderBy, limit}), set(col, id, data), update(col, id, patch),
 *   add(col, data), runTransaction(fn(tx)), subscribe(col, q, cb), serverTime()
 * tx: get(col, id), set(col, id, data), update(col, id, patch), delete(col, id)  (all reads before writes)
 */
import { createMockAdapter, browserStorage } from './mockAdapter.js';
import { createFirestoreAdapter } from './firestoreAdapter.js';

export function selectAdapter(win) {
  const config = win.RJ_FIREBASE_CONFIG;
  if (config && config.projectId && win.firebase) {
    return createFirestoreAdapter(win.firebase, config);
  }
  return createMockAdapter({ storage: browserStorage(win, 'rj-ims-demo-db') });
}
