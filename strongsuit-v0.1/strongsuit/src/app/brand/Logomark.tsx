// ===== Coachwright brand mark family =====
// Every variant from the brand-mark reference sheet (`Coachwright Logo.dc.html`),
// reproduced exactly: one mark (a barbell collar seen end-on, its negative
// space resolving into a hard "C"), always monochrome — ink or porcelain,
// never a jade/ember tint. Construction ratio matches the reference sheet's
// own swatches (~60% mark-to-badge, generous clearspace).
//
// Badge tone auto-swaps with the app theme by default (ink badge in light
// mode, porcelain badge in dark mode) so it stays legible against a
// theme-toggling surface — pass an explicit `tone` only for a fixed-background
// context (printed paper, a raw HTML file outside React/Tailwind's dark:
// scoping, like electron/splash.html or index.html's pre-boot splash).

import type { CSSProperties } from 'react'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

const MARK_PATH = 'M 86.4 29 A 42 42 0 1 0 86.4 71 L 67.3 60 A 20 20 0 1 1 67.3 40 Z'
const INK = '#171A1E'
const PORCELAIN = '#F7F6F3'
const FAINT = '#8A919B'

type Tone = 'dark' | 'light'

function BadgeSvg({ size, tone, animated, className }: { size: number; tone: Tone; animated: boolean; className: string }) {
  const bg = tone === 'dark' ? INK : PORCELAIN
  const fg = tone === 'dark' ? PORCELAIN : INK
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" fill={bg} />
      <path
        d={MARK_PATH}
        fill={fg}
        transform="translate(24 24) scale(0.343) translate(-44.4 -50)"
        className={animated ? 'animate-[cw-wipe_0.75s_cubic-bezier(0.2,0,0,1)_both]' : ''}
      />
    </svg>
  )
}

/** The square mark badge — "Mark on dark/light" / "Monogram square" in the
 *  reference sheet. Sharp corners, per the guide (never rounded). */
export function Logomark({ size = 32, tone, animated = false, className = '' }: {
  size?: number; tone?: Tone; animated?: boolean; className?: string
}) {
  if (tone) return <BadgeSvg size={size} tone={tone} animated={animated} className={className} />
  return (
    <>
      <BadgeSvg size={size} tone="dark" animated={animated} className={`${className} dark:hidden`} />
      <BadgeSvg size={size} tone="light" animated={animated} className={`${className} hidden dark:block`} />
    </>
  )
}

/** "Coachwright" wordmark — Inter Tight 800, −0.04em tracking, per the guide. */
export function Wordmark({ size = 24, tone, className = '' }: { size?: number; tone?: Tone; className?: string }) {
  const style: CSSProperties = { fontSize: size, lineHeight: 1 }
  if (tone) style.color = tone === 'dark' ? INK : PORCELAIN
  return (
    <span className={`font-display font-extrabold tracking-[-0.04em] ${tone ? '' : 'text-ink'} ${className}`} style={style}>
      {APP_NAME}
    </span>
  )
}

/** "CW" monogram — the type-only variant, no mark. */
export function MonogramCW({ size = 32, tone, className = '' }: { size?: number; tone?: Tone; className?: string }) {
  const style: CSSProperties = { fontSize: size, lineHeight: 1 }
  if (tone) style.color = tone === 'dark' ? INK : PORCELAIN
  return (
    <span className={`font-display font-black tracking-[-0.06em] ${tone ? '' : 'text-ink'} ${className}`} style={style}>
      CW
    </span>
  )
}

/** Compact icon + wordmark, inline — the "Horizontal lockup" variant. The
 *  right choice for a persistent header/sidebar; `Lockup` below is the
 *  hero/marketing treatment and reads oversized in a nav rail. */
export function HorizontalLockup({ markSize = 32, wordmarkSize, tone, animated = false, className = '' }: {
  markSize?: number; wordmarkSize?: number; tone?: Tone; animated?: boolean; className?: string
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logomark size={markSize} tone={tone} animated={animated} />
      <Wordmark size={wordmarkSize ?? Math.round(markSize * 0.64)} tone={tone} />
    </div>
  )
}

/** Icon badge + wordmark + tagline — the "Primary Lockup" from the reference
 *  sheet: badge and text sit side by side, vertically centered on each
 *  other, the wordmark set large and tight (0.92 line-height) with the
 *  tagline breaking below it. This is NOT a stacked/centered arrangement —
 *  the guide's own hero lockup is a horizontal row (`display:flex;
 *  align-items:center`, 132px badge + a big left-aligned text block, 40px
 *  gap). Ratios below (gap≈0.3×, wordmark≈0.45×, tagline≈0.1× the mark
 *  size) are read directly off the reference sheet's own numbers
 *  (132px badge / 40px gap / ~59px wordmark / 13px tagline). */
export function Lockup({ markSize = 96, tone, showTagline = true, animated = false, className = '' }: {
  markSize?: number; tone?: Tone; showTagline?: boolean; animated?: boolean; className?: string
}) {
  return (
    <div className={`flex items-center ${className}`} style={{ gap: Math.round(markSize * 0.22) }}>
      <Logomark size={markSize} tone={tone} animated={animated} />
      <div>
        <Wordmark size={Math.round(markSize * 0.45)} tone={tone} className="block leading-[0.92] whitespace-nowrap" />
        {showTagline && (
          <p
            className={`whitespace-nowrap font-mono uppercase tracking-[0.06em] ${tone ? '' : 'text-faint'}`}
            style={{ marginTop: Math.round(markSize * 0.05), fontSize: Math.max(8, Math.round(markSize * 0.075)), ...(tone ? { color: FAINT } : {}) }}
          >
            {APP_TAGLINE}
          </p>
        )}
      </div>
    </div>
  )
}

export type BrandMarkVariant = 'horizontal' | 'mark' | 'monogram' | 'cw' | 'lockup'

export const BRAND_MARK_VARIANTS: { key: BrandMarkVariant; label: string; hint: string }[] = [
  { key: 'horizontal', label: 'Horizontal lockup', hint: 'Mark + wordmark, side by side' },
  { key: 'mark', label: 'Mark only', hint: 'Just the badge, no text' },
  { key: 'monogram', label: 'Monogram square', hint: 'Mark, larger, no wordmark' },
  { key: 'cw', label: 'CW monogram', hint: 'Type only, no mark' },
  { key: 'lockup', label: 'Full lockup', hint: 'Mark, wordmark & tagline, side by side' },
]

/** Renders whichever brand-mark variant a coach picked for the sidebar header.
 *  Pass `tone` when the mark sits on a fixed-color surface (the workshop rail
 *  is always dark — theme-auto ink/porcelain would invert against it). */
export function BrandMark({ variant, animated = false, tone }: {
  variant: BrandMarkVariant; animated?: boolean; tone?: Tone
}) {
  switch (variant) {
    case 'mark': return <Logomark size={28} animated={animated} tone={tone} />
    case 'monogram': return <Logomark size={36} animated={animated} tone={tone} />
    case 'cw': return <MonogramCW size={26} tone={tone} />
    case 'lockup': return <Lockup markSize={34} animated={animated} tone={tone} showTagline />
    case 'horizontal':
    default: return <HorizontalLockup markSize={28} animated={animated} tone={tone} />
  }
}
