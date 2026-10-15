import { useState } from 'react'
import { Users, User } from 'lucide-react'
import { Button, Card, Input, Label } from '@/design'
import { profileRepo } from '@/db/repo'
import { PairingFlow } from '@/features/sync/PairingFlow'
import type { CompanionProfile } from '@/db/types'

type Step = 'name' | 'path' | 'pair'

/** First run: get a name, then the one decision this whole doc is built
 *  around — "I have a coach" vs "I'm training myself." Neither path
 *  requires anything more than what's already on this device; the "pair"
 *  step hands off to `PairingFlow`, the real ECDH handshake + safety-number
 *  confirmation (see docs/CLIENT_APP_STRATEGY.md §3.5) — not a stub. */
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
    <div className="companion-canvas companion-grain mx-auto flex h-full max-w-md flex-col justify-center px-6">
      {step === 'name' && (
        <div className="animate-rise-in space-y-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">Coachwright</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.04em] text-ink">Companion</h1>
            <div aria-hidden className="mt-3 h-1 w-12 rounded-full bg-ember-500 ember-pulse" />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Your training log. No account, no password — everything stays on this device unless you choose otherwise later.
            </p>
          </div>
          <Card className="shadow-bench">
            <Label>Your name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jordan" autoFocus />
            <Button variant="primary" className="mt-4 w-full" onClick={() => setStep('path')} disabled={!name.trim()}>
              Continue
            </Button>
          </Card>
        </div>
      )}

      {step === 'path' && (
        <div className="animate-rise-in space-y-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">One thing to know</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">Do you have a coach?</h1>
            <p className="mt-2 text-sm text-muted">Using Coachwright already? Pair in one step. Otherwise start a personal log.</p>
          </div>
          <div className="stagger-in space-y-2">
            <button
              onClick={() => setStep('pair')}
              className="hover-lift flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left shadow-raise hover:border-verde-600/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-verde-100 text-verde-700">
                <Users size={20} />
              </span>
              <span>
                <span className="block font-display text-sm font-semibold text-ink">Yes, I have a coach</span>
                <span className="block text-2xs text-muted">Pair using the code they gave you</span>
              </span>
            </button>
            <button
              onClick={finish}
              disabled={busy}
              className="hover-lift flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left shadow-raise hover:border-verde-600/50 disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-verde-100 text-verde-700">
                <User size={20} />
              </span>
              <span>
                <span className="block font-display text-sm font-semibold text-ink">No, I&apos;m training myself</span>
                <span className="block text-2xs text-muted">Start a personal log — pair with a coach later</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {step === 'pair' && (
        <div className="animate-rise-in">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">Pairing</p>
          <h1 className="mt-1 mb-1 font-display text-2xl font-extrabold tracking-tight text-ink">Pair with your coach</h1>
          <p className="mb-4 text-sm text-muted">This confirms it&apos;s really them — no server sees anything until you both verify the safety number.</p>
          <PairingFlow onPaired={finish} onSkip={finish} />
        </div>
      )}
    </div>
  )
}
