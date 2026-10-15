// ===== Workshop emblems — serious gym "mascots" =====
// Chalk-line / shop-stamp illustrations for denser UI. Adult gym aesthetic:
// engraved silhouettes, plate stacks, rack geometry — never big-eyed cartoons.
// Colors follow Ironworks tokens via currentColor + optional accent props.

import type { ReactNode, SVGProps } from 'react'

type EmblemProps = SVGProps<SVGSVGElement> & {
  size?: number
  /** Accent stroke for ember ticks / verde fill accents */
  accent?: string
}

function base(size: number, props: SVGProps<SVGSVGElement>) {
  const { className = '', ...rest } = props
  return {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    fill: 'none',
    className,
    'aria-hidden': true as const,
    ...rest,
  }
}

/** Athlete under a bar — the house mascot silhouette. */
export function EmblemLifter({ size = 64, accent = 'var(--ember-500)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <rect x="8" y="14" width="48" height="4" rx="1" fill="currentColor" opacity="0.9" />
      <circle cx="12" cy="16" r="5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="52" cy="16" r="5" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M32 20v6M26 26c0 0 2 8 6 8s6-8 6-8M24 42c2-6 4-8 8-8s6 2 8 8M28 34v12M36 34v12M26 46h4M34 46h4"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="24" r="3.5" fill="currentColor" />
      <path d="M18 52h28" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
    </svg>
  )
}

/** Coach with clipboard — calm, standing, clipboard as identity. */
export function EmblemCoach({ size = 64, accent = 'var(--verde-600)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="28" cy="16" r="5" fill="currentColor" />
      <path
        d="M20 26c2-4 5-6 8-6s6 2 8 6v18H20V26z"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinejoin="round"
      />
      <path d="M24 44v10M32 44v10M22 54h6M30 54h6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <rect x="40" y="22" width="14" height="18" rx="1.5" stroke={accent} strokeWidth="2" />
      <path d="M43 28h8M43 33h8M43 38h5" stroke={accent} strokeWidth="1.75" strokeLinecap="round" />
      <path d="M45 22v-3h4v3" stroke={accent} strokeWidth="1.75" />
    </svg>
  )
}

/** Two figures — spotter + lifter. Pairing / roster energy. */
export function EmblemSpotter({ size = 64, accent = 'var(--verde-600)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="22" cy="14" r="3.5" fill="currentColor" />
      <path d="M16 22c1.5-3 3.5-4.5 6-4.5s4.5 1.5 6 4.5v14H16V22z" stroke="currentColor" strokeWidth="2" />
      <path d="M18 36v12M26 36v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="44" cy="18" r="3.5" fill={accent} />
      <path d="M38 26c1.5-3 3.5-4.5 6-4.5s4.5 1.5 6 4.5v10H38V26z" stroke={accent} strokeWidth="2" />
      <path d="M32 28h6M40 24v-6" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      <rect x="14" y="20" width="16" height="2.5" rx="0.5" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

/** Kettlebell sentinel — abstract, slightly characterful stance. */
export function EmblemKettle({ size = 64, accent = 'var(--ember-500)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <path
        d="M24 18c0-4 3.5-7 8-7s8 3 8 7v4H24v-4z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M18 28c0-2 2-4 6-4h16c4 0 6 2 6 4v18c0 6-6 12-14 12S18 52 18 46V28z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="40" r="1.8" fill={accent} />
      <circle cx="36" cy="40" r="1.8" fill={accent} />
      <path d="M26 46h12" stroke={accent} strokeWidth="1.75" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}

/** Plate stack — iron identity mark. */
export function EmblemPlates({ size = 64, accent = 'var(--verde-600)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <ellipse cx="32" cy="48" rx="20" ry="5" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="32" cy="40" rx="18" ry="4.5" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="32" cy="32" rx="16" ry="4" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="32" cy="24" rx="14" ry="3.5" stroke={accent} strokeWidth="2.25" />
      <rect x="30" y="12" width="4" height="14" rx="1" fill="currentColor" />
      <circle cx="32" cy="12" r="3" fill={accent} />
    </svg>
  )
}

/** Film Room — athlete + frame marks. */
export function EmblemFilm({ size = 64, accent = 'var(--ember-500)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <rect x="8" y="12" width="48" height="40" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 20h48M8 44h48" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="14" cy="16" r="1.5" fill={accent} />
      <circle cx="20" cy="16" r="1.5" fill={accent} />
      <circle cx="14" cy="48" r="1.5" fill={accent} />
      <circle cx="20" cy="48" r="1.5" fill={accent} />
      <circle cx="32" cy="26" r="3" fill="currentColor" />
      <path
        d="M26 34c1.5-3 3.5-5 6-5s4.5 2 6 5v10H26V34z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 38l4-2M42 38l-4-2" stroke={accent} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/** Chalk hands / grip — readiness & effort. */
export function EmblemGrip({ size = 64, accent = 'var(--ember-500)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <path
        d="M20 40c0-8 4-14 10-18 2-1.5 4-1 5 1l2 4c1 2 3 2 4 0l1-2c1-2 3-2 4.5-.5 3 3 5 8 5 14 0 8-5 14-14 14s-17.5-6-17.5-12.5z"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinejoin="round"
      />
      <path d="M28 28v8M34 26v10M40 28v8" stroke={accent} strokeWidth="1.75" strokeLinecap="round" opacity="0.85" />
      <circle cx="18" cy="18" r="2" fill={accent} opacity="0.7" />
      <circle cx="48" cy="22" r="1.5" fill="currentColor" opacity="0.4" />
      <circle cx="14" cy="28" r="1.2" fill="currentColor" opacity="0.35" />
    </svg>
  )
}

/** Power rack stamp. */
export function EmblemRack({ size = 64, accent = 'var(--verde-600)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M14 10v44M50 10v44M14 14h36M14 50h36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 22h8M42 22h8M14 38h8M42 38h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="20" y="28" width="24" height="3" rx="0.5" fill={accent} />
      <circle cx="18" cy="29.5" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="46" cy="29.5" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Companion stride — lean athlete mid-step for the phone app. */
export function EmblemStride({ size = 64, accent = 'var(--verde-600)', ...props }: EmblemProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="36" cy="12" r="4.5" fill="currentColor" />
      <path
        d="M34 18c-2 4-2 8 0 12l-8 6M34 22l8 4 4 10M26 36l-6 12M42 36l6 10M20 48h8M44 46h8"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 54h40" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.75" />
    </svg>
  )
}

/** Small stamp frame around any emblem — mural / patch feel. */
export function EmblemStamp({
  children,
  className = '',
  label,
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <div className="relative rounded-[2px] border-2 border-current/20 p-2">
        <div className="pointer-events-none absolute inset-1 border border-current/10" aria-hidden />
        {children}
      </div>
      {label && (
        <span className="mt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-current/55">
          {label}
        </span>
      )}
    </div>
  )
}

/** Corner-bracket frame for maximalist panels. */
export function CornerFrame({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className="pointer-events-none absolute start-2 top-2 h-3 w-3 border-s-2 border-t-2 border-verde-600/50" />
      <span aria-hidden className="pointer-events-none absolute end-2 top-2 h-3 w-3 border-e-2 border-t-2 border-verde-600/50" />
      <span aria-hidden className="pointer-events-none absolute bottom-2 start-2 h-3 w-3 border-b-2 border-s-2 border-ember-500/45" />
      <span aria-hidden className="pointer-events-none absolute bottom-2 end-2 h-3 w-3 border-b-2 border-e-2 border-ember-500/45" />
      {children}
    </div>
  )
}
