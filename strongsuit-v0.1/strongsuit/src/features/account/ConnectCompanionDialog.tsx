import { useState } from 'react'
import { Dialog, Button, toast, toastError } from '@/design'
import { createInvite, disconnectClient } from '@/lib/cloud/invites'

/** One-time code the client types into Companion. Codes expire after a week
 *  and work once; disconnecting signs out every Companion for this client. */
export function ConnectCompanionDialog({ clientId, clientName, open, onClose }: {
  clientId: string; clientName: string; open: boolean; onClose: () => void
}) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function generate() {
    setBusy(true)
    try { setInvite(await createInvite(clientId)) }
    catch (e) { toastError(e instanceof Error ? e.message : 'Could not create a code.') }
    finally { setBusy(false) }
  }

  async function disconnect() {
    setBusy(true)
    try { await disconnectClient(clientId); setInvite(null); toast(`${clientName} is disconnected from Companion.`) }
    catch (e) { toastError(e instanceof Error ? e.message : 'Could not disconnect.') }
    finally { setBusy(false) }
  }

  const pretty = invite ? `${invite.code.slice(0, 4)}-${invite.code.slice(4)}` : ''

  return (
    <Dialog open={open} onClose={() => { setInvite(null); onClose() }} title="Connect Companion">
      <p className="text-sm text-muted">
        {clientName} gets their program, messages and reminders in the free Companion app, and their logged
        sessions come back to you automatically.
      </p>
      {invite ? (
        <div className="my-5 text-center">
          <p className="font-mono text-3xl font-semibold tracking-widest text-ink" aria-label={`Code ${invite.code.split('').join(' ')}`}>{pretty}</p>
          <p className="mt-2 text-xs text-faint">
            Enter this in Companion → Connect to coach. Works once, until {new Date(invite.expiresAt).toLocaleDateString()}.
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => { navigator.clipboard?.writeText(invite.code).then(() => toast('Copied.')).catch(() => {}) }}>
            Copy code
          </Button>
        </div>
      ) : (
        <div className="my-5">
          <Button variant="primary" onClick={generate} disabled={busy}>{busy ? 'Creating…' : 'Create connect code'}</Button>
        </div>
      )}
      <div className="border-t border-line pt-3">
        <button type="button" className="text-xs text-faint hover:text-signal-600 disabled:opacity-50" onClick={disconnect} disabled={busy}>
          Disconnect {clientName}’s Companion
        </button>
      </div>
    </Dialog>
  )
}
