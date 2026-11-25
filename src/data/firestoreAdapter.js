/*
 * Firestore adapter (production). Uses the Firebase compat SDK loaded from vendor/ as the global `firebase`.
 * STATUS: written in Phase 1, NOT yet verified against a real project — see TQ-1 / KI-001 (spike).
 */

function applyQuery(ref, q = {}) {
  let r = ref;
  for (const [field, op, value] of q.where || []) r = r.where(field, op, value);
  for (const [field, dir = 'asc'] of q.orderBy || []) r = r.orderBy(field, dir);
  if (q.limit) r = r.limit(q.limit);
  return r;
}
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export function createFirestoreAdapter(firebase, config) {
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
  const db = app.firestore();

  // Offline read cache (D-012). Must run before any other Firestore call; may be unavailable under file://.
  const persistence = db
    .enablePersistence({ synchronizeTabs: true })
    .then(() => 'enabled')
    .catch((err) => `unavailable (${err.code || err.message})`);

  return {
    kind: 'firestore',
    persistence,
    auth: app.auth(),
    async get(name, id) { const s = await db.collection(name).doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null; },
    async query(name, q) { return rows(await applyQuery(db.collection(name), q).get()); },
    async set(name, id, data) { await db.collection(name).doc(id).set(data); },
    async update(name, id, data) { await db.collection(name).doc(id).update(data); },
    async add(name, data) { const ref = await db.collection(name).add(data); return ref.id; },
    newId() { return db.collection('_ids').doc().id; },
    runTransaction(fn) {
      return db.runTransaction(async (t) => fn({
        async get(name, id) { const s = await t.get(db.collection(name).doc(id)); return { id, exists: s.exists, data: s.exists ? s.data() : undefined }; },
        set(name, id, data) { t.set(db.collection(name).doc(id), data); return this; },
        update(name, id, data) { t.update(db.collection(name).doc(id), data); return this; },
        delete(name, id) { t.delete(db.collection(name).doc(id)); return this; },
      }));
    },
    subscribe(name, q, cb, onError) { return applyQuery(db.collection(name), q).onSnapshot((s) => cb(rows(s)), onError); },
    serverTime() { return firebase.firestore.FieldValue.serverTimestamp(); },
  };
}
