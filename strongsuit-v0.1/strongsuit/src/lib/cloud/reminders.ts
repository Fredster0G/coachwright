// Coach-scheduled reminders, released to a client's Companion app the next
// time it checks in after `sendAt` (sync-server `/reminders`).

import { api } from './session'

export interface UpcomingReminder { id: string; clientId: string; content: string; sendAt: string }

/** `id` makes the call idempotent (same id = same reminder, updated) — used
 *  by the welcome sequence so a retry can't schedule a step twice. */
export async function scheduleReminder(clientId: string, content: string, sendAt: Date, id?: string): Promise<string> {
  const r = await api<{ id: string }>('/reminders', { method: 'POST', json: { id, clientId, content, sendAt: sendAt.toISOString() } })
  return r.id
}

export async function listUpcomingReminders(clientId: string): Promise<UpcomingReminder[]> {
  return (await api<{ reminders: UpcomingReminder[] }>(`/reminders?clientId=${encodeURIComponent(clientId)}`)).reminders
}

export async function cancelReminder(id: string): Promise<void> {
  await api(`/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
