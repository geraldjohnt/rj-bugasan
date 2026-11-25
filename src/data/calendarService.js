/*
 * Custom calendar events (Phase 9, RQ-035). Other calendar entries are derived from sales, installments and restocks.
 * Custom events may be edited and deleted (they are reminders, not business records); each change is logged.
 */
import { DomainError } from '../domain/errors.js';
import { formatDate } from '../domain/dates.js';
import { assertEvent } from '../domain/calendar.js';
import { logWrite } from './activityLog.js';
import { assertOnline } from './inventoryService.js';

const stamp = (adapter, actor) => ({ updatedAt: adapter.serverTime(), updatedBy: actor.uid });

/** data: output of validateEventForm. Returns the new id. */
export async function createEvent(adapter, actor, data) {
  assertOnline();
  assertEvent(data);
  const id = adapter.newId();
  return adapter.runTransaction(async (tx) => {
    tx.set('calendarEvents', id, {
      title: data.title, date: data.date, time: data.time || '', note: data.note || '', category: 'OTHER',
      createdAt: adapter.serverTime(), createdBy: actor.uid, ...stamp(adapter, actor),
    });
    logWrite(tx, adapter, actor, { action: 'EVENT_CREATE', entityType: 'calendarEvent', entityId: id, summary: `Added calendar event "${data.title}" on ${formatDate(data.date)}` });
    return id;
  });
}

export async function updateEvent(adapter, actor, id, data) {
  assertOnline();
  assertEvent(data);
  return adapter.runTransaction(async (tx) => {
    const s = await tx.get('calendarEvents', id);
    if (!s.exists) throw new DomainError('EVENT_MISSING', 'This event no longer exists.');
    tx.update('calendarEvents', id, { title: data.title, date: data.date, time: data.time || '', note: data.note || '', ...stamp(adapter, actor) });
    logWrite(tx, adapter, actor, { action: 'EVENT_UPDATE', entityType: 'calendarEvent', entityId: id, summary: `Edited calendar event "${data.title}" (${formatDate(data.date)})` });
  });
}

export async function deleteEvent(adapter, actor, id) {
  assertOnline();
  return adapter.runTransaction(async (tx) => {
    const s = await tx.get('calendarEvents', id);
    if (!s.exists) return;
    tx.delete('calendarEvents', id);
    logWrite(tx, adapter, actor, { action: 'EVENT_DELETE', entityType: 'calendarEvent', entityId: id, summary: `Deleted calendar event "${s.data.title}" of ${formatDate(s.data.date)}` });
  });
}
