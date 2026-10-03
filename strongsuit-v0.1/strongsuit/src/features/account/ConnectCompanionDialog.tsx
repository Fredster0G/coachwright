import { useState } from 'react'
import { Dialog, Button, toast, toastError } from '@/design'
import { createInvite, disconnectClient } from '@/lib/cloud/invites'
import { useTranslation } from '@/lib/i18n'

/** One-time code the client types into Companion. Codes expire after a week
 *  and work once; disconnecting signs out every Companion for this client. */
export function ConnectCompanionDialog({ clientId, clientName, open, onClose }: {
  clientId: string; clientName: string; open: boolean; onClose: () => void
}) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation()

  async function generate() {
    setBusy(true)
    try { setInvite(await createInvite(clientId)) }
    catch (e) { toastError(e instanceof Error ? e.message : t('connect.createFailed')) }
    finally { setBusy(false) }
  }

  async function disconnect() {
    if (!window.confirm(t('connect.confirmDisconnect', { name: clientName }))) return
    setBusy(true)
    try { await disconnectClient(clientId); setInvite(null); toast(t('connect.disconnected', { name: clientName })) }
    catch (e) { toastError(e instanceof Error ? e.message : t('connect.disconnectFailed')) }
    finally { setBusy(false) }
  }

  const pretty = invite ? `${invite.code.slice(0, 4)}-${invite.code.slice(4)}` : ''

  return (
    <Dialog open={open} onClose={() => { setInvite(null); onClose() }} title={t('connect.title')}>
      <p className="text-sm text-muted">
        {t('connect.body', { name: clientName })}
      </p>
      {invite ? (
        <div className="my-5 text-center">
          <p className="font-mono text-3xl font-semibold tracking-widest text-ink" aria-label={t('connect.codeLabel', { code: invite.code.split('').join(' ') })}>{pretty}</p>
          <p className="mt-2 text-xs text-faint">
            {t('connect.howTo', { date: new Date(invite.expiresAt).toLocaleDateString() })}
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => { navigator.clipboard?.writeText(invite.code).then(() => toast(t('connect.copied'))).catch(() => {}) }}>
            {t('connect.copy')}
          </Button>
        </div>
      ) : (
        <div className="my-5">
          <Button variant="primary" onClick={generate} disabled={busy}>{busy ? t('connect.creating') : t('connect.create')}</Button>
        </div>
      )}
      <div className="border-t border-line pt-3">
        <button type="button" className="text-xs text-faint hover:text-signal-600 disabled:opacity-50" onClick={disconnect} disabled={busy}>
          {t('connect.disconnect', { name: clientName })}
        </button>
      </div>
    </Dialog>
  )
}
