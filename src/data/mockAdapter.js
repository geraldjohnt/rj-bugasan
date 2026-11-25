/*
 * Mock adapter — development and demo only (NOT the production data store).
 * In-memory collections, optionally persisted to localStorage. Emulates Firestore transaction semantics:
 * reads must precede writes, writes are applied all-or-nothing, and a transaction whose read documents were
 * changed by another committed transaction is retried (optimistic concurrency), like Firestore.
 */

export class TransactionConflictError extends Error {
  constructor() { super('Transaction failed after too many conflicting retries.'); this.name = 'TransactionConflictError'; }
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function browserStorage(win, key) {
  return {
    load() { try { return JSON.parse(win.localStorage.getItem(key) || 'null'); } catch (e) { return null; } },
    save(data) { try { win.localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* quota/private mode: keep in memory */ } },
  };
}

function matches(doc, where) {
  return (where || []).every(([field, op, value]) => {
    const v = doc[field];
    switch (op) {
      case '==': return v === value;
      case '!=': return v !== value;
      case '<': return v < value;
      case '<=': return v <= value;
      case '>': return v > value;
      case '>=': return v >= value;
      case 'in': return value.includes(v);
      case 'array-contains': return Array.isArray(v) && v.includes(value);
      default: throw new Error(`Unsupported operator: ${op}`);
    }
  });
}

export function createMockAdapter({ storage = null, maxRetries = 5, now = () => new Date() } = {}) {
  // db: { [collection]: { [id]: { data, version } } }
  let db = (storage && storage.load()) || {};
  let idCounter = 0;
  const listeners = new Set();

  const col = (name) => (db[name] = db[name] || {});
  const persist = () => storage && storage.save(db);
  const notify = (names) => listeners.forEach((l) => names.has(l.col) && l.run());
  const newId = () => `${now().getTime().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function runQuery(name, q = {}) {
    let rows = Object.entries(col(name)).map(([id, rec]) => ({ id, ...clone(rec.data) }));
    rows = rows.filter((r) => matches(r, q.where));
    for (const [field, dir = 'asc'] of [...(q.orderBy || [])].reverse()) {
      rows.sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (q.limit) rows = rows.slice(0, q.limit);
    return rows;
  }

  function commit(writes) {
    const touched = new Set();
    for (const w of writes) {
      const c = col(w.col);
      const cur = c[w.id];
      if (w.op === 'delete') { delete c[w.id]; }
      else if (w.op === 'set') { c[w.id] = { data: clone(w.data), version: (cur ? cur.version : 0) + 1 }; }
      else if (w.op === 'update') {
        if (!cur) throw new Error(`No document to update: ${w.col}/${w.id}`);
        c[w.id] = { data: { ...cur.data, ...clone(w.data) }, version: cur.version + 1 };
      }
      touched.add(w.col);
    }
    persist();
    notify(touched);
  }

  async function runTransaction(fn) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const readVersions = new Map();
      const writes = [];
      const tx = {
        async get(name, id) {
          if (writes.length) throw new Error('Transactions require all reads before any writes.');
          const rec = col(name)[id];
          readVersions.set(`${name}/${id}`, rec ? rec.version : 0);
          return rec ? { id, exists: true, data: clone(rec.data) } : { id, exists: false, data: undefined };
        },
        set(name, id, data) { writes.push({ op: 'set', col: name, id, data }); return tx; },
        update(name, id, data) { writes.push({ op: 'update', col: name, id, data }); return tx; },
        delete(name, id) { writes.push({ op: 'delete', col: name, id }); return tx; },
      };
      const result = await fn(tx); // throwing aborts: nothing is written
      const stale = [...readVersions].some(([key, v]) => {
        const [name, id] = key.split('/');
        const rec = col(name)[id];
        return (rec ? rec.version : 0) !== v;
      });
      if (stale) continue; // someone committed in between — retry like Firestore
      commit(writes);
      return result;
    }
    throw new TransactionConflictError();
  }

  return {
    kind: 'mock',
    async get(name, id) { const rec = col(name)[id]; return rec ? { id, ...clone(rec.data) } : null; },
    async query(name, q) { return runQuery(name, q); },
    async set(name, id, data) { commit([{ op: 'set', col: name, id, data }]); },
    async update(name, id, data) { commit([{ op: 'update', col: name, id, data }]); },
    async add(name, data) { const id = newId(); commit([{ op: 'set', col: name, id, data }]); return id; },
    runTransaction,
    newId,
    subscribe(name, q, cb) {
      const l = { col: name, run: () => cb(runQuery(name, q)) };
      listeners.add(l);
      l.run();
      return () => listeners.delete(l);
    },
    subscribeDoc(name, id, cb) {
      const l = { col: name, run: () => { const rec = col(name)[id]; cb(rec ? { id, ...clone(rec.data) } : null); } };
      listeners.add(l);
      l.run();
      return () => listeners.delete(l);
    },
    serverTime() { return now().toISOString(); },
    reset() { db = {}; persist(); },
  };
}
