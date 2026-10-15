// ===== Workshop emblems — AI-generated chalk-stamp graphics =====
// Raster marks live in `public/emblems/*.webp` (generated assets, resized for
// the bundle). Same export names as the old SVG stamps so call sites stay put.
// Serious gym branding — not hand-drawn stick figures.

import type { ImgHTMLAttributes, ReactNode } from 'react'

type EmblemProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  size?: number
}

const BASE = `${import.meta.env.BASE_URL}emblems`

function EmblemImg({ name, size = 64, className = '', style, ...rest }: EmblemProps & { name: string }) {
  return (
    <img
      src={`${BASE}/${name}.webp`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`select-none object-contain ${className}`}
      style={{ width: size, height: size, ...style }}
      aria-hidden
      {...rest}
    />
  )
}

export function EmblemLifter(props: EmblemProps) {
  return <EmblemImg name="lifter" {...props} />
}
export function EmblemCoach(props: EmblemProps) {
  return <EmblemImg name="coach" {...props} />
}
export function EmblemSpotter(props: EmblemProps) {
  return <EmblemImg name="spotter" {...props} />
}
export function EmblemKettle(props: EmblemProps) {
  return <EmblemImg name="kettle" {...props} />
}
export function EmblemPlates(props: EmblemProps) {
  return <EmblemImg name="plates" {...props} />
}
export function EmblemFilm(props: EmblemProps) {
  return <EmblemImg name="film" {...props} />
}
export function EmblemGrip(props: EmblemProps) {
  return <EmblemImg name="grip" {...props} />
}
export function EmblemRack(props: EmblemProps) {
  return <EmblemImg name="rack" {...props} />
}
export function EmblemStride(props: EmblemProps) {
  return <EmblemImg name="stride" {...props} />
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
      <div className="relative rounded-[2px] border-2 border-current/40 bg-current/[0.06] p-1.5">
        <div className="pointer-events-none absolute inset-1 border border-current/15" aria-hidden />
        <div className="pointer-events-none absolute -end-0.5 -top-0.5 h-2 w-2 border-e-2 border-t-2 border-ember-500/70" aria-hidden />
        <div className="pointer-events-none absolute -bottom-0.5 -start-0.5 h-2 w-2 border-b-2 border-s-2 border-verde-600/70" aria-hidden />
        {children}
      </div>
      {label && (
        <span className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-current/70">
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
