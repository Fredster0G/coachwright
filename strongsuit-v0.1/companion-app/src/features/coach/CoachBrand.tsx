import type { CoachLink } from '@/db/types'

/** The coach's logo + name as this client sees them. Falls back to the
 *  coach's account name when their plan doesn't include custom branding. */
export function CoachBrand({ link, size = 'md' }: { link: CoachLink; size?: 'sm' | 'md' }) {
  const name = link.brand?.name || link.coachName
  const logo = link.brand?.logo
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logo && <img src={logo} alt="" className={`${size === 'sm' ? 'h-5' : 'h-8'} w-auto max-w-[96px] shrink-0 object-contain`} />}
      <span className="truncate">{name}</span>
    </span>
  )
}

/** Inline style for the coach's accent colour (a left rule), if set. */
export const brandAccent = (link?: CoachLink) =>
  link?.brand?.color ? { borderInlineStartColor: link.brand.color, borderInlineStartWidth: 3 } : undefined
