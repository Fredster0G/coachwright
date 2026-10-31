import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Camera, ChevronLeft, ChevronRight, Copy, Pause, Play, Send, Video, Waves, X,
} from 'lucide-react'
import { Button, Card, PageHeader } from '@/design'
import { BONES, barPathDeviation, repConsistency, symmetryPct, type Lm, type Pt } from '@/lib/pose'
import { buildSelfReviewSummary } from '@/lib/filmSummary'
import { coachLinkRepo } from '@/db/repo'
import { pushMessageToCoach } from '@/features/sync/companionSyncApi'
import type { CoachLink } from '@/db/types'
import type { PoseTracker } from './tracker'
import { useClipTracking } from './useClipTracking'

/** One frame at 30fps — the step size for the frame-by-frame buttons. */
const FRAME_STEP = 1 / 30

/** Skeleton + bar-path overlay, drawn in the video element's own pixel space
 *  and letterboxed exactly like the video is. Same math as the coach app's
 *  `SkeletonOverlay`; kept as plain SVG (no canvas) so it scales with the
 *  element and needs no resize plumbing. */
function SkeletonOverlay({ landmarks, videoRef, barPath, repaired }: {
  landmarks: Lm[] | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  barPath?: Pt[]
  /** Landmark indices reconstructed rather than seen. */
  repaired?: number[]
}) {
  const v = videoRef.current
  if (!v || !v.videoWidth) return null
  const cw = v.clientWidth, ch = v.clientHeight
  const scale = Math.min(cw / v.videoWidth, ch / v.videoHeight)
  const dw = v.videoWidth * scale, dh = v.videoHeight * scale
  const ox = (cw - dw) / 2, oy = (ch - dh) / 2
  const pt = (i: number) => {
    const lm = landmarks?.[i]
    if (!lm || (lm.visibility ?? 1) < 0.5) return null
    return { x: ox + lm.x * dw, y: oy + lm.y * dh }
  }
  const isRepaired = (i: number) => !!repaired?.includes(i)
  return (
    <svg width="100%" height="100%" className="pointer-events-none absolute inset-0">
      {barPath && barPath.length > 1 && (
        <polyline
          points={barPath.map(p => `${ox + p.x * dw},${oy + p.y * dh}`).join(' ')}
          className="fill-none stroke-ember-500" strokeWidth={2} opacity={0.8}
        />
      )}
      {landmarks && BONES.map(([a, b], i) => {
        const p1 = pt(a), p2 = pt(b)
        if (!p1 || !p2) return null
        // Dashed where a joint was reconstructed rather than seen, so an
        // inference never looks like a measurement.
        const inferred = isRepaired(a) || isRepaired(b)
        return (
          <line
            key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            className="stroke-verde-600" strokeWidth={2} opacity={inferred ? 0.5 : 0.85}
            strokeDasharray={inferred ? '4 3' : undefined}
          />
        )
      })}
      {landmarks?.map((lm, i) => {
        if (i < 11 || (lm.visibility ?? 1) < 0.5) return null // skip face points
        return isRepaired(i)
          ? <circle key={i} cx={ox + lm.x * dw} cy={oy + lm.y * dh} r={3.5} className="fill-none stroke-verde-600" strokeWidth={1.5} opacity={0.8} />
          : <circle key={i} cx={ox + lm.x * dw} cy={oy + lm.y * dh} r={3} className="fill-verde-600" opacity={0.9} />
      })}
    </svg>
  )
}

/** Human names for the joints the occlusion layer can reconstruct — so it
 *  reads "your left knee", not "landmark 25". */
const REPAIRED_JOINT_LABEL: Record<number, string> = {
  25: 'your left knee', 26: 'your right knee',
  13: 'your left elbow', 14: 'your right elbow',
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ctl border border-line px-2.5 py-2">
      <p className="font-mono text-base font-semibold text-ink tnum">{value}</p>
      <p className="text-2xs text-faint">{label}</p>
    </div>
  )
}

/** Film Room self-review (T13).
 *
 *  The client-facing half of the coach's Film Room: record or pick a clip,
 *  watch your own skeleton, get reps/tempo/depth/symmetry. Free and on-device
 *  for the same reason it's free in the coach app — the model is bundled and
 *  runs locally, so it costs nothing per use and paywalling it would be
 *  dishonest. No coach and no connection required.
 *
 *  The video itself never leaves the phone: it isn't uploaded, isn't synced,
 *  and isn't even written to IndexedDB — it lives in an object URL for the
 *  length of the visit. Only the text summary can be sent, and only if you
 *  press the button. */
export function FilmRoomPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const trackerRef = useRef<PoseTracker | null>(null)

  const [clipUrl, setClipUrl] = useState<string>()
  const [clipName, setClipName] = useState('')
  const [tracking, setTracking] = useState(false)
  const [initialising, setInitialising] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [playing, setPlaying] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [showBarPath, setShowBarPath] = useState(false)
  const [coachLink, setCoachLink] = useState<CoachLink>()
  const [sendState, setSendState] = useState<'' | 'sending' | 'sent'>('')

  useEffect(() => { coachLinkRepo.get().then(setCoachLink) }, [])

  // An object URL is a real allocation held by the document — release the
  // previous one whenever the clip is replaced, and on unmount.
  useEffect(() => () => { if (clipUrl) URL.revokeObjectURL(clipUrl) }, [clipUrl])
  useEffect(() => () => { trackerRef.current?.dispose(); trackerRef.current = null }, [])

  const onFatalError = useCallback((message: string) => {
    setError(message)
    setTracking(false)
  }, [])
  const onRecovered = useCallback(() => {
    setNotice('Tracking hiccuped and restarted itself.')
  }, [])

  const analysis = useClipTracking({
    active: tracking, videoRef, clipUrl, showBarPath, trackerRef, onFatalError, onRecovered,
  })

  function pickClip(file: File) {
    setError(''); setNotice(''); setSendState('')
    setClipUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
    setClipName(file.name)
    setPlaying(false)
    trackerRef.current?.resetTimeline()
  }

  async function toggleTracking() {
    if (tracking) {
      setTracking(false)
      // Actually dispose, don't just stop reading: a cached tracker means
      // "turn it off and on again" hands back the same possibly-wedged
      // instance instead of a fresh one (coach app debt #33).
      trackerRef.current?.dispose()
      trackerRef.current = null
      return
    }
    setError(''); setNotice(''); setInitialising(true)
    try {
      const { createPoseTracker } = await import('./tracker')
      const tracker = createPoseTracker()
      await tracker.init()
      trackerRef.current = tracker
      setTracking(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start movement tracking.")
    } finally {
      setInitialising(false)
    }
  }

  function step(direction: -1 | 1) {
    const v = videoRef.current
    if (!v) return
    v.pause()
    setPlaying(false)
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + direction * FRAME_STEP))
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { void v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  const { reps, angles, focusJoint, pose, barPath, trackingStale, repairedJoints } = analysis
  const consistency = repConsistency(reps)
  const symmetry = symmetryPct(angles['Knee (L)'], angles['Knee (R)'])
    ?? symmetryPct(angles['Elbow (L)'], angles['Elbow (R)'])
  const drift = showBarPath && barPath.length > 1 ? barPathDeviation(barPath).driftPct : null
  const lastRep = reps.at(-1)

  const summary = buildSelfReviewSummary({
    reps,
    symmetryPct: symmetry,
    depthConsistency: consistency.depth?.score ?? null,
    tempoConsistency: consistency.tempo?.score ?? null,
    barPathDriftPct: drift,
  })

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary)
      setNotice('Summary copied.')
    } catch {
      setError("Couldn't copy — select the text and copy it manually.")
    }
  }

  async function sendToCoach() {
    if (!coachLink || !summary) return
    setSendState('sending'); setError('')
    try {
      const delivered = await pushMessageToCoach(coachLink, summary)
      setSendState('sent')
      setNotice(delivered ? 'Sent to your coach.' : 'Saved — goes out with your next sync.')
    } catch (e) {
      setSendState('')
      setError(e instanceof Error ? e.message : "Couldn't send.")
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Film Room"
        title="Check your form"
        action={<Link to="/" className="text-muted hover:text-ink" aria-label="Back"><ArrowLeft size={20} /></Link>}
      />

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        // `capture` makes a phone open the camera straight away rather than
        // the file browser — recording a set is the common case here.
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) pickClip(f); e.target.value = '' }}
      />

      {!clipUrl ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <Video size={28} className="text-verde-600" />
          <div>
            <p className="text-sm font-medium text-ink">Record or pick a set</p>
            <p className="mt-1 text-xs text-muted">
              Everything runs on this phone. The video is never uploaded and never leaves the device.
            </p>
          </div>
          <Button variant="primary" onClick={() => fileRef.current?.click()} className="gap-2">
            <Camera size={16} /> Choose a clip
          </Button>
        </Card>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-card bg-black">
            <video
              ref={videoRef}
              src={clipUrl}
              playsInline
              muted
              className="max-h-[55vh] w-full"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={() => trackerRef.current?.resetTimeline()}
            />
            {showSkeleton && tracking && (
              <SkeletonOverlay landmarks={pose} videoRef={videoRef} barPath={showBarPath ? barPath : undefined} repaired={repairedJoints} />
            )}
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => step(-1)} aria-label="Previous frame" className="min-h-[44px] px-3"><ChevronLeft size={18} /></Button>
            <Button variant="primary" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="min-h-[44px] px-5">
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </Button>
            <Button onClick={() => step(1)} aria-label="Next frame" className="min-h-[44px] px-3"><ChevronRight size={18} /></Button>
            <Button onClick={() => fileRef.current?.click()} aria-label="Replace clip" className="min-h-[44px] px-3"><Video size={18} /></Button>
          </div>

          <p className="truncate text-center text-2xs text-faint">{clipName}</p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={tracking ? 'primary' : 'secondary'}
              onClick={toggleTracking}
              disabled={initialising}
              className="min-h-[44px] flex-1 gap-2"
            >
              <Waves size={16} />
              {initialising ? 'Starting…' : tracking ? 'Tracking on' : 'Track my movement'}
            </Button>
          </div>

          {tracking && (
            <div className="flex gap-2">
              <Button onClick={() => setShowSkeleton(s => !s)} className="min-h-[44px] flex-1 text-xs">
                {showSkeleton ? 'Hide skeleton' : 'Show skeleton'}
              </Button>
              <Button onClick={() => setShowBarPath(s => !s)} className="min-h-[44px] flex-1 text-xs">
                {showBarPath ? 'Hide bar path' : 'Show bar path'}
              </Button>
            </div>
          )}
        </>
      )}

      {initialising && (
        <p className="text-center text-xs text-muted">
          Loading the movement model — this happens once, then it works offline.
        </p>
      )}

      {error && (
        <Card className="border-signal-600/40 text-xs text-signal-600">
          <div className="flex items-start gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button>
          </div>
        </Card>
      )}
      {notice && (
        <p className="text-center text-xs text-muted">{notice}</p>
      )}

      {tracking && trackingStale && (
        <Card className="text-xs text-muted">
          No one detected in frame for a while. Check that your whole body is in shot and
          that a bench or rack isn't blocking the camera.
        </Card>
      )}
      {tracking && !trackingStale && repairedJoints.length > 0 && (
        // Said plainly rather than quietly showing inferred positions as
        // measured ones. Naming the joint tells you what to do about it.
        <Card className="text-2xs text-muted">
          The machine is blocking {repairedJoints.map(i => REPAIRED_JOINT_LABEL[i] ?? 'a joint').join(' and ')}.
          {' '}Those points are being worked out from your limb lengths and are drawn dashed — good enough to
          keep counting reps, but treat the numbers as approximate.
        </Card>
      )}

      {tracking && (
        <Card className="space-y-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-faint">
            Movement analysis{focusJoint ? ` · watching your ${focusJoint.replace(/ \((L|R)\)/, '').toLowerCase()}` : ''}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Reps" value={String(reps.length)} />
            <Stat label="Last tempo" value={lastRep ? `${((lastRep.eccentricMs + lastRep.concentricMs) / 1000).toFixed(1)}s` : '—'} />
            <Stat label="Last depth" value={lastRep ? `${lastRep.depth}%` : '—'} />
            <Stat label="Depth consistency" value={consistency.depth ? `${consistency.depth.score}%` : '—'} />
            <Stat label="Tempo consistency" value={consistency.tempo ? `${consistency.tempo.score}%` : '—'} />
            <Stat label="Symmetry" value={symmetry != null ? `${symmetry}%` : '—'} />
          </div>
          {drift != null && (
            <p className="text-2xs text-muted">Bar path drift: <span className="font-mono tnum text-ink">{drift}%</span> off vertical</p>
          )}
          {reps.length === 0 && (
            <p className="text-2xs text-faint">
              Play the clip — reps are counted as they happen. The first couple of seconds
              are used to work out which joint you're working.
            </p>
          )}
        </Card>
      )}

      {summary && (
        <Card className="space-y-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-faint">Summary</p>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink">{summary}</pre>
          <div className="flex gap-2">
            <Button onClick={copySummary} className="min-h-[44px] flex-1 gap-2 text-xs"><Copy size={14} /> Copy</Button>
            {coachLink && (
              <Button
                variant="primary"
                onClick={sendToCoach}
                disabled={sendState === 'sending' || sendState === 'sent'}
                className="min-h-[44px] flex-1 gap-2 text-xs"
              >
                <Send size={14} /> {sendState === 'sent' ? 'Sent' : sendState === 'sending' ? 'Sending…' : 'Send to coach'}
              </Button>
            )}
          </div>
          {coachLink && (
            <p className="text-2xs text-faint">
              Only this text is sent. The video stays on your phone.
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
