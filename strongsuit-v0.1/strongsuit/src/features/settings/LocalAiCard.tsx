import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cpu, RefreshCw, Check, Ban, Download, Trash2, X } from 'lucide-react'
import { Button, Card } from '@/design'
import {
  offersFor, defaultSelection, totalDownloadMb, fitsOnDisk,
  classifyHardware, describeHardware, HARDWARE_CLASS_LABEL,
  type HardwareProfile, type ModelOffer,
} from '@/lib/localAi'
import { downloadAndCacheModel, formatBytes, type DownloadProgress } from '@/lib/modelFetch'
import { installEmbeddingsModel, removeEmbeddingsModel, EMBEDDINGS_MODEL_ID } from '@/lib/embeddings'
import { installSpeechModel, removeSpeechModel, SPEECH_MODEL_ID } from '@/lib/speech'
import { installAssistantModel, removeAssistantModel, ASSISTANT_MODEL_ID } from '@/lib/assistant'
import { installOcrModel, removeOcrModel, OCR_MODEL_ID } from '@/lib/ocr'
import { modelBlobsRepo } from '@/db/repo'
import { probeHardware } from './hardwareProbe'

/** Models with a real install path even without a single-file `url` — all
 *  four are multi-file downloads their own `lib/*.ts` module fetches and
 *  caches itself (a Cache-API/IndexedDB-backed cache the module owns, not
 *  modelFetch.ts's single-blob path — see each module's own header).
 *  Everything else with no `url` genuinely has no runtime to load it yet. */
const SPECIAL_INSTALL_IDS = new Set([EMBEDDINGS_MODEL_ID, SPEECH_MODEL_ID, ASSISTANT_MODEL_ID, OCR_MODEL_ID])

/**
 * The system check, model picker, AND — since S15 — the actual fetcher for
 * the models that can be (plan 02 §3–§4, and lib/modelFetch.ts's header for
 * exactly which ones and why).
 *
 * What this screen is still careful about, unchanged from before:
 *
 * · It shows EVERY model, including the ones this machine or build can't
 *   have, each with the reason. A silently shorter list leaves the user
 *   unable to tell whether it's their hardware or a bug.
 * · It never claims a measurement it doesn't have, or a capability it can't
 *   back up — a model with no `url` says plainly it isn't downloadable yet
 *   in this build, rather than showing a button that goes nowhere.
 * · Nothing here is required. Every AI feature is opt-in with a deterministic
 *   fallback — the app's numbers come from the engines, not a model.
 */
export function LocalAiCard() {
  const [hw, setHw] = useState<HardwareProfile | null>(null)
  const [checking, setChecking] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const installedIds = useLiveQuery(() => modelBlobsRepo.allIds(), [], [] as string[])
  const cachedBytes = useLiveQuery(() => modelBlobsRepo.totalBytes(), [], 0)

  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({})
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runCheck = useCallback(async () => {
    setChecking(true)
    try {
      const profile = await probeHardware()
      setHw(profile)
      setSelected(defaultSelection(profile))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => { void runCheck() }, [runCheck])

  const cls = hw ? classifyHardware(hw) : 'unknown'
  const offers = hw ? offersFor(hw) : []
  const sizeMb = totalDownloadMb(selected)
  const fit = fitsOnDisk(selected, hw?.freeDiskGb)

  function toggle(id: string) {
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  }

  const selectedModels = offers.map(o => o.model).filter(m => selected.includes(m.id) && !installedIds.includes(m.id))
  const toDownload = selectedModels.filter(m => m.url || SPECIAL_INSTALL_IDS.has(m.id))
  const notDownloadable = selectedModels.filter(m => !m.url && !SPECIAL_INSTALL_IDS.has(m.id))

  async function startDownloads() {
    if (toDownload.length === 0) return
    setDownloading(true)
    setDownloadError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for (const model of toDownload) {
        if (SPECIAL_INSTALL_IDS.has(model.id)) {
          // Multi-file download transformers.js manages itself (its own
          // Cache-API-backed cache, not modelFetch.ts's single-blob path) —
          // no cancellation support here, see each module's own note.
          if (model.id === OCR_MODEL_ID) {
            // OcrProgress is shaped { status, progress: 0..1 }, not
            // modelFetch.ts's { loaded, total } — adapted here so the same
            // progress bar renders correctly for every model kind.
            await installOcrModel(p => setProgress(prev => ({ ...prev, [model.id]: { loaded: p.progress * 100, total: 100 } })))
          } else {
            const install = model.id === EMBEDDINGS_MODEL_ID ? installEmbeddingsModel
              : model.id === SPEECH_MODEL_ID ? installSpeechModel
              : installAssistantModel
            await install(p => setProgress(prev => ({ ...prev, [model.id]: p })))
          }
        } else {
          await downloadAndCacheModel(
            model,
            p => setProgress(prev => ({ ...prev, [model.id]: p })),
            controller.signal,
          )
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setDownloadError(err instanceof Error ? err.message : 'The download failed.')
      }
    } finally {
      setDownloading(false)
      abortRef.current = null
    }
  }

  function cancelDownloads() {
    abortRef.current?.abort()
  }

  async function removeModel(id: string) {
    if (id === EMBEDDINGS_MODEL_ID) await removeEmbeddingsModel()
    else if (id === SPEECH_MODEL_ID) await removeSpeechModel()
    else if (id === ASSISTANT_MODEL_ID) await removeAssistantModel()
    else if (id === OCR_MODEL_ID) await removeOcrModel()
    else await modelBlobsRepo.remove(id)
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">On-device AI</p>
        </div>
        <Button size="sm" onClick={runCheck} disabled={checking} className="gap-1.5">
          <RefreshCw size={13} className={checking ? 'animate-spin' : undefined} />
          {checking ? 'Checking…' : 'Re-check'}
        </Button>
      </div>

      <p className="mb-3 text-xs text-muted">
        Optional models that run entirely on this machine — no account, no API key, nothing sent anywhere.
        Every feature they power has a working fallback, so you can ignore this page completely.
      </p>

      {hw && (
        <div className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-faint">
            This machine · {HARDWARE_CLASS_LABEL[cls]}
          </p>
          <p className="mt-0.5 text-xs text-ink">{describeHardware(hw, cls)}</p>
        </div>
      )}

      {installedIds.length > 0 && (
        <p className="mb-2 text-2xs text-faint">
          {installedIds.length} model{installedIds.length === 1 ? '' : 's'} installed · {formatBytes(cachedBytes)} on disk
        </p>
      )}

      <div className="space-y-1.5">
        {offers.map(o => (
          <OfferRow
            key={o.model.id}
            offer={o}
            checked={selected.includes(o.model.id)}
            installed={installedIds.includes(o.model.id)}
            progress={progress[o.model.id]}
            onToggle={() => toggle(o.model.id)}
            onRemove={() => removeModel(o.model.id)}
          />
        ))}
      </div>

      {selected.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs text-ink">
            {selected.length} selected · {sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`} total
          </p>
          {!fit.ok && <p className="mt-1 text-2xs text-signal-600">{fit.reason}</p>}

          {toDownload.length > 0 ? (
            <div className="mt-2">
              {downloading ? (
                <Button size="sm" variant="ghost" onClick={cancelDownloads} className="gap-1.5">
                  <X size={13} /> Cancel
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={startDownloads} disabled={!fit.ok} className="gap-1.5">
                  <Download size={13} />
                  Download {toDownload.length} model{toDownload.length === 1 ? '' : 's'}
                </Button>
              )}
              {notDownloadable.length > 0 && (
                <p className="mt-1.5 text-2xs text-faint">
                  {notDownloadable.map(m => m.label).join(', ')} {notDownloadable.length === 1 ? "isn't" : "aren't"} downloadable
                  in this build yet — selected anyway so the plan is complete, but won't be fetched.
                </p>
              )}
              {downloadError && <p className="mt-1.5 text-2xs text-signal-600">{downloadError}</p>}
            </div>
          ) : (
            <p className="mt-1.5 text-2xs text-faint">
              {selectedModels.length === 0
                ? 'Everything selected is already installed.'
                : "None of what's selected can be downloaded in this build yet — see each row's reason above."}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function OfferRow({ offer, checked, installed, progress, onToggle, onRemove }: {
  offer: ModelOffer
  checked: boolean
  installed: boolean
  progress?: DownloadProgress
  onToggle: () => void
  onRemove: () => void
}) {
  const blocked = offer.state.startsWith('blocked')
  const { model } = offer
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null

  return (
    <div className={`rounded-ctl border p-2.5 ${blocked ? 'border-line/60 bg-surface2/40' : 'border-line'}`}>
      <div className="flex items-start gap-2.5">
        {installed ? (
          <Check size={16} className="mt-0.5 shrink-0 text-verde-600" aria-label="Installed" />
        ) : (
          <input
            type="checkbox"
            checked={checked && !blocked}
            disabled={blocked}
            onChange={onToggle}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--verde-600)] disabled:opacity-40"
            aria-label={model.label}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`text-xs font-medium ${blocked ? 'text-muted' : 'text-ink'}`}>{model.label}</span>
            <span className="text-2xs text-faint">
              {model.sizeMb >= 1024 ? `${(model.sizeMb / 1024).toFixed(1)} GB` : `${model.sizeMb} MB`}
            </span>
            <span className="text-2xs text-faint">· {model.licence}</span>
            {installed && (
              <span className="inline-flex items-center gap-0.5 text-2xs text-verde-600"><Check size={11} /> installed</span>
            )}
            {!installed && offer.state === 'recommended' && (
              <span className="inline-flex items-center gap-0.5 text-2xs text-verde-600">
                <Check size={11} /> recommended
              </span>
            )}
            {offer.state === 'blocked-hardware' && (
              <span className="inline-flex items-center gap-0.5 text-2xs text-muted"><Ban size={11} /> unavailable</span>
            )}
            {!installed && !model.url && !SPECIAL_INSTALL_IDS.has(model.id) && !blocked && (
              <span className="text-2xs text-faint">· not downloadable yet</span>
            )}
          </div>
          <p className="mt-0.5 text-2xs text-muted">{model.purpose}</p>
          {/* Every row carries its reason, including the good outcomes. */}
          <p className="mt-0.5 text-2xs text-faint">{offer.reason}</p>
          {pct != null && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-verde-600 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        {installed && (
          <Button size="sm" variant="ghost" onClick={onRemove} className="shrink-0 gap-1 text-2xs text-muted hover:text-signal-600">
            <Trash2 size={12} /> Remove
          </Button>
        )}
      </div>
    </div>
  )
}
