import { Icon } from './Icon.jsx';

/** variant: primary | secondary | ghost | danger; size: sm | md | lg */
export function Button({ variant = 'secondary', size = 'md', icon, loading = false, disabled, children, className = '', type = 'button', ...rest }) {
  return (
    <button type={type} className={`btn btn-${variant} btn-${size} ${loading ? 'is-loading' : ''} ${className}`}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children && <span>{children}</span>}
    </button>
  );
}

/** Icon-only button: label is required (tooltip + screen readers). */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', className = '', ...rest }) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} btn-icon ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : 18} />
    </button>
  );
}
