import { NAV, activeNavItem } from './routes.js';
import { Link } from './router.jsx';
import { Icon } from '../components/Icon.jsx';
import { IconButton } from '../components/Button.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePrefs } from './prefs.jsx';
import { useOnline } from './useOnline.js';
import { ChangePasswordDialog } from '../auth/AuthPages.jsx';
import { useToast } from '../components/Toast.jsx';

function Sidebar({ path, collapsed, onNavigate }) {
  const active = activeNavItem(path);
  return (
    <nav className="sidebar-nav" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.group} className="nav-group">
          <div className="nav-group-label">{g.group}</div>
          {g.items.map((item) => (
            <Link key={item.path} to={item.path} onClick={onNavigate}
              className={`nav-item ${active && active.path === item.path ? 'is-active' : ''}`}
              aria-current={active && active.path === item.path ? 'page' : undefined}
              title={collapsed ? item.label : undefined}>
              <Icon name={item.icon} size={18} /><span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const auth = useAuth();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pwOpen, setPwOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const initials = (auth.user.displayName || auth.user.username || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="user-name">{auth.user.displayName}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header"><div className="menu-title">{auth.user.displayName}</div><div className="menu-sub">@{auth.user.username} · Owner</div></div>
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); setPwOpen(true); }}><Icon name="key" size={16} />Change password</button>
          <a role="menuitem" className="menu-item" href="guide.html" target="_blank" rel="noopener" onClick={() => setOpen(false)}><Icon name="info" size={16} />User guide</a>
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); auth.lock(); }}><Icon name="lock" size={16} />Lock screen</button>
          <button role="menuitem" className="menu-item" onClick={() => auth.signOut()}><Icon name="logout" size={16} />Sign out</button>
        </div>
      )}
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} onDone={() => toast({ message: 'Password changed.' })} />
    </div>
  );
}

export function Shell({ path, demo, children }) {
  const { prefs, update } = usePrefs();
  const online = useOnline();
  const [drawer, setDrawer] = React.useState(false);
  const collapsed = prefs.sidebarCollapsed;
  React.useEffect(() => { setDrawer(false); }, [path]);
  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''} ${drawer ? 'drawer-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">RJ</span>
          <span className="brand-name">RJ Inventory &amp; Sales</span>
        </div>
        <Sidebar path={path} collapsed={collapsed} onNavigate={() => setDrawer(false)} />
      </aside>
      <div className="drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      <div className="main">
        <header className="topbar">
          <IconButton icon="menu" label="Open menu" className="menu-toggle" onClick={() => setDrawer(true)} />
          <IconButton icon={collapsed ? 'expand' : 'collapse'} label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => update({ sidebarCollapsed: !collapsed })} className="collapse-toggle" />
          <div className="topbar-spacer" />
          <span className={`net-status ${online ? 'is-online' : 'is-offline'}`} role="status">
            <Icon name={online ? 'online' : 'offline'} size={16} />{online ? 'Online' : 'Offline'}
          </span>
          <UserMenu />
        </header>
        {demo && <div className="app-banner app-banner-info" role="status"><Icon name="info" size={16} />Demo data — Firebase is not configured. Nothing is saved to the cloud.</div>}
        {!online && <div className="app-banner app-banner-warning" role="alert"><Icon name="offline" size={16} />Offline — viewing saved data. Changes are disabled until the connection returns.</div>}
        <main className="content" id="main">{children}</main>
      </div>
    </div>
  );
}
