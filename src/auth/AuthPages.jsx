import { Button } from '../components/Button.jsx';
import { TextField, PasswordField } from '../components/Field.jsx';
import { Banner } from '../components/Feedback.jsx';
import { Icon } from '../components/Icon.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { useAuth } from './AuthContext.jsx';
import { DEMO_CREDENTIALS, friendlyAuthError, MIN_PASSWORD } from './authService.js';
import { navigate, Link } from '../app/router.jsx';
import { useOnline } from '../app/useOnline.js';

function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand"><span className="brand-mark" aria-hidden="true">RJ</span><span>RJ Inventory &amp; Sales</span></div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </div>
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  );
}

export function LoginPage({ next = '/' }) {
  const auth = useAuth();
  const online = useOnline();
  const [form, setForm] = React.useState({ username: '', password: '' });
  const [error, setError] = React.useState(auth.message);
  const [busy, setBusy] = React.useState(false);
  const [setup, setSetup] = React.useState(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const isDemo = auth.service.kind === 'demo';

  React.useEffect(() => {
    if (!online || isDemo) return;
    auth.service.setupStatus().then(setSetup).catch(() => setSetup(null));
  }, [online]);

  async function submit(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try { await auth.signIn(form.username, form.password); navigate(next, { replace: true }); }
    catch (err) { setError(friendlyAuthError(err)); setBusy(false); }
  }

  return (
    <AuthCard title="Sign in" subtitle="Enter your username and password."
      footer={<><Link to="/system-check">System check</Link><span aria-hidden="true">·</span><span>v{__APP_VERSION__}</span></>}>
      {isDemo && <Banner tone="info">Demo mode — sign in with <b>{DEMO_CREDENTIALS.username}</b> / <b>{DEMO_CREDENTIALS.password}</b>. Data stays on this computer only.</Banner>}
      {!online && <Banner tone="warning">No internet connection. Signing in needs internet.</Banner>}
      {setup === 'needed' && <Banner tone="info" action={<Button size="sm" variant="primary" onClick={() => navigate('/setup')}>Set up</Button>}>No owner account yet. Set up the owner account first.</Banner>}
      {setup === 'rules-missing' && <Banner tone="danger">The database rules are not installed yet. Publish <code>firebase/firestore.rules</code> in the Firebase console (FIREBASE_SETUP.md), then reload.</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}
      <form className="form-stack" onSubmit={submit} noValidate>
        <TextField label="Username" autoComplete="username" autoCapitalize="none" spellCheck="false" value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })} required autoFocus />
        <PasswordField label="Password" autoComplete="current-password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!online || !form.username || !form.password}>Sign in</Button>
      </form>
      {!isDemo && <button type="button" className="link-button" onClick={() => setResetOpen(true)}>Forgot password?</button>}
      <ResetPasswordDialog open={resetOpen} onClose={() => setResetOpen(false)} defaultUsername={form.username} />
    </AuthCard>
  );
}

function ResetPasswordDialog({ open, onClose, defaultUsername }) {
  const auth = useAuth();
  const [username, setUsername] = React.useState(defaultUsername);
  const [state, setState] = React.useState({ busy: false, done: false, error: null });
  React.useEffect(() => { if (open) { setUsername(defaultUsername); setState({ busy: false, done: false, error: null }); } }, [open]);
  async function send(e) {
    e.preventDefault();
    setState({ busy: true, done: false, error: null });
    try { await auth.service.requestReset(username); setState({ busy: false, done: true, error: null }); }
    catch (err) { setState({ busy: false, done: false, error: friendlyAuthError(err) }); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Reset password" size="sm"
      footer={state.done ? <Button variant="primary" onClick={onClose}>Done</Button> : <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="reset-form" loading={state.busy} disabled={!username}>Send reset link</Button></>}>
      {state.done
        ? <p>If that username exists, a reset link was sent to its recovery email. Open the link, set a new password, then sign in here.</p>
        : <form id="reset-form" className="form-stack" onSubmit={send}>
            <p className="muted">A reset link will be sent to the recovery email linked to this username.</p>
            {state.error && <Banner tone="danger">{state.error}</Banner>}
            <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" data-autofocus />
          </form>}
    </Dialog>
  );
}

export function SetupPage() {
  const auth = useAuth();
  const online = useOnline();
  const [status, setStatus] = React.useState('checking');
  const [form, setForm] = React.useState({ displayName: '', username: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { auth.service.setupStatus().then(setStatus).catch((e) => { setStatus('error'); setError(friendlyAuthError(e)); }); }, []);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); if (errors[k]) setErrors({ ...errors, [k]: undefined }); };
  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.username.trim()) errs.username = 'Required.';
    if (!form.email.trim()) errs.email = 'Required.';
    if (form.password.length < MIN_PASSWORD) errs.password = `At least ${MIN_PASSWORD} characters.`;
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try { await auth.service.setupOwner(form); navigate('/', { replace: true }); }
    catch (err) { setError(friendlyAuthError(err)); setBusy(false); }
  }

  if (status === 'checking') return <AuthCard title="First-time setup"><p className="muted">Checking…</p></AuthCard>;
  if (status === 'done') return <AuthCard title="Setup complete" subtitle="The owner account already exists."><Button variant="primary" onClick={() => navigate('/login')}>Go to sign in</Button></AuthCard>;
  return (
    <AuthCard title="Create the owner account" subtitle="This is done once. The owner has full access to the system.">
      {status === 'rules-missing' && <Banner tone="danger">Publish <code>firebase/firestore.rules</code> in the Firebase console first, then reload this page.</Banner>}
      {!online && <Banner tone="warning">Setup needs an internet connection.</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}
      <form className="form-stack" onSubmit={submit} noValidate>
        <TextField label="Your name" value={form.displayName} onChange={set('displayName')} autoComplete="name" />
        <TextField label="Username" required value={form.username} onChange={set('username')} error={errors.username} autoCapitalize="none"
          help="Used to sign in. Lowercase letters, numbers, dot, dash or underscore. Pick one that is not easy to guess." />
        <TextField label="Recovery email" type="email" required value={form.email} onChange={set('email')} error={errors.email} autoComplete="email"
          help="Password reset links are sent here. It is never shown on the sign-in screen." />
        <PasswordField label="Password" required value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" help={`At least ${MIN_PASSWORD} characters.`} />
        <PasswordField label="Confirm password" required value={form.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!online || status !== 'needed'}>Create owner account</Button>
      </form>
      <Link to="/login" className="link-button">Back to sign in</Link>
    </AuthCard>
  );
}

export function LockScreen() {
  const auth = useAuth();
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await auth.unlock(password); } catch (err) { setError(friendlyAuthError(err)); setBusy(false); setPassword(''); }
  }
  return (
    <div className="auth-screen lock-screen">
      <div className="auth-card">
        <div className="lock-icon"><Icon name="lock" size={22} /></div>
        <h1 className="auth-title">Locked</h1>
        <p className="auth-subtitle">Signed in as <b>{auth.user.displayName}</b>. Enter your password to continue.</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <form className="form-stack" onSubmit={submit}>
          <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!password}>Unlock</Button>
        </form>
        <button type="button" className="link-button" onClick={() => auth.signOut()}>Sign out instead</button>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({ open, onClose, onDone }) {
  const auth = useAuth();
  const [f, setF] = React.useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setF({ current: '', next: '', confirm: '' }); setErrors({}); setError(null); setBusy(false); } }, [open]);
  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!f.current) errs.current = 'Required.';
    if (f.next.length < MIN_PASSWORD) errs.next = `At least ${MIN_PASSWORD} characters.`;
    else if (f.next === f.current) errs.next = 'Choose a password different from the current one.';
    if (f.confirm !== f.next) errs.confirm = 'Passwords do not match.';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    try { await auth.service.changePassword(f.current, f.next); onDone && onDone(); onClose(); }
    catch (err) { setError(friendlyAuthError(err)); setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Change password" size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="pw-form" loading={busy}>Change password</Button></>}>
      <form id="pw-form" className="form-stack" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <PasswordField label="Current password" value={f.current} onChange={(e) => { setF({ ...f, current: e.target.value }); setErrors({ ...errors, current: undefined }); }} error={errors.current} autoComplete="current-password" data-autofocus />
        <PasswordField label="New password" value={f.next} onChange={(e) => { setF({ ...f, next: e.target.value }); setErrors({ ...errors, next: undefined }); }} error={errors.next} autoComplete="new-password" help={`At least ${MIN_PASSWORD} characters.`} />
        <PasswordField label="Confirm new password" value={f.confirm} onChange={(e) => { setF({ ...f, confirm: e.target.value }); setErrors({ ...errors, confirm: undefined }); }} error={errors.confirm} autoComplete="new-password" />
      </form>
    </Dialog>
  );
}
