import { checkEnvironment } from '../../app/environment.js';
import { PageHeader, Badge, DataTable } from '../../components/Feedback.jsx';
import { Link } from '../../app/router.jsx';

const TONE = { ok: ['success', 'OK'], fail: ['danger', 'Problem'], info: ['neutral', 'Info'] };

export function SystemChecks({ adapterKind }) {
  const [checks, setChecks] = React.useState(null);
  React.useEffect(() => { checkEnvironment(window).then(setChecks); }, []);
  if (!checks) return <p className="muted">Checking…</p>;
  const rows = [...checks, { name: 'Data source', status: 'info', detail: adapterKind === 'mock' ? 'Demo (this computer only)' : 'Firebase Firestore' }];
  return (
    <div data-system-checks="ready">
      <DataTable caption="System checks" rowKey="name" rows={rows} columns={[
        { key: 'name', header: 'Check', render: (r) => <span data-check={r.name} data-status={r.status}>{r.name}</span> },
        { key: 'status', header: 'Result', render: (r) => <Badge tone={TONE[r.status][0]}>{TONE[r.status][1]}</Badge> },
        { key: 'detail', header: 'Detail', render: (r) => <span className="muted" data-detail={r.name}>{r.detail}</span> },
      ]} />
    </div>
  );
}

/** Public page (no sign-in needed) so problems can be diagnosed even when login fails. */
export function SystemCheckPage({ adapterKind }) {
  return (
    <div className="standalone-page">
      <PageHeader title="System check" description={`Version ${__APP_VERSION__} (${__BUILD_MODE__})`} actions={<Link to="/login" className="btn btn-secondary btn-md"><span>Back to sign in</span></Link>} />
      <div className="panel"><SystemChecks adapterKind={adapterKind} /></div>
    </div>
  );
}
