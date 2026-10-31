// ===== Battery-safe background-ish sync =====
// Doctrine (docs/CLIENT_APP_STRATEGY.md §9): sync is EVENT-driven, never
// timer-driven. We sync when the app opens, when it returns to the
// foreground, and when the network comes back — and never more than once
// per THROTTLE window. There is deliberately NO setInterval anywhere in
// this file: a hidden tab/PWA does zero work, holds no sockets, and costs
// zero battery. Notifications for a CLOSED app are Web Push's job
// (lib/push.ts) — the OS's single shared push channel, not our polling.

import { coachLinkRepo, profileRepo } from '@/db/repo'
import { syncNow } from '@/features/sync/companionSyncApi'

const THROTTLE_MS = 15 * 60 * 1000 // at most one auto-sync per 15 minutes
let lastRun = 0
let running = false
let wired = false

export type AutoSyncResult = { pulled: number; programs: number; reminders: number }
type Notify = (r: AutoSyncResult) => void

async function runOnce(notify?: Notify) {
  if (running || Date.now() - lastRun < THROTTLE_MS) return
  const link = await coachLinkRepo.get()
  if (!link) return
  running = true
  try {
    const r = await syncNow(link)
    lastRun = Date.now()
    if ((r.pulled || r.programs || r.reminders) && notify) notify(r)
  } catch {
    // Offline or server unreachable — fine, we'll try again on the next
    // foreground/online event. Never surface an error for a background sync.
  } finally {
    running = false
  }
}

/** Show a system notification for background-arrived items, if the person
 *  has granted permission — otherwise stay silent (the UI shows the new
 *  items anyway next time they look). */
async function systemNotify(r: AutoSyncResult) {
  const profile = await profileRepo.get()
  if (!profile?.notifyEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const parts: string[] = []
  if (r.pulled) parts.push(`${r.pulled} new message${r.pulled === 1 ? '' : 's'}`)
  if (r.programs) parts.push('program updated')
  if (r.reminders) parts.push(`${r.reminders} reminder${r.reminders === 1 ? '' : 's'}`)
  const reg = await navigator.serviceWorker?.getRegistration()
  const opts = { body: parts.join(' · '), icon: './icon-192.svg', tag: 'companion-sync' }
  if (reg) reg.showNotification('From your coach', opts)
  else new Notification('From your coach', opts)
}

/** Call once at app boot. Idempotent. */
export function initAutoSync() {
  if (wired) return
  wired = true
  runOnce(systemNotify)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runOnce(systemNotify)
  })
  window.addEventListener('online', () => runOnce(systemNotify))
}
