/*
 * Authentication services (RQ-040, RQ-041, D-011). Two implementations with the same interface:
 *   onChange(cb) → unsubscribe   cb(user|null), user = { uid, username, displayName, role, email, preferences }
 *   signIn(username, password)   signOut()   unlock(password)   changePassword(current, next)
 *   requestReset(username)       setupStatus() → 'needed' | 'done' | 'rules-missing'
 *   setupOwner({ displayName, username, email, password })   savePreferences(prefs)
 * Passwords are never stored by the app. A localStorage flag is never treated as being signed in.
 */
import { DomainError } from '../domain/errors.js';

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 8;
export const normalizeUsername = (u) => String(u || '').trim().toLowerCase();

const fail = (code, message) => { throw new DomainError(code, message); };
const BAD_LOGIN = 'Incorrect username or password.';

export function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  if (err instanceof DomainError) return err.message;
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(code)) return BAD_LOGIN;
  if (/too-many-requests/.test(code)) return 'Too many attempts. Wait a few minutes, then try again.';
  if (/network-request-failed|unavailable/.test(code)) return 'No internet connection. Connect and try again.';
  if (/weak-password/.test(code)) return `Use at least ${MIN_PASSWORD} characters for the password.`;
  if (/email-already-in-use/.test(code)) return 'That recovery email is already used by another account.';
  if (/requires-recent-login/.test(code)) return 'For security, sign out and sign in again, then retry.';
  if (/permission-denied/.test(code)) return 'The database refused this action. Check that the Firestore rules are published (FIREBASE_SETUP.md).';
  return 'Something went wrong. Try again.';
}

function validatePassword(p) {
  if (!p || p.length < MIN_PASSWORD) fail('WEAK_PASSWORD', `Use at least ${MIN_PASSWORD} characters for the password.`);
}

/* ---------------------------------------------------------------- Firebase */
export function createFirebaseAuthService(firebase, app) {
  const auth = app.auth();
  const db = app.firestore();
  const persistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  // During first-time setup the Auth account exists before its profile documents do: ignore auth events until saved.
  let settingUp = false;
  const subscribers = new Set();

  async function loadProfile(fbUser) {
    const snap = await db.collection('users').doc(fbUser.uid).get();
    if (!snap.exists) return null;
    const d = snap.data();
    return { uid: fbUser.uid, email: fbUser.email, username: d.username, displayName: d.displayName || d.username, role: d.role, active: d.active, preferences: d.preferences || null };
  }

  async function handle(fbUser, cb) {
    if (!fbUser) return cb(null);
    try {
      const profile = await loadProfile(fbUser);
      if (!profile || !profile.active) { await auth.signOut(); return cb(null, 'This account is not active.'); }
      cb(profile);
    } catch (e) {
      // Offline with a cached session: stay signed in, read-only (D-012).
      if (/unavailable/.test(e.code || '')) cb({ uid: fbUser.uid, email: fbUser.email, username: '', displayName: fbUser.email, role: 'owner', offlineProfile: true });
      else cb(null, friendlyAuthError(e));
    }
  }

  async function lookupEmail(u) {
    const snap = await db.collection('usernames').doc(u).get({ source: 'server' });
    return snap.exists ? snap.data().email : null;
  }

  return {
    kind: 'firebase',
    onChange(cb) {
      subscribers.add(cb);
      const unsub = auth.onAuthStateChanged((fbUser) => { if (!settingUp) handle(fbUser, cb); });
      return () => { subscribers.delete(cb); unsub(); };
    },
    async signIn(username, password) {
      await persistenceReady;
      const u = normalizeUsername(username);
      if (!USERNAME_RE.test(u) || !password) fail('BAD_LOGIN', BAD_LOGIN);
      let email;
      try { email = await lookupEmail(u); } catch (e) { throw new DomainError('LOOKUP', friendlyAuthError(e)); }
      if (!email) fail('BAD_LOGIN', BAD_LOGIN);
      try { await auth.signInWithEmailAndPassword(email, password); } catch (e) { throw new DomainError('BAD_LOGIN', friendlyAuthError(e)); }
    },
    signOut() { return auth.signOut(); },
    async unlock(password) {
      const user = auth.currentUser; if (!user) fail('NO_USER', 'You are signed out.');
      try { await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, password)); }
      catch (e) { throw new DomainError('BAD_LOGIN', /invalid-credential|wrong-password/.test(e.code || '') ? 'Incorrect password.' : friendlyAuthError(e)); }
    },
    async changePassword(current, next) {
      validatePassword(next);
      await this.unlock(current);
      try { await auth.currentUser.updatePassword(next); } catch (e) { throw new DomainError('CHANGE_FAILED', friendlyAuthError(e)); }
    },
    async requestReset(username) {
      const u = normalizeUsername(username);
      if (!USERNAME_RE.test(u)) return; // same response whether or not the username exists
      try { const email = await lookupEmail(u); if (email) await auth.sendPasswordResetEmail(email); }
      catch (e) { if (/network|unavailable/.test(e.code || '')) throw new DomainError('OFFLINE', friendlyAuthError(e)); }
    },
    async setupStatus() {
      try {
        const snap = await db.collection('settings').doc('bootstrap').get({ source: 'server' });
        return snap.exists ? 'done' : 'needed';
      } catch (e) {
        if (/permission-denied/.test(e.code || '')) return 'rules-missing';
        throw new DomainError('OFFLINE', friendlyAuthError(e));
      }
    },
    /** One-time owner creation. Security rules allow this only while settings/bootstrap does not exist. */
    async setupOwner({ displayName, username, email, password }) {
      const u = normalizeUsername(username);
      if (!USERNAME_RE.test(u)) fail('BAD_USERNAME', 'Username: 3–32 characters — lowercase letters, numbers, dot, dash or underscore.');
      if (!/^\S+@\S+\.\S+$/.test(email || '')) fail('BAD_EMAIL', 'Enter a valid recovery email.');
      validatePassword(password);
      await persistenceReady;
      settingUp = true;
      try {
        let cred;
        try { cred = await auth.createUserWithEmailAndPassword(email.trim(), password); }
        catch (e) {
          if (!/email-already-in-use/.test(e.code || '')) throw new DomainError('SETUP_FAILED', friendlyAuthError(e));
          // A previous attempt may have created the account but not the profile: sign in and continue.
          try { cred = await auth.signInWithEmailAndPassword(email.trim(), password); }
          catch (e2) { throw new DomainError('SETUP_FAILED', friendlyAuthError(e)); }
        }
        const uid = cred.user.uid;
        const ts = firebase.firestore.FieldValue.serverTimestamp();
        const batch = db.batch();
        batch.set(db.collection('settings').doc('bootstrap'), { ownerUid: uid, createdAt: ts });
        batch.set(db.collection('users').doc(uid), { username: u, displayName: (displayName || '').trim() || u, role: 'owner', active: true, preferences: null, createdAt: ts });
        batch.set(db.collection('usernames').doc(u), { email: email.trim(), uid });
        try { await batch.commit(); }
        catch (e) { settingUp = false; await auth.signOut(); throw new DomainError('SETUP_FAILED', friendlyAuthError(e)); }
        settingUp = false;
        const profile = await loadProfile(cred.user);
        subscribers.forEach((cb) => cb(profile));
        return uid;
      } finally { settingUp = false; }
    },
    async savePreferences(prefs) {
      const user = auth.currentUser; if (!user) return;
      try { await db.collection('users').doc(user.uid).update({ preferences: prefs }); } catch (e) { /* offline: kept locally */ }
    },
  };
}

/* ---------------------------------------------------------------- Demo (Mock) */
export const DEMO_CREDENTIALS = { username: 'owner', password: 'demo1234' };
const DEMO_SESSION_KEY = 'rj-ims-demo-session';

export function createDemoAuthService() {
  let listeners = new Set();
  let password = DEMO_CREDENTIALS.password;
  const demoUser = { uid: 'demo-owner', username: DEMO_CREDENTIALS.username, displayName: 'Demo Owner', role: 'owner', email: 'owner@example.com', preferences: null };
  const signedIn = () => { try { return localStorage.getItem(DEMO_SESSION_KEY) === '1'; } catch (e) { return false; } };
  const emit = () => listeners.forEach((cb) => cb(signedIn() ? demoUser : null));
  const check = (u, p) => normalizeUsername(u) === DEMO_CREDENTIALS.username && p === password;
  return {
    kind: 'demo',
    onChange(cb) { listeners.add(cb); setTimeout(() => cb(signedIn() ? demoUser : null), 0); return () => listeners.delete(cb); },
    async signIn(u, p) { if (!check(u, p)) fail('BAD_LOGIN', BAD_LOGIN); try { localStorage.setItem(DEMO_SESSION_KEY, '1'); } catch (e) { /* ignore */ } emit(); },
    async signOut() { try { localStorage.removeItem(DEMO_SESSION_KEY); } catch (e) { /* ignore */ } emit(); },
    async unlock(p) { if (p !== password) fail('BAD_LOGIN', 'Incorrect password.'); },
    async changePassword(cur, next) { if (cur !== password) fail('BAD_LOGIN', 'Incorrect password.'); validatePassword(next); password = next; },
    async requestReset() {},
    async setupStatus() { return 'done'; },
    async setupOwner() { fail('DEMO', 'Setup is not available in demo mode.'); },
    async savePreferences() {},
  };
}
