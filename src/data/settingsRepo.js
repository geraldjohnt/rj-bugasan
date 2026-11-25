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
