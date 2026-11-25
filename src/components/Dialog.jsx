import { IconButton } from './Button.jsx';

/** Modal dialog with focus trap, Esc to close. size: sm | md | lg. Full-screen sheet on phones (CSS). */
export function Dialog({ open, title, onClose, size = 'md', children, footer, dismissible = true }) {
  const ref = React.useRef(null);
  const lastFocus = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    const first = el.querySelector('[data-autofocus]') || focusables()[0];
    if (first) first.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); onClose && onClose(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('keydown', onKey); if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus(); };
  }, [open]);

  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose && onClose(); }}>
      <div ref={ref} className={`dialog dialog-${size}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-header">
          <h2 id="dialog-title" className="dialog-title">{title}</h2>
          {dismissible && <IconButton icon="close" label="Close" size="sm" onClick={onClose} />}
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
