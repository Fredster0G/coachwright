import type { ReactNode } from 'react'
import { initials } from '@/lib/core'

export function Card({ children, className = '', pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={`rounded-card border border-line/90 bg-surface/90 shadow-bench ${pad ? 'p-4' : ''} ${className}`}>
      {children}
    </div>
  )
}

/** Signature element #1 (spec §7.4): section header over the Ledger Rule. */
export function SectionHeader({ title, action, eyebrow }: { title: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">{eyebrow}</p>
          )}
          <h2 className="font-display text-xl font-extrabold tracking-[-0.03em] text-ink">{title}</h2>
        </div>
        {action}
      </div>
      <div className="ledger-rule h-[5px]" aria-hidden />
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="font-display text-base font-bold tracking-tight text-ink">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, unit, tone = 'ink' }: { label: string; value: string | number; unit?: string; tone?: 'ink' | 'ember' | 'verde' }) {
  const toneCls = { ink: 'text-ink', ember: 'text-ember-600', verde: 'text-verde-600' }[tone]
  return (
    <div>
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`font-mono tabular-nums text-xl font-semibold ${toneCls}`}>
        {value}
        {unit && <span className="ms-1 text-xs font-normal text-muted">{unit}</span>}
      </p>
    </div>
  )
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'verde' | 'ember' | 'red' }) {
  const cls = {
    neutral: 'bg-surface2 text-muted border-line',
    verde: 'bg-verde-100 text-verde-700 border-transparent',
    ember: 'bg-ember-500/10 text-ember-600 border-transparent',
    red: 'bg-signal-600/10 text-signal-600 border-transparent',
  }[tone]
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium ${cls}`}>{children}</span>
}

/** Signature element #3: the Ember PR tag — square corners, mono type. */
export function PRTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center bg-ember-500 px-1.5 py-0.5 font-mono text-2xs font-semibold text-white">
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-line bg-surface2 px-1.5 py-0.5 font-mono text-2xs text-muted">
      {children}
    </kbd>
  )
}

/** One consistent fallback treatment (spec §7.5): mono initials on verde-100. */
export function Avatar({ person, src, size = 32 }: { person: { firstName: string; lastName: string }; src?: string; size?: number }) {
  const s = { width: size, height: size }
  if (src) return <img src={src} alt="" style={s} className="rounded-full object-cover" />
  return (
    <span
      style={s}
      className="inline-flex items-center justify-center rounded-full bg-verde-100 font-mono text-2xs font-semibold text-verde-700"
    >
      {initials(person)}
    </span>
  )
}

export function InjuryRibbon({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <div className="flex items-start gap-2 rounded-ctl border border-ember-500/30 bg-ember-500/10 px-3 py-2 text-xs text-ember-600">
      <span className="mt-px font-semibold uppercase tracking-wide">Injury note</span>
      <span className="text-ink">{text}</span>
    </div>
  )
}

export function LogoSpinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`animate-cw-spin ${className}`}>
      <circle cx="50" cy="50" r="34" fill="none" className="stroke-line" strokeWidth="12" />
      <path d="M 50 16 A 34 34 0 0 1 84 50" fill="none" className="stroke-ink" strokeWidth="12" strokeLinecap="butt" />
    </svg>
  )
}
