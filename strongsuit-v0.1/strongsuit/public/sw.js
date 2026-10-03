// Retired offline cache (S23). Coachwright is a cloud app now; the old
// cache-first worker is what made "reload twice after an update" necessary.
// Browsers that still have it registered fetch this file on their next
// update check: it deletes every cache, unregisters itself, and reloads open
// tabs onto the network-served app. Nothing registers a worker any more.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key)
    await self.registration.unregister()
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
  })())
})
