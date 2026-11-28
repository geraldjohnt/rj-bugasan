/*
 * Price poster dialog (D-047): choose items and wording, preview, and download a PNG for a Facebook post.
 * Cash price = item price; Payday option = item payday price (D-046). Items without stock are crossed out (or hidden).
 */
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Banner } from '../../components/Feedback.jsx';
import { TextField, Segmented } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { loadGeneralSettings } from '../../data/settingsRepo.js';
import { today } from '../../domain/dates.js';
import { defaultPosterSelection, posterRows } from '../../domain/poster.js';
import { drawPoster, loadPosterFonts, posterBlob, downloadBlob } from './pricePoster.js';

const PREFS_KEY = 'rj.poster.text';
const DEFAULT_TEXT = { tagline: 'Bugas karon, bayad inig sweldo.', paydayTag: 'Max 1 month', contact: '' };

function readPrefs() {
  try { return { ...DEFAULT_TEXT, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch (e) { return { ...DEFAULT_TEXT }; }
}
function writePrefs(v) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch (e) { /* per-browser convenience only */ } }

export function PricePosterDialog({ open, onClose, adapter, items }) {
  const toast = useToast();
  const active = React.useMemo(() => items.filter((i) => i.status === 'ACTIVE'), [items]);
  const [selected, setSelected] = React.useState(() => new Set(defaultPosterSelection(items)));
  const [hideOut, setHideOut] = React.useState('STRIKE');
  const [date, setDate] = React.useState(today());
  const [text, setText] = React.useState(readPrefs);
  const [general, setGeneral] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set(defaultPosterSelection(items))); setDate(today()); setError(null);
    loadGeneralSettings(adapter).then((g) => {
      setGeneral(g);
      setText((t) => (t.contact ? t : { ...t, contact: g.contactNumber || '' }));
    });
  }, [open]);

  const rows = posterRows(items, { selectedIds: [...selected], hideOutOfStock: hideOut === 'HIDE' });
  const opts = { businessName: (general && general.businessName) || 'RJ Bugasan', date, tagline: text.tagline.trim(), paydayTag: text.paydayTag.trim(), contact: text.contact.trim() };
  const key = JSON.stringify([rows, opts]);

  // Redraw the preview when anything changes (debounced so typing stays smooth).
  React.useEffect(() => {
    if (!open || !general) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      await loadPosterFonts();
      if (cancelled) return;
      try {
        const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
        drawPoster(canvas, rows, opts);
        setPreview(canvas.toDataURL('image/png'));
      } catch (e) { setError('Could not draw the poster in this browser.'); }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, general, key]);

  const setT = (k) => (e) => setText((t) => { const v = { ...t, [k]: e.target.value }; writePrefs(v); return v; });
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pick = (fn) => setSelected(new Set(active.filter(fn).map((i) => i.id)));

  async function download() {
    setBusy(true); setError(null);
    try {
      await loadPosterFonts();
      const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
      drawPoster(canvas, rows, opts);
      downloadBlob(await posterBlob(canvas), `price-update-${date}.png`);
      toast({ message: 'Poster downloaded. Post it on Facebook from your Downloads folder.' });
    } catch (e) { setError(e.message || 'Could not create the image.'); }
    setBusy(false);
  }

  const soldOut = rows.filter((r) => r.soldOut).length;
  return (
    <Dialog open={open} onClose={onClose} size="xl" title="Price poster"
      footer={<>
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" icon="download" onClick={download} loading={busy} disabled={!rows.length}>Download image</Button>
      </>}>
      <div className="poster-layout">
        <div className="form-stack poster-options">
          {error && <Banner tone="danger">{error}</Banner>}
          <p className="muted">Cash price and credit price come from each item. Set the credit price in the item's Edit form.</p>
          <TextField label="Date on poster" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Segmented label="Items with no stock" value={hideOut} onChange={setHideOut} options={[{ value: 'STRIKE', label: 'Cross out' }, { value: 'HIDE', label: 'Leave out' }]} />
          <div className="field">
            <div className="field-label">Items on the poster</div>
            <div className="button-row">
              <Button size="sm" onClick={() => pick((i) => i.unit === 'SACK')}>Sacks</Button>
              <Button size="sm" onClick={() => pick(() => true)}>All</Button>
              <Button size="sm" onClick={() => pick(() => false)}>None</Button>
            </div>
            <div className="poster-items" role="group" aria-label="Items on the poster">
              {active.map((i) => (
                <label key={i.id} className="checkbox">
                  <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                  <span>{i.name}{i.qtyH <= 0 && <span className="muted"> · no stock</span>}</span>
                </label>
              ))}
              {!active.length && <span className="muted">No active items.</span>}
            </div>
          </div>
          <TextField label="Tagline" value={text.tagline} onChange={setT('tagline')} />
          <TextField label="Credit note" value={text.paydayTag} onChange={setT('paydayTag')} help="Small tag on the Credit price panel, e.g. Max 1 month." />
          <TextField label="Contact line" value={text.contact} onChange={setT('contact')} help="Shown under “Message us now”. Leave empty to hide." />
        </div>
        <div className="poster-preview" aria-live="polite">
          {preview
            ? <img src={preview} alt={`Price poster preview: ${rows.length} item(s)${soldOut ? `, ${soldOut} crossed out` : ''}`} />
            : <div className="muted">Drawing preview…</div>}
          <p className="muted">{rows.length} item(s) on the poster{soldOut ? ` · ${soldOut} with no stock crossed out` : ''}</p>
        </div>
      </div>
    </Dialog>
  );
}
