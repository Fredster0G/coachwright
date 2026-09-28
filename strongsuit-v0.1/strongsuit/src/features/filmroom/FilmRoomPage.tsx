/* eslint-disable tailwindcss/no-custom-classname */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Clapperboard, Play, Pause, ChevronLeft, ChevronRight, Activity,
  Link2, Link2Off, Ruler, Slash, Eraser, Upload, FlipHorizontal2, AlertTriangle,
  StickyNote, Copy, Download, Send, Trash2, Printer, Camera,
} from 'lucide-react'
import { Button, Card, SectionHeader, EmptyState, Kbd, Select, Input, Stat, Tag, toast, toastError, LogoSpinner, SegmentedControl } from '@/design'
import {
  frameAngles, symmetryPct, BONES, JOINTS, RepCounter, FocusJointPicker, replayHistory, LandmarkSmoother,
  repQualityNote,
  SYMMETRY_PAIRS, repConsistency, barPathDeviation, barPathPoint,
  type JointName, type Lm, type Rep, type AngleSample,
} from '@/lib/pose'
import { OcclusionRepairer } from '@/lib/skeleton'
import {
  EQUIPMENT_PRESETS, presetById, referenceFor, excludedJoints, occlusionHint,
  type EquipmentPreset, type EquipmentPresetId,
} from '@/lib/equipment'
import { compareReps, compareAngles, type RepComparison, type JointDeviation } from '@/lib/filmCompare'
import { buildFilmRoomSummary, buildFilmRoomStatsHtml, type FilmNote } from '@/lib/filmRoomSummary'
import type { PoseTracker } from './tracker'
import { downloadSnapshot } from './snapshot'
import { clientsRepo, messagesRepo } from '@/db/repo'
import { newId, nowIso, fullName, isoDay } from '@/lib/core'
import { downloadText } from '@/db/backup'

// ===== Film Room — local biomechanical video analysis =====
// Everything stays on-device: videos load via object URLs and are never
// persisted. Compare a client's lift against a reference (or their own
// earlier footage) side-by-side or overlaid, step frame-by-frame, lock the
// two clips in sync, and measure joint angles directly on the footage.

type Pt = { x: number; y: number } // percent coords (0..1) of the stage
type Shape =
  | { kind: 'line'; pts: [Pt, Pt] }
  | { kind: 'angle'; pts: [Pt, Pt, Pt] }
type Tool = 'off' | 'line' | 'angle'

interface Clip { url: string; name: string }

function fmtTime(t: number) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}

/** Angle at vertex p2 (degrees), computed in pixel space to respect aspect. */
function angleAt(pts: [Pt, Pt, Pt], w: number, h: number) {
  const [a, b, c] = pts.map(p => ({ x: p.x * w, y: p.y * h }))
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const m1 = Math.hypot(v1.x, v1.y)
  const m2 = Math.hypot(v2.x, v2.y)
  if (!m1 || !m2) return 0
  return Math.round((Math.acos(Math.min(1, Math.max(-1, dot / (m1 * m2)))) * 180) / Math.PI)
}

/** Maps normalized pose landmarks onto the letterboxed video content box and
 *  draws the skeleton. Reads the <video> element's live geometry each render
 *  (the page re-renders per tracked frame anyway). `color` distinguishes the
 *  client's skeleton from the reference's when both are tracked and drawn on
 *  the same composited stage (overlay mode) — otherwise they'd be visually
 *  indistinguishable. */
function SkeletonOverlay({ landmarks, videoRef, barPath, color = 'verde', repaired }: {
  landmarks: Lm[] | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  barPath?: Pt[]
  color?: 'verde' | 'signal'
  /** Landmark indices that were reconstructed rather than seen. */
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
  const boneClass = color === 'signal' ? 'stroke-signal-600' : 'stroke-verde-600'
  const jointClass = color === 'signal' ? 'fill-signal-600' : 'fill-verde-600'
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
        // A bone touching a reconstructed joint is drawn dashed. The coach can
        // see at a glance which part of the skeleton is measured and which is
        // inferred from limb lengths — the same honesty rule the numbers
        // follow, applied to the picture.
        const inferred = isRepaired(a) || isRepaired(b)
        return (
          <line
            key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            className={boneClass} strokeWidth={2} opacity={inferred ? 0.5 : 0.85}
            strokeDasharray={inferred ? '4 3' : undefined}
          />
        )
      })}
      {landmarks && landmarks.map((lm, i) => {
        if (i < 11 || (lm.visibility ?? 1) < 0.5) return null // skip face points
        return isRepaired(i)
          ? (
            <circle
              key={i} cx={ox + lm.x * dw} cy={oy + lm.y * dh} r={3.5}
              className={`fill-none ${boneClass}`} strokeWidth={1.5} opacity={0.8}
            />
          )
          : <circle key={i} cx={ox + lm.x * dw} cy={oy + lm.y * dh} r={3} className={jointClass} opacity={0.9} />
      })}
    </svg>
  )
}

function VideoPane({ label, clip, onPick, videoRef, onScrub, muted = true, overlay, footer, mirrored }: {
  label: string
  clip: Clip | null
  onPick: (file: File) => void
  videoRef: React.RefObject<HTMLVideoElement | null>
  onScrub?: (t: number) => void
  muted?: boolean
  overlay?: React.ReactNode
  footer?: React.ReactNode
  mirrored?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</span>
        {clip && (
          <button
            onClick={() => fileRef.current?.click()}
            className="text-2xs text-muted hover:text-ink"
          >
            Replace video
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
      {clip ? (
        <div className="relative overflow-hidden rounded-card border border-line bg-iron-950">
          <video
            ref={videoRef}
            src={clip.url}
            muted={muted}
            playsInline
            className={`max-h-[420px] w-full object-contain ${mirrored ? '-scale-x-100' : ''}`}
            onSeeked={e => onScrub?.((e.target as HTMLVideoElement).currentTime)}
          />
          {overlay}
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-56 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line text-muted hover:border-verde-600 hover:text-ink"
        >
          <Upload size={20} strokeWidth={1.5} />
          <span className="text-sm font-medium">Load {label.toLowerCase()}</span>
          <span className="text-2xs text-faint">Stays on this device — never uploaded</span>
        </button>
      )}
      {clip && footer}
      {clip && <p className="truncate text-2xs text-faint" title={clip.name}>{clip.name}</p>}
    </div>
  )
}

/** Per-video transport state + controls. Binds to whatever <video> the ref
 *  currently points at; re-binds when the clip (src) changes. */
function useClip(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  clipKey: string | undefined,
  fps: number,
) {
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => setTime(v.currentTime)
    const onMeta = () => setDur(v.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('seeked', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    setTime(v.currentTime); if (v.duration) setDur(v.duration); setPlaying(!v.paused)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('seeked', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [videoRef, clipKey])
  const toggle = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (v.paused) void v.play(); else v.pause()
  }, [videoRef])
  const step = useCallback((frames: number) => {
    const v = videoRef.current; if (!v) return
    v.pause()
    v.currentTime = Math.min(Math.max(0, v.currentTime + frames / fps), v.duration || Infinity)
  }, [videoRef, fps])
  const seek = useCallback((t: number) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = t
  }, [videoRef])
  return { time, dur, playing, toggle, step, seek }
}

/** One transport row: play/pause, frame step, scrubber, time readout. */
function TransportBar({ label, time, dur, playing, fps, onToggle, onStep, onSeek, hints, hintMod, accent }: {
  label?: string
  time: number
  dur: number
  playing: boolean
  fps: number
  onToggle: () => void
  onStep: (frames: number) => void
  onSeek: (t: number) => void
  hints?: boolean
  /** Modifier shown before each key hint ('Alt' on the Reference bar). */
  hintMod?: string
  accent?: 'verde' | 'slate'
}) {
  return (
    <Card pad={false} className="flex items-center gap-2 px-3 py-2">
      {label && (
        <span className={`shrink-0 text-2xs font-semibold uppercase tracking-wide ${accent === 'slate' ? 'text-[var(--chart-3)]' : 'text-verde-600'}`}>
          {label}
        </span>
      )}
      <Button size="sm" variant="primary" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onStep(-1)} title="Back one frame" aria-label="Back one frame">
        <ChevronLeft size={14} />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onStep(1)} title="Forward one frame" aria-label="Forward one frame">
        <ChevronRight size={14} />
      </Button>
      <input
        type="range" min={0} max={dur || 0} step={1 / fps} value={time}
        onChange={e => onSeek(Number(e.target.value))}
        aria-label="Scrub"
        className="min-w-0 flex-1 accent-[var(--verde-600)]"
      />
      <span className="font-mono tabular-nums text-xs text-muted">{fmtTime(time)} / {fmtTime(dur)}</span>
      {hints && (
        <span className="hidden items-center gap-1 text-2xs text-faint lg:flex">
          {hintMod && <><Kbd>{hintMod}</Kbd>+</>}<Kbd>Space</Kbd><Kbd>←</Kbd><Kbd>→</Kbd>
        </span>
      )}
    </Card>
  )
}

/** Shared empty array so a frame with nothing occluded doesn't allocate a new
 *  one 60 times a second and re-render the overlay for no reason. */
const EMPTY_REPAIRED: number[] = []

/** Human names for the joints the occlusion layer can reconstruct — so the
 *  coach is told "the left knee is blocked," not "landmark 25." */
const REPAIRED_JOINT_LABEL: Record<number, string> = {
  25: 'the left knee', 26: 'the right knee',
  13: 'the left elbow', 14: 'the right elbow',
}

export interface ClipAnalysis {
  pose: Lm[] | null
  angles: Partial<Record<JointName, number>>
  focusJoint: JointName | null
  reps: Rep[]
  barPath: Pt[]
  trackingStale: boolean
  /** Landmark indices reconstructed this frame because equipment was blocking
   *  them — drawn differently in the overlay so the coach can see which parts
   *  of the skeleton are inferred rather than measured. */
  repairedJoints: number[]
  /** Every frame's angles since tracking started on this clip, capped at
   *  600 samples — read by the cross-clip comparison engine, not rendered
   *  directly. */
  angleBufferRef: React.RefObject<AngleSample[]>
  reset: () => void
}

/** Owns one clip's entire tracking-analysis pipeline: rep counting, focus-
 *  joint calibration, landmark smoothing, bar-path collection, and the
 *  detection loop itself. FilmRoomPage instantiates this ONCE PER CLIP (A
 *  and B) so both can be tracked at the same time — each instance is
 *  independent, right down to its own PoseTracker (`trackerRef`, owned and
 *  lifecycle-managed by the caller so the two clips' MediaPipe instances
 *  can be created/disposed together in `toggleTracking`). */
function useClipTracking({ active, videoRef, clipUrl, showBarPath, trackerRef, onFatalError, preset }: {
  active: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  clipUrl: string | undefined
  showBarPath: boolean
  trackerRef: React.RefObject<PoseTracker | null>
  onFatalError: (message: string) => void
  /** Equipment context, or null for "let the footage speak". Supplies the
   *  true full-extension reference for depth (debt #10) and the joints this
   *  machine makes meaningless to track. */
  preset: EquipmentPreset | null
}): ClipAnalysis {
  const [pose, setPose] = useState<Lm[] | null>(null)
  const [angles, setAngles] = useState<Partial<Record<JointName, number>>>({})
  const [focusJoint, setFocusJoint] = useState<JointName | null>(null)
  const [reps, setReps] = useState<Rep[]>([])
  const [barPath, setBarPath] = useState<Pt[]>([])
  const [trackingStale, setTrackingStale] = useState(false)
  const [repairedJoints, setRepairedJoints] = useState<number[]>(EMPTY_REPAIRED)

  const consecutiveNoPerson = useRef(0)
  const repCounter = useRef(new RepCounter())
  const jointPicker = useRef(new FocusJointPicker(excludedJoints(preset)))
  const lastBarPathPushMs = useRef(-1000)
  const landmarkSmoother = useRef(new LandmarkSmoother())
  const occlusionRepairer = useRef(new OcclusionRepairer())
  const angleBufferRef = useRef<AngleSample[]>([])
  const hasReplayed = useRef(false)
  const consecutiveErrors = useRef(0)

  const reset = useCallback(() => {
    repCounter.current = new RepCounter()
    jointPicker.current = new FocusJointPicker(excludedJoints(preset))
    landmarkSmoother.current.reset()
    occlusionRepairer.current.reset()
    angleBufferRef.current = []
    hasReplayed.current = false
    consecutiveErrors.current = 0
    consecutiveNoPerson.current = 0
    lastBarPathPushMs.current = -1000
    setReps([])
    setFocusJoint(null)
    setPose(null)
    setAngles({})
    setBarPath([])
    setTrackingStale(false)
    setRepairedJoints(EMPTY_REPAIRED)
  }, [preset])

  // A new clip on this slot — or a different equipment context — means a new
  // set of assumptions, so analysis restarts rather than mixing references.
  useEffect(() => { reset() }, [clipUrl, reset])
  // Toggling bar-path visibility always starts a fresh trace rather than
  // resuming a possibly-stale one from before it was hidden.
  useEffect(() => { setBarPath([]) }, [showBarPath])

  const activeRef = useRef(active)
  activeRef.current = active
  const onFatalErrorRef = useRef(onFatalError)
  onFatalErrorRef.current = onFatalError

  useEffect(() => {
    if (!active) return
    const v = videoRef.current
    if (!v) return
    let cancelled = false
    let handle = 0
    let process: (() => void) | null = null

    trackerRef.current?.resetTimeline()

    const onFrame = () => {
      if (cancelled || !activeRef.current) return
      const tracker = trackerRef.current
      if (!tracker) return
      const frame = tracker.detectFrame(v)
      if (cancelled) return

      if (frame.error) {
        consecutiveErrors.current++
        // A handful of detection exceptions in a row (not just "no person
        // visible," an actual thrown error) means this clip's tracker is
        // wedged — recover automatically instead of silently going blind
        // for the rest of the clip.
        if (consecutiveErrors.current >= 12) {
          consecutiveErrors.current = 0
          void (async () => {
            const { createPoseTracker } = await import('./tracker')
            trackerRef.current?.dispose()
            const fresh = createPoseTracker()
            trackerRef.current = fresh
            try {
              await fresh.init()
              fresh.resetTimeline()
              if (!cancelled) toast('Movement tracking hiccuped and restarted itself.')
            } catch (e) {
              if (!cancelled) onFatalErrorRef.current(e instanceof Error ? e.message : 'Movement tracking stopped working. Try again in a moment.')
              return
            }
            schedule()
          })()
          return
        }
        schedule()
        return
      }
      consecutiveErrors.current = 0

      if (frame.landmarks) {
        consecutiveNoPerson.current = 0
        setTrackingStale(stale => (stale ? false : stale))

        // Smooth before anything downstream touches these — the skeleton
        // overlay, angle math, and bar-path tracking all read from this
        // same smoothed array, not the model's raw per-frame output.
        const smoothed = landmarkSmoother.current.smooth(frame.landmarks, frame.timestampMs)
        // Then repair occlusion. Order matters: the repairer calibrates limb
        // lengths from what it sees, so it should learn from the stable
        // smoothed positions rather than raw per-frame jitter. Reconstructed
        // joints come back with visibility set to the reconstruction's
        // confidence, so `frameAngles`' existing gate drops anything the
        // repairer doesn't stand behind — no other code needs to change.
        const repair = occlusionRepairer.current.repair(smoothed)
        const landmarks = repair.landmarks
        setRepairedJoints(repair.repaired.length ? repair.repaired : EMPTY_REPAIRED)
        const a = frameAngles(landmarks)
        setPose(landmarks)
        setAngles(a)
        jointPicker.current.push(a)
        const focus = jointPicker.current.best()
        setFocusJoint(focus)

        angleBufferRef.current.push({ tMs: frame.timestampMs, angles: a })
        if (angleBufferRef.current.length > 600) angleBufferRef.current.shift()

        if (focus && !hasReplayed.current) {
          // First time a focus joint exists. The depth reference depends on
          // WHICH joint is working, so the counter is built here rather than
          // up front — on a leg press this is where 175° replaces "the widest
          // angle we happened to see", which is debt #10's whole fix.
          const ref = referenceFor(preset, focus, angleBufferRef.current
            .reduce((max, s) => Math.max(max, s.angles[focus] ?? -Infinity), -Infinity))
          repCounter.current = new RepCounter(
            ref.basis === 'preset'
              ? { referenceExtended: ref.extended, referenceTarget: ref.target }
              : {},
          )
          // Replay everything buffered since tracking started, so a rep that
          // already happened during calibration still gets scored instead of
          // silently vanishing.
          hasReplayed.current = true
          replayHistory(repCounter.current, angleBufferRef.current, focus)
          setReps([...repCounter.current.reps])
        } else if (focus && a[focus] != null) {
          // Tell the counter whether THIS joint was reconstructed this frame,
          // so each rep can be graded on how well it was actually seen. Only
          // the working joint matters — a blocked elbow says nothing about
          // the trustworthiness of a squat's depth.
          const occluded = repair.repaired.some(i => JOINTS[focus].includes(i as never))
          const rep = repCounter.current.push(frame.timestampMs, a[focus]!, occluded)
          if (rep) setReps([...repCounter.current.reps])
        }

        if (showBarPath) {
          // Throttled to ~20 points/sec: pushing a state update (and
          // recomputing a 600-point SVG polyline) on every single tracked
          // frame — up to 60/sec — was heavy enough to visibly drag down
          // both the tracking loop and video playback. A trace this dense
          // doesn't need every frame to look smooth.
          if (frame.timestampMs - lastBarPathPushMs.current >= 50) {
            lastBarPathPushMs.current = frame.timestampMs
            const p = barPathPoint(landmarks)
            if (p) setBarPath(path => (path.length > 600 ? path.slice(-600) : path).concat(p))
          }
        }
      } else {
        consecutiveNoPerson.current++
        // ~60 misses in a row (roughly 1–2s of active playback) — long
        // enough that this almost certainly isn't just a single bad frame.
        if (consecutiveNoPerson.current === 60) setTrackingStale(true)
      }
      schedule()
    }
    const rvfc = (v as Partial<{ requestVideoFrameCallback: (cb: () => void) => number }>).requestVideoFrameCallback
    const schedule = () => {
      if (cancelled) return
      if (rvfc) {
        handle = rvfc.call(v, () => void onFrame())
      } else if (!process) {
        // fallback for browsers without rVFC: poll on timeupdate/seeked
        process = () => void onFrame()
        v.addEventListener('timeupdate', process)
        v.addEventListener('seeked', process)
      }
    }
    void onFrame() // analyze the currently shown frame immediately
    return () => {
      cancelled = true
      const cancel = (v as Partial<{ cancelVideoFrameCallback: (h: number) => void }>).cancelVideoFrameCallback
      if (handle && cancel) cancel.call(v, handle)
      if (process) {
        v.removeEventListener('timeupdate', process)
        v.removeEventListener('seeked', process)
      }
    }
  }, [active, videoRef, clipUrl, showBarPath, trackerRef])

  return { pose, angles, focusJoint, reps, barPath, trackingStale, repairedJoints, angleBufferRef, reset }
}

/** The single-clip stats readout: reps, tempo, depth, symmetry, consistency,
 *  live joint angles, and the "no person detected" hint. Rendered once for
 *  a single tracked clip, or twice side-by-side (Client / Reference) when
 *  both are tracked at the same time. */
function MovementAnalysisCard({ label, analysis, showBarPath, accent = 'verde', presetHint }: {
  label?: string
  analysis: ClipAnalysis
  showBarPath: boolean
  accent?: 'verde' | 'signal'
  /** What this equipment tends to block, shown before anything goes wrong. */
  presetHint?: string | null
}) {
  const { angles, focusJoint, reps, barPath, trackingStale, repairedJoints } = analysis
  const accentClass = accent === 'signal' ? 'text-signal-600' : 'text-verde-600'
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${accentClass}`}>
          <Activity size={14} /> {label ? `${label} — movement analysis` : 'Movement analysis'}
          {focusJoint && <span className="font-normal normal-case text-faint">· working joint: {focusJoint}</span>}
        </div>
        {!label && <span className="text-2xs text-faint">Runs on this device — nothing is uploaded</span>}
      </div>
      {trackingStale && (
        <p className="mb-3 flex items-start gap-1.5 rounded-ctl border border-ember-500/30 bg-ember-500/10 px-3 py-2 text-xs text-ember-600">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          No person detected right now — check that {label ? `the ${label.toLowerCase()}` : 'the'} video's
          framing isn't blocked by equipment (a bench, a rack upright, a machine arm) or that the lifter hasn't stepped out of frame.
        </p>
      )}
      {/* Before-the-fact warning: a coach can still move the camera, but they
          can't re-shoot a set that's already happened. */}
      {presetHint && !trackingStale && repairedJoints.length === 0 && (
        <p className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2 text-2xs text-muted">
          {presetHint}
        </p>
      )}
      {!trackingStale && repairedJoints.length > 0 && (
        // Says it plainly rather than quietly presenting inferred positions as
        // measured ones. Naming the joint tells the coach what to actually do
        // about it — move the camera — which "low confidence" would not.
        <p className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2 text-2xs text-muted">
          Equipment is blocking {repairedJoints.map(i => REPAIRED_JOINT_LABEL[i] ?? 'a joint').join(' and ')}.
          {' '}Those points are being reconstructed from limb lengths and are drawn dashed — accurate enough to keep
          counting reps, but treat the numbers as approximate.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Reps detected" value={reps.length} />
        <Stat
          label="Last rep tempo"
          value={reps.length
            ? `${(reps.at(-1)!.eccentricMs / 1000).toFixed(1)}↓ ${(reps.at(-1)!.concentricMs / 1000).toFixed(1)}↑`
            : '—'}
          unit={reps.length ? 's' : undefined}
        />
        {/* Same rule as the per-rep table: if the joint was hidden at the
            bottom, this headline number is an inference, and a headline is
            the worst place to present one as a measurement. */}
        <Stat
          label="Depth (last rep)"
          value={!reps.length ? '—' : reps.at(-1)!.quality === 'unmeasurable' ? 'blocked' : reps.at(-1)!.depth}
          unit={reps.length && reps.at(-1)!.quality !== 'unmeasurable' ? '%' : undefined}
          tone={reps.length && reps.at(-1)!.quality !== 'unmeasurable' && reps.at(-1)!.depth >= 100 ? 'verde' : 'ink'}
        />
        <Stat
          label="Symmetry"
          value={(() => {
            const scores = SYMMETRY_PAIRS
              .map(([l, r]) => symmetryPct(angles[l], angles[r]))
              .filter((s): s is number => s !== null)
            return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—'
          })()}
          unit="%"
        />
      </div>
      {reps.length >= 2 && (() => {
        const consistency = repConsistency(reps)
        return (
          <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-4">
            <Stat
              label="Depth consistency" unit={consistency.depth ? '%' : undefined}
              value={consistency.depth?.score ?? '—'}
              tone={consistency.depth && consistency.depth.score < 70 ? 'ember' : 'ink'}
            />
            <Stat
              label="Tempo consistency" unit={consistency.tempo ? '%' : undefined}
              value={consistency.tempo?.score ?? '—'}
              tone={consistency.tempo && consistency.tempo.score < 70 ? 'ember' : 'ink'}
            />
            {showBarPath && barPath.length > 5 && (
              <Stat
                label="Bar path drift" value={barPathDeviation(barPath).driftPct} unit="%"
                tone={barPathDeviation(barPath).driftPct > 15 ? 'ember' : 'verde'}
              />
            )}
          </div>
        )
      })()}
      {Object.keys(angles).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
          {(Object.entries(angles) as [JointName, number][]).map(([name, a]) => (
            <span key={name} className={`text-2xs ${name === focusJoint ? 'text-ink font-medium' : 'text-faint'}`}>
              {name} <span className="font-mono tabular-nums">{a}°</span>
            </span>
          ))}
        </div>
      )}
      {/* Per-rep breakdown (T6b). The cards above only ever showed the LAST
          rep, which hides exactly what a coach is looking for — the rep where
          depth fell off or the tempo ran away. Rows are marked when they
          deviate meaningfully from the set's own average, so the outlier is
          findable at a glance instead of by reading four columns of numbers. */}
      {reps.length > 0 && (() => {
        // Withholding a rep's depth and then folding it into the set average
        // anyway would be the same dishonesty one level up — the number would
        // just reappear as a baseline every other row is judged against. Reps
        // whose depth we don't stand behind are excluded from the average;
        // tempo is unaffected by occlusion, so it uses every rep.
        const trusted = reps.filter(r => r.quality !== 'unmeasurable')
        const depthBasis = trusted.length ? trusted : reps
        const avgDepth = depthBasis.reduce((a, r) => a + r.depth, 0) / depthBasis.length
        const totals = reps.map(r => r.eccentricMs + r.concentricMs)
        const avgTempo = totals.reduce((a, b) => a + b, 0) / reps.length
        return (
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-2xs font-semibold uppercase tracking-wide text-faint">Rep by rep</span>
              <span className="text-2xs text-faint">▲ / ▼ = off this set's average</span>
            </div>
            {/* eslint-disable-next-line tailwindcss/no-custom-classname */}
            <div className="max-h-48 overflow-y-auto panel-scroll">
              <table className="w-full text-2xs">
                <thead className="sticky top-0 bg-surface text-faint">
                  <tr className="text-start">
                    <th className="py-1 pe-2 font-medium">#</th>
                    <th className="py-1 pe-2 font-medium">Bottom</th>
                    <th className="py-1 pe-2 font-medium">Down / Up</th>
                    <th className="py-1 font-medium">Depth</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {reps.map((r, i) => {
                    const total = r.eccentricMs + r.concentricMs
                    const depthOff = r.depth < avgDepth - 8
                    const tempoOff = Math.abs(total - avgTempo) > avgTempo * 0.25
                    return (
                      <tr key={i} className="border-t border-line/60">
                        <td className="py-1 pe-2 text-faint">{i + 1}</td>
                        <td className="py-1 pe-2 text-ink">{r.bottomAngle}°</td>
                        <td className={`py-1 pe-2 ${tempoOff ? 'text-ember-600' : 'text-ink'}`}>
                          {(r.eccentricMs / 1000).toFixed(1)} / {(r.concentricMs / 1000).toFixed(1)}s
                          {tempoOff && <span className="ms-1">{total > avgTempo ? '▲' : '▼'}</span>}
                        </td>
                        {/* Depth is withheld — not shown greyed, WITHHELD —
                            when the joint was hidden at the bottom of the rep.
                            A number the coach can't trust is worse than an
                            honest gap; the tooltip says which it is and why.
                            The leading dot uses the confidence tokens from the
                            design-system import (index.css) — measured/estimated/
                            unmeasurable is exactly the distinction RepQuality
                            already carries, just not painted until now. */}
                        {r.quality === 'unmeasurable' ? (
                          <td className="py-1 text-faint" title={repQualityNote(r.quality) ?? undefined}>
                            <span className="me-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--confidence-unmeasurable)]" />
                            — <span className="font-sans">blocked</span>
                          </td>
                        ) : (
                          <td
                            className={`py-1 ${depthOff ? 'text-ember-600' : 'text-ink'} ${r.quality === 'partial' ? 'decoration-dotted underline decoration-from-font' : ''}`}
                            title={r.quality ? repQualityNote(r.quality) ?? undefined : undefined}
                          >
                            {r.quality && (
                              <span
                                className={`me-1 inline-block h-1.5 w-1.5 rounded-full ${
                                  r.quality === 'partial' ? 'bg-[var(--confidence-estimated)]' : 'bg-[var(--confidence-measured)]'
                                }`}
                              />
                            )}
                            {r.depth}%{depthOff && <span className="ms-1">▼</span>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Says what depth is measured against. Without a preset the
                reference is whatever range appeared in the clip, which
                under-reports whenever the lifter never reaches full extension
                — debt #10. Presenting both the same way is how a coach ends
                up trusting the weaker one. */}
            <p className="mt-1.5 text-2xs text-faint">
              {reps.some(r => r.depthBasis === 'preset')
                ? 'Depth is measured against full extension for this equipment.'
                : 'Depth is measured against the range in this clip — set the equipment above for a truer figure on machines.'}
            </p>
          </div>
        )
      })()}
      {reps.length === 0 && (
        <p className="mt-3 text-xs text-muted">
          Play the clip through a few reps — the counter calibrates from the movement itself, picks the working joint automatically, and starts scoring depth and tempo.
        </p>
      )}
    </Card>
  )
}

/** The "advanced breakdown" — direct client-vs-reference numbers, not just
 *  two skeletons shown next to each other. Rep-by-rep depth/tempo deltas
 *  work regardless of sync state (reps are matched by ordinal); the joint-
 *  angle deviation list needs the clips to actually be time-aligned (sync-
 *  locked or overlaid), so it only appears once that's true. */
function ComparisonCard({ repComparisons, jointDeviations, hasOffset }: {
  repComparisons: RepComparison[]
  jointDeviations: JointDeviation[]
  hasOffset: boolean
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
        <Activity size={14} /> Client vs. reference
      </div>
      {repComparisons.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="text-faint">
                <th className="py-1 pe-3 font-medium">Rep</th>
                <th className="py-1 pe-3 font-medium">Depth (client → ref)</th>
                <th className="py-1 pe-3 font-medium">Δ depth</th>
                <th className="py-1 pe-3 font-medium">Tempo (client → ref)</th>
                <th className="py-1 font-medium">Δ tempo</th>
              </tr>
            </thead>
            <tbody>
              {repComparisons.map(r => (
                <tr key={r.index} className="border-t border-line">
                  <td className="py-1.5 pe-3 font-mono tabular-nums">{r.index + 1}</td>
                  <td className="py-1.5 pe-3 font-mono tabular-nums">{r.depthA}% → {r.depthB}%</td>
                  <td className={`py-1.5 pe-3 font-mono tabular-nums ${r.depthDeltaPts != null && Math.abs(r.depthDeltaPts) >= 15 ? 'text-ember-600' : 'text-muted'}`}>
                    {r.depthDeltaPts != null ? `${r.depthDeltaPts > 0 ? '+' : ''}${r.depthDeltaPts}pts` : '—'}
                  </td>
                  <td className="py-1.5 pe-3 font-mono tabular-nums">{r.tempoASec?.toFixed(1)}s → {r.tempoBSec?.toFixed(1)}s</td>
                  <td className={`py-1.5 font-mono tabular-nums ${r.tempoDeltaPct != null && Math.abs(r.tempoDeltaPct) >= 20 ? 'text-ember-600' : 'text-muted'}`}>
                    {r.tempoDeltaPct != null ? `${r.tempoDeltaPct > 0 ? '+' : ''}${r.tempoDeltaPct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted">Play both clips through at least one matching rep to compare depth and tempo, rep for rep.</p>
      )}

      {hasOffset ? (
        jointDeviations.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-faint">Joint angle deviation (biggest first)</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {jointDeviations.slice(0, 8).map(d => (
                <span key={d.joint} className={`text-2xs ${d.avgDeltaDeg >= 12 ? 'text-ember-600 font-medium' : 'text-muted'}`}>
                  {d.joint} <span className="font-mono tabular-nums">{d.avgDeltaDeg}°</span> avg
                </span>
              ))}
            </div>
          </div>
        )
      ) : (
        <p className="mt-3 text-2xs text-faint">Lock sync (or switch to Overlay) to also see a joint-by-joint angle comparison at matched moments in the lift.</p>
      )}
    </Card>
  )
}

export default function FilmRoomPage() {
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [clipA, setClipA] = useState<Clip | null>(null)
  const [clipB, setClipB] = useState<Clip | null>(null)
  const [mode, setMode] = useState<'side' | 'overlay'>('side')
  const [opacity, setOpacity] = useState(0.5)
  const [fps, setFps] = useState(30)
  const [speed, setSpeed] = useState(1)
  const [syncOffset, setSyncOffset] = useState<number | null>(null) // B time − A time
  const [mirrorA, setMirrorA] = useState(false)
  const [mirrorB, setMirrorB] = useState(false)
  const [tool, setTool] = useState<Tool>('off')
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Pt[]>([])
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })

  // ---- timestamped notes + client export ----
  const [notes, setNotes] = useState<FilmNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [sendToClientId, setSendToClientId] = useState('')
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])

  // ---- movement tracking (on-device AI) ----
  const [tracking, setTracking] = useState<'off' | 'loading' | 'on'>('off')
  const [showBarPath, setShowBarPath] = useState(false)
  // Which clip(s) the model analyzes. 'both' runs two independent
  // PoseLandmarker instances at the same time — not one after another — so
  // the comparison breakdown below has genuinely matched-in-time data from
  // both sides, not just two separately-tracked clips shown side by side.
  const [trackTarget, setTrackTarget] = useState<'A' | 'B' | 'both'>('A')

  // What the lifter is filming on. 'auto' means no assumptions — depth is
  // measured against whatever range appears in the clip, which is honest but
  // weaker on machines that never show full extension (debt #10).
  const [presetId, setPresetId] = useState<EquipmentPresetId>('auto')
  const preset = useMemo(() => presetById(presetId), [presetId])
  const presetHint = useMemo(() => occlusionHint(preset), [preset])

  const trackerARef = useRef<PoseTracker | null>(null)
  const trackerBRef = useRef<PoseTracker | null>(null)
  // Which pose model actually ended up running — set once tracking starts,
  // from the tracker's own getActiveModel() rather than assumed, since a
  // downloaded upgrade can silently fall back to the bundled one if its
  // cached file fails to load (see tracker.ts). null until tracking is on.
  const [activeModel, setActiveModel] = useState<'pose-lite' | 'pose-full' | 'pose-heavy' | null>(null)

  const wantA = (trackTarget === 'A' || trackTarget === 'both') && !!clipA
  const wantB = (trackTarget === 'B' || trackTarget === 'both') && !!clipB
  const activeA = tracking === 'on' && wantA
  const activeB = tracking === 'on' && wantB

  const stopTracking = useCallback(() => {
    setTracking('off')
    // Dispose rather than just flipping state off: if a landmarker had
    // wedged itself into a bad state, leaving it cached meant turning
    // tracking back on handed back that same broken instance — the natural
    // "turn it off and on again" recovery didn't actually recover anything.
    trackerARef.current?.dispose()
    trackerBRef.current?.dispose()
    trackerARef.current = null
    trackerBRef.current = null
    setActiveModel(null)
  }, [])

  const toggleTracking = useCallback(async () => {
    if (tracking !== 'off') {
      stopTracking()
      return
    }
    setTracking('loading')
    try {
      const { createPoseTracker } = await import('./tracker')
      const inits: Promise<void>[] = []
      if (wantA) { trackerARef.current = createPoseTracker(); inits.push(trackerARef.current.init()) }
      if (wantB) { trackerBRef.current = createPoseTracker(); inits.push(trackerBRef.current.init()) }
      await Promise.all(inits)
      setTracking('on')
      // Both trackers resolve independently but always agree in practice —
      // they read the same cache at effectively the same moment — so either
      // one's answer is representative; A is picked because it's the one
      // that always exists outside 'B'-only mode.
      setActiveModel(trackerARef.current?.getActiveModel() ?? trackerBRef.current?.getActiveModel() ?? null)
    } catch (e) {
      trackerARef.current?.dispose(); trackerARef.current = null
      trackerBRef.current?.dispose(); trackerBRef.current = null
      setTracking('off')
      toastError(e instanceof Error ? e.message : "Couldn't start movement tracking.")
    }
  }, [tracking, wantA, wantB, stopTracking])

  const onFatalTrackingError = useCallback((message: string) => {
    stopTracking()
    toastError(message)
  }, [stopTracking])

  // Two fully independent analysis pipelines — reps, angles, smoothing,
  // bar-path, all of it — one per clip. In single-target modes only one is
  // ever `active`, so behavior there is unchanged from before; in 'both'
  // mode they run concurrently against two separate PoseTracker instances.
  const trackA = useClipTracking({
    active: activeA, videoRef: videoA, clipUrl: clipA?.url, showBarPath,
    trackerRef: trackerARef, onFatalError: onFatalTrackingError, preset,
  })
  const trackB = useClipTracking({
    active: activeB, videoRef: videoB, clipUrl: clipB?.url, showBarPath,
    trackerRef: trackerBRef, onFatalError: onFatalTrackingError, preset,
  })
  // Single-target UI (the note timestamp button, the classic Movement
  // Analysis card) reads from whichever clip is actually the target;
  // defaults to A in 'both' mode, matching the master-transport convention
  // used everywhere else in this page (A drives, B follows).
  const primary = trackTarget === 'B' ? trackB : trackA

  // If the currently-tracked clip gets cleared but the other slot has one,
  // follow it rather than silently pointing at nothing — and if 'both' loses
  // either side, fall back to whichever single clip remains loaded.
  useEffect(() => {
    if (trackTarget === 'A' && !clipA && clipB) setTrackTarget('B')
    else if (trackTarget === 'B' && !clipB && clipA) setTrackTarget('A')
    else if (trackTarget === 'both' && (!clipA || !clipB)) setTrackTarget(clipA ? 'A' : clipB ? 'B' : 'A')
  }, [clipA, clipB, trackTarget])

  // ---- client-vs-reference comparison (only meaningful with both tracked) ----
  const repComparisons = useMemo<RepComparison[]>(
    () => (trackTarget === 'both' && tracking === 'on' ? compareReps(trackA.reps, trackB.reps) : []),
    [trackTarget, tracking, trackA.reps, trackB.reps],
  )

  const pick = (setter: (c: Clip) => void) => (file: File) => {
    setter({ url: URL.createObjectURL(file), name: file.name })
  }
  // revoke object URLs when clips are replaced or the page unmounts
  useEffect(() => () => { if (clipA) URL.revokeObjectURL(clipA.url) }, [clipA])
  useEffect(() => () => { if (clipB) URL.revokeObjectURL(clipB.url) }, [clipB])

  // per-video transport controllers (each drives its own <video>)
  const A = useClip(videoA, clipA?.url, fps)
  const B = useClip(videoB, clipB?.url, fps)

  // Two clips are "linked" when overlaid or sync-locked: one transport drives
  // both, holding B at A's time plus the locked offset (0 in overlay).
  const effectiveOffset = syncOffset !== null
    ? syncOffset
    : (mode === 'overlay' && clipA && clipB ? 0 : null)
  const linked = effectiveOffset !== null && !!clipB

  // Per-joint angle deviation between the two clips only means anything once
  // they're actually time-aligned (sync-locked or overlaid) — without a
  // known offset there's no honest way to say "the same moment" in both.
  const jointDeviations = useMemo<JointDeviation[]>(
    () => (trackTarget === 'both' && tracking === 'on' && effectiveOffset !== null
      ? compareAngles(trackA.angleBufferRef.current, trackB.angleBufferRef.current, effectiveOffset * 1000)
      : []),
    [trackTarget, tracking, effectiveOffset, trackA.reps.length, trackB.reps.length, trackA.angleBufferRef, trackB.angleBufferRef],
  )

  const alignB = useCallback(() => {
    const a = videoA.current, b = videoB.current
    if (a && b && effectiveOffset !== null) {
      b.currentTime = Math.max(0, a.currentTime + effectiveOffset)
    }
  }, [effectiveOffset])

  // Continuous drift correction. alignB() only fires on a transport action
  // (play/step/scrub) — it does NOT keep firing during sustained playback.
  // Two independently-playing <video> elements are not guaranteed to stay
  // frame-locked; real decode/render differences between two different
  // files let them drift apart by a visible amount within seconds, which is
  // exactly "the videos stop playing together" even though sync is locked.
  // Re-snap B against A's clock on every timeupdate while they're linked.
  useEffect(() => {
    if (!linked) return
    const a = videoA.current, b = videoB.current
    if (!a || !b) return
    const onTimeUpdate = () => {
      if (effectiveOffset === null) return
      const target = Math.max(0, a.currentTime + effectiveOffset)
      if (Math.abs(b.currentTime - target) > 0.15) {
        b.currentTime = target
      }
    }
    a.addEventListener('timeupdate', onTimeUpdate)
    return () => a.removeEventListener('timeupdate', onTimeUpdate)
  }, [linked, effectiveOffset, clipA, clipB])

  useEffect(() => {
    for (const v of [videoA.current, videoB.current]) if (v) v.playbackRate = speed
  }, [speed, clipA, clipB])

  // stage size for pixel-true angle math + label placement
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [clipA, mode])

  // master transport = drives A, and B too when the clips are linked
  const masterToggle = useCallback(() => {
    const a = videoA.current, b = videoB.current
    if (!a) return
    if (a.paused) {
      alignB()
      void a.play()
      if (b && linked) void b.play()
    } else {
      a.pause(); if (linked) b?.pause()
    }
  }, [alignB, linked])

  const masterStep = useCallback((frames: number) => {
    const a = videoA.current
    if (!a) return
    a.pause(); if (linked) videoB.current?.pause()
    a.currentTime = Math.min(Math.max(0, a.currentTime + frames / fps), a.duration || Infinity)
    alignB()
  }, [fps, alignB, linked])

  const masterSeek = useCallback((t: number) => {
    const a = videoA.current
    if (!a) return
    a.currentTime = t
    alignB()
  }, [alignB])

  const lockSync = () => {
    const a = videoA.current, b = videoB.current
    if (!a || !b) return
    setSyncOffset(b.currentTime - a.currentTime)
  }

  // ---- timestamped notes ----
  const addNote = () => {
    if (!noteDraft.trim()) return
    const v = (trackTarget === 'B' ? videoB : videoA).current ?? videoA.current ?? videoB.current
    const tMs = Math.round((v?.currentTime ?? 0) * 1000)
    setNotes(n => [...n, { id: newId(), tMs, text: noteDraft.trim() }].sort((x, y) => x.tMs - y.tMs))
    setNoteDraft('')
  }
  const removeNote = (id: string) => setNotes(n => n.filter(x => x.id !== id))
  const seekToNote = useCallback((tMs: number) => {
    if (clipA) masterSeek(tMs / 1000)
    else if (clipB) B.seek(tMs / 1000)
  }, [clipA, clipB, masterSeek, B])

  // Stats for the client-facing summary — mirrors the Movement Analysis
  // card's own numbers so "what got exported" always matches what's on
  // screen. Reflects the primary/client track even in 'both' mode; the
  // comparison breakdown is a separate, on-screen-only view (see debt log).
  const summaryStats = useMemo(() => {
    const scores = SYMMETRY_PAIRS.map(([l, r]) => symmetryPct(primary.angles[l], primary.angles[r])).filter((s): s is number => s !== null)
    const symmetryAvg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
    const consistency = primary.reps.length >= 2 ? repConsistency(primary.reps) : null
    const barDrift = showBarPath && primary.barPath.length > 5 ? barPathDeviation(primary.barPath).driftPct : null
    return {
      reps: primary.reps,
      symmetryPct: symmetryAvg,
      depthConsistency: consistency?.depth?.score ?? null,
      tempoConsistency: consistency?.tempo?.score ?? null,
      barPathDriftPct: barDrift,
    }
  }, [primary.angles, primary.reps, showBarPath, primary.barPath])

  const selectedClient = clients.find(c => c.id === sendToClientId)
  const summaryText = useMemo(
    () => buildFilmRoomSummary(summaryStats, notes, selectedClient ? fullName(selectedClient) : undefined),
    [summaryStats, notes, selectedClient],
  )

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText)
      toast('Copied to clipboard.')
    } catch {
      toastError("Couldn't copy — your browser may be blocking clipboard access.")
    }
  }
  function downloadSummary() {
    downloadText(`film-room-notes-${isoDay(new Date())}.txt`, summaryText)
  }
  async function sendSummaryToClient() {
    if (!selectedClient) return
    await messagesRepo.create({
      clientId: selectedClient.id, date: nowIso(), direction: 'outbound', channel: 'other', content: summaryText,
    })
    toast(`Logged to ${fullName(selectedClient)}'s message history.`)
  }
  /** PNG still of the current frame with the skeleton and bar path burned in
   *  (T6b) — the thing a coach actually sends a client. Captures whichever
   *  clip is being tracked; in dual-track mode that's the client's. */
  async function saveSnapshot() {
    const useReference = trackTarget === 'B'
    const video = (useReference ? videoB : videoA).current
    const track = useReference ? trackB : trackA
    if (!video) { toastError('Load a clip first.'); return }
    const stamp = isoDay(new Date())
    const at = `${Math.floor(video.currentTime / 60)}:${String(Math.floor(video.currentTime % 60)).padStart(2, '0')}`
    const ok = await downloadSnapshot(video, `film-room-${stamp}-${at.replace(':', 'm')}s.png`, {
      landmarks: tracking === 'on' ? track.pose : null,
      barPath: tracking === 'on' && showBarPath ? track.barPath : undefined,
      caption: `${selectedClient ? fullName(selectedClient) + ' · ' : ''}${at}${track.reps.length ? ` · rep ${track.reps.length}` : ''}`,
    })
    if (ok) toast('Snapshot saved.')
    else toastError("Couldn't capture a frame — let the clip load and try again.")
  }

  function printStatsSheet() {
    // Film Room's data is entirely in-memory (videos are never persisted),
    // so this can't be a normal Dexie-backed sibling print route the way
    // PrintSessionSheet/PrintProgressReport are — open a standalone print
    // window built straight from the live state instead.
    const win = window.open('', '_blank', 'width=820,height=920')
    if (!win) { toastError("Couldn't open the print window — check your browser's popup blocker."); return }
    win.document.write(buildFilmRoomStatsHtml(summaryStats, notes, { clientName: selectedClient ? fullName(selectedClient) : undefined }))
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  // keyboard: space play/pause, arrows step 1 frame (shift = 5). With Alt
  // held, the same keys drive the Reference clip when it isn't synced to the
  // client's (DEBT-13) — and plain keys do when it's the only clip loaded.
  const refToggle = B.toggle, refStep = B.step
  const refIndependent = !!clipB && (!linked || !clipA)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return
      const toRef = refIndependent && (e.altKey || !clipA)
      const toggle = toRef ? refToggle : masterToggle
      const step = toRef ? refStep : masterStep
      if (e.key === ' ') { e.preventDefault(); toggle() }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(e.shiftKey ? 5 : 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(e.shiftKey ? -5 : -1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [masterToggle, masterStep, refToggle, refStep, refIndependent, clipA])

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === 'off') return
    const rect = e.currentTarget.getBoundingClientRect()
    const p: Pt = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
    const next = [...draft, p]
    const needed = tool === 'line' ? 2 : 3
    if (next.length === needed) {
      setShapes(s => [...s, { kind: tool, pts: next as [Pt, Pt] & [Pt, Pt, Pt] } as Shape])
      setDraft([])
    } else {
      setDraft(next)
    }
  }

  const { w, h } = stageSize
  const annotations = useMemo(() => (
    <svg width="100%" height="100%" className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {shapes.map((s, i) => {
        const px = s.pts.map(p => ({ x: p.x * w, y: p.y * h }))
        if (s.kind === 'line') {
          return <line key={i} x1={px[0].x} y1={px[0].y} x2={px[1].x} y2={px[1].y} className="stroke-ember-500" strokeWidth={2} />
        }
        const deg = angleAt(s.pts, w, h)
        return (
          <g key={i}>
            <polyline
              points={px.map(p => `${p.x},${p.y}`).join(' ')}
              className="fill-none stroke-ember-500" strokeWidth={2}
            />
            {px.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={3} className="fill-ember-500" />)}
            <text x={px[1].x + 8} y={px[1].y - 8} className="fill-ember-500 font-mono text-xs font-semibold">
              {deg}°
            </text>
          </g>
        )
      })}
      {draft.map((p, i) => <circle key={i} cx={p.x * w} cy={p.y * h} r={3} className="fill-verde-600" />)}
    </svg>
  ), [shapes, draft, w, h])

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader title="Film Room" />

      {!clipA && !clipB ? (
        <div className="space-y-4">
          <EmptyState
            icon={<Clapperboard size={32} strokeWidth={1.5} />}
            title="Coach the movement, frame by frame"
            body="Load a client's lift and a reference clip. Compare them side-by-side or overlaid, lock them in sync, step one frame at a time, and measure joint angles on the footage. Videos never leave this device."
          />
          <div className="flex flex-col md:flex-row gap-4">
            <VideoPane label="Client video" clip={clipA} onPick={pick(setClipA)} videoRef={videoA} />
            <VideoPane label="Reference video" clip={clipB} onPick={pick(setClipB)} videoRef={videoB} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <Card pad={false} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
            <SegmentedControl
              options={[
                { value: 'side', label: 'Side by side' },
                { value: 'overlay', label: 'Overlay', disabled: !clipA || !clipB, title: !clipA || !clipB ? 'Load both videos to overlay' : undefined },
              ]}
              value={mode}
              onChange={v => setMode(v as 'side' | 'overlay')}
            />

            {mode === 'overlay' && (
              <label className="flex items-center gap-2 text-xs text-muted">
                Blend
                <input
                  type="range" min={0} max={1} step={0.05} value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                  className="w-24 accent-[var(--verde-600)]"
                />
              </label>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted">
              Speed
              <Select value={speed} onChange={e => setSpeed(Number(e.target.value))} className="!h-7 !w-20 text-xs">
                <option value={0.25}>0.25×</option>
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
              </Select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted">
              Frame rate
              <Select value={fps} onChange={e => setFps(Number(e.target.value))} className="!h-7 !w-24 text-xs">
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
                <option value={120}>120 fps</option>
              </Select>
            </div>

            {(clipA || clipB) && (
              <div className="flex items-center gap-1.5">
                {clipA && clipB && (
                  <Select
                    value={trackTarget}
                    onChange={e => setTrackTarget(e.target.value as 'A' | 'B' | 'both')}
                    disabled={tracking !== 'off'}
                    className="!h-7 !w-36 text-xs"
                    title="Choose which clip the model analyzes — or both, at the same time, to compare them"
                  >
                    <option value="A">Track: Client</option>
                    <option value="B">Track: Reference</option>
                    <option value="both">Track: Both (compare)</option>
                  </Select>
                )}
                <Button
                  size="sm"
                  variant={tracking === 'on' ? 'primary' : 'secondary'}
                  onClick={toggleTracking}
                  disabled={tracking === 'loading'}
                  title="On-device movement tracking: skeleton, joint angles, reps, tempo, depth and symmetry. Runs entirely on this computer."
                >
                  {tracking === 'loading'
                    ? <LogoSpinner size={14} />
                    : <Activity size={14} />}
                  {tracking === 'on' ? 'Tracking on' : tracking === 'loading' ? 'Starting…' : 'Track movement'}
                </Button>
                {/* Only surfaced for an upgraded model — the bundled default
                    is the assumed baseline everywhere else in this app, so a
                    badge for it would just be noise. A coach who downloaded
                    a bigger tracker in Settings gets to see it's actually
                    the one running. */}
                {tracking === 'on' && activeModel && activeModel !== 'pose-lite' && (
                  <span title="Downloaded in Settings → On-device AI">
                    <Tag tone="verde">{activeModel === 'pose-heavy' ? 'Pro tracker' : 'Standard tracker'}</Tag>
                  </span>
                )}
              </div>
            )}

            {(clipA || clipB) && tracking === 'on' && (
              <Button
                size="sm" variant={showBarPath ? 'primary' : 'secondary'}
                onClick={() => setShowBarPath(s => !s)}
                title="Trace the wrist/bar path across the lift and measure horizontal drift from vertical."
              >
                Bar path
              </Button>
            )}

            {/* Equipment context. Small control, but it's what lets depth be
                measured against true extension on a machine that never shows
                it — see lib/equipment.ts. */}
            {(clipA || clipB) && (
              <Select
                value={presetId}
                onChange={e => setPresetId(e.target.value as EquipmentPresetId)}
                className="h-8 text-xs"
                title="What is being filmed. Machines rarely show full lockout, so telling Coachwright which one gives honest depth numbers."
              >
                <option value="auto">Equipment: not set</option>
                {Object.values(EQUIPMENT_PRESETS).map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            )}

            {clipA && clipB && (
              syncOffset === null ? (
                <Button size="sm" variant="secondary" onClick={lockSync} title="Scrub both clips to the same moment (e.g. the start of the descent), then lock them together.">
                  <Link2 size={14} /> Lock sync here
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setSyncOffset(null)}>
                  <Link2Off size={14} /> Unlock sync
                </Button>
              )
            )}

            {clipA && (
              <Button size="sm" variant={mirrorA ? 'primary' : 'ghost'} onClick={() => setMirrorA(m => !m)} title="Flip the client video horizontally — useful when the two clips are filmed from opposite sides">
                <FlipHorizontal2 size={14} /> Flip client
              </Button>
            )}
            {clipB && (
              <Button size="sm" variant={mirrorB ? 'primary' : 'ghost'} onClick={() => setMirrorB(m => !m)} title="Flip the reference video horizontally">
                <FlipHorizontal2 size={14} /> Flip ref
              </Button>
            )}

            <div className="ms-auto flex items-center gap-1">
              <Button size="sm" variant={tool === 'line' ? 'primary' : 'ghost'} onClick={() => { setTool(tool === 'line' ? 'off' : 'line'); setDraft([]) }} title="Draw a line: click two points (bar path, back angle)">
                <Slash size={14} /> Line
              </Button>
              <Button size="sm" variant={tool === 'angle' ? 'primary' : 'ghost'} onClick={() => { setTool(tool === 'angle' ? 'off' : 'angle'); setDraft([]) }} title="Measure an angle: click three points — the middle click is the joint">
                <Ruler size={14} /> Angle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShapes([]); setDraft([]) }} disabled={!shapes.length && !draft.length}>
                <Eraser size={14} /> Clear
              </Button>
            </div>
          </Card>

          {/* Stage — videos only; annotations overlay this, transports sit below */}
          <div
            ref={stageRef}
            onClick={onStageClick}
            className={`relative ${tool !== 'off' ? 'cursor-crosshair' : ''}`}
          >
            {mode === 'side' ? (
              <div className="flex flex-col gap-4 lg:flex-row">
                <VideoPane
                  label="Client video" clip={clipA} onPick={pick(setClipA)} videoRef={videoA}
                  mirrored={mirrorA}
                  overlay={activeA ? <SkeletonOverlay landmarks={trackA.pose} videoRef={videoA} barPath={showBarPath ? trackA.barPath : undefined} color="verde" repaired={trackA.repairedJoints} /> : null}
                />
                <VideoPane
                  label="Reference video" clip={clipB} onPick={pick(setClipB)} videoRef={videoB}
                  mirrored={mirrorB}
                  overlay={activeB ? <SkeletonOverlay landmarks={trackB.pose} videoRef={videoB} barPath={showBarPath ? trackB.barPath : undefined} color="signal" repaired={trackB.repairedJoints} /> : null}
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-card border border-line bg-iron-950">
                <div className="relative">
                  <video ref={videoA} src={clipA?.url} muted playsInline className={`max-h-[520px] w-full object-contain ${mirrorA ? '-scale-x-100' : ''}`} />
                  <video
                    ref={videoB} src={clipB?.url} muted playsInline
                    style={{ opacity }}
                    className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${mirrorB ? '-scale-x-100' : ''}`}
                  />
                  {activeA && (
                    <SkeletonOverlay landmarks={trackA.pose} videoRef={videoA} barPath={showBarPath ? trackA.barPath : undefined} color="verde" repaired={trackA.repairedJoints} />
                  )}
                  {activeB && (
                    <SkeletonOverlay landmarks={trackB.pose} videoRef={videoB} barPath={showBarPath ? trackB.barPath : undefined} color="signal" repaired={trackB.repairedJoints} />
                  )}
                </div>
              </div>
            )}
            {annotations}
          </div>

          {/* Transport — one bar per video, or a single master bar when linked */}
          {(clipA || clipB) && (
            <div className="space-y-2">
              {clipA && (
                <TransportBar
                  label={linked ? 'Both — synced' : (clipB ? 'Client' : undefined)} hints
                  time={A.time} dur={A.dur} playing={A.playing} fps={fps}
                  onToggle={masterToggle} onStep={masterStep} onSeek={masterSeek}
                />
              )}
              {clipB && !linked && (
                <TransportBar
                  label={clipA ? 'Reference' : undefined} accent="slate" hints hintMod={clipA ? 'Alt' : undefined}
                  time={B.time} dur={B.dur} playing={B.playing} fps={fps}
                  onToggle={B.toggle} onStep={B.step} onSeek={B.seek}
                />
              )}
              {clipA && clipB && linked && (
                <p className="flex items-center gap-1.5 px-1 text-2xs text-faint">
                  <Link2 size={12} className="text-verde-600" /> Reference is locked to the client video — the bar above scrubs both. Unlock sync to control them separately.
                </p>
              )}
            </div>
          )}

          {tool === 'angle' && (
            <p className="text-xs text-muted">
              Click three points — first limb end, then the joint, then the other limb end. The angle reads at the joint.
            </p>
          )}

          {/* Movement analysis readout — one card per tracked clip, or two
              side by side when comparing both at once. */}
          {tracking === 'on' && (
            trackTarget === 'both' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <MovementAnalysisCard label="Client" analysis={trackA} showBarPath={showBarPath} accent="verde" presetHint={presetHint} />
                <MovementAnalysisCard label="Reference" analysis={trackB} showBarPath={showBarPath} accent="signal" presetHint={presetHint} />
              </div>
            ) : (
              <MovementAnalysisCard analysis={primary} showBarPath={showBarPath} presetHint={presetHint} />
            )
          )}

          {/* The advanced breakdown: rep-by-rep + joint-angle deviation between
              the two clips — only exists once both are tracked at once. */}
          {trackTarget === 'both' && tracking === 'on' && (
            <ComparisonCard repComparisons={repComparisons} jointDeviations={jointDeviations} hasOffset={effectiveOffset !== null} />
          )}

          {/* Timestamped notes + client export */}
          {(clipA || clipB) && (
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
                  <StickyNote size={14} /> Notes
                </div>
                {/* Not inside the "Send to client" row below: that row only
                    appears once there are notes or counted reps, and grabbing
                    a still of a frame is useful before either exists. */}
                <Button size="sm" variant="secondary" onClick={saveSnapshot}>
                  <Camera size={13} /> Snapshot PNG
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addNote() }}
                  placeholder="e.g. elbow flares on the way up — captures the current timestamp"
                  className="flex-1"
                />
                <Button size="sm" variant="primary" onClick={addNote} disabled={!noteDraft.trim()}>
                  Add at {fmtTime((trackTarget === 'A' ? videoA : videoB).current?.currentTime ?? videoA.current?.currentTime ?? 0)}
                </Button>
              </div>

              {notes.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {notes.map(n => (
                    <div key={n.id} className="flex items-center gap-2 rounded-ctl border border-line px-2.5 py-1.5 text-sm">
                      <button
                        onClick={() => seekToNote(n.tMs)}
                        className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 font-mono tabular-nums text-xs text-verde-600 hover:bg-verde-100"
                        title="Jump to this moment"
                      >
                        {fmtTime(n.tMs / 1000)}
                      </button>
                      <span className="flex-1 text-ink">{n.text}</span>
                      <button onClick={() => removeNote(n.id)} className="shrink-0 text-faint hover:text-ember-600" aria-label="Delete note">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  Jot a note as you scrub through the footage — each one captures the exact moment, and you can jump straight back to it later.
                </p>
              )}

              {(notes.length > 0 || summaryStats.reps.length > 0) && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-faint">Send to client</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={sendToClientId} onChange={e => setSendToClientId(e.target.value)} className="!h-8 !w-48 text-xs">
                      <option value="">No client selected</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                    </Select>
                    <Button size="sm" variant="secondary" onClick={copySummary}><Copy size={13} /> Copy</Button>
                    <Button size="sm" variant="secondary" onClick={downloadSummary}><Download size={13} /> Download</Button>
                    <Button size="sm" variant="secondary" onClick={printStatsSheet}><Printer size={13} /> Print stats sheet</Button>
                    <Button size="sm" variant="primary" onClick={sendSummaryToClient} disabled={!selectedClient}>
                      <Send size={13} /> Log to {selectedClient ? fullName(selectedClient) : 'client'}
                    </Button>
                  </div>
                  <p className="mt-2 text-2xs text-faint">Written in plain language for a client to read — not a raw stats dump. "Log" adds it to that client's Message Log; nothing sends automatically.</p>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
