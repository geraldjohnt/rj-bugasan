/* Firebase file:// spike — development only, never shipped in /dist. Plain browser JS. */
(function () {
  var out = document.getElementById('out');
  function log(name, ok, detail) {
    out.textContent += '\n' + (ok === true ? 'PASS ' : ok === false ? 'FAIL ' : 'INFO ') + name + (detail ? ' — ' + detail : '');
  }
  out.textContent = 'Page origin: ' + location.protocol + ' / navigator.userAgent: ' + navigator.userAgent;

  var cfg = window.RJ_FIREBASE_CONFIG;
  if (!cfg) { log('Config present', false, 'config/firebase-config.js is null'); return; }
  log('Compat SDK loaded', !!(window.firebase && firebase.auth && firebase.firestore), firebase.SDK_VERSION);

  var app = firebase.initializeApp(cfg);
  var db = app.firestore();
  var persistence = db.enablePersistence({ synchronizeTabs: true })
    .then(function () { return 'enabled'; })
    .catch(function (e) { return 'unavailable: ' + (e.code || e.message); });

  firebase.auth().onAuthStateChanged(function (u) {
    log('Restored session on load', !!u || null, u ? u.email : 'no saved session (expected on first run)');
  });

  document.getElementById('f').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    try {
      log('Firestore persistent cache', null, await persistence);
      var user = firebase.auth().currentUser;
      if (!user) {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        var cred = await firebase.auth().signInWithEmailAndPassword(
          document.getElementById('email').value, document.getElementById('password').value);
        user = cred.user;
      }
      log('Sign in (email/password)', true, user.email);

      var ref = db.collection('_spike').doc('probe');
      await ref.set({ at: firebase.firestore.FieldValue.serverTimestamp(), n: 0 }, { merge: true });
      log('Firestore write', true);
      var snap = await ref.get({ source: 'server' });
      log('Firestore read (server)', snap.exists, JSON.stringify(snap.data()));
      var n = await db.runTransaction(async function (t) {
        var s = await t.get(ref); var next = (s.data().n || 0) + 1; t.update(ref, { n: next }); return next;
      });
      log('Firestore transaction', true, 'counter = ' + n);
      var unsub = ref.onSnapshot(function (s) { log('Realtime listener', true, 'n = ' + s.data().n); unsub(); });
      log('Done', null, 'Now reopen this page (double-click) and press Run again without typing the password.');
    } catch (e) {
      log('Error', false, (e.code || '') + ' ' + e.message);
    }
  });
})();
