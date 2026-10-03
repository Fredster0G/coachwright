import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, CloudOff, RefreshCw, LogOut, KeyRound, Trash2 } from 'lucide-react'
import { Card, Button, Dialog, Field, Input, SectionHeader, toast, toastError } from '@/design'
import { getSession, signOut, changePassword, deleteAccount } from '@/lib/cloud/session'
import { getSyncStatus, onSyncStatus, syncNow, resetSyncState, eraseThisDevice, type SyncStatus } from '@/lib/cloud/syncEngine'
import { exportBackup, downloadText } from '@/db/backup'
import { useTranslation } from '@/lib/i18n'

function describe(s: SyncStatus, t: ReturnType<typeof useTranslation>['t']): string {
  switch (s.phase) {
    case 'syncing': return t('account.status.syncing')
    case 'offline': return t('account.status.offline')
    case 'error': return t('account.status.error', { error: s.error ?? t('account.status.unknownError') })
    case 'signed-out': return t('account.status.signedOut')
    default: return s.lastSyncAt ? t('account.status.upToDateAt', { time: new Date(s.lastSyncAt).toLocaleTimeString() }) : t('account.status.upToDate')
  }
}

/** Account, sync status and membership in one place. */
export default function AccountPage() {
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus)
  const session = getSession()
  const [pw, setPw] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation()

  useEffect(() => { void syncNow() }, [])

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await changePassword(pw.current, pw.next)
      setPw({ current: '', next: '' })
      toast(t('account.passwordChanged'))
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('account.passwordFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function doSignOut() {
    if (status.pending > 0 && !window.confirm(t('account.confirmSignOut', { count: status.pending }))) return
    await signOut()
    resetSyncState()
  }

  const offline = status.phase === 'offline' || status.phase === 'error'

  return (
    <div className="max-w-2xl space-y-4">
      <SectionHeader title={t('account.title')} />

      <Card>
        <div className="flex items-start gap-3">
          {offline ? <CloudOff size={18} className="mt-0.5 text-ember-600" /> : <Cloud size={18} className="mt-0.5 text-verde-600" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{session?.email}</p>
            <p className="mt-0.5 text-xs text-muted">{describe(status, t)}</p>
            {status.pending > 0 && <p className="mt-0.5 text-xs text-faint">{t('account.pending', { count: status.pending })}</p>}
            {!!status.refusedClients && (
              <p className="mt-1 text-xs text-ember-600" role="status">
                {t('account.refused', { count: status.refusedClients })}
              </p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => void syncNow()} disabled={status.phase === 'syncing'}>
            <RefreshCw size={13} className={status.phase === 'syncing' ? 'animate-spin' : ''} /> {t('account.syncNow')}
          </Button>
        </div>
        <p className="mt-3 text-2xs text-faint">
          {t('account.syncHint')}
        </p>
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-2">
          <KeyRound size={15} className="text-muted" />
          <p className="text-sm font-semibold text-ink">{t('account.changePassword')}</p>
        </div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={savePassword}>
          <Field label={t('account.currentPassword')}>
            <Input type="password" required value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label={t('auth.newPassword')} hint={t('auth.min8')}>
            <Input type="password" required minLength={8} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </Field>
          <div className="sm:col-span-2">
            <Button size="sm" type="submit" disabled={busy}>{t('account.changePassword')}</Button>
          </div>
        </form>
      </Card>

      <Button variant="ghost" onClick={doSignOut}><LogOut size={14} className="me-1.5" /> {t('account.signOut')}</Button>

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
  const { t } = useTranslation()

  async function backup() {
    try {
      const { filename, text } = await exportBackup()
      downloadText(filename, text)
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('auth.backupFailed'))
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
      toastError(err instanceof Error ? err.message : t('account.delete.failed'))
      setBusy(false)
    }
  }

  function close() { setOpen(false); setPassword(''); setConfirm('') }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Trash2 size={15} className="text-ember-600" />
        <p className="text-sm font-semibold text-ember-600">{t('account.delete.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        {t('account.delete.body')}
      </p>
      <Button size="sm" variant="ghost" className="text-ember-600 hover:bg-ember-500/10 hover:text-ember-600" onClick={() => setOpen(true)}>
        {t('account.delete.open')}
      </Button>

      <Dialog open={open} onClose={close} title={t('account.delete.dialogTitle')}>
        <p className="text-sm text-muted">
          {t('account.delete.dialogBody')}
        </p>
        <Button size="sm" className="mt-3" onClick={backup}>{t('account.delete.backup')}</Button>
        <div className="mt-4 space-y-3">
          <Field label={t('account.delete.password')}>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={t('account.delete.typeDelete')}>
            <Input value={confirm} onChange={e => setConfirm(e.target.value)} spellCheck={false} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>{t('account.delete.cancel')}</Button>
          <Button variant="destructive" onClick={erase}
            disabled={busy || !password || confirm !== 'DELETE'}>
            {busy ? t('account.delete.deleting') : t('account.delete.go')}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
