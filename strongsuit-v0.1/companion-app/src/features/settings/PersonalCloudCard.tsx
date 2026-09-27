import { Cloud, Check } from 'lucide-react'
import { Button, Card } from '@/design'
import type { CompanionProfile } from '@/db/types'

/** The pricing surface from docs/CLIENT_APP_STRATEGY.md §4. Honestly marked
 *  as not-yet-purchasable — provisioning isn't wired to anything real yet
 *  (same "coming soon, no fake button" rule as the rest of this codebase).
 *  When it IS wired, this follows the same bring-your-own-payment-link
 *  pattern the coach app already uses for invoicing, not a card form here. */
export function PersonalCloudCard({ profile }: { profile: CompanionProfile }) {
  const isPersonal = profile.personalCloudTier === 'personal'
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Cloud size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold text-ink">Personal Cloud</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Logging your own training in Companion is free. This is only for syncing your own data between your
        own devices when you train without a coach. Connecting to a coach is always free and separate from this.
      </p>

      <div className="rounded-ctl border border-line p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">Free</span>
          {!isPersonal && <Check size={14} className="text-verde-600" />}
        </div>
        <p className="text-2xs text-muted">Full local logging, on-device Film Room self-review, manual file-based backup. $0, forever.</p>
      </div>

      <div className="mt-2 rounded-ctl border border-line p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">Companion Cloud</span>
          <span className="text-xs font-medium text-verde-600">$3.99/mo · $29/yr</span>
        </div>
        <p className="text-2xs text-muted">Automatic cross-device sync of your own data, automatic cloud backup, extended trend history.</p>
        <Button variant="secondary" className="mt-2 w-full" disabled title="Not available yet in this build">
          Coming soon
        </Button>
      </div>
    </Card>
  )
}
