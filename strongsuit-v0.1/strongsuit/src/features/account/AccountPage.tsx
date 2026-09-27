import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, CloudOff, RefreshCw, LogOut, KeyRound, Trash2 } from 'lucide-react'
import { Card, Button, Dialog, Field, Input, SectionHeader, toast, toastError } from '@/design'
import { getSession, signOut, changePassword, deleteAccount } from '@/lib/cloud/session'
import { getSyncStatus, onSyncStatus, syncNow, resetSyncState, eraseThisDevice, type SyncStatus } from '@/lib/cloud/syncEngine'
import { exportBackup, downloadText } from '@/db/backup'

function describe(s: SyncStatus): string {
  switch (s.phase) {
    case 'syncing': return 'Syncing…'
    case 'offline': return 'Offline — changes are saved on this device and will upload when you reconnect.'
    case 'error': return `Sync problem: ${s.error ?? 'unknown error'}`
    case 'signed-out': return 'Signed out.'
    default: return s.lastSyncAt ? `Up to date · last synced ${new Date(s.lastSyncAt).toLocaleTimeString()}` : 'Up to date'
  }
}

/** Account, sync status and membership in one place. */
export default function AccountPage() {
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus)
  const session = getSession()
  const [pw, setPw] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => { void syncNow() }, [])

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await changePassword(pw.current, pw.next)
      setPw({ current: '', next: '' })
      toast('Password changed. Other devices have been signed out.')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  async function doSignOut() {
    if (status.pending > 0 && !window.confirm(`${status.pending} change(s) haven't uploaded yet. Sign out anyway? They stay on this device and upload next time you sign in to this account.`)) return
    await signOut()
    resetSyncState()
  }

  const offline = status.phase === 'offline' || status.phase === 'error'

  return (
    <div className="max-w-2xl space-y-4">
      <SectionHeader title="Account & sync" />

      <Card>
        <div className="flex items-start gap-3">
          {offline ? <CloudOff size={18} className="mt-0.5 text-ember-600" /> : <Cloud size={18} className="mt-0.5 text-verde-600" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{session?.email}</p>
            <p className="mt-0.5 text-xs text-muted">{describe(status)}</p>
            {status.pending > 0 && <p className="mt-0.5 text-xs text-faint">{status.pending} change(s) waiting to upload</p>}
            {!!status.refusedClients && (
              <p className="mt-1 text-xs text-ember-600" role="status">
                {status.refusedClients} active client(s) weren’t saved to your account: Free covers 3 active clients.
                Archive a client or start a Membership (Settings) and they’ll upload automatically.
              </p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => void syncNow()} disabled={status.phase === 'syncing'}>
            <RefreshCw size={13} className={status.phase === 'syncing' ? 'animate-spin' : ''} /> Sync now
          </Button>
        </div>
        <p className="mt-3 text-2xs text-faint">
          Everything syncs automatically to every device you sign in on, and to the web app. Clients connect
          through Companion from their client page.
        </p>
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-2">
          <KeyRound size={15} className="text-muted" />
          <p className="text-sm font-semibold text-ink">Change password</p>
        </div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={savePassword}>
          <Field label="Current password">
            <Input type="password" required value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" required minLength={8} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </Field>
          <div className="sm:col-span-2">
            <Button size="sm" type="submit" disabled={busy}>Change password</Button>
          </div>
        </form>
      </Card>

      <Button variant="ghost" onClick={doSignOut}><LogOut size={14} className="me-1.5" /> Sign out</Button>

      <DeleteAccountCard />
    </div>
  )
}

/** Erase the account on the server and this device's copy. The only way
 *  back is a backup, so one is offered right here, and the coach has to type
 *  their password and DELETE. */
function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function backup() {
    try {
      const { filename, text } = await exportBackup()
      downloadText(filename, text)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Backup failed.')
    }
  }

  async function erase() {
    setBusy(true)
    try {
      await deleteAccount(password)
      await eraseThisDevice()
      window.location.hash = '#/'
      window.location.reload()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not delete the account.')
      setBusy(false)
    }
  }

  function close() { setOpen(false); setPassword(''); setConfirm('') }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Trash2 size={15} className="text-ember-600" />
        <p className="text-sm font-semibold text-ember-600">Delete account</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Permanently erases your account and everything in it — clients, programs, logs, messages, photos —
        from Coachwright Cloud and from this device, cancels any Membership, and disconnects your clients’
        Companion apps. Other devices are signed out and lose access. This can’t be undone.
      </p>
      <Button size="sm" variant="ghost" className="text-ember-600 hover:bg-ember-500/10 hover:text-ember-600" onClick={() => setOpen(true)}>
        Delete my account…
      </Button>

      <Dialog open={open} onClose={close} title="Delete your account?">
        <p className="text-sm text-muted">
          Everything is erased for good. If you might ever want any of it, download a backup first — it restores
          into a new account.
        </p>
        <Button size="sm" className="mt-3" onClick={backup}>Download a backup</Button>
        <div className="mt-4 space-y-3">
          <Field label="Your password">
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="Type DELETE to confirm">
            <Input value={confirm} onChange={e => setConfirm(e.target.value)} spellCheck={false} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={erase}
            disabled={busy || !password || confirm !== 'DELETE'}>
            {busy ? 'Deleting…' : 'Delete everything'}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
