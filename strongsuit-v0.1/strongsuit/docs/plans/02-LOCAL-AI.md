# 02 — Local AI: optional, on-device, and never load-bearing

**Hard rule, restated:** no cloud inference, no API keys, no telemetry. Every model runs on the user's machine. Every AI feature is opt-in and has a deterministic fallback.

---

## 1. The governing idea: RAG over a citation corpus, not a chatbot

The temptation is to bolt a chatbot on. That would be the least valuable and most dangerous version of this.

**What actually makes this special:** the app already computes every recommendation deterministically *with citations* (`lib/nutrition.ts`, `lib/progression.ts`, `lib/readiness.ts`). The AI's job is **not** to invent recommendations. It's to:

1. **Explain** the deterministic output in the coach's or client's own words.
2. **Retrieve** the actual passage from the position stand that justifies it.
3. **Translate** structured data into natural language and back.
4. **Search** semantically across the 3,000-exercise library.

That's a **grounded, auditable, genuinely useful** assistant. It's also the version that can't tell a client to eat 800 calories a day, because it isn't the thing choosing the number.

```
   User question
        │
        ▼
 ┌──────────────────┐     ┌─────────────────────────┐
 │ Deterministic    │     │ Citation corpus         │
 │ engine output    │     │ (bundled, versioned,    │
 │ (the numbers)    │     │  ~40 position stands)   │
 └────────┬─────────┘     └───────────┬─────────────┘
          │                           │
          └──────────┬────────────────┘
                     ▼
              Local LLM (explains only)
                     │
                     ▼
        Answer + inline citation + "show the maths"
```

**Guardrail:** if retrieval returns nothing above a relevance threshold, the assistant says *"I don't have a source for that"* rather than generating. Non-negotiable.

---

## 2. Model roster

Licence column matters — several popular models **cannot** legally ship in a paid closed-source product. Flagged honestly.

### 2.1 Text (LLM)

| Tier | Model | Size (Q4) | Licence | Use |
|---|---|---|---|---|
| **Light** | Qwen3-1.7B-Instruct | ~1.1 GB | Apache-2.0 ✅ | Explanations, NL logging, summaries |
| **Standard** | Qwen3-4B-Instruct | ~2.5 GB | Apache-2.0 ✅ | Above + program drafting |
| **Pro** | Qwen3-8B / Mistral-7B-v0.3 | ~4.7 GB | Apache-2.0 ✅ | Best quality, needs real hardware |
| — | ~~Llama 3.x~~ | — | Meta licence ⚠️ | Extra terms + branding requirements — avoid |
| — | ~~Gemma~~ | — | Gemma terms ⚠️ | Use restrictions — avoid |

*(Phi-3.5-mini, MIT, is a reasonable Light alternative if Qwen quality disappoints on explanation tasks. Decide by eval, §7.)*

### 2.2 Embeddings (semantic search — **the highest-value model here**)

| Model | Size | Licence | Use |
|---|---|---|---|
| `bge-small-en-v1.5` | ~130 MB | MIT ✅ | Exercise semantic search, citation retrieval |
| `multilingual-e5-small` | ~470 MB | MIT ✅ | Same, for non-English UI |

**This is the one to ship first.** 130 MB is an acceptable download, it makes a 3,000-row curated library genuinely searchable ("exercise for rear delts that doesn't hurt my shoulder"), and it powers RAG retrieval. Highest value per megabyte in the whole plan.

### 2.3 Vision / pose (Film Room — see [04](04-FILM-ROOM-V2.md))

| Tier | Model | Size | Licence | Notes |
|---|---|---|---|---|
| Light | MediaPipe Pose Lite | 5.7 MB | Apache-2.0 ✅ | **Current default.** Keep. |
| Standard | MediaPipe Pose Full | ~9 MB | Apache-2.0 ✅ | Better occlusion behaviour |
| Pro | MediaPipe Pose Heavy | ~29 MB | Apache-2.0 ✅ | Best accuracy, needs GPU |
| Pro+ | RTMPose-m (ONNX) | ~50 MB | Apache-2.0 ✅ | Best-in-class occlusion robustness |
| — | ~~YOLOv8/v11-pose~~ | — | **AGPL-3.0 🚫** | Would force us to open-source the whole app. **Do not use.** |

### 2.4 Speech

| Model | Size | Licence | Use |
|---|---|---|---|
| `whisper-small` (whisper.cpp, Q5) | ~190 MB | MIT ✅ | **Hands-free logging on the gym floor.** Genuinely transformative for a coach mid-session. |
| `whisper-base` | ~75 MB | MIT ✅ | Light tier |

### 2.5 OCR

| Model | Size | Licence | Use |
|---|---|---|---|
| Tesseract 5 + `eng` | ~15 MB | Apache-2.0 ✅ | Import handwritten/printed logs; read a nutrition label |

---

## 3. DECIDED: no fixed ceiling — hardware recommends, edition gates

**Decision (Caleb, 2026-07-27):** *"as big as it needs, but it should hardware check and recommend based off of that. It should also only have certain ones for certain tiers like studio vs individual."*

So there is **no arbitrary download cap**. Two independent gates decide what a given user is offered:

```
     What the hardware can actually run          What the edition licenses
                    │                                       │
                    └──────────────┬────────────────────────┘
                                   ▼
                      What is OFFERED and RECOMMENDED
                    (everything else shown, greyed, with the reason)
```

### 3.1 Gate 1 — hardware (recommendation)

The probe (§4) produces a **capability class**, and the app pre-selects the best tier that class can run *comfortably* — never the biggest one it can technically load.

| Class | Signal | Recommended default |
|---|---|---|
| **Minimal** | <8 GB RAM, no WebGPU, no AVX2 | Embeddings only (130 MB) |
| **Standard** | 8–16 GB, WebGPU or AVX2 | Light bundle (~1.4 GB) |
| **Capable** | 16–32 GB + GPU | Standard bundle (~2.9 GB) |
| **Workstation** | 32 GB+, discrete GPU ≥8 GB VRAM | Pro (~5.5 GB), and larger models unlocked |

Rules that keep this honest:
- **Recommend comfort, not maximum.** If a model would run at <8 tokens/sec, it is not recommended even if it fits — we show the measured number and say *"this will feel slow on your machine."*
- **Never hide what the hardware can't do.** Greyed with a plain reason (*"needs 16 GB RAM — you have 8"*) beats a mysteriously shorter list.
- **Always re-runnable** from Settings, because people upgrade machines and Studio buys new ones.

### 3.2 Gate 2 — edition (licensing)

> **Superseded S25 (Caleb):** there is no edition gate any more. These models run on the coach's own
> machine and cost the service nothing, so every plan gets every model its hardware can run.
> `offerFor()` in `lib/localAi.ts` takes no edition. The rest of this section is history.

Model access becomes a real differentiator between editions, per your instruction:

| Model / feature | Personal | Independent | Studio |
|---|:--:|:--:|:--:|
| Embeddings — semantic search | ● | ● | ● |
| Whisper base/small — voice logging | ● | ● | ● |
| LLM Light (1.7B) — explanations, NL logging | ● | ● | ● |
| LLM Standard (4B) — program drafting | — | ● | ● |
| LLM Pro (8B) — best quality | — | ● | ● |
| Pose Light / Standard | ● | ● | ● |
| Pose Heavy / RTMPose Pro | — | ● | ● |
| VBT (velocity) model | — | ● | ● |
| Multi-person pose (group filming) | — | — | ● |
| OCR — intake & label scanning | — | ● | ● |
| **Batch/roster-wide AI** (triage 50 clients at once) | — | — | ● |
| **Shared model cache across staff machines** | — | — | ● |

Two Studio-only capabilities worth calling out, because they're genuine business value rather than artificial gating:
- **Shared model cache** — one download on the Studio Hub, distributed over LAN to every staff machine. A 10-seat studio downloads 5 GB once, not ten times. This is a real operational win and it's only possible because Studio has a hub.
- **Batch inference** — run the assistant across the whole roster overnight (who needs attention, who's plateaued, who's drifting on adherence). Meaningless for one person; transformative for a gym.

### 3.3 What still ships to everyone, unconditionally

Embeddings (~130 MB) install silently on first run for **all editions**. It's within the noise of the existing 38 MB MediaPipe payload, it's what makes the exercise library searchable, and a library you can't search well is worse than a smaller one.

---

## 4. First-run system check ("performs a system check and optional installs")

A real capability probe, not a splash screen. Runs once at setup, re-runnable from Settings.

### 4.1 What it measures

| Probe | Method | Gates |
|---|---|---|
| CPU cores / arch | `navigator.hardwareConcurrency`, `os.cpus()` | LLM tier |
| **RAM** | `os.totalmem()` (Electron) | The real gate — 8/16/32 GB tiers |
| GPU + backend | WebGPU adapter probe; WebGL2 fallback | Vision tier, LLM offload |
| SIMD / AVX2 | wasm feature detect | Whether wasm inference is viable at all |
| Free disk | `checkDiskSpace` | Refuse a download that won't fit |
| Battery/thermal | `getBattery()` | Warn before a heavy job on battery |
| Camera/mic | `enumerateDevices()` | Film Room, voice logging |
| **Benchmark** | 5-second matmul + a 20-token generation | The honest number — measured, not guessed |

### 4.2 What the user sees

```
  Setting up Coachwright

  ✓ Your computer                    16 GB RAM · 8 cores · GPU acceleration
  ✓ Camera and microphone            Available — Film Room and voice logging ready
  ✓ Storage                          412 GB free

  Optional add-ons — everything works without these

  ┌────────────────────────────────────────────────────────────┐
  │ ◉ Smart search                        130 MB   Recommended │
  │   Find exercises by describing them, not by exact name.    │
  │   Runs instantly on your hardware.                         │
  ├────────────────────────────────────────────────────────────┤
  │ ○ Coaching assistant (Standard)       2.5 GB               │
  │   Explains any recommendation and cites the research.      │
  │   Your hardware: ~18 words/sec — comfortable.              │
  ├────────────────────────────────────────────────────────────┤
  │ ○ Voice logging                       190 MB               │
  │   Log sets by talking. Works offline.                      │
  ├────────────────────────────────────────────────────────────┤
  │ ○ Advanced movement tracking          50 MB                │
  │   Much better when equipment blocks part of the body.      │
  │   Needs GPU acceleration — you have it. ✓                  │
  └────────────────────────────────────────────────────────────┘

  These download in the background. You can start using the app now.
                                    [ Skip for now ]  [ Install selected ]
```

Design rules:
- **Never a progress bar the user must watch.** Downloads are backgrounded and resumable.
- **Always show the honest measured speed**, not marketing ("~18 words/sec — comfortable" beats "AI-powered!").
- **Every card states what still works without it.**
- If hardware can't run a tier, it's shown **greyed with the reason**, not hidden — hiding it makes the app feel arbitrary.

### 4.3 Model manager

```
lib/ai/
  registry.ts     Model catalogue: id, tier, bytes, sha256, licence, url
  manager.ts      install / verify / remove / resume; disk accounting
  probe.ts        the system check above
  runtime/
    llm.ts        node-llama-cpp (Electron) | WebLLM (browser)
    embed.ts      transformers.js / ONNX Runtime
    asr.ts        whisper.cpp
    ocr.ts        tesseract.js
  capability.ts   "is feature X available right now?" — single source of truth
```

- **Checksum every download.** A corrupt 2.5 GB model that half-works is worse than none.
- **Models live outside the app bundle** (userData), so an app update doesn't re-download them.
- **Uninstall is one click and reclaims the disk**, shown in Settings with real sizes.
- `capability.ts` mirrors the existing `cloudCapability.ts` pattern — a feature asks *"can I?"* and gets back a reason string when the answer is no. Consistency with how the cloud tiers already work.

---

## 5. The feature set (ranked by value per megabyte)

| # | Feature | Needs | Why it's genuinely beneficial |
|---|---|---|---|
| 1 | **Semantic exercise search** | Embeddings (130 MB) | Finds the right exercise from intent, not exact name — the difference between a big library and a useful one. |
| 2 | **"Why this number?"** | Embeddings + Light LLM | Retrieves the actual position-stand passage behind a protein target. Turns the app into a teaching tool and defends the coach in front of a client. |
| 3 | **Voice logging** | Whisper | Coaching happens with hands full. Biggest real-world workflow win. |
| 4 | **Natural-language logging** | Light LLM | "*bench 3x5 at 225, last set was an 8*" → structured sets. |
| 5 | **Program drafting** | Standard LLM | Drafts *within* the deterministic progression engine's constraints — never freehand. Coach edits, never accepts blind. |
| 6 | **Check-in triage** | Light LLM | "Which of my 40 clients needs me today?" — summarizes the attention queue. |
| 7 | **Form-cue suggestions** | Light LLM + Film Room | Turns "depth CV 22%, knee valgus L>R" into two coaching cues, cited to a cueing-literature corpus. |
| 8 | **Intake/label OCR** | Tesseract | Paper PAR-Q → structured. Nutrition label → macros. |
| 9 | **Translation assist** | Standard LLM | Coach writes a note in English, client reads it in Spanish. Pairs with [07](07-PLATFORM.md) i18n. |

---

## 6. The citation corpus (what the AI is grounded in)

A **bundled, versioned, offline** corpus — this is the moat, more than the model is.

**Contents:** ~40–60 open-access position stands, consensus statements, and major meta-analyses. Only sources that are **freely redistributable** (open-access / CC-licensed) get their full text bundled. Everything else is stored as **citation + our own summary**, which is lawful and still useful.

Domains: resistance-training dose-response, protein/energy requirements, hydration, sleep & recovery, monitoring/ACWR, female athlete physiology, youth & masters training, RED-S, injury risk, cueing & motor learning.

```
data/corpus/
  manifest.json      id, title, authors, year, doi, licence, redistributable
  passages/          chunked text (open-access only)
  embeddings.bin     precomputed at build time — no user-side indexing cost
```

Full source list and inclusion criteria live in [03-SCIENCE-ENGINES.md](03-SCIENCE-ENGINES.md) §7 — same corpus serves both the engines and the AI.

**Rule:** every AI answer cites corpus entries by id. The UI renders them as real citations the coach can open. No citation → no answer.

---

## 7. Safety, evaluation, and honesty

### 7.1 Hard guardrails
- **Scope of practice.** The assistant does not diagnose, prescribe for medical conditions, or give eating-disorder-adjacent advice. Refusal patterns for: disordered eating, extreme deficits, pain/injury diagnosis, medication, pregnancy-specific programming → **route to a qualified professional**.
- **Never invents numbers.** Targets come from the deterministic engines, always.
- **Every output is labelled as generated** and is editable before use.
- **Nothing auto-sends.** No AI-written message reaches a client without the coach pressing send.

### 7.2 Evaluation before shipping
A model that's confidently wrong about training is worse than no model. Before any LLM feature ships:
- **A golden set of ~200 Q&A pairs** with known correct citations; measure retrieval precision and answer faithfulness.
- **A red-team set** of ~50 prompts that *should* be refused.
- **Per-tier benchmarks** on real mid-range hardware, published in-app as the honest speed number.
- Ship the Light tier only if it passes; otherwise Standard becomes the floor.

### 7.3 What we will not claim
No "AI coach." No "personalized by AI." The honest framing:

> **Your research library, searchable and explained — running entirely on your computer.**
