// ===== Brand constants (single source of truth) =====
// Renaming the product = edit this file. User-facing strings pull from here.
//
// IMPORTANT — do NOT repoint the data-level identifiers below to the new name
// without a migration: the IndexedDB database name and the backup envelope's
// `app` value are how existing data + backup files are recognized. They keep
// the legacy 'strongsuit' value on purpose so nobody's data or old backups
// break. Renamed 2026-07-16: "Strongsuit" → "Coachwright" (Strongsuit was
// already trademarked by another company).

export const APP_NAME = 'Coachwright'
/** Market-facing category line — S15 membership pivot: we're a SaaS product
 *  with a free tier, not a pay-once "workstation you own" pitch. */
export const APP_TAGLINE = 'Coaching platform'
// S15: free tier (≤3 clients) + Coachwright Membership ($29/mo) replaced the
// one-time-purchase model — see docs/MEMBERSHIP.md.
export const APP_ONELINER = 'Free for up to 3 clients. $29/mo, flat, for the rest of your practice.'

/** Backup file extension shown to the trainer (new canonical + legacy accepted). */
export const BACKUP_EXT = '.coachwright'
export const BACKUP_ACCEPT = '.coachwright,.strongsuit,application/json'
export const BACKUP_FILE_PREFIX = 'coachwright-backup'

/** "Built with Coachwright" companion footer / marketing credit. */
export const COMPANION_CREDIT = `Built with ${APP_NAME}`

// ---- data-level identifiers (see warning above; keep stable) ----
/** IndexedDB database name. NEVER change without a data migration. */
export const DB_NAME = 'strongsuit'
/** Canonical + legacy values accepted in a backup envelope's `app` field. */
export const BACKUP_APP_ID = 'coachwright' as const
export const BACKUP_APP_ID_LEGACY = 'strongsuit' as const
