import { useEffect, useState } from 'react'
import { Card, Button, Field, Input, toastError } from '@/design'
import { Logomark } from '@/app/brand/Logomark'
import { APP_NAME } from '@/lib/brand'
import { signIn, signUp, requestPasswordReset, confirmPasswordReset } from '@/lib/cloud/session'
import { localHasCoachData, linkedAccountId } from '@/lib/cloud/syncEngine'
import { exportBackup, downloadText } from '@/db/backup'

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

const TITLES: Record<Mode, string> = {
  signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password',
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
      toastError(err instanceof Error ? err.message : 'Backup failed.')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface2 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <Logomark size={36} />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{TITLES[mode]}</h1>
            <p className="text-xs text-muted">Your clients and programs, on every device and on the web.</p>
          </div>
        </div>

        {localData && mode !== 'forgot' && (
          <div className="mb-4 rounded-ctl border border-line bg-surface2 p-3 text-xs text-muted">
            {linkedAccountId()
              ? 'This device holds data from another account. Signing in will replace it with this account’s data.'
              : `This device already has coaching data. Creating a new account uploads it. Signing in to an account that already has data replaces what’s here with that account’s data.`}
            {' '}
            <button type="button" className="font-semibold text-ink underline" onClick={backup}>Download a backup first</button>
          </div>
        )}

        {mode === 'forgot' && resetSent ? (
          <div className="space-y-3 text-sm text-muted" role="status">
            <p>If there’s an account for <span className="font-semibold text-ink">{email}</span>, a reset link is on its way. It works for one hour.</p>
            <p className="text-xs">On the desktop app, the email also contains a code — paste it on the next screen.</p>
            <Button className="w-full" onClick={() => { setMode('reset'); setError(null) }}>I have a reset code</Button>
          </div>
        ) : (
        <form className="space-y-3" onSubmit={submit}>
          {mode === 'forgot' && (
            <p className="text-xs text-muted">Enter your account email and we’ll send you a link to choose a new password.</p>
          )}
          {mode === 'reset' && (
            <Field label="Reset code" hint="From the email">
              <Input required value={resetToken} onChange={e => setResetToken(e.target.value)} autoComplete="one-time-code" spellCheck={false} />
            </Field>
          )}
          {mode === 'signup' && (
            <Field label="Your name or business">
              <Input value={name} onChange={e => setName(e.target.value)} autoComplete="organization" />
            </Field>
          )}
          {mode !== 'reset' && (
            <Field label="Email">
              <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </Field>
          )}
          {mode !== 'forgot' && (
            <Field label={mode === 'reset' ? 'New password' : 'Password'} hint={mode === 'signin' ? undefined : 'At least 8 characters'}>
              <Input type="password" required minLength={mode === 'signin' ? undefined : 8} value={password}
                onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            </Field>
          )}
          {mode === 'signin' && (
            <button type="button" className="text-xs font-semibold text-muted underline hover:text-ink"
              onClick={() => { setMode('forgot'); setResetSent(false); setError(null) }}>
              Forgot password?
            </button>
          )}
          {error && <p className="text-sm text-signal-600" role="alert">{error}</p>}
          <Button variant="primary" type="submit" className="w-full" disabled={busy}>
            {busy ? 'Please wait…'
              : mode === 'signin' ? 'Sign in'
              : mode === 'signup' ? `Create ${APP_NAME} account`
              : mode === 'forgot' ? 'Email me a reset link'
              : 'Set password and sign in'}
          </Button>
        </form>
        )}

        <p className="mt-4 text-center text-xs text-muted">
          {mode === 'signin' ? 'New here?' : mode === 'signup' ? 'Already have an account?' : 'Remembered it?'}{' '}
          <button type="button" className="font-semibold text-ink underline" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </Card>
    </div>
  )
}
