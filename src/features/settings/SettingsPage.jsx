import { PageHeader, Panel, Tabs, Banner } from '../../components/Feedback.jsx';
import { TextField, Segmented, SelectField } from '../../components/Field.jsx';
import { Button } from '../../components/Button.jsx';
import { useToast } from '../../components/Toast.jsx';
import { navigate } from '../../app/router.jsx';
import { usePrefs, PALETTES } from '../../app/prefs.jsx';
import { useOnline } from '../../app/useOnline.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ChangePasswordDialog } from '../../auth/AuthPages.jsx';
import { SystemChecks } from '../system/SystemCheckPage.jsx';
import { loadGeneralSettings, saveGeneralSettings } from '../../data/settingsRepo.js';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'appearance', label: 'Appearance' },
  { value: 'account', label: 'Account' },
  { value: 'system', label: 'System' },
];

export function SettingsPage({ tab = 'general', adapter, onGeneralSaved }) {
  const current = TABS.some((t) => t.value === tab) ? tab : 'general';
  return (
    <div className="page">
      <PageHeader title="Settings" description="Business details, appearance and your account." />
      <Tabs label="Settings sections" tabs={TABS} value={current} onChange={(v) => navigate('/settings/' + v, { replace: true })} />
      <div className="tab-panel">
        {current === 'general' && <GeneralSettings adapter={adapter} onSaved={onGeneralSaved} />}
        {current === 'appearance' && <AppearanceSettings />}
        {current === 'account' && <AccountSettings />}
        {current === 'system' && <Panel title="System check" flush><SystemChecks adapterKind={adapter.kind} /></Panel>}
      </div>
    </div>
  );
}

function GeneralSettings({ adapter, onSaved }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [values, setValues] = React.useState(null);
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { loadGeneralSettings(adapter).then(setValues); }, [adapter]);
  if (!values) return <p className="muted">Loading…</p>;
  const set = (k) => (e) => { setValues({ ...values, [k]: e.target.value }); if (errors[k]) setErrors({ ...errors, [k]: undefined }); };

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!values.businessName.trim()) errs.businessName = 'Required.';
    const idle = Number(values.idleLockMinutes);
    if (!Number.isInteger(idle) || idle < 1 || idle > 480) errs.idleLockMinutes = 'Enter 1 to 480 minutes.';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try {
      const clean = { ...values, businessName: values.businessName.trim(), idleLockMinutes: idle };
      await saveGeneralSettings(adapter, clean, auth.user.uid);
      onSaved && onSaved(clean);
      toast({ message: 'Settings saved.' });
    } catch (err) { setError('Could not save. Check your connection and try again.'); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Panel title="Business" actions={<Button type="submit" variant="primary" loading={busy} disabled={!online}>Save changes</Button>}>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="form-grid">
          <TextField label="Business name" required value={values.businessName} onChange={set('businessName')} error={errors.businessName} help="Shown on receipts and reports." />
          <TextField label="Contact number" value={values.contactNumber} onChange={set('contactNumber')} inputMode="tel" />
          <TextField label="Address" value={values.address} onChange={set('address')} className="span-2" />
          <TextField label="Email" type="email" value={values.email} onChange={set('email')} />
          <TextField label="Lock screen after" value={String(values.idleLockMinutes)} onChange={set('idleLockMinutes')} error={errors.idleLockMinutes}
            inputMode="numeric" suffix="minutes" help="Asks for the password after this much inactivity." />
          <SelectField label="Currency" value={values.currency} onChange={set('currency')} options={[{ value: 'PHP', label: 'Philippine Peso (₱)' }]} disabled />
          <SelectField label="Time zone" value={values.timeZone} onChange={set('timeZone')} options={[{ value: 'Asia/Manila', label: 'Asia/Manila (PHT, UTC+8)' }]} disabled />
        </div>
      </Panel>
    </form>
  );
}

function AppearanceSettings() {
  const { prefs, update } = usePrefs();
  return (
    <Panel title="Appearance">
      <p className="muted panel-intro">These preferences are saved for your account and apply on every device you sign in to.</p>
      <div className="form-stack narrow">
        <Segmented label="Theme" value={prefs.theme} onChange={(theme) => update({ theme })} options={[
          { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'system', label: 'Match system', icon: 'system' }]} />
        <div className="field">
          <div className="field-label" id="palette-label">Color palette</div>
          <div className="palette-grid" role="radiogroup" aria-labelledby="palette-label">
            {PALETTES.map((p) => (
              <label key={p.value} className={`palette-option ${prefs.palette === p.value ? 'is-selected' : ''}`}>
                <input type="radio" name="palette" value={p.value} checked={prefs.palette === p.value} onChange={() => update({ palette: p.value })} />
                <span className="swatch" style={{ background: p.swatch }} aria-hidden="true" />{p.label}
              </label>
            ))}
          </div>
        </div>
        <Segmented label="Density" value={prefs.density} onChange={(density) => update({ density })} options={[
          { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        <Segmented label="Sidebar" value={prefs.sidebarCollapsed ? 'collapsed' : 'expanded'} onChange={(v) => update({ sidebarCollapsed: v === 'collapsed' })} options={[
          { value: 'expanded', label: 'Show labels' }, { value: 'collapsed', label: 'Icons only' }]} />
      </div>
    </Panel>
  );
}

function AccountSettings() {
  const auth = useAuth();
  const toast = useToast();
  const [pwOpen, setPwOpen] = React.useState(false);
  return (
    <Panel title="Your account">
      <dl className="detail-list">
        <div><dt>Name</dt><dd>{auth.user.displayName}</dd></div>
        <div><dt>Username</dt><dd>{auth.user.username}</dd></div>
        <div><dt>Role</dt><dd>Owner</dd></div>
        <div><dt>Recovery email</dt><dd>{auth.user.email}</dd></div>
      </dl>
      <div className="button-row">
        <Button icon="key" onClick={() => setPwOpen(true)}>Change password</Button>
        <Button icon="logout" onClick={() => auth.signOut()}>Sign out</Button>
      </div>
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} onDone={() => toast({ message: 'Password changed.' })} />
    </Panel>
  );
}
