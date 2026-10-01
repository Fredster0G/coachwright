// ===== Local AI: model registry, hardware class, and what may be offered =====
// (docs/plans/02-LOCAL-AI.md §2–§4)
//
// HARD RULE, restated from the plan because it constrains everything below:
// no cloud inference, no API keys, no telemetry. Every model runs on the
// user's own machine, every AI feature is opt-in, and every one of them has a
// deterministic fallback. Nothing here is load-bearing — the app's numbers
// come from `lib/nutrition.ts`, `lib/progression.ts`, `lib/readiness.ts` and
// friends, all of which already work with no model installed at all.
//
// ONE GATE decides what a user is offered: what the hardware can actually
// run. (Until S25 the edition also capped the tier. Dropped on Caleb's call:
// these models run on the coach's own machine and cost the service nothing,
// so there is nothing to charge for — DEBT-70.)
//
// The reason is always reported in plain words. A model the machine can't run is
// shown greyed and explained ("needs 16 GB — you have 8"), never silently
// dropped: a mysteriously short list is worse than an honest "no", because
// the user can't tell whether it's their machine, their licence, or a bug.
//
// LICENCES ARE LOAD-BEARING, not trivia. Several popular models cannot
// legally ship inside a paid closed-source product — Llama's extra terms,
// Gemma's use restrictions, and above all **YOLOv8/v11-pose is AGPL-3.0**,
// which would force open-sourcing this entire application. Every entry
// carries its licence and `registryIsPermissive()` is a test-enforced check
// that no copyleft or restricted model ever creeps into the list.
//
// Pure. No fetch, no navigator, no Electron — the probe lives in
// `probeHardware()`'s caller and is passed in, so all of this is testable.

import type { AiTier } from './edition'
import { tierAtLeast } from './edition'

export type ModelKind = 'embeddings' | 'llm' | 'pose' | 'speech' | 'ocr'

/** Only permissive licences may appear here — see the header. */
export type ModelLicence = 'Apache-2.0' | 'MIT'

export interface ModelSpec {
  id: string
  label: string
  kind: ModelKind
  tier: AiTier
  /** Download size in megabytes. */
  sizeMb: number
  licence: ModelLicence
  /** RAM the machine needs, in GB, to run this comfortably. */
  minRamGb: number
  /** True when it realistically needs a GPU to be usable. */
  needsGpu?: boolean
  /** What it's actually for, in the user's terms. */
  purpose: string
  /**
   * Direct HTTPS download for the model file, verified reachable (S15).
   * Only MediaPipe's pose models use this (`lib/modelFetch.ts`). The
   * transformers.js-backed entries (semantic search, voice, assistant) are
   * fetched by that runtime from their HF repo ids in `lib/embeddings.ts`,
   * `lib/speech.ts` and `lib/assistant.ts`; OCR ships inside the app
   * (`public/tesseract/`). A url here is a promise this build can LOAD the
   * bytes once cached — entries with no loader get none.
   */
  url?: string
}

/**
 * The roster from plan §2.
 *
 * Sizes are the quantised download sizes, because that is what the user
 * actually waits for — quoting parameter counts would be describing the model
 * to ourselves rather than to them.
 */
export const MODEL_REGISTRY: ModelSpec[] = [
  {
    id: 'bge-small-en-v1.5', label: 'Semantic search', kind: 'embeddings', tier: 'embeddings',
    sizeMb: 130, licence: 'MIT', minRamGb: 2,
    purpose: 'Makes the exercise library searchable by meaning — "rear delt work that doesn’t aggravate a shoulder" finds the right movements.',
  },
  {
    id: 'multilingual-e5-small', label: 'Semantic search (multilingual)', kind: 'embeddings', tier: 'embeddings',
    sizeMb: 470, licence: 'MIT', minRamGb: 4,
    purpose: 'Same as above, for coaching in a language other than English.',
  },
  {
    id: 'whisper-base', label: 'Voice logging (light)', kind: 'speech', tier: 'light',
    sizeMb: 75, licence: 'MIT', minRamGb: 4,
    purpose: 'Log sets by speaking, hands-free, mid-session.',
  },
  {
    id: 'whisper-small', label: 'Voice logging', kind: 'speech', tier: 'light',
    sizeMb: 190, licence: 'MIT', minRamGb: 8,
    purpose: 'More accurate hands-free logging, including in a noisy gym.',
  },
  {
    id: 'qwen3-1.7b-instruct', label: 'Assistant', kind: 'llm', tier: 'light',
    sizeMb: 1100, licence: 'Apache-2.0', minRamGb: 8,
    // "Turns typed notes into logged sets" used to be claimed here — that's
    // Quick Log (lib/quickLog.ts), a pure regex parser with zero AI and zero
    // download, real today regardless of whether this model is installed.
    // Wrongly attributing a free feature to a 1.1GB download is its own kind
    // of dishonesty; removed rather than left to mislead someone deciding
    // whether the download is worth it.
    purpose: 'Explains the app’s own numbers in plain language, grounded in a client’s real check-ins, sessions, and Film Room notes.',
  },
  {
    id: 'qwen3-4b-instruct', label: 'Assistant (standard)', kind: 'llm', tier: 'standard',
    sizeMb: 2500, licence: 'Apache-2.0', minRamGb: 16,
    // NOT JUST UNDOWNLOADABLE — FUNCTIONALLY INERT EVEN IF IT WERE. `lib/
    // assistant.ts`'s MODEL_REPO is hardcoded to the 1.7B model; nothing
    // reads this tier's id to switch which model actually loads, and no
    // program-drafting feature exists anywhere in the codebase. Installing
    // this row would do nothing today. Purpose text says so honestly instead
    // of promising a feature — see docs/ROADMAP.md for the real scope this
    // would take (dynamic model selection + a drafting pipeline + a
    // review-before-apply UI, the same bar every other local-AI feature met).
    purpose: 'Not yet wired to anything — installing this does nothing today. A future release may add program drafting from a brief at this tier.',
  },
  {
    id: 'qwen3-8b-instruct', label: 'Assistant (pro)', kind: 'llm', tier: 'pro',
    sizeMb: 4700, licence: 'Apache-2.0', minRamGb: 32, needsGpu: true,
    // Same gap as the standard tier above — hardcoded MODEL_REPO means this
    // is inert even if downloaded.
    purpose: 'Not yet wired to anything — installing this does nothing today. The assistant always runs the light-tier model regardless of what’s installed here.',
  },
  {
    id: 'pose-lite', label: 'Movement tracking (light)', kind: 'pose', tier: 'embeddings',
    sizeMb: 6, licence: 'Apache-2.0', minRamGb: 2,
    purpose: 'The Film Room tracker that ships today.',
  },
  {
    id: 'pose-full', label: 'Movement tracking (standard)', kind: 'pose', tier: 'light',
    sizeMb: 9, licence: 'Apache-2.0', minRamGb: 4,
    purpose: 'Noticeably steadier when equipment partly blocks the body.',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  },
  {
    id: 'pose-heavy', label: 'Movement tracking (pro)', kind: 'pose', tier: 'standard',
    sizeMb: 29, licence: 'Apache-2.0', minRamGb: 8, needsGpu: true,
    purpose: 'The most accurate of the built-in trackers — worth it when the footage is difficult.',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
  },
  {
    id: 'rtmpose-m', label: 'Movement tracking (pro+)', kind: 'pose', tier: 'pro',
    sizeMb: 50, licence: 'Apache-2.0', minRamGb: 8, needsGpu: true,
    purpose: 'Best-in-class when machines block the body.',
    // No url: RTMPose is a different runtime from MediaPipe's — this app has
    // no RTMPose inference path yet, so there is nothing to point a download
    // at that this build could actually load and run.
  },
  {
    id: 'tesseract-eng', label: 'Text from images', kind: 'ocr', tier: 'standard',
    sizeMb: 9, licence: 'Apache-2.0', minRamGb: 4,
    purpose: 'Read a printed or neatly written log sheet into the app — you check the text before anything is saved.',
    // No url: nothing to download. Worker, wasm core and English data ship
    // inside the app (public/tesseract/, scripts/copy-ocr-assets.mjs) —
    // ~9MB, which is the sizeMb above. "Install" only warms the engine.
    // Purpose used to promise handwriting and nutrition labels; lib/ocr.ts's
    // own header says cursive is weak, and no label-reading flow exists.
  },
]

/** The one model that installs for everyone (plan §3.3): a curated library
 *  you can't search well is worse than a smaller one, and 130 MB sits inside
 *  the noise of the MediaPipe payload already shipping. */
export const ALWAYS_INSTALLED_ID = 'bge-small-en-v1.5'

/** Guard against a restricted model ever entering the roster. AGPL in
 *  particular (YOLO-pose) would force open-sourcing the whole product. */
export function registryIsPermissive(models: ModelSpec[] = MODEL_REGISTRY): boolean {
  return models.every(m => m.licence === 'MIT' || m.licence === 'Apache-2.0')
}

// ------------------------------------------------------------- hardware

export interface HardwareProfile {
  /** Total system RAM in GB. `null` when the platform won't say — the web
   *  build usually can't, and guessing would defeat the point. */
  ramGb: number | null
  cores: number | null
  hasGpu: boolean
  /** Discrete GPU memory in GB, when known. */
  vramGb?: number | null
  hasWasmSimd: boolean
  /** Free disk in GB, when known. */
  freeDiskGb?: number | null
}

export type HardwareClass = 'unknown' | 'minimal' | 'standard' | 'capable' | 'workstation'

/**
 * Bucket the machine (plan §3.1).
 *
 * Returns `unknown` when RAM is unavailable rather than assuming a class.
 * The browser build genuinely cannot read total RAM — `deviceMemory` is
 * Chrome-only, capped at 8, and rounded — so pretending to know would put a
 * confident wrong recommendation in front of the user. `unknown` degrades to
 * "embeddings only, and tell them why", which is honest and still useful.
 */
export function classifyHardware(hw: HardwareProfile): HardwareClass {
  if (hw.ramGb == null) return 'unknown'
  if (hw.ramGb >= 32 && hw.hasGpu && (hw.vramGb ?? 0) >= 8) return 'workstation'
  if (hw.ramGb >= 16 && hw.hasGpu) return 'capable'
  if (hw.ramGb >= 8 && (hw.hasGpu || hw.hasWasmSimd)) return 'standard'
  return 'minimal'
}

/** The tier a class can run COMFORTABLY — deliberately not the largest it
 *  could technically load. A model that runs at four tokens a second is
 *  something the user will try once and never open again. */
export function recommendedTier(cls: HardwareClass): AiTier {
  switch (cls) {
    case 'workstation': return 'pro'
    case 'capable': return 'standard'
    case 'standard': return 'light'
    case 'minimal':
    case 'unknown':
    default: return 'embeddings'
  }
}

export const HARDWARE_CLASS_LABEL: Record<HardwareClass, string> = {
  unknown: 'Not measured',
  minimal: 'Modest',
  standard: 'Capable',
  capable: 'Strong',
  workstation: 'Workstation',
}

export function describeHardware(hw: HardwareProfile, cls: HardwareClass): string {
  if (cls === 'unknown') {
    return 'This browser won’t report how much memory the machine has, so only the small always-on model is offered. ' +
      'The desktop app can measure it properly.'
  }
  const bits = [
    hw.ramGb != null ? `${hw.ramGb} GB memory` : null,
    hw.cores ? `${hw.cores} cores` : null,
    hw.hasGpu ? 'GPU available' : 'no GPU detected',
  ].filter(Boolean)
  return bits.join(' · ')
}

// ------------------------------------------------------- offer decisions

export type OfferState = 'recommended' | 'available' | 'blocked-hardware'

export interface ModelOffer {
  model: ModelSpec
  state: OfferState
  /** Always populated — a greyed row without a reason is the thing this
   *  design exists to avoid. */
  reason: string
}

/** What to show for one model on this machine. Every plan gets every model
 *  the hardware can run. */
export function offerFor(model: ModelSpec, hw: HardwareProfile): ModelOffer {
  const cls = classifyHardware(hw)

  if (hw.ramGb != null && hw.ramGb < model.minRamGb) {
    return {
      model, state: 'blocked-hardware',
      reason: `Needs ${model.minRamGb} GB of memory — this machine has ${hw.ramGb} GB.`,
    }
  }
  if (model.needsGpu && !hw.hasGpu) {
    return {
      model, state: 'blocked-hardware',
      reason: 'Needs a GPU, and none was detected on this machine.',
    }
  }
  if (cls === 'unknown' && model.tier !== 'embeddings') {
    return {
      model, state: 'blocked-hardware',
      reason: 'Can’t tell how much memory this machine has, so larger models aren’t offered here. Try the desktop app.',
    }
  }

  const recommended = tierAtLeast(recommendedTier(cls), model.tier)
  return recommended
    ? { model, state: 'recommended', reason: 'Runs comfortably on this machine.' }
    : { model, state: 'available', reason: 'This machine can run it, but expect it to feel slow.' }
}

/** Every model, decided. Sorted so the useful ones surface first: offered
 *  before blocked, then smallest download first — the cheapest useful thing
 *  should be the easiest to say yes to. */
export function offersFor(hw: HardwareProfile): ModelOffer[] {
  const rank: Record<OfferState, number> = { recommended: 0, available: 1, 'blocked-hardware': 2 }
  return MODEL_REGISTRY
    .map(m => offerFor(m, hw))
    .sort((a, b) => rank[a.state] - rank[b.state] || a.model.sizeMb - b.model.sizeMb)
}

/** Total download for a chosen set, in MB — shown before anything starts, so
 *  a 4.7 GB decision is never made accidentally. */
export function totalDownloadMb(ids: string[]): number {
  return MODEL_REGISTRY.filter(m => ids.includes(m.id)).reduce((sum, m) => sum + m.sizeMb, 0)
}

/** Refuse a download that won't fit, with the numbers in the message. */
export function fitsOnDisk(ids: string[], freeDiskGb: number | null | undefined): { ok: boolean; reason?: string } {
  if (freeDiskGb == null) return { ok: true } // unknown: don't block on a guess
  const needGb = totalDownloadMb(ids) / 1024
  if (needGb <= freeDiskGb) return { ok: true }
  return {
    ok: false,
    reason: `That’s ${needGb.toFixed(1)} GB and there’s ${freeDiskGb.toFixed(1)} GB free.`,
  }
}

/**
 * The default selection for a machine.
 *
 * ONE MODEL PER CAPABILITY. The models within a kind are alternatives, not
 * complements — nobody needs both embeddings models, or `whisper-base` *and*
 * `whisper-small`. Selecting every recommended model queued 606 MB on a
 * modest laptop by adding the 470 MB multilingual index alongside the 130 MB
 * English one, which is exactly the kind of silent waste this screen exists
 * to prevent. (Caught by a test asserting a modest machine gets a modest
 * default.)
 *
 * Within a kind: the highest tier that runs COMFORTABLY, breaking ties by
 * smallest download — so an English-speaking user gets `bge-small`, and the
 * multilingual index stays a deliberate opt-in for coaches who need it.
 *
 * Never auto-selects something merely `available`: "we can run it" is not a
 * reason to spend gigabytes of someone's disk.
 */
export function defaultSelection(hw: HardwareProfile): string[] {
  const tierRank: Record<AiTier, number> = { embeddings: 0, light: 1, standard: 2, pro: 3 }
  const bestPerKind = new Map<ModelKind, ModelSpec>()

  for (const offer of offersFor(hw)) {
    if (offer.state !== 'recommended') continue
    const m = offer.model
    const held = bestPerKind.get(m.kind)
    if (!held
      || tierRank[m.tier] > tierRank[held.tier]
      || (tierRank[m.tier] === tierRank[held.tier] && m.sizeMb < held.sizeMb)) {
      bestPerKind.set(m.kind, m)
    }
  }

  const ids = [...bestPerKind.values()].map(m => m.id)
  return ids.includes(ALWAYS_INSTALLED_ID) ? ids : [ALWAYS_INSTALLED_ID, ...ids]
}
