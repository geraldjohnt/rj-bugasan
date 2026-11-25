/*
 * Appearance preferences (per user). Cached in localStorage so the theme applies before first paint
 * (see the inline script in index.html), and synced to users/{uid}.preferences when signed in.
 */
export const PREFS_KEY = 'rj-ims-prefs';
export const DEFAULT_PREFS = { theme: 'light', palette: 'navy', density: 'comfortable', sidebarCollapsed: false };
export const PALETTES = [
  { value: 'navy', label: 'Navy', swatch: '#1F3B60' },
  { value: 'forest', label: 'Forest', swatch: '#23563F' },
  { value: 'graphite', label: 'Graphite', swatch: '#3A4452' },
  { value: 'burgundy', label: 'Burgundy', swatch: '#6B2537' },
  { value: 'teal', label: 'Teal', swatch: '#155B63' },
];

export function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY)) || {}) }; } catch (e) { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } }

export function resolveTheme(theme) {
  if (theme !== 'system') return theme;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyPrefs(p) {
  const r = document.documentElement;
  r.setAttribute('data-theme', resolveTheme(p.theme));
  r.setAttribute('data-palette', p.palette);
  r.setAttribute('data-density', p.density);
}

const PrefsContext = React.createContext(null);
export const usePrefs = () => React.useContext(PrefsContext);

export function PrefsProvider({ children, onPersist }) {
  const [prefs, setPrefs] = React.useState(loadPrefs);
  React.useEffect(() => { applyPrefs(prefs); savePrefs(prefs); }, [prefs]);
  React.useEffect(() => {
    if (prefs.theme !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyPrefs(prefs);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [prefs]);
  const update = React.useCallback((patch) => {
    setPrefs((p) => { const next = { ...p, ...patch }; if (onPersist) onPersist(next); return next; });
  }, [onPersist]);
  /** Replace with preferences loaded from the user profile (after sign-in). */
  const adopt = React.useCallback((remote) => { if (remote) setPrefs((p) => ({ ...p, ...remote })); }, []);
  return <PrefsContext.Provider value={{ prefs, update, adopt }}>{children}</PrefsContext.Provider>;
}
