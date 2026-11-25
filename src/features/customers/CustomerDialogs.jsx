/* Customer form and alternate-contact dialogs (Phase 5). */
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Banner } from '../../components/Feedback.jsx';
import { TextField, SelectField, TextAreaField } from '../../components/Field.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOnline } from '../../app/useOnline.js';
import { actorOf, errorMessage } from '../../data/useData.js';
import { centavosToPlain } from '../../domain/money.js';
import { CUSTOMER_TYPES, validateCustomerForm, validateContactForm } from '../../domain/customers.js';
import { createCustomer, updateCustomer, saveContact } from '../../data/customerService.js';

const focusFirstError = (formEl) => setTimeout(() => { const el = formEl && formEl.querySelector('[aria-invalid="true"]'); if (el) el.focus(); }, 0);

function initialCustomer(c) {
  if (!c) return { name: '', type: 'Household', contactNumber: '', email: '', address: '', facebook: '', creditLimit: '', notes: '' };
  return {
    name: c.name, type: c.type || 'Other', contactNumber: c.contactNumber || '', email: c.email || '', address: c.address || '',
    facebook: c.facebook || '', creditLimit: c.creditLimitC == null ? '' : centavosToPlain(c.creditLimitC), notes: c.notes || '',
  };
}

export function CustomerFormDialog({ open, onClose, adapter, customer, customers = [], onSaved }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const isNew = !customer;
  const [form, setForm] = React.useState(() => initialCustomer(customer));
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const formRef = React.useRef(null);
  React.useEffect(() => { if (open) { setForm(initialCustomer(customer)); setErrors({}); setError(null); } }, [open, customer && customer.id]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };
  const sameName = form.name.trim() && customers.find((c) => c.nameLower === form.name.trim().toLowerCase() && (!customer || c.id !== customer.id));

  async function submit(e) {
    e.preventDefault();
    const { data, errors: errs } = validateCustomerForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) { focusFirstError(formRef.current); return; }
    setBusy(true); setError(null);
    try {
      const actor = actorOf(auth.user);
      if (isNew) { const id = await createCustomer(adapter, actor, data); toast({ message: `${data.name} added.` }); onSaved && onSaved(id); }
      else { await updateCustomer(adapter, actor, customer.id, data); toast({ message: 'Changes saved.' }); onSaved && onSaved(customer.id); }
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" title={isNew ? 'Add customer' : `Edit ${customer.name}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="customer-form" loading={busy} disabled={!online}>{isNew ? 'Add customer' : 'Save changes'}</Button></>}>
      <form id="customer-form" ref={formRef} onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="form-grid">
          <TextField label="Name" required value={form.name} onChange={set('name')} error={errors.name} data-autofocus placeholder="Person or business name" className="span-2" />
          <SelectField label="Customer type" required value={form.type} onChange={set('type')} error={errors.type} options={CUSTOMER_TYPES.map((t) => ({ value: t, label: t }))} />
          <TextField label="Contact number" required value={form.contactNumber} onChange={set('contactNumber')} error={errors.contactNumber} inputMode="tel" placeholder="0917 123 4567" help="Used for collection reminders." />
          <TextField label="Address" value={form.address} onChange={set('address')} className="span-2" />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
          <TextField label="Facebook" value={form.facebook} onChange={set('facebook')} placeholder="Profile name or link" />
          <TextField label="Credit limit" value={form.creditLimit} onChange={set('creditLimit')} error={errors.creditLimit} inputMode="decimal" prefix="₱" inputClassName="num"
            help="Optional. You are warned when unpaid balances would go over it." />
          <TextAreaField label="Notes" value={form.notes} onChange={set('notes')} rows={2} className="span-2" />
        </div>
        {sameName && <Banner tone="warning">Another customer is already named “{sameName.name}”. Check that this is not the same person.</Banner>}
      </form>
    </Dialog>
  );
}

const blankContact = { name: '', relationship: '', contactNumber: '', email: '', facebook: '', address: '', notes: '', isPrimary: false };

export function ContactDialog({ open, onClose, adapter, customer, contact }) {
  const auth = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [form, setForm] = React.useState(blankContact);
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const formRef = React.useRef(null);
  React.useEffect(() => { if (open) { setForm(contact ? { ...blankContact, ...contact } : { ...blankContact, isPrimary: !(customer.alternateContacts || []).length }); setErrors({}); setError(null); } }, [open]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  async function submit(e) {
    e.preventDefault();
    const { data, errors: errs } = validateContactForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) { focusFirstError(formRef.current); return; }
    setBusy(true); setError(null);
    try {
      await saveContact(adapter, actorOf(auth.user), customer.id, { ...data, id: contact ? contact.id : undefined });
      toast({ message: contact ? 'Contact saved.' : `${data.name} added as a contact.` });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title={contact ? `Edit contact ${contact.name}` : `Add contact for ${customer.name}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="contact-form" loading={busy} disabled={!online}>Save contact</Button></>}>
      <form id="contact-form" ref={formRef} onSubmit={submit} noValidate className="form-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <p className="muted">Someone who can be reached about this customer's account, e.g. a relative or neighbor. Not a customer.</p>
        <div className="form-grid">
          <TextField label="Name" required value={form.name} onChange={set('name')} error={errors.name} data-autofocus />
          <TextField label="Relationship" value={form.relationship} onChange={set('relationship')} placeholder="e.g. Son, Neighbor" />
          <TextField label="Contact number" value={form.contactNumber} onChange={set('contactNumber')} error={errors.contactNumber} inputMode="tel" />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
          <TextField label="Facebook" value={form.facebook} onChange={set('facebook')} />
          <TextField label="Address" value={form.address} onChange={set('address')} />
          <TextAreaField label="Notes" value={form.notes} onChange={set('notes')} rows={2} className="span-2" />
        </div>
        <label className="checkbox"><input type="checkbox" checked={form.isPrimary} onChange={set('isPrimary')} />Primary alternate contact</label>
      </form>
    </Dialog>
  );
}
