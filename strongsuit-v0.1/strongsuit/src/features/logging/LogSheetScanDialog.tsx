/* eslint-disable tailwindcss/no-custom-classname */
import { useState } from 'react'
import { Camera } from 'lucide-react'
import { Dialog, Button, LogoSpinner, toast } from '@/design'
import { recognizeText, type OcrProgress } from '@/lib/ocr'
import { parseLogSheet, type ParsedLogSheet } from '@/lib/logSheetParser'
import type { Units } from '@/db/types'
import { useTranslation } from '@/lib/i18n'

/**
 * Photograph/upload a printed log sheet, review what OCR actually read and
 * what got parsed from it, then apply — never silent, same "confirm, don't
 * guess" posture as voice logging's toast-before-filling-fields flow. The
 * raw text always stays visible even when parsing found nothing, so a bad
 * read is obviously a bad read, not a silent no-op.
 */
export function LogSheetScanDialog({ open, onClose, onApply, units }: {
  open: boolean
  onClose: () => void
  onApply: (sets: ParsedLogSheet['sets']) => void
  units: Units
}) {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [result, setResult] = useState<ParsedLogSheet | null>(null)
  const { t } = useTranslation()

  async function onFile(file: File) {
    setScanning(true)
    setResult(null)
    try {
      const text = await recognizeText(file, setProgress)
      setResult(parseLogSheet(text))
    } catch {
      toast(t('scan.failed'))
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  function close() {
    setResult(null)
    setScanning(false)
    onClose()
  }

  function apply() {
    if (!result || result.sets.length === 0) return
    onApply(result.sets)
    close()
  }

  return (
    <Dialog open={open} onClose={close} title={t('scan.title')} width={420}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          {t('scan.hint')}
        </p>

        {!result && !scanning && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-line px-4 py-8 text-center transition-colors hover:border-verde-600/40">
            <Camera size={24} className="text-faint" />
            <span className="text-sm font-medium text-ink">{t('scan.pick')}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
            />
          </label>
        )}

        {scanning && (
          <div className="flex flex-col items-center gap-2 py-8">
            <LogoSpinner size={24} />
            <p className="text-xs text-faint">
              {progress ? t('scan.progress', { status: progress.status, pct: (progress.progress * 100).toFixed(0) }) : t('scan.reading')}
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">{t('scan.whatItRead')}</p>
              {/* eslint-disable-next-line tailwindcss/no-custom-classname */}
              <div className="panel-scroll max-h-24 overflow-y-auto whitespace-pre-wrap rounded-ctl border border-line bg-surface2 px-2.5 py-2 text-2xs text-muted">
                {result.raw.trim() || t('scan.nothing')}
              </div>
            </div>

            {result.sets.length > 0 ? (
              <div>
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">
                  {t('scan.found', { count: result.sets.length })}
                </p>
                <ul className="space-y-1">
                  {result.sets.map((s, i) => (
                    <li key={i} className="rounded-ctl border border-line px-2.5 py-1.5 text-sm text-ink">
                      {t('scan.setLine', { n: i + 1, detail: [
                        s.load != null ? `${s.load} ${units}` : null,
                        s.reps != null ? `× ${s.reps}` : null,
                        s.rpe != null ? `RPE ${s.rpe}` : null,
                      ].filter(Boolean).join(' ') || t('scan.unclear') })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-signal-600">
                {t('scan.none')}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResult(null)}>{t('scan.again')}</Button>
              <Button variant="primary" onClick={apply} disabled={result.sets.length === 0}>
                {t('scan.apply', { count: result.sets.length })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
