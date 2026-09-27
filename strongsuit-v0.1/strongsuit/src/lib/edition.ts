// ===== Edition capabilities (docs/plans/06-EDITIONS-PRICING.md) =====
// Single source of truth for "what does this licence unlock."
//
// A feature asks *can I?* and gets back a boolean plus a plain-language
// reason when the answer is no — a coach who can't see a feature should
// understand why, not wonder if it's broken.
//
// S24: only what is actually enforced is left. The pre-pivot flags
// (`clients`, `programBuilder`, `filmRoomPro`, `business`, `batchAi`,
// `sharedModelCache`) were read by nothing — every tier gets those features,
// which is what S15's pricing promises — so they were deleted (DEBT-70).
//
// ONE codebase, three editions. Never fork. A Personal build is the same code
// with capabilities off, which is what keeps three products maintainable by
// one person.

export type Edition = 'personal' | 'independent' | 'studio'

export interface EditionCapabilities {
  edition: Edition
  /** Multi-seat, roles, shared roster, hub, commissions, audit log. */
  multiSeat: boolean
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
  // The client cap is a count, not a flag: lib/membership.ts canAddClient()
  // locally, and the server's /data/push since S24.
  multiSeat: false,
  maxAiTier: 'light',
  // Only ever rendered by the multiSeat-gated pages (Team, Studio hub,
  // Location).
  upgradeReason:
    'Team features — multiple trainers, shared clients, commissions — are part of the ' +
    'Studio edition. Coachwright Membership covers one coach with unlimited clients.',
}

const INDEPENDENT: EditionCapabilities = {
  edition: 'independent',
  multiSeat: false,
  maxAiTier: 'pro',
  upgradeReason:
    'Running a team — multiple trainers, shared clients, commissions — is part of ' +
    'the Studio edition.',
}

const STUDIO: EditionCapabilities = {
  edition: 'studio',
  multiSeat: true,
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
