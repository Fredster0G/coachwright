// ===== Local AI: the assistant (Qwen3-1.7B) =====
//
// Third of `lib/localAi.ts`'s registry entries to get a real runtime —
// same `@huggingface/transformers` engine as semantic search and voice
// logging, same on-device/no-server posture, same Cache-API-managed
// multi-file download pattern (see `lib/embeddings.ts`'s header for why
// that's a different mechanism from `lib/modelFetch.ts`'s single-file path).
//
// Verified for real before this was wired in: a standalone Node script
// downloaded the actual model (`onnx-community/Qwen3-1.7B-ONNX`, the
// transformers.js ONNX port of Qwen/Qwen3-1.7B — Qwen3's base models ship
// chat-template-ready, no separate "-Instruct" checkpoint needed, confirmed
// from the repo's own `tokenizer_config.chat_template`) and ran a real
// generation end to end — loaded, streamed tokens, produced a coherent
// answer to a coaching question with real numbers in the prompt.
//
// Size note, same shape as whisper-small's: the registry's `sizeMb: 1100`
// doesn't match any single published dtype exactly. Checked every variant
// this repo publishes via direct file-size lookup: fp32 ≈ 6.9GB, fp16 ≈
// 3.45GB, int8/quantized/uint8 ≈ 1.74GB, q4 ≈ 2.15GB (larger than int8 here —
// quantization scheme overhead, not a typo), **q4f16 ≈ 1.43GB** — the
// closest available match, used below via `dtype: 'q4f16'`, still ~30% over
// the registry's claim. Stated honestly rather than silently picked without
// comment, same as whisper-small's discrepancy.
//
// ONLY the light tier (qwen3-1.7b-instruct) is wired this pass — same
// "start with one, most defensible" scope as the previous two AI features.
// qwen3-4b/8b stay without a `url`.

// Type-only at module level: the runtime (~500KB) is imported on first use,
// so it stays out of the startup bundle (the Dashboard imports this file).
import type { TextGenerationPipeline } from '@huggingface/transformers'
import { modelBlobsRepo } from '@/db/repo'
import { createThinkFilter } from './thinkFilter'

const MODEL_REPO = 'onnx-community/Qwen3-1.7B-ONNX'
/** Matches `lib/localAi.ts`'s registry id. */
export const ASSISTANT_MODEL_ID = 'qwen3-1.7b-instruct'

export interface AssistantProgress {
  loaded: number
  total: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Every reply is grounded by this system message, whether or not the caller
 * supplies real app context — the "don't invent numbers" instruction matters
 * even for a context-free question, since a small local model asked "what
 * was my client's squat max last week" with no data attached should say it
 * doesn't know, not guess a plausible-sounding number.
 */
const SYSTEM_PREAMBLE =
  "You are Coachwright's built-in assistant, running entirely on this coach's own device — you have no " +
  'internet access and cannot look anything up beyond what is given to you below. Answer only from the ' +
  "context provided and general exercise-science knowledge. If the context doesn't cover something, say so " +
  'plainly rather than inventing a client name, number, or history you were not given. Keep answers short ' +
  'and direct — this is a working coach reading on a phone or between sets, not a report.'

let generatorPromise: Promise<TextGenerationPipeline> | null = null

function getGenerator(onProgress?: (p: AssistantProgress) => void): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    generatorPromise = import('@huggingface/transformers').then(({ pipeline }) => pipeline('text-generation', MODEL_REPO, {
      dtype: 'q4f16',
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && onProgress) onProgress({ loaded: p.loaded ?? 0, total: p.total ?? 0 })
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)).catch((err: unknown) => {
      generatorPromise = null
      throw err
    })
  }
  return generatorPromise
}

/**
 * Streams a reply token-by-token via `onToken`, and resolves with the full
 * text once generation finishes. `context`, when given, is real data the
 * caller assembled (e.g. `buildClientContext`) — appended to the system
 * message, never invented by this function.
 *
 * `do_sample: false` (greedy decoding) on purpose — a coaching aide
 * answering questions grounded in real numbers should be deterministic and
 * literal, not creatively varied between two askings of the same question.
 */
export async function generateReply(
  messages: ChatMessage[],
  onToken: (text: string) => void,
  opts?: { context?: string; maxNewTokens?: number; signal?: AbortSignal },
): Promise<string> {
  const generator = await getGenerator()
  const system: ChatMessage = {
    role: 'system',
    content: opts?.context ? `${SYSTEM_PREAMBLE}\n\nContext:\n${opts.context}` : SYSTEM_PREAMBLE,
  }
  const full = [system, ...messages.filter(m => m.role !== 'system')]

  // Qwen3 can preface its answer with a <think>...</think> reasoning block —
  // real output, not a bug, but not something a coach reading a quick reply
  // should see raw. See thinkFilter.ts's own header for why this can't be a
  // simple post-hoc string strip (the tags can straddle chunk boundaries).
  let out = ''
  const filter = createThinkFilter(text => {
    out += text
    onToken(text)
  })
  const { TextStreamer } = await import('@huggingface/transformers')
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
      if (opts?.signal?.aborted) return
      filter.push(text)
    },
  })

  await generator(full, { max_new_tokens: opts?.maxNewTokens ?? 400, do_sample: false, streamer })
  return out
}

export async function installAssistantModel(onProgress?: (p: AssistantProgress) => void): Promise<void> {
  await getGenerator(onProgress)
  await modelBlobsRepo.put(ASSISTANT_MODEL_ID, new Blob(['ready']))
}

export async function isAssistantModelInstalled(): Promise<boolean> {
  return modelBlobsRepo.has(ASSISTANT_MODEL_ID)
}

/** Same honest gap as `lib/embeddings.ts`/`lib/speech.ts` — the sentinel is
 *  cleared, the real files stay in the Cache API until the browser evicts
 *  them or all site data is cleared. */
export async function removeAssistantModel(): Promise<void> {
  await modelBlobsRepo.remove(ASSISTANT_MODEL_ID)
  generatorPromise = null
}
