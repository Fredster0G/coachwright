import { useState } from 'react'
import { Users, User } from 'lucide-react'
import { Button, Card, Input, Label } from '@/design'
import { profileRepo } from '@/db/repo'
import { ConnectFlow } from '@/features/sync/ConnectFlow'
import type { CompanionProfile } from '@/db/types'

type Step = 'name' | 'path' | 'pair'

/** First run: get a name, then the one decision this whole doc is built
 *  around — "I have a coach" vs "I'm training myself." Neither path
 *  requires anything more than what's already on this device; the "pair"
 *  step takes the coach's connect code (`ConnectFlow`). */
export function Onboarding({ profile, onDone }: {
  profile: CompanionProfile
  onDone: (p: CompanionProfile) => void
}) {
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState(profile.name)
  const [busy, setBusy] = useState(false)

  async function finish() {
    setBusy(true)
    try {
      await profileRepo.patch({ name: name.trim() || 'You', onboarded: true })
      const updated = await profileRepo.get()
      if (updated) onDone(updated)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6">
      {step === 'name' && (
        <Card>
          <h1 className="mb-1 font-display text-lg font-semibold text-ink">Welcome to Companion</h1>
          <p className="mb-4 text-xs text-muted">Your training log. No account, no password — everything here stays on this device unless you choose otherwise later.</p>
          <Label>Your name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jordan" autoFocus />
          <Button variant="primary" className="mt-4 w-full" onClick={() => setStep('path')} disabled={!name.trim()}>
            Continue
          </Button>
        </Card>
      )}

      {step === 'path' && (
        <Card>
          <h1 className="mb-1 font-display text-lg font-semibold text-ink">One thing to know</h1>
          <p className="mb-4 text-xs text-muted">Do you already have a coach using Coachwright?</p>
          <div className="space-y-2">
            <button
              onClick={() => setStep('pair')}
              className="flex w-full items-center gap-3 rounded-card border border-line p-3 text-left hover:border-verde-600"
            >
              <Users size={20} className="shrink-0 text-verde-600" />
              <span>
                <span className="block text-sm font-medium text-ink">Yes, I have a coach</span>
                <span className="block text-2xs text-muted">Connect using the code they gave you</span>
              </span>
            </button>
            <button
              onClick={finish}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-card border border-line p-3 text-left hover:border-verde-600"
            >
              <User size={20} className="shrink-0 text-verde-600" />
              <span>
                <span className="block text-sm font-medium text-ink">No, I'm training myself</span>
                <span className="block text-2xs text-muted">Start a personal log — you can connect to a coach later</span>
              </span>
            </button>
          </div>
        </Card>
      )}

      {step === 'pair' && (
        <div>
          <h1 className="mb-1 font-display text-lg font-semibold text-ink">Connect to your coach</h1>
          <p className="mb-3 text-xs text-muted">Ask your coach for a connect code. Your program and messages arrive here; your workouts go back to them.</p>
          <ConnectFlow onConnected={finish} onSkip={finish} />
        </div>
      )}
    </div>
  )
}
