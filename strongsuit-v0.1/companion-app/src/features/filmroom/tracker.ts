// ===== On-device pose tracker (Companion self-review, T13) =====
// Near-verbatim copy of the coach app's `features/filmroom/tracker.ts`, for the
// same reason `lib/sync.ts` is duplicated: these are two separate npm projects
// with no shared package, and the tracking contract has to stay identical so a
// movement analysed here means the same thing it does in the coach's Film Room.
// If you change the detection contract in one, change it in the other.
//
// Only the user-facing failure message differs (different app name, and a
// client can't "reinstall Coachwright").
//
// Everything is bundled locally: wasm runtime + model live in public/mediapipe/
// — zero network at runtime, zero API keys, no per-use cost. That's why this
// is free for the client: it costs nothing to give away.
//
// This module is imported dynamically from FilmRoomPage so the app bundle
// doesn't carry MediaPipe until self-review is actually opened — on a phone
// that matters, the runtime + model are ~17MB fetched on first use.

import type { Lm } from '@/lib/pose'

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
  /** Idempotent, lazy init. Tries GPU acceleration first, then falls back to
   *  CPU before giving up — phones and low-tier laptops are exactly the
   *  hardware where the GPU delegate is most likely to be unavailable. */
  init(): Promise<void>
  /** Detect the pose on the video's current frame. MediaPipe requires
   *  strictly increasing timestamps in VIDEO mode, so we guard scrubbing
   *  backwards — per instance, since each tracker has its own timeline. */
  detectFrame(video: HTMLVideoElement): PoseFrame
  /** Call whenever the bound clip changes — the timestamp guard is
   *  per-instance and monotonic, so without this it would reject the new
   *  clip's early frames as "in the past." */
  resetTimeline(): void
  /** Releases the underlying model. Always call before discarding a tracker;
   *  leaving it cached means a later "start" hands back a possibly-wedged
   *  instance instead of a fresh one. */
  dispose(): void
}

export function createPoseTracker(): PoseTracker {
  let landmarker: Landmarker | null = null
  let initPromise: Promise<Landmarker> | null = null
  let lastTs = -1

  async function ensure(): Promise<Landmarker> {
    if (landmarker) return landmarker
    if (initPromise) return initPromise
    initPromise = (async () => {
      const vision = await import('@mediapipe/tasks-vision')
      // Non-module loader: picks vision_wasm_internal (SIMD) or
      // vision_wasm_nosimd_internal. The `_module_` variant is never used and
      // is deliberately not shipped (DEBT-11, S24).
      const fileset = await vision.FilesetResolver.forVisionTasks('mediapipe')
      const baseOptions = { modelAssetPath: 'mediapipe/pose_landmarker_lite.task' }

      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          const lm = await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { ...baseOptions, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
          })
          landmarker = lm as unknown as Landmarker
          return landmarker
        } catch (err) {
          if (delegate === 'CPU') {
            initPromise = null
            throw new Error(
              "Couldn't start movement tracking on this device. Close and reopen Companion and try again — if it keeps failing, this device may not support on-device video analysis.",
              { cause: err },
            )
          }
          // GPU delegate failed (no WebGL2 / blocklisted driver) — retry on CPU.
        }
      }
      // unreachable — the loop above always returns or throws
      throw new Error("Couldn't start movement tracking.")
    })()
    return initPromise
  }

  return {
    async init() {
      await ensure()
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
    },
  }
}
