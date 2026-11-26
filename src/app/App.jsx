/*
 * Root component: providers, route guard (RQ-041), shell.
 * No page renders until Firebase Auth has reported the session state; unauthenticated users only see public pages.
 */
import { useLocation, navigate, matchPath } from './router.jsx';
import { activeNavItem } from './routes.js';
import { PrefsProvider, usePrefs } from './prefs.jsx';
import { Shell } from './Shell.jsx';
import { AuthProvider, useAuth } from '../auth/AuthContext.jsx';
import { LoginPage, SetupPage, LockScreen } from '../auth/AuthPages.jsx';
import { ToastProvider } from '../components/Toast.jsx';
import { Spinner } from '../components/Feedback.jsx';
import { PlannedPage, NotFoundPage } from '../features/placeholder/PlannedPage.jsx';
import { SettingsPage } from '../features/settings/SettingsPage.jsx';
import { SystemCheckPage } from '../features/system/SystemCheckPage.jsx';
import { UiReferencePage } from '../features/dev/UiReferencePage.jsx';
import { ItemsPage } from '../features/inventory/ItemsPage.jsx';
import { ItemDetailPage } from '../features/inventory/ItemDetailPage.jsx';
import { MovementsPage } from '../features/inventory/MovementsPage.jsx';
import { StockCountListPage, StockCountPage } from '../features/inventory/StockCountPages.jsx';
import { CustomersPage } from '../features/customers/CustomersPage.jsx';
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage.jsx';
import { NewSalePage } from '../features/sales/NewSalePage.jsx';
import { SalesPage } from '../features/sales/SalesPage.jsx';
import { SaleDetailPage } from '../features/sales/SaleDetailPage.jsx';
import { CollectionsPage } from '../features/sales/CollectionsPage.jsx';
import { SuppliersPage, SupplierDetailPage } from '../features/purchasing/SuppliersPage.jsx';
import { RestocksPage, RestockFormPage } from '../features/purchasing/RestocksPage.jsx';
import { RestockDetailPage } from '../features/purchasing/RestockDetailPage.jsx';
import { ExpensesPage } from '../features/purchasing/ExpensesPage.jsx';
import { ActivityLogPage } from '../features/system/ActivityLogPage.jsx';
import { BackupPage } from '../features/system/BackupPage.jsx';
import { OpeningBalancesPage } from '../features/sales/OpeningBalancesPage.jsx';
import { CalendarPage } from '../features/calendar/CalendarPage.jsx';
import { DashboardPage } from '../features/dashboard/DashboardPage.jsx';
import { ReportsPage } from '../features/reports/ReportsPage.jsx';
import { loadGeneralSettings, DEFAULT_GENERAL } from '../data/settingsRepo.js';

const PUBLIC = ['/login', '/setup', '/system-check'];

function Redirect({ to }) {
  React.useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}

function Splash() {
  return <div className="splash"><Spinner label="Starting" /></div>;
}

function Routes({ adapter, general, setGeneral }) {
  const { path, query } = useLocation();
  const auth = useAuth();
  const { adopt } = usePrefs();

  React.useEffect(() => {
    if (auth.status !== 'signedIn') return;
    if (auth.user.preferences) adopt(auth.user.preferences);
    loadGeneralSettings(adapter).then(setGeneral);
  }, [auth.status, auth.user && auth.user.uid]);

  const nav = activeNavItem(path);
  React.useEffect(() => {
    const t = path === '/settings' || path.startsWith('/settings/') ? 'Settings' : nav ? nav.label : path === '/login' ? 'Sign in' : null;
    document.title = (t ? t + ' · ' : '') + (general.businessName || 'RJ Inventory & Sales');
  }, [path, general.businessName]);

  if (auth.status === 'loading') return <Splash />;
  if (path === '/system-check') return <SystemCheckPage adapterKind={adapter.kind} />;

  if (auth.status === 'signedOut') {
    if (path === '/setup') return <SetupPage />;
    if (path !== '/login') return <Redirect to={'/login' + (path !== '/' ? '?next=' + encodeURIComponent(path) : '')} />;
    return <LoginPage next={query.next || '/'} />;
  }

  // Signed in
  if (PUBLIC.includes(path)) return <Redirect to={query.next || '/'} />;
  if (auth.locked) return <LockScreen />;

  let page;
  const settings = matchPath('/settings', path) ? {} : matchPath('/settings/:tab', path);
  if (settings) page = <SettingsPage tab={settings.tab} adapter={adapter} onGeneralSaved={setGeneral} />;
  else if (path === '/dev/ui' && __BUILD_MODE__ === 'development') page = <UiReferencePage />;
  else if (path === '/') page = <DashboardPage adapter={adapter} />;
  else if (path === '/reports' || matchPath('/reports/:tab', path)) page = <ReportsPage adapter={adapter} tab={(matchPath('/reports/:tab', path) || {}).tab} query={query} />;
  else if (path === '/items') page = <ItemsPage adapter={adapter} />;
  else if (matchPath('/items/:id', path)) { const { id } = matchPath('/items/:id', path); page = <ItemDetailPage key={id} adapter={adapter} id={id} />; }
  else if (path === '/movements') page = <MovementsPage adapter={adapter} />;
  else if (path === '/stock-count') page = <StockCountListPage adapter={adapter} />;
  else if (matchPath('/stock-count/:id', path)) { const { id } = matchPath('/stock-count/:id', path); page = <StockCountPage key={id} adapter={adapter} id={id} />; }
  else if (path === '/customers') page = <CustomersPage adapter={adapter} />;
  else if (matchPath('/customers/:id', path) || matchPath('/customers/:id/:tab', path)) {
    const { id, tab } = matchPath('/customers/:id', path) || matchPath('/customers/:id/:tab', path);
    page = <CustomerDetailPage key={id} adapter={adapter} id={id} tab={tab} />;
  }
  else if (path === '/sales/new') page = <NewSalePage key={query.customer || 'new'} adapter={adapter} />;
  else if (path === '/sales') page = <SalesPage adapter={adapter} />;
  else if (matchPath('/sales/:id', path)) { const { id } = matchPath('/sales/:id', path); page = <SaleDetailPage key={id} adapter={adapter} id={id} />; }
  else if (path === '/collections' || matchPath('/collections/:tab', path)) page = <CollectionsPage adapter={adapter} tab={(matchPath('/collections/:tab', path) || {}).tab} />;
  else if (path === '/suppliers') page = <SuppliersPage adapter={adapter} />;
  else if (matchPath('/suppliers/:id', path)) { const { id } = matchPath('/suppliers/:id', path); page = <SupplierDetailPage key={id} adapter={adapter} id={id} />; }
  else if (path === '/restocks') page = <RestocksPage adapter={adapter} />;
  else if (path === '/restocks/new') page = <RestockFormPage key={'new-' + (query.supplier || '')} adapter={adapter} supplierId={query.supplier} />;
  else if (matchPath('/restocks/:id/edit', path)) { const { id } = matchPath('/restocks/:id/edit', path); page = <RestockFormPage key={'edit-' + id} adapter={adapter} id={id} />; }
  else if (matchPath('/restocks/:id', path)) { const { id } = matchPath('/restocks/:id', path); page = <RestockDetailPage key={id} adapter={adapter} id={id} />; }
  else if (path === '/calendar' || matchPath('/calendar/:view', path)) page = <CalendarPage adapter={adapter} view={(matchPath('/calendar/:view', path) || {}).view} monthParam={query.m} />;
  else if (path === '/expenses') page = <ExpensesPage adapter={adapter} />;
  else if (path === '/activity') page = <ActivityLogPage adapter={adapter} />;
  else if (path === '/backup') page = <BackupPage adapter={adapter} />;
  else if (path === '/opening-balances') page = <OpeningBalancesPage adapter={adapter} />;
  else if (nav && (nav.path === path)) page = <PlannedPage item={nav} />;
  else page = <NotFoundPage />;

  return <Shell path={path} demo={adapter.kind === 'mock'} businessName={general.businessName}>{page}</Shell>;
}

export function App({ adapter, authService }) {
  const [general, setGeneral] = React.useState(DEFAULT_GENERAL);
  const persistPrefs = React.useCallback((p) => authService.savePreferences(p), [authService]);
  return (
    <ToastProvider>
      <PrefsProvider onPersist={persistPrefs}>
        <AuthProvider service={authService} idleMinutes={general.idleLockMinutes || 30}>
          <ReadyMarker />
          <Routes adapter={adapter} general={general} setGeneral={setGeneral} />
        </AuthProvider>
      </PrefsProvider>
    </ToastProvider>
  );
}

/** Marks the document once the session state is known (used by the smoke and E2E tests). */
function ReadyMarker() {
  const auth = useAuth();
  React.useEffect(() => { document.documentElement.setAttribute('data-app-ready', auth.status === 'loading' ? 'false' : 'true'); }, [auth.status]);
  return null;
}
