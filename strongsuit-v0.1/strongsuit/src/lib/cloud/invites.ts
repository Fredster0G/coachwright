// Connecting a client's Companion app: the coach creates a one-time code, the
// client types it into Companion. The server turns it into a token that can
// only read this client's program/messages and add its own logs.

import { api } from './session'
import { syncNow } from './syncEngine'

export async function createInvite(clientId: string): Promise<{ code: string; expiresAt: string }> {
  // The server only issues codes for clients it has seen — make sure a
  // just-created client has been uploaded first.
  await syncNow()
  return api<{ code: string; expiresAt: string }>('/invites', { method: 'POST', json: { clientId } })
}

export async function disconnectClient(clientId: string): Promise<void> {
  await api(`/invites/${encodeURIComponent(clientId)}`, { method: 'DELETE' })
}
