import { Field, useId } from './Field.jsx';
import { Icon } from './Icon.jsx';

/**
 * Searchable single-select (UI_UX_GUIDELINES §5): type to filter, ↑/↓ to move, Enter to pick, Esc to close.
 * options: [{ value, label, detail?, disabled?, search? }]. renderOption(option) may return custom content.
 */
export function Combobox({ label, required, help, error, options, value, onChange, placeholder = 'Search…', emptyText = 'No matches', className, inputLabel, maxShown = 50 }) {
  const id = useId('cb');
  const listId = `${id}-list`;
  const selected = options.find((o) => o.value === value) || null;
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const wrap = React.useRef(null);
  const input = React.useRef(null);

  const q = query.trim().toLowerCase();
  const filtered = options.filter((o) => !q || (o.search || `${o.label} ${o.detail || ''}`).toLowerCase().includes(q)).slice(0, maxShown);

  React.useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  React.useEffect(() => { setActive(0); }, [query]);

  function pick(o) {
    if (!o || o.disabled) return;
    onChange(o.value, o);
    setOpen(false); setQuery('');
  }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open) { e.preventDefault(); pick(filtered[active]); } }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); setQuery(''); } }
  }
  React.useEffect(() => {
    if (!open || !wrap.current) return;
    const el = wrap.current.querySelector(`[data-index="${active}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  return (
    <Field label={label} required={required} help={help} error={error} id={id} className={className}>
      <div className={`combobox ${open ? 'is-open' : ''}`} ref={wrap}>
        <div className="input-wrap has-suffix">
          <input ref={input} id={id} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
            aria-label={label ? undefined : inputLabel} aria-invalid={!!error || undefined} autoComplete="off"
            aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
            value={open ? query : (selected ? selected.label : '')} placeholder={selected && open ? selected.label : placeholder}
            onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={onKey} />
          <span className="input-affix input-suffix"><Icon name={open ? 'search' : 'chevronDown'} size={16} /></span>
        </div>
        {open && (
          <ul className="combobox-list" role="listbox" id={listId}>
            {!filtered.length && <li className="combobox-empty">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li key={o.value} id={`${id}-opt-${i}`} data-index={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
                className={`combobox-option ${i === active ? 'is-active' : ''} ${o.disabled ? 'is-disabled' : ''}`}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
                <span className="combobox-label">{o.label}</span>
                {o.detail && <span className="combobox-detail">{o.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
