// ===== Local AI: voice logging runtime (Whisper) =====
//
// Second of `lib/localAi.ts`'s registry entries to get a real inference
// runtime, after semantic search — same `@huggingface/transformers` engine,
// same on-device/no-server posture. This wraps ASR only: turning the
// resulting text into a logged set is `lib/setLogParser.ts`'s job, kept
// separate because it's real, independently testable logic with nothing to
// do with the model.
//
// Verified for real before this was wired in, matching the same bar as
// semantic search: a standalone Node script downloaded the actual model
// (`Xenova/whisper-base`, quantized) and ran real inference — it loaded,
// ran without error, and returned a well-formed `{ text }` result. Real
// speech wasn't available to test with outside the browser (no microphone
// in that environment); this proves the pipeline mechanics work, not
// transcription accuracy, which only a real voice can actually verify.
//
// Size note: the registry's `sizeMb: 75` for whisper-base only matches the
// QUANTIZED export (`dtype: 'q8'`, encoder+decoder ≈ 77MB) — the default
// fp32 export is closer to 290MB. `dtype: 'q8'` is passed explicitly below
// for exactly this reason, not left to default.

// Type-only at module level: the runtime (~500KB) is imported on first use,
// so it stays out of the startup bundle (the session logger imports this file).
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { modelBlobsRepo } from '@/db/repo'

const MODEL_REPO = 'Xenova/whisper-base'
/** Matches `lib/localAi.ts`'s registry id. */
export const SPEECH_MODEL_ID = 'whisper-base'

export interface TranscribeProgress {
  loaded: number
  total: number
}

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null

function getTranscriber(onProgress?: (p: TranscribeProgress) => void): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = import('@huggingface/transformers').then(({ pipeline }) => pipeline('automatic-speech-recognition', MODEL_REPO, {
      dtype: 'q8',
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && onProgress) onProgress({ loaded: p.loaded ?? 0, total: p.total ?? 0 })
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)).catch((err: unknown) => {
      transcriberPromise = null
      throw err
    })
  }
  return transcriberPromise
}

/** `audio` must be mono Float32 samples at `sampleRate` (16kHz is what
 *  Whisper actually expects — `features/logging/voiceCapture.ts` resamples
 *  whatever the microphone captured before this is ever called). */
export async function transcribeAudio(audio: Float32Array, sampleRate = 16000): Promise<string> {
  const transcriber = await getTranscriber()
  const result = await transcriber(audio, { sampling_rate: sampleRate })
  const first = Array.isArray(result) ? result[0] : result
  return (first?.text ?? '').trim()
}

export async function installSpeechModel(onProgress?: (p: TranscribeProgress) => void): Promise<void> {
  await getTranscriber(onProgress)
  await modelBlobsRepo.put(SPEECH_MODEL_ID, new Blob(['ready']))
}

export async function isSpeechModelInstalled(): Promise<boolean> {
  return modelBlobsRepo.has(SPEECH_MODEL_ID)
}

/** Same honest gap as `lib/embeddings.ts`'s `removeEmbeddingsModel` — the
 *  sentinel is cleared, but the real files stay in the Cache API until the
 *  browser evicts them or all site data is cleared. */
export async function removeSpeechModel(): Promise<void> {
  await modelBlobsRepo.remove(SPEECH_MODEL_ID)
  transcriberPromise = null
}
