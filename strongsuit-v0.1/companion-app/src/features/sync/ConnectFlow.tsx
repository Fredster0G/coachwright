import { useState } from 'react'
import { Button, Input, Label } from '@/design'
import { connectWithCode, syncNow } from './companionSyncApi'

/** Enter the connect code from the coach (their app → client page → Connect
 *  Companion). One step: redeem, then an immediate first sync so the program
 *  is there when this closes. */
export function ConnectFlow({ onConnected, onSkip }: { onConnected: () => void; onSkip?: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function connect() {
    setBusy(true); setError('')
    try {
      const link = await connectWithCode(code)
      await syncNow(link).catch(() => { /* first sync can retry later */ })
      onConnected()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.")
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Connect code</Label>
        <Input
          value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="one-time-code"
          className="font-mono tracking-widest"
          onKeyDown={e => { if (e.key === 'Enter' && code.trim()) connect() }}
        />
        <p className="mt-1 text-2xs text-faint">Your coach creates this in their Coachwright app. It works once.</p>
      </div>
      {error && <p className="text-2xs text-signal-600">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={connect} disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 8}>
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
        {onSkip && <Button variant="secondary" onClick={onSkip}>Later</Button>}
      </div>
    </div>
  )
}
