import { useEffect, useState } from 'react'
import { Card, Button, Field, Input, toastError } from '@/design'
import { Logomark } from '@/app/brand/Logomark'
import { APP_NAME } from '@/lib/brand'
import { signIn, signUp, requestPasswordReset, confirmPasswordReset } from '@/lib/cloud/session'
import { localHasCoachData, linkedAccountId } from '@/lib/cloud/syncEngine'
import { exportBackup, downloadText } from '@/db/backup'
import { useTranslation, type MessageKey } from '@/lib/i18n'

/**
 * Sign in / create account. Shown before the app whenever there's no session.
 * The one decision with data consequences — what happens to rows already on
 * this device — is spelled out here, before the coach commits, with a backup
 * one click away. `linkDevice()` in lib/cloud/syncEngine.ts implements it.
 */
type Mode = 'signin' | 'signup' | 'forgot' | 'reset'

/** `#/reset-password?token=…` — the link in the reset email. */
function tokenFromUrl(): string {
  const q = window.location.hash.split('?')[1]
  return window.location.hash.startsWith('#/reset-password') && q ? new URLSearchParams(q).get('token') ?? '' : ''
}

const TITLES: Record<Mode, MessageKey> = {
  signin: 'auth.title.signin', signup: 'auth.title.signup', forgot: 'auth.title.forgot', reset: 'auth.title.reset',
}

export default function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [resetToken, setResetToken] = useState(tokenFromUrl)
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin')
  const [resetSent, setResetSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localData, setLocalData] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    localHasCoachData().then(setLocalData).catch(() => setLocalData(false))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email)
        setResetSent(true)
        return
      }
      if (mode === 'reset') {
        await confirmPasswordReset(resetToken, password)
        window.location.hash = '#/'
      } else if (mode === 'signup') await signUp(email, password, name || undefined)
      else await signIn(email, password)
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function backup() {
    try {
      const { filename, text } = await exportBackup()
      downloadText(filename, text)
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('auth.backupFailed'))
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface2 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <Logomark size={36} />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{t(TITLES[mode])}</h1>
            <p className="text-xs text-muted">{t('auth.tagline')}</p>
          </div>
        </div>

        {localData && mode !== 'forgot' && (
          <div className="mb-4 rounded-ctl border border-line bg-surface2 p-3 text-xs text-muted">
            {linkedAccountId()
              ? t('auth.local.otherAccount')
              : t('auth.local.unlinked')}
            {' '}
            <button type="button" className="font-semibold text-ink underline" onClick={backup}>{t('auth.backupFirst')}</button>
          </div>
        )}

        {mode === 'forgot' && resetSent ? (
          <div className="space-y-3 text-sm text-muted" role="status">
            <p>{t('auth.resetSent', { email })}</p>
            <p className="text-xs">{t('auth.resetDesktop')}</p>
            <Button className="w-full" onClick={() => { setMode('reset'); setError(null) }}>{t('auth.haveCode')}</Button>
          </div>
        ) : (
        <form className="space-y-3" onSubmit={submit}>
          {mode === 'forgot' && (
            <p className="text-xs text-muted">{t('auth.forgotHint')}</p>
          )}
          {mode === 'reset' && (
            <Field label={t('auth.resetCode')} hint={t('auth.fromEmail')}>
              <Input required value={resetToken} onChange={e => setResetToken(e.target.value)} autoComplete="one-time-code" spellCheck={false} />
            </Field>
          )}
          {mode === 'signup' && (
            <Field label={t('auth.name')}>
              <Input value={name} onChange={e => setName(e.target.value)} autoComplete="organization" />
            </Field>
          )}
          {mode !== 'reset' && (
            <Field label={t('auth.email')}>
              <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </Field>
          )}
          {mode !== 'forgot' && (
            <Field label={mode === 'reset' ? t('auth.newPassword') : t('auth.password')} hint={mode === 'signin' ? undefined : t('auth.min8')}>
              <Input type="password" required minLength={mode === 'signin' ? undefined : 8} value={password}
                onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            </Field>
          )}
          {mode === 'signin' && (
            <button type="button" className="text-xs font-semibold text-muted underline hover:text-ink"
              onClick={() => { setMode('forgot'); setResetSent(false); setError(null) }}>
              {t('auth.forgot')}
            </button>
          )}
          {error && <p className="text-sm text-signal-600" role="alert">{error}</p>}
          <Button variant="primary" type="submit" className="w-full" disabled={busy}>
            {busy ? t('auth.wait')
              : mode === 'signin' ? t('auth.submit.signin')
              : mode === 'signup' ? t('auth.submit.signup', { app: APP_NAME })
              : mode === 'forgot' ? t('auth.submit.forgot')
              : t('auth.submit.reset')}
          </Button>
        </form>
        )}

        <p className="mt-4 text-center text-xs text-muted">
          {mode === 'signin' ? t('auth.newHere') : mode === 'signup' ? t('auth.haveAccount') : t('auth.remembered')}{' '}
          <button type="button" className="font-semibold text-ink underline" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}>
            {mode === 'signin' ? t('auth.createAccount') : t('auth.submit.signin')}
          </button>
        </p>
      </Card>
    </div>
  )
}
