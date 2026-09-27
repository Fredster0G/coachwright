// ===== Web Push — notifications while the app is CLOSED =====
// This is the honest answer to "background notifications without battery
// drain": the OS keeps exactly one shared push socket for every app on the
// device; we ride it instead of polling. Requires the platform to support
// Web Push for installed PWAs — Android/desktop broadly yes; iOS only when
// added to the Home Screen on iOS 16.4+. See CLIENT_APP_STRATEGY.md §9.
//
// Privacy: the push payload is metadata only ("new message"), never content.
// The app fetches the message itself on open — the push service
// (FCM/APNs/Mozilla) never sees anything worth reading.

import { profileRepo } from '@/db/repo'
import { clientApi } from '@/lib/cloud'
import type { CoachLink } from '@/db/types'

function b64ToUint8(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
}

/** Ask permission, subscribe with the cloud's VAPID key, and register the
 *  subscription for this coach connection. Returns a human-readable status. */
export async function enablePush(link: CoachLink): Promise<string> {
  if (!pushSupported()) return "This browser can't receive push — install the app to your home screen and try again."

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'Notifications stay off until you allow them.'

  try {
    const { publicKey } = await clientApi<{ publicKey: string }>('/client/push/vapid', link.token)
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(publicKey) as BufferSource,
    })
    await clientApi('/client/push/subscribe', link.token, { json: { subscription: sub.toJSON() } })
  } catch {
    return "Couldn't turn on notifications right now — try again later. In-app alerts still work."
  }
  await profileRepo.patch({ notifyEnabled: true })
  return 'On — you\'ll hear about new coach messages even with the app closed.'
}

export async function disablePush(link: CoachLink | undefined): Promise<void> {
  await profileRepo.patch({ notifyEnabled: false })
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    if (link) await clientApi('/client/push/unsubscribe', link.token, { json: { endpoint: sub.endpoint } }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
}
