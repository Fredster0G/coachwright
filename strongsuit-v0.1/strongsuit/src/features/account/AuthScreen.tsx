import { useEffect, useState } from 'react'
import { Card, Button, Field, Input, toastError } from '@/design'
import { Logomark } from '@/app/brand/Logomark'
import { APP_NAME } from '@/lib/brand'
import { signIn, signUp } from '@/lib/cloud/session'
import { localHasCoachData, linkedAccountId } from '@/lib/cloud/syncEngine'
import { exportBackup, downloadText } from '@/db/backup'

/**
 * Sign in / create account. Shown before the app whenever there's no session.
 * The one decision with data consequences — what happens to rows already on
 * this device — is spelled out here, before the coach commits, with a backup
 * one click away. `linkDevice()` in lib/cloud/syncEngine.ts implements it.
 */
export default function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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
      if (mode === 'signup') await signUp(email, password, name || undefined)
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
            <h1 className="text-xl font-bold tracking-tight text-ink">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
            <p className="text-xs text-muted">Your clients and programs, on every device and on the web.</p>
          </div>
        </div>

        {localData && (
          <div className="mb-4 rounded-ctl border border-line bg-surface2 p-3 text-xs text-muted">
            {linkedAccountId()
              ? 'This device holds data from another account. Signing in will replace it with this account’s data.'
              : `This device already has coaching data. Creating a new account uploads it. Signing in to an account that already has data replaces what’s here with that account’s data.`}
            {' '}
            <button type="button" className="font-semibold text-ink underline" onClick={backup}>Download a backup first</button>
          </div>
        )}

        <form className="space-y-3" onSubmit={submit}>
          {mode === 'signup' && (
            <Field label="Your name or business">
              <Input value={name} onChange={e => setName(e.target.value)} autoComplete="organization" />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
            <Input type="password" required minLength={mode === 'signup' ? 8 : undefined} value={password}
              onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </Field>
          {error && <p className="text-sm text-signal-600" role="alert">{error}</p>}
          <Button variant="primary" type="submit" className="w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : `Create ${APP_NAME} account`}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="font-semibold text-ink underline" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </Card>
    </div>
  )
}
