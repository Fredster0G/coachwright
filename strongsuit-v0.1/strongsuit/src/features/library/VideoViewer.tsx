import { useState } from 'react'
import { ExternalLink, PlayCircle } from 'lucide-react'
import { Dialog, Button, Tag } from '@/design'
import { classifyVideoUrl } from '@/lib/videoEmbed'
import type { ExerciseVideoLink } from '@/db/types'
import { useTranslation } from '@/lib/i18n'

/** In-app player for a trainer's own exercise video links (spec §4.3b) —
 *  YouTube/Vimeo embed inline, direct video files play natively, anything
 *  else falls back to an explicit "open" action (never a silent new tab). */
export function VideoViewerDialog({ title, links, open, onClose }: {
  title: string
  links: ExerciseVideoLink[]
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const link = links[active]
  const target = link ? classifyVideoUrl(link.url) : null

  return (
    <Dialog open={open} onClose={onClose} title={title} width={640}>
      {links.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {links.map((l, i) => (
            <button
              key={i} onClick={() => setActive(i)}
              className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${i === active ? 'border-transparent bg-verde-600 text-white' : 'border-line text-muted hover:bg-surface2'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
      {!target ? (
        <p className="py-8 text-center text-sm text-muted">{t('library.video.none')}</p>
      ) : target.kind === 'youtube' || target.kind === 'vimeo' ? (
        <div className="aspect-video w-full overflow-hidden rounded-card bg-iron-950">
          <iframe
            key={target.src}
            src={target.src}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={link.label}
          />
        </div>
      ) : target.kind === 'direct' ? (
        <video key={target.src} src={target.src} controls className="w-full rounded-card bg-iron-950" />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-10 text-center">
          <PlayCircle size={28} className="text-faint" />
          <p className="text-sm text-muted">{t('library.video.notInline')}</p>
          <Button variant="secondary" onClick={() => window.open(target.original, '_blank', 'noopener,noreferrer')}>
            <ExternalLink size={14} /> {t('library.video.open', { label: link.label })}
          </Button>
        </div>
      )}
      {target && target.kind !== 'link' && (
        <div className="mt-2 flex items-center justify-between">
          <Tag>{target.kind}</Tag>
          <a href={target.original} target="_blank" rel="noopener noreferrer" className="text-2xs text-faint hover:text-ink">
            {t('library.video.openOriginal')} <ExternalLink size={11} className="inline -mt-0.5" />
          </a>
        </div>
      )}
    </Dialog>
  )
}
