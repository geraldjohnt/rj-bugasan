import { DEFAULT_SALES_SETTINGS } from '../domain/sales.js';
/* settings/general (DATA_DICTIONARY). */
export const DEFAULT_GENERAL = {
  businessName: 'RJ Bugasan', address: '', contactNumber: '', email: '',
  currency: 'PHP', timeZone: 'Asia/Manila', dateFormat: 'MMM D, YYYY', idleLockMinutes: 30,
};

export async function loadGeneralSettings(adapter) {
  try { return { ...DEFAULT_GENERAL, ...((await adapter.get('settings', 'general')) || {}) }; }
  catch (e) { return { ...DEFAULT_GENERAL }; }
}

export async function saveGeneralSettings(adapter, values, uid) {
  const { id, ...data } = values;
  await adapter.set('settings', 'general', { ...data, updatedAt: adapter.serverTime(), updatedBy: uid });
}

/* settings/sales (DATA_DICTIONARY): Sale ID prefix, installment defaults, reminder template, receipt footer. */
export { DEFAULT_SALES_SETTINGS };

export async function loadSalesSettings(adapter) {
  try { return { ...DEFAULT_SALES_SETTINGS, ...((await adapter.get('settings', 'sales')) || {}) }; }
  catch (e) { return { ...DEFAULT_SALES_SETTINGS }; }
}

export async function saveSalesSettings(adapter, values, uid) {
  const { id, ...data } = values;
  await adapter.set('settings', 'sales', { ...data, updatedAt: adapter.serverTime(), updatedBy: uid });
}
