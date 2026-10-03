// Companion's service worker exists for Web Push only (notifications while
// the app is closed). The old cache-first offline shell was removed in S23:
// activate deletes any cache it left behind, and there is no fetch handler,
// so every load comes from the network.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key)
    await self.clients.claim()
  })())
})

// ---- Web Push (S13) ----
// Payloads are metadata only ("new message") — the app fetches the content
// itself when opened. See lib/push.ts.
self.addEventListener('push', (event) => {
  let data = { title: 'Companion', body: 'Something new from your coach.' }
  try { data = { ...data, ...event.data?.json() } } catch { /* keep defaults */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.svg',
      tag: 'companion-push',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins[0]
      if (existing) return existing.focus()
      return self.clients.openWindow('./#/coach')
    }),
  )
})
