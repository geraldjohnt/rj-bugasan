/*
 * Backup and restore (Phase 11, RQ-042, BR-094, D-044).
 * Download: one JSON file with every business record. Reminder when the last backup is older than 7 days.
 * Restore (owner only): choose a file, check what it contains, type RESTORE, then the database is made equal to it.
 */
import { PageHeader, Panel, Banner, EmptyState, DataTable } from '../../components/Feedback.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { TextField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useOnline } from '../../app/useOnline.js';
import { navigate } from '../../app/router.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDoc, actorOf, errorMessage } from '../../data/useData.js';
import { exportBackup, restoreBackup } from '../../data/backupService.js';
import { parseBackup, backupAge, backupIsDue, backupFileName, COLLECTION_LABELS, BACKUP_COLLECTIONS, RESTORE_WORD, BACKUP_REMINDER_DAYS } from '../../domain/backup.js';
import { formatDateTime } from '../../app/format.js';
import { useBusiness } from '../sales/Print.jsx';

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Banner for the dashboard and the Backup page (BR-094). Renders nothing while loading or when a backup is recent. */
export function BackupReminder({ adapter, showAction = true }) {
  const auth = useAuth();
  const { doc } = useDoc(adapter, 'settings', 'backup');
  if (doc === undefined || !auth.user || auth.user.role !== 'owner') return null;
  const age = backupAge(doc && doc.lastBackupAt);
  if (!backupIsDue(age)) return null;
  return (
    <Banner tone="warning" action={showAction ? <Button size="sm" icon="backup" onClick={() => navigate('/backup')}>Back up now</Button> : null}>
      {age === null ? 'No backup has been downloaded yet.' : `The last backup is ${age} days old.`} Download a backup at least every {BACKUP_REMINDER_DAYS} days and keep it somewhere safe (USB drive, email to yourself).
    </Banner>
  );
}

function RestoreDialog({ open, onClose, adapter, file }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [word, setWord] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  React.useEffect(() => { if (open) { setWord(''); setError(null); setProgress(null); } }, [open]);
  async function submit(e) {
    e.preventDefault();
    if (word.trim() !== RESTORE_WORD) { setError(`Type ${RESTORE_WORD} in capital letters to confirm.`); return; }
    setBusy(true); setError(null);
    try {
      const r = await restoreBackup(adapter, { ...actorOf(auth.user), role: auth.user.role }, file.backup, word, { onProgress: setProgress });
      toast({ message: `Backup restored: ${r.written} records written, ${r.deleted} removed.` });
      onClose(true);
    } catch (x) { setError(errorMessage(x)); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={() => !busy && onClose(false)} dismissible={!busy} title="Restore this backup?"
      footer={<><Button onClick={() => onClose(false)} disabled={busy}>Cancel</Button><Button variant="danger" type="submit" form="restore-form" loading={busy} disabled={!online}>Restore backup</Button></>}>
      <form id="restore-form" onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <p>All current records will be <strong>replaced</strong> by the {file ? file.total : 0} records in this backup
          {file && file.exportedAt ? <> from <strong>{formatDateTime(file.exportedAt)}</strong></> : null}. Anything entered after that time will be lost.</p>
        <p className="muted">User accounts and the owner sign-in are not changed. Download a backup of the current data first if you might need it.</p>
        {progress && <p role="status">Restoring… {progress.done} of {progress.total} ({progress.col})</p>}
        <TextField label={`Type ${RESTORE_WORD} to confirm`} required value={word} onChange={(e) => { setWord(e.target.value); setError(null); }} autoComplete="off" data-autofocus disabled={busy} />
      </form>
    </Dialog>
  );
}

export function BackupPage({ adapter }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const business = useBusiness(adapter);
  const isOwner = auth.user && auth.user.role === 'owner';
  const { doc: last } = useDoc(adapter, 'settings', 'backup');
  const { doc: restore } = useDoc(adapter, 'settings', 'restore');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [file, setFile] = React.useState(null);
  const [fileError, setFileError] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);
  const inputRef = React.useRef(null);

  if (!isOwner) return <div className="page stack"><PageHeader title="Backup" /><Panel><EmptyState icon="lock" title="Only the owner can back up and restore" /></Panel></div>;

  async function download() {
    setBusy(true); setError(null);
    try {
      const b = await exportBackup(adapter, actorOf(auth.user));
      const name = backupFileName(b.exportedAt, business.general && business.general.businessName);
      downloadJson(name, b);
      const total = Object.values(b.counts).reduce((x, y) => x + y, 0);
      toast({ message: `Backup downloaded: ${name} (${total} records).` });
    } catch (x) { setError(errorMessage(x)); }
    setBusy(false);
  }
  async function pick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    setFile(null); setFileError(null);
    if (!f) return;
    try { setFile({ name: f.name, ...parseBackup(await f.text()) }); }
    catch (x) { setFileError(errorMessage(x)); }
  }
  const age = backupAge(last && last.lastBackupAt);
  const countRows = file ? BACKUP_COLLECTIONS.filter((c) => file.counts[c]).map((c) => ({ id: c, label: COLLECTION_LABELS[c], n: file.counts[c] })) : [];

  return (
    <div className="page stack">
      <PageHeader title="Backup" description="Download a copy of all your records to a file, and restore it if something goes wrong." />
      {restore && restore.active && <Banner tone="danger">A restore started {formatDateTime(restore.startedAt)} did not finish. The data may be incomplete. Choose the same backup file and restore it again.</Banner>}
      <BackupReminder adapter={adapter} showAction={false} />
      {error && <Banner tone="danger">{error}</Banner>}

      <Panel title="Download a backup" actions={<Button variant="primary" icon="download" onClick={download} loading={busy} disabled={!online}>Download backup</Button>}>
        <p>Saves every item, movement, customer, sale, installment, payment, restock, supplier, expense, reminder, setting and activity-log entry in one file (JSON). Keep it on a USB drive or email it to yourself.</p>
        <p className="muted">{last && last.lastBackupAt
          ? <>Last backup: <strong>{formatDateTime(last.lastBackupAt)}</strong> ({age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}){last.lastBackupRecords ? `, ${last.lastBackupRecords} records` : ''}{last.lastBackupByName ? ` by ${last.lastBackupByName}` : ''}.</>
          : 'No backup has been downloaded yet.'}</p>
      </Panel>

      <Panel title="Restore from a backup">
        <div className="form-stack">
          <Banner tone="warning">Restoring replaces <strong>all</strong> current records with the ones in the file. Use it only to recover from a mistake or after moving to a new database.</Banner>
          <div className="button-row">
            <input ref={inputRef} type="file" accept=".json,application/json" onChange={pick} className="sr-only" id="backup-file" aria-label="Choose backup file" />
            <Button icon="restore" onClick={() => inputRef.current && inputRef.current.click()} disabled={!online}>Choose backup file…</Button>
            {file && <span className="muted">{file.name}</span>}
          </div>
          {fileError && <Banner tone="danger">{fileError}</Banner>}
          {file && (
            <>
              <p>Backup from <strong>{file.exportedAt ? formatDateTime(file.exportedAt) : 'an unknown date'}</strong>{file.backup.exportedBy ? ` by ${file.backup.exportedBy}` : ''}: {file.total} records.</p>
              <DataTable caption="Records in the backup" columns={[{ key: 'label', header: 'Records' }, { key: 'n', header: 'Count', align: 'right', render: (r) => r.n }]} rows={countRows} />
              <div><Button variant="danger" icon="restore" onClick={() => setConfirming(true)} disabled={!online}>Restore this backup…</Button></div>
            </>
          )}
        </div>
      </Panel>
      <RestoreDialog open={confirming} file={file} adapter={adapter} onClose={(done) => { setConfirming(false); if (done) setFile(null); }} />
    </div>
  );
}
