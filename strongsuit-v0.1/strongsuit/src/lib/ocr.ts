// ===== Local AI: text from images (tesseract.js) =====
//
// Fourth and last of `lib/localAi.ts`'s registry entries to get a real
// runtime. Unlike semantic search/voice logging/the assistant, this one
// doesn't use `@huggingface/transformers` at all — Tesseract is a different
// engine entirely (a dedicated OCR project, not an ONNX model), so this
// pulls in `tesseract.js` as its own dependency.
//
// Verified for real before this was wired in: a standalone Node script
// created a worker and ran real recognition against tesseract.js's own
// documented example image (`tesseract.projectnaptha.com/img/eng_bw.png`)
// — 92% confidence, and the recognized text matched the image's actual
// printed content exactly (a Keats excerpt, not garbage). This proves the
// runtime genuinely works, the same bar as the other three AI features.
//
// Caching: tesseract.js manages its own language-data cache (IndexedDB via
// an internal localForage store) — same "the real payload isn't in
// modelBlobsRepo" situation as `lib/embeddings.ts`/`lib/speech.ts`, and the
// same tiny-sentinel-row workaround so `LocalAiCard.tsx`'s installed/remove
// UI keeps working unmodified for a fourth model kind.
//
// Scope: recognizes English printed/typed text well — Tesseract's own
// documentation is upfront that freeform cursive handwriting is a much
// harder target for it than print, so `features/logging/LogSheetScanDialog.tsx`
// says "scan a log sheet," not "reads any handwriting," and always shows the
// coach the raw recognized text before applying anything (see that file).

import { createWorker, type Worker } from 'tesseract.js'
import { modelBlobsRepo } from '@/db/repo'

/** Matches `lib/localAi.ts`'s registry id. */
export const OCR_MODEL_ID = 'tesseract-eng'

export interface OcrProgress {
  status: string
  progress: number
}

let workerPromise: Promise<Worker> | null = null

/** The smallest valid module using a SIMD opcode — the same probe
 *  wasm-feature-detect uses. Picks which bundled core to load. */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])

/** Everything tesseract.js loads comes from `public/tesseract/` (filled by
 *  scripts/copy-ocr-assets.mjs). Left at its defaults, tesseract.js pulls its
 *  worker script and wasm core via importScripts() from cdn.jsdelivr.net and
 *  the language data from the same CDN — executable remote code, which this
 *  project refuses everywhere (DEBT-59), and a hard failure offline. Absolute
 *  URLs because the worker is started from a blob: URL, which can't resolve
 *  relative paths against the page. */
function localAssetOptions() {
  const base = new URL('tesseract/', document.baseURI).href
  const core = WebAssembly.validate(SIMD_PROBE) ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'
  return { workerPath: `${base}worker.min.js`, corePath: `${base}${core}`, langPath: base.replace(/\/$/, ''), gzip: false }
}

function getWorker(onProgress?: (p: OcrProgress) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', undefined, {
      ...localAssetOptions(),
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status && m.progress != null && onProgress) onProgress({ status: m.status, progress: m.progress })
      },
    }).catch((err: unknown) => {
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

/** `image` accepts anything tesseract.js's own `recognize` does — a `File`
 *  from a file/camera input is the real caller here (`LogSheetScanDialog`). */
export async function recognizeText(
  image: File | Blob | string,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(image)
  return data.text
}

export async function installOcrModel(onProgress?: (p: OcrProgress) => void): Promise<void> {
  await getWorker(onProgress)
  await modelBlobsRepo.put(OCR_MODEL_ID, new Blob(['ready']))
}

export async function isOcrModelInstalled(): Promise<boolean> {
  return modelBlobsRepo.has(OCR_MODEL_ID)
}

/** Same honest gap as the other three model wrappers — the sentinel is
 *  cleared and the in-memory worker is torn down, but tesseract.js's own
 *  on-disk language-data cache stays until the browser evicts it or all
 *  site data is cleared. */
export async function removeOcrModel(): Promise<void> {
  await modelBlobsRepo.remove(OCR_MODEL_ID)
  const pending = workerPromise
  workerPromise = null
  if (pending) {
    try { (await pending).terminate() } catch { /* already gone */ }
  }
}
