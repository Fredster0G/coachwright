// ===== Edition capabilities (docs/plans/06-EDITIONS-PRICING.md) =====
// Single source of truth for "what does this licence unlock."
//
// Deliberately mirrors `lib/cloudCapability.ts`: a feature asks *can I?* and
// gets back a boolean plus a plain-language reason when the answer is no. That
// pattern is why the cloud tiers explain themselves instead of silently
// hiding UI, and edition gating needs exactly the same discipline — a coach
// who can't see a feature should understand why, not wonder if it's broken.
//
// ONE codebase, three editions. Never fork. A Personal build is the same code
// with capabilities off, which is what keeps three products maintainable by
// one person.

export type Edition = 'personal' | 'independent' | 'studio'

export interface EditionCapabilities {
  edition: Edition
  /** Manage other people at all. The line between Personal and the rest. */
  clients: boolean
  /** Author programs (Personal can *view* an assigned program, not build one). */
  programBuilder: boolean
  /** Dual-clip comparison, VBT, heavy pose models. Personal gets self-review only. */
  filmRoomPro: boolean
  /** Ledger, invoicing, profit planner, expenses. */
  business: boolean
  /** Multi-seat, roles, shared roster, hub, commissions, audit log. */
  multiSeat: boolean
  /** Run the assistant across the whole roster at once (Studio-only: meaningless for one person). */
  batchAi: boolean
  /** One model download on the hub, distributed over LAN to staff machines. */
  sharedModelCache: boolean
  /** Largest local-AI tier this edition licenses. Hardware gates separately. */
  maxAiTier: AiTier
  /** Plain-language reason a gated feature is unavailable. Undefined when nothing is gated. */
  upgradeReason?: string
}

/** Model tiers, smallest first. Edition sets the ceiling; hardware sets the
 *  recommendation (docs/plans/02-LOCAL-AI.md §3). Both gates must pass. */
export type AiTier = 'embeddings' | 'light' | 'standard' | 'pro'

const TIER_ORDER: AiTier[] = ['embeddings', 'light', 'standard', 'pro']

/** True when `have` is at least `want`. */
export function tierAtLeast(have: AiTier, want: AiTier): boolean {
  return TIER_ORDER.indexOf(have) >= TIER_ORDER.indexOf(want)
}

const PERSONAL: EditionCapabilities = {
  edition: 'personal',
  // S15: free tier now includes coaching, capped rather than absent — see
  // lib/membership.ts's FREE_TIER_CLIENT_LIMIT and canAddClient(), which
  // enforce the actual number. This flag only means "can reach the Clients
  // feature at all", which every tier now can; the cap is a count check,
  // not a capability flag, because "how many" isn't a fixed per-edition
  // constant anymore — it depends on whether membership is active.
  clients: true,
  programBuilder: false,
  filmRoomPro: false,
  business: false,
  multiSeat: false,
  batchAi: false,
  sharedModelCache: false,
  maxAiTier: 'light',
  // Only ever rendered by the multiSeat-gated pages (Team, Studio hub,
  // Location). It used to claim the program builder, Film Room and business
  // tools were Membership-only — none of those flags is enforced anywhere
  // (DEBT-70), every tier gets them, and a paying member landing on Team
  // was told to buy the thing they already had.
  upgradeReason:
    'Team features — multiple trainers, shared clients, commissions — are part of the ' +
    'Studio edition. Coachwright Membership covers one coach with unlimited clients.',
}

const INDEPENDENT: EditionCapabilities = {
  edition: 'independent',
  clients: true,
  programBuilder: true,
  filmRoomPro: true,
  business: true,
  multiSeat: false,
  batchAi: false,
  sharedModelCache: false,
  maxAiTier: 'pro',
  upgradeReason:
    'Running a team — multiple trainers, shared clients, commissions — is part of ' +
    'the Studio edition.',
}

const STUDIO: EditionCapabilities = {
  edition: 'studio',
  clients: true,
  programBuilder: true,
  filmRoomPro: true,
  business: true,
  multiSeat: true,
  batchAi: true,
  sharedModelCache: true,
  maxAiTier: 'pro',
}

/** What this edition unlocks. Pure and synchronous — safe to call in render. */
export function editionCapabilities(edition: Edition | undefined | null): EditionCapabilities {
  switch (edition) {
    case 'studio': return STUDIO
    case 'independent': return INDEPENDENT
    // Unknown/absent falls back to the most restrictive edition on purpose:
    // a corrupt or missing licence must never silently unlock paid features.
    default: return PERSONAL
  }
}

export const EDITION_NAMES: Record<Edition, string> = {
  personal: 'Coachwright Personal',
  independent: 'Coachwright for Independent Trainers',
  studio: 'Coachwright Studio',
}

/** Seats a licence grants. Personal and Independent are inherently single-seat;
 *  Studio carries its seat count in the licence itself. */
export function seatsFor(edition: Edition, licensedSeats?: number): number {
  if (edition !== 'studio') return 1
  return Math.max(1, licensedSeats ?? 1)
}
