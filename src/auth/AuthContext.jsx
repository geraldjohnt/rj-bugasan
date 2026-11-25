/*
 * Auth state + idle lock (RQ-041, BR-091).
 * The idle lock is a convenience lock for an unattended screen: it records the last activity time so that
 * reopening the app after the idle period also starts locked. Real security remains Firebase Auth + rules.
 */
const AuthContext = React.createContext(null);
export const useAuth = () => React.useContext(AuthContext);

const LAST_ACTIVITY_KEY = 'rj-ims-last-activity';
const LOCKED_KEY = 'rj-ims-locked';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

export function AuthProvider({ service, idleMinutes = 30, children }) {
  const [state, setState] = React.useState({ status: 'loading', user: null, message: null });
  const [locked, setLocked] = React.useState(false);

  React.useEffect(() => service.onChange((user, message) => {
    if (user) {
      const last = Number(ls.get(LAST_ACTIVITY_KEY) || 0);
      const expired = last && Date.now() - last > idleMinutes * 60000;
      setLocked(ls.get(LOCKED_KEY) === '1' || !!expired);
      ls.set(LAST_ACTIVITY_KEY, String(Date.now()));
    } else { setLocked(false); ls.del(LOCKED_KEY); }
    setState({ status: user ? 'signedIn' : 'signedOut', user, message: message || null });
  }), [service]);

  // Idle tracking
  React.useEffect(() => {
    if (state.status !== 'signedIn' || locked) return undefined;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      ls.set(LAST_ACTIVITY_KEY, String(last));
      if (Date.now() - last > idleMinutes * 60000) { ls.set(LOCKED_KEY, '1'); setLocked(true); }
    }, 15000);
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); clearInterval(timer); };
  }, [state.status, locked, idleMinutes]);

  const value = React.useMemo(() => ({
    ...state,
    locked,
    service,
    signIn: (u, p) => service.signIn(u, p),
    signOut: async () => { ls.del(LOCKED_KEY); await service.signOut(); },
    lock: () => { ls.set(LOCKED_KEY, '1'); setLocked(true); },
    unlock: async (p) => { await service.unlock(p); ls.del(LOCKED_KEY); ls.set(LAST_ACTIVITY_KEY, String(Date.now())); setLocked(false); },
  }), [state, locked, service]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
