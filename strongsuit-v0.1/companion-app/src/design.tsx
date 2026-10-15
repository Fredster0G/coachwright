// ===== Minimal design primitives — same token vocabulary as the coach app =====
// (bg-surface, text-ink, border-line, verde/ember/signal accents) but this
// file is intentionally small: Companion doesn't need the coach app's full
// component library, and copying it wholesale would just be dead weight in
// a PWA bundle that should stay light. Grow this only as real screens need it.
//
// Mobile rules (S13 overhaul): interactive controls hit 44px minimum touch
// height, inputs are 44px tall, and every page opens with the same
// PageHeader treatment so the app reads as one designed thing.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const base = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-ctl px-4 py-2 text-sm font-medium transition-[color,background-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-verde-600 text-white hover:bg-verde-700 shadow-raise',
    secondary: 'border border-line bg-surface text-ink hover:bg-surface2',
    ghost: 'text-muted hover:text-ink hover:bg-surface2',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface/90 p-4 shadow-raise ${className}`}>{children}</div>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-11 w-full rounded-ctl border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint ${props.className ?? ''}`} />
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted">{children}</label>
}

/** One header treatment for every page: small eyebrow line, big display
 *  title, optional right-side action. */
export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 animate-rise-in">
      <div>
        {eyebrow && (
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">{eyebrow}</p>
        )}
        <h1 className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-ink">{title}</h1>
        <div aria-hidden className="mt-2 h-0.5 w-8 rounded-full bg-ember-500/80" />
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, body, icon }: { title: string; body: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      <p className="text-xs text-muted">{body}</p>
    </div>
  )
}

/** Dependency-free trend line for a series of {date, value} points — the
 *  same inline-SVG philosophy as the coach app's charts. Renders nothing
 *  for fewer than 2 points (a single dot isn't a trend). */
export function Sparkline({ points, height = 56, className = '' }: {
  points: { date: string; value: number }[]
  height?: number
  className?: string
}) {
  if (points.length < 2) return null
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const vals = sorted.map(p => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const W = 100
  const pad = 6
  const step = W / (sorted.length - 1)
  const y = (v: number) => pad + (height - 2 * pad) * (1 - (v - min) / span)
  const d = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const last = sorted[sorted.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }} aria-hidden>
      <path d={d} fill="none" stroke="var(--verde-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={(sorted.length - 1) * step} cy={y(last.value)} r="2.5" fill="var(--verde-600)" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
