import { Icon } from './Icon.jsx';

const TONE_ICON = { info: 'info', success: 'check', warning: 'warning', danger: 'error' };

/** Status badge: always text, never color alone. tone: neutral | success | info | warning | danger */
export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Banner({ tone = 'info', children, action }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon name={TONE_ICON[tone]} size={16} /><div className="banner-body">{children}</div>{action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} size={22} /></div>
      <div className="empty-title">{title}</div>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <header className="page-header">
      <div><h1 className="page-title">{title}</h1>{description && <p className="page-desc">{description}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, flush = false }) {
  return (
    <section className="panel">
      {(title || actions) && <div className="panel-header"><h2 className="panel-title">{title}</h2>{actions}</div>}
      <div className={flush ? '' : 'panel-body'}>{children}</div>
    </section>
  );
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'is-active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Simple data table. columns: [{ key, header, align: 'left'|'right', render(row), className }]
 * footer: optional array of cells (same length as columns) for a totals row.
 */
export function DataTable({ columns, rows, rowKey = 'id', empty, caption, footer, rowClassName }) {
  if (!rows.length && empty) return empty;
  const cls = (c) => [c.align === 'right' ? 'num-col num' : '', c.className || ''].join(' ').trim() || undefined;
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'num-col' : undefined} scope="col">{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[rowKey]} className={rowClassName ? rowClassName(r) : undefined}>{columns.map((c) => <td key={c.key} className={cls(c)}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
        {footer && <tfoot><tr>{columns.map((c, i) => <td key={c.key} className={cls(c)}>{footer[i]}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

/** Skeleton rows while a list loads. */
export function LoadingRows({ label = 'Loading' }) {
  return (
    <div className="loading-rows" role="status" aria-label={label}>
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton-row" />)}
    </div>
  );
}
