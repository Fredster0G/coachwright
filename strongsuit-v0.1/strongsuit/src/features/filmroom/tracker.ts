// ===== On-device pose tracker (Film Room) =====
// Wraps MediaPipe PoseLandmarker (Apache-2.0). Everything is bundled locally:
// wasm runtime + model live in public/mediapipe/ — zero network at runtime,
// zero API keys. The lite model (~5.5MB) is chosen deliberately so tracking
// stays usable on low-tier laptops; the wasm runtime auto-falls back to a
// no-SIMD build on old CPUs, and we run detection only on video frames the
// browser actually presents (requestVideoFrameCallback), never a hot loop.
//
// This module is imported dynamically from FilmRoomPage so the main app
// bundle doesn't carry MediaPipe until a trainer turns tracking on.
//
// `createPoseTracker()` is a factory, not a singleton — Film Room can track
// the client clip and the reference clip AT THE SAME TIME (simultaneous
// side-by-side comparison), and each clip needs its own independent
// PoseLandmarker instance: MediaPipe's VIDEO mode is stateful (it uses the
// previous call's result as a prior for the next), so feeding it alternating
// frames from two unrelated videos through one shared instance would corrupt
// its internal tracking, not just be slower. The real cost of that
// correctness requirement is running two model instances at once — noted in
// PROGRESS.md as a real resource tradeoff on low-tier hardware, not a free
// upgrade.

import type { Lm } from '@/lib/pose'
import { resolvePoseModel, BUNDLED_LITE_PATH, type PoseModelId } from './modelSelection'

export interface PoseFrame {
  landmarks: Lm[] | null
  timestampMs: number
  /** true when detectForVideo threw — distinct from a clean "no person in
   *  frame" result, so the caller can tell a transient/permanent failure
   *  apart from ordinary detection misses and react (retry, auto-recover). */
  error?: boolean
}

type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, ts: number) => { landmarks: Lm[][] }
  close: () => void
}

export interface PoseTracker {
  /** Idempotent, lazy init. Tries GPU acceleration first (fast, but needs
   *  WebGL2 — unavailable or blocklisted on some older/integrated-GPU
   *  laptops, exactly the "low-tier laptop" hardware this feature targets),
   *  then falls back to CPU before giving up. Throws a designed error
   *  message on failure. */
  init(): Promise<void>
  /** Detect the pose on the video's current frame. MediaPipe requires
   *  strictly increasing timestamps in VIDEO mode, so we guard scrubbing
   *  backwards — per instance, since each tracker has its own timeline. */
  detectFrame(video: HTMLVideoElement): PoseFrame
  /** Call whenever the bound clip changes (new file, or scrubbed back to
   *  ~0 on a replaced video) — the timestamp guard is per-instance and
   *  monotonic, so without this it would reject the new clip's early
   *  frames as "in the past." */
  resetTimeline(): void
  /** Releases the underlying model. Always call before discarding a
   *  tracker (turning tracking off, switching targets) — leaving it cached
   *  means a later "start" hands back a possibly-wedged instance instead of
   *  a fresh one. Also revokes the object URL backing a downloaded model,
   *  if this tracker ended up using one. */
  dispose(): void
  /** Which model actually ended up running, once `init()` resolves — `null`
   *  before that. Lets the UI show what's really active (a downloaded
   *  upgrade, or the bundled default it silently fell back to) rather than
   *  assuming resolution and loading always agree. */
  getActiveModel(): PoseModelId | null
}

/** One attempt at one model path, GPU first then CPU — `null` on failure
 *  rather than throwing, so the caller can decide whether to fall back to a
 *  different model or give up for real. */
async function tryLoad(
  vision: typeof import('@mediapipe/tasks-vision'),
  fileset: Awaited<ReturnType<typeof import('@mediapipe/tasks-vision').FilesetResolver.forVisionTasks>>,
  modelAssetPath: string,
): Promise<Landmarker | null> {
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const lm = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
      return lm as unknown as Landmarker
    } catch {
      // GPU delegate failed (no WebGL2 / blocklisted driver) — retry on CPU
      // before giving up on this model path entirely.
    }
  }
  return null
}

export function createPoseTracker(): PoseTracker {
  let landmarker: Landmarker | null = null
  let initPromise: Promise<Landmarker> | null = null
  let lastTs = -1
  let objectUrlToRevoke: string | null = null
  let activeModel: PoseModelId | null = null

  async function ensure(): Promise<Landmarker> {
    if (landmarker) return landmarker
    if (initPromise) return initPromise
    initPromise = (async () => {
      const vision = await import('@mediapipe/tasks-vision')
      // Non-module loader: picks vision_wasm_internal (SIMD) or
      // vision_wasm_nosimd_internal. The `_module_` variant is never used and
      // is deliberately not shipped (DEBT-11, S24).
      const fileset = await vision.FilesetResolver.forVisionTasks('mediapipe')

      const resolved = await resolvePoseModel()
      let lm = await tryLoad(vision, fileset, resolved.assetPath)
      let used = resolved.modelId

      if (lm) {
        // Only the resolved model's own object URL (if any) survives past
        // this point — it's now owned by the running landmarker and gets
        // revoked in dispose(), not here.
        objectUrlToRevoke = resolved.objectUrl ?? null
      } else if (resolved.modelId !== 'pose-lite') {
        // The cached upgrade failed to load (a corrupted or incomplete
        // download is the realistic cause) — a downloaded model must never
        // make tracking WORSE than it was before the download existed, so
        // fall back to the always-reliable bundled one rather than failing
        // tracking outright.
        if (resolved.objectUrl) URL.revokeObjectURL(resolved.objectUrl)
        lm = await tryLoad(vision, fileset, BUNDLED_LITE_PATH)
        used = 'pose-lite'
      }

      if (!lm) {
        initPromise = null
        throw new Error(
          "Couldn't start movement tracking on this device. Try restarting Coachwright — if it keeps failing, the tracking model files may be missing from this build; reinstall Coachwright and try again.",
        )
      }
      landmarker = lm
      activeModel = used
      return landmarker
    })()
    return initPromise
  }

  return {
    async init() {
      await ensure()
    },
    getActiveModel() {
      return activeModel
    },
    detectFrame(video: HTMLVideoElement): PoseFrame {
      const ts = Math.round(video.currentTime * 1000)
      const empty = { landmarks: null, timestampMs: ts }
      if (!landmarker || video.readyState < 2) return empty
      const safeTs = ts <= lastTs ? lastTs + 1 : ts
      lastTs = safeTs
      try {
        const res = landmarker.detectForVideo(video, safeTs)
        return { landmarks: res.landmarks?.[0] ?? null, timestampMs: ts }
      } catch {
        return { ...empty, error: true }
      }
    },
    resetTimeline() {
      lastTs = -1
    },
    dispose() {
      landmarker?.close()
      landmarker = null
      initPromise = null
      lastTs = -1
      activeModel = null
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke)
        objectUrlToRevoke = null
      }
    },
  }
}
