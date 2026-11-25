/*
 * Hash router (history.pushState is unreliable under file://). URLs look like index.html#/settings/appearance?x=1
 */
export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (replace) window.location.replace(target);
  else window.location.hash = path;
}

export function useLocation() {
  const [loc, setLoc] = React.useState(() => parseHash());
  React.useEffect(() => {
    const on = () => setLoc(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return loc;
}

/** Match "/settings/:tab" against "/settings/appearance" → { tab: 'appearance' } or null. */
export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, children, className = '', ...rest }) {
  return <a href={'#' + to} className={className} {...rest}>{children}</a>;
}
