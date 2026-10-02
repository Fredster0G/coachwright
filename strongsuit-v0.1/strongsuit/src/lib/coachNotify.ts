// ===== System notifications for the coach =====
//
// Companion replies and booking requests arrive with a sync, and nothing used
// to tell the coach — they found them by opening the client. With this on,
// each sync that brings new client messages raises ONE system notification
// (desktop app and website alike, while it's open). Device-local and opt-in:
// it's a property of this computer, not the account.
//
// "New" is tracked by message id, not timestamp: a client's phone can queue a
// message offline and deliver it with an older createdAt than our last check.

import type { CoachMessage } from '@/db/types'

const ENABLED_KEY = 'cw.notify.enabled'
const SEEN_KEY = 'cw.notify.seen'
const MAX_SEEN = 2000

export interface Arrival { title: string; body: string; clientId: string }

/** Inbound messages not seen before, oldest first. */
export function unseenInbound(messages: readonly CoachMessage[], seen: ReadonlySet<string>): CoachMessage[] {
  return messages
    .filter(m => m.direction === 'inbound' && !seen.has(m.id))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** One notification for a batch: booking requests called out, names listed. */
export function summarize(arrivals: readonly CoachMessage[], nameOf: (clientId: string) => string): Arrival | null {
  if (!arrivals.length) return null
  const names = [...new Set(arrivals.map(m => nameOf(m.clientId)))]
  const who = names.length <= 2 ? names.join(' and ') : `${names[0]}, ${names[1]} and ${names.length - 2} more`
  const requests = arrivals.filter(m => m.booking && !m.booking.status).length
  const last = arrivals[arrivals.length - 1]
  if (arrivals.length === 1) {
    return requests
      ? { title: `Session request from ${who}`, body: last.content, clientId: last.clientId }
      : { title: `Message from ${who}`, body: last.content.slice(0, 140), clientId: last.clientId }
  }
  const title = requests
    ? `${arrivals.length} new from ${who} (${requests} session request${requests === 1 ? '' : 's'})`
    : `${arrivals.length} new messages from ${who}`
  return { title, body: last.content.slice(0, 140), clientId: last.clientId }
}

// ---- device-local state (localStorage; every access guarded) ----

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v) as T } catch { return fallback }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode etc. */ }
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window
export const notificationsEnabled = (): boolean => notificationsSupported() && read<boolean>(ENABLED_KEY, false) && Notification.permission === 'granted'

/** Turn on (asks the OS/browser) or off. Turning on marks everything already
 *  here as seen, so the first sync doesn't announce months of history. */
export async function setNotificationsEnabled(on: boolean, existing: readonly CoachMessage[]): Promise<boolean> {
  if (!on) { write(ENABLED_KEY, false); return false }
  if (!notificationsSupported()) return false
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') { write(ENABLED_KEY, false); return false }
  write(SEEN_KEY, existing.map(m => m.id).slice(-MAX_SEEN))
  write(ENABLED_KEY, true)
  return true
}

/** Called after each sync. Records what's been seen even when off, so
 *  switching on later starts from "now". Returns the notification shown. */
export function notifyArrivals(messages: readonly CoachMessage[], nameOf: (clientId: string) => string, open: (clientId: string) => void): Arrival | null {
  const seenList = read<string[]>(SEEN_KEY, [])
  const seen = new Set(seenList)
  const fresh = unseenInbound(messages, seen)
  if (!fresh.length) return null
  write(SEEN_KEY, [...seenList, ...fresh.map(m => m.id)].slice(-MAX_SEEN))
  if (!notificationsEnabled()) return null
  const a = summarize(fresh, nameOf)
  if (!a) return null
  try {
    const n = new Notification(a.title, { body: a.body, tag: 'coachwright-messages' })
    n.onclick = () => { window.focus(); open(a.clientId); n.close() }
  } catch { /* some platforms only allow notifications from a service worker */ }
  return a
}
