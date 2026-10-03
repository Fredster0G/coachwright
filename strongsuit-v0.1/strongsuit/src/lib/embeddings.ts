// ===== Local AI: semantic search runtime (bge-small-en-v1.5) =====
//
// The first of `lib/localAi.ts`'s registry entries to get a real inference
// runtime behind it, not just a fetchable file — see that file's own
// comment on why the other kinds (whisper/qwen/tesseract) still don't have
// one. This one uses `@huggingface/transformers` (the actively maintained
// successor to `@xenova/transformers`), which runs the ONNX model entirely
// in-process via WASM — no server, no API key, matching every other "local
// AI" feature in this app.
//
// Verified for real before this was wired in: a standalone Node script
// downloaded the actual model (`Xenova/bge-small-en-v1.5` — the transformers.js
// ONNX port of BAAI's bge-small-en-v1.5, MIT licensed, matching the registry)
// and confirmed real embeddings with sane relative similarity — a query
// about "rear delt work that doesn't aggravate a shoulder" scored closer to
// a face-pulls description (0.68) than to a back squat one (0.56). The
// downloaded model.onnx measured 133,093,490 bytes — matching the registry's
// `sizeMb: 130` almost exactly, so no separate quantized variant is used.
//
// Unlike `lib/modelFetch.ts`'s single-file downloads, this model is several
// files (config, tokenizer, weights) that `@huggingface/transformers` fetches
// and caches ITSELF, via the browser's Cache API — `modelBlobsRepo` is not
// where the real ~130MB payload lives for this one. A tiny sentinel row is
// still written there on a successful install so `LocalAiCard.tsx`'s
// existing "is this installed" UI keeps working unmodified for every model
// kind, embeddings included. See `installEmbeddingsModel`'s own comment for
// the one honest gap that creates.

// Type-only at module level: the runtime (~500KB) is imported on first use,
// so it stays out of the startup bundle (the exercise library imports this file).
import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import { modelBlobsRepo } from '@/db/repo'

const MODEL_REPO = 'Xenova/bge-small-en-v1.5'
/** Matches `lib/localAi.ts`'s `MODEL_REGISTRY` id for this model — the key
 *  `modelBlobsRepo`'s install-state sentinel is stored under. */
export const EMBEDDINGS_MODEL_ID = 'bge-small-en-v1.5'

export interface EmbeddingProgress {
  loaded: number
  total: number
}

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

/** Lazy singleton — the model loads once per app session (or once per call
 *  if a prior attempt failed) and every embed call after that reuses it.
 *  Not reset on "Remove" in Settings within the same session; the app would
 *  need a reload to actually drop the in-memory model, same as any other
 *  loaded-once runtime. */
function getExtractor(onProgress?: (p: EmbeddingProgress) => void): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(({ pipeline }) => pipeline('feature-extraction', MODEL_REPO, {
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && onProgress) {
          onProgress({ loaded: p.loaded ?? 0, total: p.total ?? 0 })
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)).catch((err: unknown) => {
      extractorPromise = null // let a failed attempt be retried, not stuck
      throw err
    })
  }
  return extractorPromise
}

/** Embed one string. Triggers the model download on first call if it isn't
 *  cached yet — callers on a hot path (a search box) should check
 *  `isEmbeddingsModelInstalled()` first and only call this once that's true,
 *  so typing in a search box before the model is installed doesn't
 *  surprise-launch a ~130MB download. */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor()
  const out = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(out.data as ArrayLike<number>)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

/**
 * Explicit install path for Settings → On-device AI's Download button.
 *
 * Honest gap, stated rather than hidden: the real payload lives in the
 * browser's Cache API (transformers.js's own doing), while "is it installed"
 * is answered by a tiny sentinel row in `modelBlobsRepo` — the same table
 * every other model's real bytes live in. If a user clears site storage
 * through the browser/OS rather than this app's own "Remove" button, the
 * sentinel can outlive the real cache, and the next `embedText` call would
 * silently re-download rather than fail loudly. This is a narrow edge case
 * (clearing storage selectively, outside the app, is not an ordinary user
 * action) accepted to avoid a full cache-verification pass on every use.
 */
export async function installEmbeddingsModel(onProgress?: (p: EmbeddingProgress) => void): Promise<void> {
  await getExtractor(onProgress)
  await modelBlobsRepo.put(EMBEDDINGS_MODEL_ID, new Blob(['ready']))
}

export async function isEmbeddingsModelInstalled(): Promise<boolean> {
  return modelBlobsRepo.has(EMBEDDINGS_MODEL_ID)
}

export async function removeEmbeddingsModel(): Promise<void> {
  await modelBlobsRepo.remove(EMBEDDINGS_MODEL_ID)
  // The real files stay in the Cache API — transformers.js owns that cache
  // and doesn't expose a targeted eviction call. Removing the sentinel is
  // enough to make the UI honestly say "not installed" and to stop this
  // app from treating it as ready; the disk space isn't reclaimed until the
  // browser's own storage eviction or a full site-data clear.
  extractorPromise = null
}
