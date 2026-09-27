import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, CloudOff, RefreshCw, LogOut, KeyRound } from 'lucide-react'
import { Card, Button, Field, Input, SectionHeader, toast, toastError } from '@/design'
import { getSession, signOut, changePassword } from '@/lib/cloud/session'
import { getSyncStatus, onSyncStatus, syncNow, resetSyncState, type SyncStatus } from '@/lib/cloud/syncEngine'

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
    </div>
  )
}
