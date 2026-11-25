import { Icon } from './Icon.jsx';

let seq = 0;
export function useId(prefix = 'f') { const ref = React.useRef(null); if (!ref.current) ref.current = `${prefix}-${++seq}`; return ref.current; }

/** Label above, helper/error below (UI_UX_GUIDELINES §5). */
export function Field({ label, required, help, error, id, children, className = '' }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <label className="field-label" htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>}
      {children}
      {error ? <div className="field-error" id={`${id}-err`} role="alert"><Icon name="error" size={14} />{error}</div>
        : help ? <div className="field-help" id={`${id}-help`}>{help}</div> : null}
    </div>
  );
}

export const TextField = React.forwardRef(function TextField({ label, required, help, error, className, prefix, suffix, inputClassName = '', ...rest }, ref) {
  const id = useId();
  const describedBy = error ? `${id}-err` : help ? `${id}-help` : undefined;
  return (
    <Field label={label} required={required} help={help} error={error} id={id} className={className}>
      <div className={`input-wrap ${prefix ? 'has-prefix' : ''} ${suffix ? 'has-suffix' : ''}`}>
        {prefix && <span className="input-affix input-prefix">{prefix}</span>}
        <input ref={ref} id={id} className={`input ${inputClassName}`} aria-invalid={!!error || undefined} aria-describedby={describedBy} required={required} {...rest} />
        {suffix && <span className="input-affix input-suffix">{suffix}</span>}
      </div>
    </Field>
  );
});

export function PasswordField(props) {
  const [show, setShow] = React.useState(false);
  return (
    <TextField {...props} type={show ? 'text' : 'password'}
      suffix={<button type="button" className="input-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={16} /></button>} />
  );
}

export function SelectField({ label, required, help, error, options, className, ...rest }) {
  const id = useId();
  return (
    <Field label={label} required={required} help={help} error={error} id={id} className={className}>
      <div className="select-wrap">
        <select id={id} className="input select" aria-invalid={!!error || undefined} {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Icon name="chevronDown" size={16} className="select-caret" />
      </div>
    </Field>
  );
}

export function TextAreaField({ label, required, help, error, className, ...rest }) {
  const id = useId();
  return (
    <Field label={label} required={required} help={help} error={error} id={id} className={className}>
      <textarea id={id} className="input textarea" aria-invalid={!!error || undefined} {...rest} />
    </Field>
  );
}

/** Segmented choice (radio group styled as buttons). */
export function Segmented({ label, value, onChange, options, name }) {
  const id = useId('seg');
  return (
    <div className="field">
      {label && <div className="field-label" id={id}>{label}</div>}
      <div className="segmented" role="radiogroup" aria-labelledby={label ? id : undefined}>
        {options.map((o) => (
          <label key={o.value} className={`segmented-option ${value === o.value ? 'is-selected' : ''}`}>
            <input type="radio" name={name || id} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.icon && <Icon name={o.icon} size={16} />}<span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
