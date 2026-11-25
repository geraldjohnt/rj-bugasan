/* Phase 1 foundation screen. Proves the file:// runtime; replaced by the real app shell in Phase 2. */
import { checkEnvironment } from './environment.js';
import { useOnline } from './useOnline.js';

const BADGE = { ok: ['badge-success', 'OK'], fail: ['badge-danger', 'Problem'], info: ['badge-neutral', 'Info'] };

export function App({ adapter }) {
  const online = useOnline();
  const [checks, setChecks] = React.useState(null);
  const [theme, setTheme] = React.useState('light');

  React.useEffect(() => { checkEnvironment(window).then(setChecks); }, []);
  React.useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  return (
    <div data-app-ready={checks ? 'true' : 'false'}>
      {adapter.kind === 'mock' && (
        <div className="banner banner-info">Demo data — Firebase is not configured. Nothing is saved to the cloud.</div>
      )}
      {!online && (
        <div className="banner banner-warning">Offline — viewing saved data. Changes are disabled until the connection returns.</div>
      )}
      <main className="foundation">
        <header className="foundation-header">
          <div>
            <h1>RJ Inventory &amp; Sales</h1>
            <p>Foundation build — Phase 1. Version {__APP_VERSION__} ({__BUILD_MODE__}).</p>
          </div>
          <button className="btn" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? 'Dark theme' : 'Light theme'}
          </button>
        </header>
        <section className="panel" aria-label="Environment checks">
          <div className="panel-header">Environment checks</div>
          <table className="check-table">
            <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {(checks || []).map((c) => (
                <tr key={c.name} data-check={c.name} data-status={c.status}>
                  <td>{c.name}</td>
                  <td><span className={`badge ${BADGE[c.status][0]}`}>{BADGE[c.status][1]}</span></td>
                  <td>{c.detail}</td>
                </tr>
              ))}
              <tr><td>Data adapter</td><td><span className="badge badge-neutral">Info</span></td><td>{adapter.kind === 'mock' ? 'Demo (local)' : 'Firebase Firestore'}</td></tr>
              <tr><td>Network</td><td><span className={`badge ${online ? 'badge-success' : 'badge-warning'}`}>{online ? 'Online' : 'Offline'}</span></td><td>{online ? 'Connected' : 'No connection'}</td></tr>
            </tbody>
          </table>
        </section>
        <p className="foot">This screen is temporary and will be replaced by the application shell in Phase 2.</p>
      </main>
    </div>
  );
}
