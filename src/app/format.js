/* Display helpers for values that differ between adapters (Firestore Timestamp vs ISO string). */
export function toJsDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DT = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Nov 25, 2026, 3:04 PM" (Asia/Manila) */
export function formatDateTime(v) {
  const d = toJsDate(v);
  return d ? DT.format(d) : '—';
}

export const timeValue = (v) => { const d = toJsDate(v); return d ? d.getTime() : Number.MAX_SAFE_INTEGER; };
