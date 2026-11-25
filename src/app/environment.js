/* Runtime environment checks shown on the Phase 1 foundation screen. */
export async function checkEnvironment(win) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, status: ok === null ? 'info' : ok ? 'ok' : 'fail', detail });

  add('Opened from', null, win.location.protocol === 'file:' ? 'Local file (file://)' : win.location.origin);
  add('React', !!win.React, win.React ? `v${win.React.version}` : 'not loaded');
  add('Firebase SDK (compat)', !!(win.firebase && win.firebase.firestore && win.firebase.auth), win.firebase ? `v${win.firebase.SDK_VERSION}` : 'not loaded');

  let ls = false;
  try { win.localStorage.setItem('__rj_check', '1'); ls = win.localStorage.getItem('__rj_check') === '1'; win.localStorage.removeItem('__rj_check'); } catch (e) { /* blocked */ }
  add('Local storage', ls, ls ? 'available' : 'blocked');

  const idb = await new Promise((resolve) => {
    try {
      const req = win.indexedDB.open('__rj_check');
      req.onsuccess = () => { req.result.close(); win.indexedDB.deleteDatabase('__rj_check'); resolve(true); };
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
  add('IndexedDB (offline cache, login session)', idb, idb ? 'available' : 'blocked');

  let font = false;
  try { await win.document.fonts.load('600 14px Inter'); font = win.document.fonts.check('600 14px Inter'); } catch (e) { /* ignore */ }
  add('Inter font', font, font ? 'loaded locally' : 'using system font fallback');

  return checks;
}
