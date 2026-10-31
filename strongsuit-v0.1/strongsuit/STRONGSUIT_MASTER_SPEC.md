# STRONGSUIT — Master Build Specification v1.0
### The Pay-Once Coaching Platform for Personal Trainers

> **⚠️ PRODUCT RENAMED (2026-07-16): Strongsuit → Coachwright.** "Strongsuit" was trademarked by another company. Everywhere this document says "Strongsuit," read **Coachwright**. In code the name lives only in `src/lib/brand.ts`; data-level identifiers (IndexedDB name, backup `app` id) deliberately keep the legacy `strongsuit` value so existing data and pre-rename backups keep working. This spec's filename is unchanged to avoid churn.
> **⚠️ PRICING SUPERSEDED (S15, 2026-08-14).** Wherever this spec says pay-once, one-time licence,
> "no subscription", or a $59–99 price: the shipped model is a free tier (up to 3 clients) plus
> **Coachwright Membership, $29/mo** (`PRODUCT_OVERVIEW.md` §8, `docs/MEMBERSHIP.md`). §0's "Zero backend"
> doctrine is likewise historical — an optional sync relay and a membership server now exist. The
> architecture (local-first, offline-always) is unchanged. This is a frozen v1.0 blueprint, not live
> status; read `docs/STATUS.md` for what is true today.
**Document type:** Direct AI code-generation blueprint. This document is written to be handed to an AI model (Claude Opus/Sonnet, Gemini, GPT) as the authoritative source of truth for a full production build. Every section is normative unless marked "optional."

---

## 0. READ THIS FIRST — BUILD DOCTRINE

You are not building a demo, a prototype, or a "vibecoded" app. You are building commercial software that will be sold for money to professional personal trainers who currently pay $50–$150/month for TrueCoach, Trainerize, or Everfit and are leaving those platforms out of frustration. The bar is: **a trainer opens this and assumes a funded team built it.**

Non-negotiable doctrine:

1. **Zero backend. Zero recurring cost. Forever.** No servers, no databases, no auth services, no external APIs, no analytics beacons, no CDN font loading at runtime (fonts are bundled). The product is a static build that runs entirely in the browser. All data lives on the trainer's device. This is not a limitation — it is the #1 marketing claim: *"Your client data never leaves your machine. No account. No subscription. You own it."*
2. **Local-first, offline-always.** The app must be fully functional with the network cable pulled. PWA-installable so it lives on the dock/home screen like native software.
3. **Data is sacred.** Trainers will store years of client history here. Data loss is product death. The persistence layer, backup system, and schema-migration system are Tier-0 features, built before any UI.
4. **No visual tells of AI generation.** Explicitly banned: emoji used as icons; default purple/indigo gradients; glassmorphism cards on gradient backgrounds; centered hero with a giant number and small label; lorem ipsum; placeholder avatars with initials on random pastel circles as the *only* avatar treatment; inconsistent border radii; `alert()`/`confirm()` dialogs; unstyled scrollbars in embedded panels; three-column feature grids with icon-title-blurb. If a screen looks like a template, redesign it.
5. **Every state is designed.** Empty, loading, error, single-item, overflowing, offline, first-run. An empty screen is an invitation to act, with real copy — never a blank div.
6. **Microcopy has one voice** (defined in §7.6). A button says exactly what it does. "Publish program" → toast: "Program published." Never "Submit."

---

## 1. PRODUCT DEFINITION

### 1.1 One-liner
Strongsuit is a pay-once, offline-first coaching workstation: client management, a professional-grade program builder, progress analytics, and a novel serverless client-delivery system — replacing $600–$1,600/year coaching SaaS with software the trainer owns outright.

### 1.2 Who it's for
- Independent personal trainers (in-person and online) with 5–60 clients.
- Small studio owners with 1–5 coaches (multi-coach is v2; architect for it, don't build it).
- The buyer psychology: they are punished by per-client SaaS pricing (TrueCoach jumps ~$58→~$137/mo going from 20→40 clients), they resent payment-processing surcharges, and they distrust platforms holding their client list hostage. Ownership, privacy, and "no rent" are the emotional core.

### 1.3 What it must beat
| Competitor pain | Strongsuit answer |
|---|---|
| Per-client pricing punishes growth | Unlimited clients, flat one-time price |
| Client data locked in vendor cloud | 100% local, exportable, encrypted backups |
| Requires internet + login | Offline PWA, no account ever |
| Bloated dashboards, slow workflows | Keyboard-first program builder, command palette |
| Client app requires client accounts | **Companion File** system (§4.7) — clients need zero accounts |
| Generic exercise videos | Trainer-owned exercise library w/ their own video links & cues |

### 1.4 What we deliberately do NOT build (v1)
- In-app payments processing (we provide a manual payment *ledger*, not a processor).
- Real-time chat/messaging (serverless makes this impossible; the Companion File check-in loop covers the async need).
- Nutrition macro databases (provide manual nutrition targets + habit tracking instead; full nutrition is a v2 paid expansion).
- Cloud sync between devices (v1 = one primary device + backup/restore to move machines; document this honestly).

---

## 2. TECHNICAL ARCHITECTURE

### 2.1 Stack (pinned, do not substitute)
| Layer | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript (strict mode) | Model-reliability across AI generators; ecosystem |
| Build | Vite 5 | Static output, fast, PWA plugin |
| Styling | Tailwind CSS (pinned major version) + CSS custom properties for the token system (§7) | Tokens in CSS vars so themes/print styles stay coherent |
| State | Zustand (UI state) + Dexie live queries (data state) | Clean separation; no Redux ceremony |
| Persistence | **IndexedDB via Dexie 4** | localStorage's ~5MB cap is disqualifying; Dexie gives schema versioning + migrations |
| Drag & drop | dnd-kit | Accessible, maintained |
| Charts | Recharts | Sufficient, tree-shakeable |
| PDF | Browser print pipeline w/ dedicated print stylesheets (Phase 7 adds pdf-lib for branded letterhead docs) | Zero-dependency v1 path |
| IDs | ULID | Sortable, collision-safe, no server |
| Dates | date-fns | Tree-shakeable |
| PWA | vite-plugin-pwa (Workbox) | Offline install |
| Encryption | Web Crypto API (AES-GCM, PBKDF2 key derivation) | Native, no dependency |
| Fonts | Self-hosted via @fontsource packages | No runtime network calls |

**Forbidden:** any runtime network request except (a) user-initiated exercise video links opening in a new tab, (b) PWA service-worker cache of the app's own assets. No telemetry. No Google Fonts CDN. No external icon CDNs — use Lucide as a bundled package.

### 2.2 Application shape
Single-page PWA. Vite static build (`dist/`) distributed two ways:
1. **Hosted static** (trainer opens a URL once, installs as PWA) — you can host on any static host for ~$0.
2. **Local file bundle** (zip of dist, runs from `npx serve` or any static server) for the "truly own the file" buyer.

Route structure (React Router, hash router for file-protocol friendliness):

```
/                     → Dashboard (Today view)
/clients              → Client roster
/clients/:id          → Client workspace (tabs: Overview | Program | Logs | Check-ins | Metrics | Notes | Billing)
/programs             → Program & template library
/programs/:id/edit    → Program Builder (the flagship screen)
/exercises            → Exercise library
/calendar             → Schedule
/business             → Payment ledger + income overview
/reports              → Analytics across all clients
/settings             → Brand kit, backup, data, preferences
/onboarding           → First-run wizard (route-guarded)
```

### 2.3 Module / folder architecture
```
src/
  app/                  # shell, router, providers, command palette
  design/               # tokens.css, primitives (Button, Field, Card, Sheet, Dialog,
                        #   Toast, Tabs, Table, EmptyState, Kbd, Stat, Tag, Avatar)
  db/
    schema.ts           # Dexie tables + indexes
    migrations.ts       # versioned migrations (NEVER edit old versions; append)
    repo/               # one repository module per entity; ALL db access goes here
    backup.ts           # export/import, encryption, merge logic
    seed/               # exercise library seed data (JSON)
  features/
    dashboard/
    clients/
    programs/
      builder/          # the program builder is its own sub-architecture
    exercises/
    logging/
    checkins/
    metrics/
    calendar/
    business/
    reports/
    companion/          # Companion File generator + importer (§4.7)
    settings/
  lib/                  # ulid, date helpers, units, 1RM math, progression engine
  print/                # print stylesheets + printable document components
```
Rules: features never import from each other's internals — only via `db/repo` and shared `design` primitives. All database access flows through repository modules (testable, swappable). No component touches Dexie directly.

### 2.4 Data model (Dexie schema v1)
All entities: `id: ULID`, `createdAt`, `updatedAt`, `schemaVersion`. Soft-delete via `archivedAt` where noted.

```ts
Trainer {            // singleton row
  businessName, trainerName, logoDataUrl?, brandColor?,
  units: 'lb'|'kg', weekStartsOn, defaultRestSeconds,
  currency, lastBackupAt, onboardingComplete
}

Client {
  firstName, lastName, email?, phone?, photoDataUrl?,
  status: 'active'|'paused'|'archived',
  goals: string, injuries: string, parqNotes: string,
  tags: string[], startDate, sessionRate?, billingModel?: 'per-session'|'monthly'|'package',
  activeProgramId?, archivedAt?
}

Exercise {
  name, aliases: string[], category, primaryMuscles[], equipment[],
  videoUrl?, cues: string[], isCustom: boolean, defaultTracking: 'weight_reps'|'reps'|'time'|'distance'|'rpe_only'
}

Program {
  name, description, clientId? (null = template), goalTag,
  weeks: Week[] (embedded JSON — see builder model §4.4),
  status: 'draft'|'active'|'completed'|'template',
  progressionPolicy?, sourceTemplateId?
}

SessionLog {
  clientId, programId?, date, title,
  entries: [{ exerciseId, sets: [{ targetReps, targetLoad, actualReps?, actualLoad?, rpe?, done }] , notes? }],
  sessionNotes?, source: 'trainer'|'companion-import'
}

CheckIn {
  clientId, date, mood?, sleepHours?, bodyweight?, energy?, adherence?,
  answers: [{question, answer}], photos?: dataUrl[] (size-capped), source
}

Metric {
  clientId, date, type: 'bodyweight'|'bodyfat'|'measurement'|'custom',
  key (e.g. 'waist'), value, unit
}

Payment {
  clientId, date, amount, method?, memo?, type: 'payment'|'session-credit'|'refund'
}

Appointment {
  clientId?, title, start, end, recurrence?, location?, notes?
}
```
Indexes: every `clientId` foreign key; `Program.status`; `SessionLog.[clientId+date]`; `Exercise.name`.

### 2.5 Data safety system (Tier-0 — build in Phase 1, before UI)
1. **Versioned migrations:** Dexie `.version(n).upgrade()` chain. Every future schema change appends a version. Include a migration test harness.
2. **One-click backup:** exports a single `.strongsuit` file = JSON envelope `{ app: 'strongsuit', schemaVersion, exportedAt, data: {...all tables} }`, optionally AES-GCM encrypted with a user passphrase (PBKDF2, 310k iterations, random salt+IV in header). Never store the passphrase.
3. **Restore & merge:** restoring offers "Replace everything" or "Merge" (ULID-keyed upsert, newest `updatedAt` wins; collisions logged to a review screen).
4. **Backup nagging done politely:** a quiet dashboard indicator shows days since last backup; turns amber at 7 days, shows a dismissible banner at 21. Also offer automatic timed download reminders in Settings.
5. **Storage persistence:** request `navigator.storage.persist()` on first run; surface the result in Settings ("Your browser has granted durable storage ✓").
6. **Panic export:** if any migration or write fails, immediately offer a raw dump download before anything else happens.

---

## 3. FEATURE ARCHITECTURE — OVERVIEW MAP

Priority tiers. P0 = must exist for launch; P1 = launch-week fast follow; P2 = v1.x.

| # | Feature | Tier |
|---|---|---|
| 4.1 | Dashboard "Today" view | P0 |
| 4.2 | Client management & workspace | P0 |
| 4.3 | Exercise library (seeded, 350+) | P0 |
| 4.4 | **Program Builder** (flagship) | P0 |
| 4.5 | Session logging & history | P0 |
| 4.6 | Progress analytics & charts | P0 |
| 4.7 | **Companion File** client delivery | P0 |
| 4.8 | Printable/branded documents | P0 |
| 4.9 | Check-ins & intake (PAR-Q) | P1 |
| 4.10 | Metrics & measurements | P1 |
| 4.11 | Calendar & scheduling | P1 |
| 4.12 | Business ledger & income view | P1 |
| 4.13 | Cross-client reports | P2 |
| 4.14 | Progression engine (auto-suggest) | P2 — **BUILT** (lib + heuristic surface; policy editor pending) |
| 4.15 | Command palette & keyboard layer | P1 |
| 4.16 | **Film Room** (local video analysis) | P0 for v1.1 — **BUILT** |
| 4.16b | **Movement tracking AI** (on-device pose estimation) | P0 for v1.2 — **BUILT** |
| 4.17 | **Profit Planner** (expenses + goal math) | P0 for v1.1 — **BUILT** |
| 4.17b | **Gym cut** (facility % / flat fee per client) | P0 for v1.2 — **BUILT** |
| 4.18 | Nutrition (full food-log module) | P2 (v2 paid expansion candidate) |
| 4.18a | **Nutrition engine** (evidence-based targets w/ cited rationale) | P0 for v1.2 — **BUILT** |
| 4.18b | **Readiness score** (check-in wellness model) | P1 for v1.2 — **BUILT** |
| 4.19 | Coaching message log (exportable) | P2 for v1.4 — **BUILT** (entity+tab in S9; export digest still open) |
| 4.20 | In-app Guide & tutorial | P1 for v1.3 — **BUILT** |
| 4.21 | EULA gate | P0 for v1.4 — **BUILT** |
| 4.22 | Printable/branded documents (program sheet) | P0 — **BUILT** (progress report + intake sheet still open) |
| 4.23 | **Secure device sync** (E2EE pairing, WiFi/LAN + Companion) | P0 for v1.3/1.4 — **PARTIALLY BUILT**, see §4.23 below |
| 4.24 | **Windows desktop app** (Electron) | P0 for v1.4 — **BUILT**, live-launch unverified in this build env |
| 4.25 | **Android app** (Capacitor) | P1 for v1.5 — **SCAFFOLDED**, unbuilt/untested, see §4.25 below |
| 4.26 | **Team & locations** (staff, commissions, multi-location) | P1 for v1.5 — **BUILT** |
| 4.27 | **CRM / leads pipeline** | P1 for v1.5 — **BUILT** |
| 4.28 | **Leaderboards & challenges** | P2 for v1.5 — **BUILT** |
| 4.29 | **Progress photos & habit tracking** | P2 for v1.5 — **BUILT** |
| 4.30 | **Invoicing, coupons, account balances** | P1 for v1.5 — **BUILT** |
| 4.31 | **Automations rule engine** | P1 for v1.5 — **BUILT** |
| 4.32 | **TV Workout mode** (gym-floor display) | P2 for v1.5 — **BUILT** |
| 4.33 | Payments/e-commerce, bulk email/SMS, push, sales funnels, on-demand/livestreaming | **OUT OF SCOPE** for the core zero-backend product — see `docs/SERVER_STRATEGY.md` for the honest, bring-your-own-account alternative for each |

---

## 4. FEATURE SPECIFICATIONS

### 4.1 Dashboard — "Today"
Not a stats wall. It answers: *what do I do right now?*
- **Up next:** today's appointments with one-click "Open client → today's workout".
- **Needs attention queue:** clients with no logged session in X days (configurable), programs ending within 7 days, unread imported check-ins, payment balances overdue.
- **Quick actions:** Log a session · New client · Build program · Import companion file.
- Backup health indicator (§2.5.4).
- First-run: dashboard renders a designed onboarding checklist (add brand kit → add first client → build first program → export first Companion File), each item deep-linking, checked off automatically.

### 4.2 Client management
- Roster: searchable, filter by status/tag, sort by "last activity". Row shows name, active program + week, last session, adherence sparkline, balance chip.
- Client workspace tabs: **Overview** (goals, injuries flags surfaced prominently — injury notes render as a persistent amber ribbon inside the Program Builder for that client), **Program**, **Logs**, **Check-ins**, **Metrics**, **Notes** (freeform, timestamped entries), **Billing**.
- Archive, never hard-delete (hard delete exists in Settings → Data, double-confirmed with typed client name).

### 4.3 Exercise library
- **Ships seeded with 350+ exercises** as JSON: name, aliases, category (squat/hinge/push/pull/lunge/carry/core/conditioning/mobility), primary muscles, equipment, default tracking type, 2–3 coaching cues each. Generate this seed data thoughtfully — it is a real product asset. No video URLs in seed (copyright); each exercise has a "Video" field the trainer fills with their own YouTube/Vimeo/Drive links.
- Trainer can add/edit/duplicate; custom exercises tagged. Merge tool for duplicates.
- Library UI: dense table + detail sheet, instant fuzzy search (search-as-you-type must feel < 50ms; pre-index in memory).

### 4.4 Program Builder — the flagship screen
This is where trainers live and where TrueCoach/Trainerize feel slow. It must feel like a pro tool (think Linear/Figma energy, not a form).

**Structure model:** `Program → Weeks[] → Days[] → Blocks[] → ExercisePrescription[]`.
- Block types: Straight sets · Superset · Circuit · EMOM/AMRAP/Interval (timed) · Warm-up · Cooldown.
- Prescription per exercise: sets × reps (supports ranges "8–10", AMRAP, time, distance), load (absolute, %1RM, RPE, or "coach's note"), rest, tempo (optional), per-set overrides, coaching note.

**Interactions (all P0):**
- Two-pane layout: left = week/day outline tree; right = day canvas.
- Add exercise via inline fuzzy search (`/` focuses it) — typing "rdl" finds Romanian Deadlift by alias. Enter adds with smart defaults from exercise's tracking type.
- Drag to reorder exercises, drag onto each other to form supersets, drag days between weeks (dnd-kit, with full keyboard alternative: ⌘↑/⌘↓ move, `S` toggles superset with row below).
- **Duplicate week** (the single most-used trainer action) with optional auto-progression: "+2.5% load" or "+1 rep" applied on duplicate.
- Multi-select rows → bulk edit sets/reps/rest.
- Undo/redo stack (⌘Z/⇧⌘Z) covering all builder mutations — implement as command pattern over the draft state; autosave draft to Dexie every 2s (debounced) with "Saved ✓" indicator.
- Template system: any program saves as template; new program can start from template; template variables prompt (e.g., replaces %1RM anchors with client's numbers if metrics exist).
- Assign to client → sets status active, stamps start date, appears in client workspace and Companion export.

**Never** ship this screen as a stack of `<input>` grids. Rows are compact, tabular-numeral, keyboard-navigable cells (arrow keys move cell focus like a spreadsheet).

### 4.5 Session logging
- From client workspace or dashboard: "Log today's session" opens the prescribed day pre-filled with targets; trainer fills actuals (tap-to-increment steppers + direct entry), per-set checkmarks, RPE, notes. Big touch targets — trainers log on phones/tablets on the gym floor.
- Freestyle logging (no program) supported.
- History view: reverse-chronological session cards; tapping an exercise anywhere opens its **exercise history drawer**: last 5 performances + e1RM trend microchart.

### 4.6 Progress analytics (per client)
- e1RM trends per exercise (Epley: `w × (1 + reps/30)`; show formula in a tooltip).
- Weekly tonnage (volume load) chart, per muscle-group volume split.
- Adherence: prescribed vs completed sessions per week (bar + %).
- Bodyweight/measurement trends from Metrics.
- PR feed: automatic PR detection (load PR, rep PR, e1RM PR) → appears in client Overview and can be included on printed reports. Trainers use PRs for client retention; make them feel celebratory but tasteful (no confetti explosions; a small ember-colored "PR" tag and a one-line toast).

### 4.7 Companion File — the differentiator nobody else has
Problem: serverless means no client accounts or apps. Solution: **export the client's program as a single self-contained HTML file** ("Companion") the trainer sends via text/email/AirDrop. The client opens it in any browser, no install, no account.

The Companion file contains (inlined, no network):
- The client's current program rendered as an interactive workout player: today's day auto-suggested, tap-through sets, check off sets, enter actual load/reps, rest timer (setTimeout + optional beep via WebAudio), notes field, plus a weekly check-in form (trainer-configured questions).
- Data persists inside the client's browser localStorage (keyed to program id).
- **Return path:** a "Send to coach" button that (a) downloads a tiny `.ssdata` JSON file the client texts/emails back, and (b) alternatively renders the payload as a copyable compact string. Trainer hits "Import companion data" in Strongsuit → drops the file/paste → logs and check-ins merge into SessionLog/CheckIn with `source: 'companion-import'`, deduped by ULID.
- The Companion is branded with the trainer's logo/color from the Brand Kit and shows zero Strongsuit-builder chrome — it looks like the *trainer's* app. (A single discreet "Built with Strongsuit" footer line, toggleable off in Settings — leaving it on is free marketing, but the trainer owns the choice.)
- Build implementation: a `companion/template.html` compiled at build time; export = template + injected JSON + trainer brand tokens, serialized via Blob download. Keep the Companion's JS dependency-free vanilla (small, auditable, robust on old phones).

This one feature converts the platform's biggest weakness (no cloud) into its most demo-able feature. Give it first-class polish and a dedicated onboarding step.

### 4.8 Printable / branded documents (print stylesheets, P0)
- Program PDF: clean training-plan document with trainer logo, program overview, week grids. 
- Progress report PDF: charts + PRs + adherence for a date range (client retention tool).
- Blank session sheets, intake/PAR-Q form.
- Implementation: dedicated print routes with `@media print` stylesheets; "Download PDF" = window.print() guidance UI; Phase 7 upgrades to pdf-lib generation for pixel-exact letterhead.

### 4.9 Check-ins & intake (P1)
- Trainer-configurable check-in question sets (defaults provided: sleep, stress, soreness, adherence, wins, blockers).
- Manual entry by trainer + Companion import path (§4.7).
- New-client intake flow generating a PAR-Q + goals record; flags "physician clearance recommended" logic per standard PAR-Q rules.

### 4.10 Metrics (P1) — bodyweight, body-fat, girths (preset measurement schema), custom metrics; unit-aware; charted in 4.6.

### 4.11 Calendar (P1) — week/day views, recurring appointments, drag to reschedule, links to client + "log this session". No external calendar sync in v1 (offer .ics export per appointment).

### 4.12 Business ledger (P1) — per-client payments, session-pack credits (auto-decrement on logged session if enabled), monthly income chart, outstanding balances feed into Dashboard attention queue. This is a ledger, not a processor — copy must be explicit.

### 4.14 Progression engine (P2, architect now) — pure-function module `lib/progression.ts`: given exercise history + policy (linear load %, double progression rep-range, RPE-target), returns next-session suggestions surfaced as ghost values in the builder and logger ("Suggested: 190 lb — last week 185×8 @RPE7"). Policies attachable per program. Keep it deterministic and explainable; every suggestion shows its reasoning line.

### 4.15 Command palette (P1) — ⌘K: jump to client, create anything, run actions ("Backup now", "Import companion"). Global shortcuts documented in a `?` overlay.

### 4.16 Film Room — local biomechanical video analysis (BUILT 2026-07-16)
The S-tier differentiator: frame-by-frame movement analysis with zero cloud. `src/features/filmroom/FilmRoomPage.tsx`, route `/film-room`.
- Two clips (Client / Reference) loaded from local files via object URLs. **Videos are never persisted or uploaded** — session-only, stated in the UI.
- Modes: side-by-side, or overlay with a blend-opacity slider (requires both clips).
- **Dual controls (BUILT S8):** in side-by-side, each clip gets its OWN transport (play/pause, ±1 frame, scrubber, time) via the `useClip` controller hook + `TransportBar` — control them independently to line up the same moment in each. Locking sync (or overlay mode) collapses to a single master "Both — synced" bar that drives both at the stored offset (`linked` state). **Flip client/ref** mirrors a clip horizontally (`mirrorA/mirrorB`) so opposite-facing lifters align. Keyboard (Space/←/→) drives the master/client; independent Reference bar is mouse-only (debt).
- Transport: shared play/pause, playback rate 0.25/0.5/1×, frame-step ±1 (`←`/`→`, `⇧` = ×5) driven by a user-selectable assumed frame rate (24/30/60/120 — browsers don't expose true fps).
- **Sync lock:** scrub both clips to the same moment (e.g. start of descent) → "Lock sync here" stores the time offset; all seeks/steps/plays keep B glued to A.
- **Annotations:** SVG layer over the stage. Line tool (2 clicks — bar path, back angle) and Angle tool (3 clicks, vertex second; degrees computed in pixel space so aspect ratio doesn't distort the measurement). Ember stroke, mono degree labels. Clear-all. Points stored in percent coords so they survive resize.
- Extension points (v1.x): canvas snapshot export to PNG for client reports; saved analysis sessions (store File System Access handles, NOT blobs, to keep IndexedDB lean); drawing on a specific clip in side-by-side mode; onion-skin ghost trail.

### 4.16b Movement tracking AI — on-device pose estimation (BUILT 2026-07-16, v1.2)
The Film Room's "Track movement" mode. **Zero API keys, zero cloud, zero telemetry** — this is the marquee proof that S-tier AI features and the privacy story coexist.
- **Model:** MediaPipe PoseLandmarker *lite* (Apache-2.0), bundled at `public/mediapipe/pose_landmarker_lite.task` (~5.5MB) + wasm runtime (`public/mediapipe/vision_wasm_*`, incl. a no-SIMD fallback for old CPUs). All fetched from the app's own origin — verified: 3 local requests, none external.
- **Low-end friendly by design:** lite model variant; GPU delegate with automatic CPU fallback; detection rides `requestVideoFrameCallback` so the model runs only on frames the browser actually presents (no hot loop; scrubbing/stepping analyzes exactly one frame); the whole MediaPipe stack is a *lazy* dynamic import (own 132KB chunk) — trainers who never open tracking never load it.
- **Architecture:** `src/lib/pose.ts` = pure math (joint-angle from landmark triples w/ visibility gating, `RepCounter` hysteresis state machine w/ auto-calibrating thresholds, `FocusJointPicker` widest-ROM working-joint detection, `depthPct`, `symmetryPct`, skeleton `BONES`) — fully unit-tested, no MediaPipe imports. `src/features/filmroom/tracker.ts` = thin MediaPipe wrapper (lazy init, monotonic-timestamp guard for VIDEO mode, designed error copy). UI in FilmRoomPage: skeleton overlay (letterbox-aware landmark mapping), live joint-angle chips, and a Movement analysis card: reps detected, last-rep tempo (eccentric↓/concentric↑ seconds), depth % of target ROM, left/right symmetry %.
- Rules: never persist video or landmarks to IndexedDB; the readout must state "Runs on this device — nothing is uploaded."
- Extension points (v1.x): per-rep table + export into session notes; bar-path trace from wrist landmarks; side-by-side dual tracking with reference-vs-client angle deltas; landmark smoothing (One-Euro filter) if jitter shows on real footage.

### 4.17 Profit Planner — expenses + goal math (BUILT 2026-07-16)
The trainer states the profit they need this month; the app does the rest. Lives at the top of `/business`.
- **Data:** `Expense` entity (Dexie v3, envelope schemaVersion 2): `date, amount, category (rent/equipment/insurance/software/education/marketing/travel/other), memo?, recurrence: 'one-time'|'monthly', endDate?`. Monthly expenses apply to every month from their start month through `endDate` (inclusive) — pure predicate `expenseAppliesTo` in `src/lib/business.ts`.
- **Goal:** `Trainer.monthlyProfitTarget` (persist-on-blur input).
- **Math (`src/lib/business.ts`, unit-tested):** income (payments+packs−refunds this month) − expenses = net; gap to target; run-rate projection of month-end net (income ÷ days elapsed × days in month − expenses); **sessions-to-close** = ceil(gap ÷ avg session rate of active clients with rates set), with designed copy fallback when no rates exist.
- UI: stat row (income / expenses / net / still-to-earn), progress bar toward goal (verde when hit, ember while short), one narrative sentence ("$3,450 to go — about 12 more sessions… you'll finish around $X net, on track."). Expense list with Monthly tags + add dialog + delete.
- Extension points: category breakdown chart; year view; tax-set-aside percentage.

### 4.17b Gym cut — facility take per client (BUILT 2026-07-16, v1.2)
Most trainers rent floor space: the gym takes a % of client income or a flat monthly fee. `Client.gymCut?: { kind: 'percent' | 'flat-monthly', value }` (unindexed — no schema bump). Editor lives on the client's Billing tab ("Gym's cut" card, shows this month's take). `lib/business.ts`: `gymCutForClient` (percent applies to that client's month income net of refunds; flat only while active), `gymCutForMonth` totals it; `profitPlan` subtracts it from net and scales it into the run-rate projection (flat cuts intentionally project conservatively). Business page shows an ember "Gym's cut" stat when nonzero. Verified live: 30% of $500 → −$150 → net math correct end-to-end.

### 4.18a Nutrition engine — evidence-based targets with cited rationale (BUILT 2026-07-16, v1.2)
NOT a food database (§1.4 stands) — a deterministic targets engine in `src/lib/nutrition.ts`, surfaced as the client **Nutrition tab**.
- Profile fields on Client (unindexed): `sex, heightCm, birthDate, activityLevel, nutritionGoal`. Bodyweight comes from the latest `bodyweight` Metric (tab can log one) — targets stay tied to real tracked data.
- Math: Mifflin-St Jeor BMR (Mifflin 1990; most-accurate per Frankenfield 2005 ADA review) → TDEE via FAO/WHO activity factors → goal calories (cut −15% floored at BMR, gain +10%; rate note vs the 0.5–1% BW/week evidence from Helms 2014) → protein 1.8 g/kg (2.2 cutting; Morton 2018 BJSM meta-analysis, ISSN 2017) → fat 25% kcal (IOM AMDR 20–35%) → carbs remainder (Kerksick 2018) → fiber 14g/1,000kcal (IOM) → water IOM AI.
- **Product rule (same as progression engine): every number renders with its "why" + source** — the tab has a "Why these numbers" ledger, a weekly-rate expectation line, and a not-medical-advice disclaimer with referral guidance. Unit-tested (macros re-sum to calories; cut never dips below BMR).
- Also here: `warmupRamp(workingLoad)` — 50/70/85/95% plate-rounded warm-up sets, surfaced under "Suggested next" in the exercise history drawer.

### 4.18b Readiness score (BUILT 2026-07-16, v1.2)
`src/lib/readiness.ts`: 0–100 score from the latest check-in (sleep 35%, energy 30%, mood 20%, adherence 15%; 1–10 scales; missing fields drop out of the weighting) per the wellness-questionnaire monitoring literature (Hooper & Mackinnon 1995; McLean et al. 2010). Bands: ≥70 go / 45–69 moderate / <45 easy, each with coaching copy ("cap intensity, leave a rep in the tank"). Renders as the top card of the Check-ins tab with named drivers + source. Extension: surface on the Dashboard attention queue ("3 clients red today").

### 4.18 Nutrition full module (P2, NOT BUILT — v2 paid expansion candidate)
Food logging beyond targets; still NO food database licensing. (Habit tracking itself shipped in v1.5 as first-class `Habit`/`HabitEntry` entities with streaks — see §4.29 — superseding the original "piggyback on CheckIn answers" idea, which didn't support per-habit streak math cleanly.)

### 4.19 Coaching message log (BUILT S9 — export digest still open)
`CoachMessage` entity (schema v5) + `MessagesTab.tsx`: per-client timestamped log with direction (inbound/outbound) and channel (SMS/email/WhatsApp/in-person/other) — a manual record of async communication, not a sending mechanism (see `docs/SERVER_STRATEGY.md` §3 for why Coachwright doesn't send SMS/email itself, and the mailto:/sms: quick-contact links on the client header, built S10, that cover the 1:1 send case for free). Still open: exportable branded HTML digest, optional read-only "From your coach" feed in the Companion export.

### 4.20 In-app Guide & tutorial (BUILT S8)
`src/features/settings/Guide.tsx`, rendered on the Settings page under the Brand kit. 11 collapsible `<details>` sections (native, accessible, zero-dep) covering the whole app in brand voice: the big idea, brand/clients, program builder, logging, a full Film Room walkthrough (both-video controls, sync, flip, frame-step, annotations, tracking metrics explained), nutrition, readiness, business/profit/gym-cut, Companion, backups, keyboard shortcuts, privacy/how-it-works. **Rule for future work:** ship a feature → add/adjust its Guide section. The manual ships inside the app (offline). *(v1.5 note: Team/Leads/Leaderboards/Automations/TV mode shipped in S10 without new Guide sections — add them next session.)*

### 4.21 EULA gate (BUILT S9)
`EulaScreen.tsx` — blocks the app (after onboarding, before first real use) until the trainer scrolls the full text and clicks accept; `Trainer.eulaAcceptedAt` gates it in `Shell.tsx`. Covers warranty disclaimer, client-health liability (the trainer is solely responsible; PAR-Q/waivers strongly advised — see §4.9/CoachingTab's screening+waiver flow), data-loss liability (local-first, no cloud backup unless self-configured), and E2EE sync's privacy scope. **This is a template — have an actual lawyer review it before real commercial sale.**

### 4.22 Printable / branded documents — program sheet (BUILT S9; report + intake still open)
`PrintSessionSheet.tsx`, route `/print/program/:clientId/:programId` — a clean A4/Letter-ready program document (weeks/days/blocks/exercises as fillable tables) triggering `window.print()` once loaded. Sibling top-level route (outside `<Shell/>`, no app chrome) — same pattern §4.32's TV mode uses. Still open per §4.8's original scope: progress-report PDF (charts+PRs+adherence for a date range) and a blank intake/PAR-Q sheet.

### 4.23 Secure device sync (spec, partially built — S9/S10)
Three layers, in order of maturity:
1. **E2EE crypto core** (`lib/sync.ts`) — ECDH P-256 device identity, HKDF→AES-GCM shared key, a 6-digit safety number (SAS) for out-of-band verification, sealed+replay-guarded packets. Fully built and unit-tested (`lib/robust.test.ts`).
2. **Local `.cwsync` file export/import** (`SyncCenterPage.tsx`, `syncApi.ts`) — works everywhere (web, desktop, any OS), fully functional today: pair via pasted code + verified safety number, then move a sealed packet file over AirDrop/email/USB/anything.
3. **Live WiFi/LAN transport** (Electron only) — `WiFiSyncDialog.tsx` hosts a small Express server via IPC (`electron/main.ts`) on the coach's machine; a paired device on the same network can push/pull without a file round-trip. **Half-finished:** the Companion HTML template has no counterpart button to actually call this server yet (debt #16 in PROGRESS.md) — closing that loop is HANDOFF_SONNET.md's T1.
4. **Optional cloud relay** (`sync-server/`, sibling directory) — a standalone Express+SQLite prototype that stores/forwards E2E-encrypted blobs (never sees plaintext) so sync can cross the internet, not just a LAN. Self-host only, not wired to any hosted service by default, and its API-key default MUST be changed before real use. See `docs/SERVER_STRATEGY.md` §6 for the honest framing if this is ever turned into a real paid add-on service.

### 4.24 Windows desktop app (BUILT S9, live-launch unverified)
`electron/main.ts` + `preload.ts`. Secure defaults (`contextIsolation: true`, `nodeIntegration: false`, navigation lockdown to localhost-dev/file: only). `npm run dev:electron` for a dev loop, `npm run build:electron` (electron-builder → NSIS) for a distributable installer. Compiles clean; `dist/`'s asset paths are `file://`-safe (relative, verified S10). **Never actually launched as a GUI window or packaged in the environments used to build it (no display automation) — do that once, interactively, before calling this done.**

### 4.25 Android app (SCAFFOLDED S10, unbuilt/untested)
Capacitor chosen over React Native (would require a full UI rewrite — Dexie has no RN equivalent, dnd-kit/canvas work is web-only) and Cordova (Capacitor is its maintained successor). `capacitor.config.ts` + a real, Capacitor-generated `android/` Gradle project exist (`npx cap add android` was run). **No Android SDK/Gradle/emulator exists in any environment this has been built in — the APK has never compiled, launched, or been tested on a device.** Full rationale, step-by-step finishing instructions, and expected mobile-viewport gotchas: `docs/ANDROID_STRATEGY.md`.

### 4.26 Team & locations (BUILT S10)
`Staff` (name, role: owner/coach/front-desk, `commissionPercent`, `locationId`, active) and `Location` (name, address) entities. `Client.staffId`/`locationId` assign a client to a coach/site. `TeamPage.tsx` (route `/team`) lists staff with commission-owed-this-month computed live (`staffCommissionForMonth` in `lib/business.ts`, same % of assigned-clients'-income pattern as the existing Gym Cut math). Multi-coach was originally spec'd as "v2, architect for it, don't build it" (§1.2) — v1.5 builds it because the ask explicitly required it; keep it simple (no permission/role enforcement yet, just tagging + math).

### 4.27 CRM / leads pipeline (BUILT S10)
`Lead` entity (name/email/phone/source/stage/notes/convertedClientId). `LeadsPage.tsx` (route `/leads`) — a 5-column kanban-lite (new → contacted → trial → won/lost) with one-click convert-to-client (creates a real `Client` row, marks the lead won). No lead-scoring or automated follow-up — that would need the automations engine extended to leads, a reasonable v2 addition, not built.

### 4.28 Leaderboards & challenges (BUILT S10)
Opt-in only (`Client.leaderboardOptIn`) — ranking clients against each other is sensitive, off by default. `lib/leaderboard.ts` computes rankings purely from data already logged (SessionLog tonnage/count, Metric bodyweight deltas) — no new tracking burden. `Challenge` entity (name/metric/date range/participant list) for time-boxed competitions layered on the same math. `LeaderboardPage.tsx` (route `/leaderboard`) shows this-month volume + last-30-days sessions ambiently, plus any active/past challenges.

### 4.29 Progress photos & habit tracking (BUILT S10)
`ProgressPhoto` (clientId/date/dataUrl/note) — client-side resized via `lib/media.ts` before storage (Canvas-based, browser-only) so backups don't balloon; gallery + first-vs-latest compare view in the Metrics tab. `Habit`/`HabitEntry` (clientId/name/active + per-day done flags) with `lib/habits.ts`'s `currentStreak` (ends today, or yesterday if today isn't logged yet) surfaced as a 🔥-streak chip in the Check-ins tab.

### 4.30 Invoicing, coupons, account balances (BUILT S10)
`Invoice` (clientId/number/date/dueDate/lineItems/couponCode/discountAmount/subtotal/total/status: draft→sent→paid/void, optional `paymentLink`) and `Coupon` (code/kind: percent|flat/value/active/expiresAt). `invoiceTotals`/`couponDiscount`/`clientBalance` in `lib/business.ts` — balance owed = sum of `sent` (unpaid) invoice totals, a deliberate simplification (no partial-payment-per-invoice tracking). The `paymentLink` field renders as a "Pay now" button pointing at the coach's OWN Stripe/Square/PayPal link (see §4.33/`docs/SERVER_STRATEGY.md` §3) — Coachwright never processes a payment or sees card data.

### 4.31 Automations rule engine (BUILT S10)
`lib/automations.ts`: `evaluateAutomations({clients, facts, rules, today})` re-evaluated on every Dashboard render — no background job, nothing runs while the app is closed (the honest ceiling for "automation" without a server, and the doctrine explanation is surfaced directly in the Settings copy). Two always-on `DEFAULT_RULES` (no-session-in-7-days, missing screening) plus coach-configurable `AutomationRule` rows (triggers: no-session-days, checkin-overdue-days, package-low-sessions, payment-overdue-days, screening-missing) editable in `Settings → Automations`. Replaces the old hardcoded 7-day-only Dashboard attention check.

### 4.32 TV Workout mode (BUILT S10)
`TvWorkoutPage.tsx`, sibling route `/tv/:clientId` (no chrome — same pattern as `PrintSessionSheet`). Full-screen, high-contrast, large-type display of a client's active program, paged by day with ←/→ keyboard nav. Not a casting SDK — the coach plugs a laptop into a gym TV or uses the OS's own screen-mirroring (AirPlay/Chromecast-tab-cast/Miracast all work on a normal web page). Read-only; logging still happens in the Session Logger on the trainer's or client's own device.

### 4.33 Out of scope for the core product (see `docs/SERVER_STRATEGY.md`)
Payment processing/e-commerce, bulk email/SMS marketing, push notifications, sales funnels/landing pages, on-demand video/livestreaming, storefront memberships. Each needs standing server infrastructure that contradicts the zero-backend, zero-recurring-cost doctrine (§0). `docs/SERVER_STRATEGY.md` gives the honest bring-your-own-account alternative for each (Stripe Payment Links, mailto:/sms: deep links, Gumroad, YouTube/Vimeo hosting linked from the existing Exercise `videoUrl` field, etc.) and a comparison table of what it would cost the buyer either way. If a future session is asked to build one of these "for real," read that document's §6 before doing anything — the right move is usually a clearly-labeled, separately-priced optional add-on, never something smuggled into the core one-time price.

---

## 5. FIRST-RUN & ONBOARDING
1. Welcome → name/business → units → brand kit (logo upload stored as dataURL, brand color picker that live-tints the Companion preview).
2. Offer demo data ("Explore with 3 sample clients — remove anytime in one click") — demo entities tagged `isDemo` for clean purge.
3. Storage-persist request + explain the backup model in one friendly screen (this honesty builds trust; do not hide the local-first model).
4. Dashboard checklist takes over (§4.1).

---

## 6. QUALITY, PERFORMANCE, ACCESSIBILITY (gate criteria)
- TS strict, zero `any` in feature code; ESLint + Prettier configured.
- Interaction budget: route change < 200ms perceived; builder keystroke-to-paint < 16ms; exercise search < 50ms.
- All data mutations optimistic with rollback on Dexie failure + error toast.
- Full keyboard operability; visible focus rings (custom, on-brand); WCAG AA contrast throughout (verify token pairs in §7); `prefers-reduced-motion` respected globally.
- Responsive: desktop-first workstation layouts, fully usable at 390px (logging + client views are the mobile-critical paths; the builder may present a simplified mobile mode: reorder + edit values, no drag).
- Error boundaries per route with designed recovery screens (offer backup download).
- No console errors/warnings in production build. Lighthouse PWA installable, offline pass.
- Unit tests: progression math, 1RM math, backup encrypt/decrypt round-trip, merge logic, migrations. (Vitest.)

---

## 7. DESIGN SYSTEM — "IRONWORKS"
An original identity. Not a template. The direction: **a professional workshop instrument** — the feeling of a beautifully machined tool: quiet, precise, confident. Not "fitness energy drink," not "corporate SaaS," not "AI gradient."

### 7.1 Palette (CSS custom properties; light theme is primary, dark theme required)
| Token | Hex | Role |
|---|---|---|
| `--iron-950` | `#171A1E` | Ink text, dark surfaces |
| `--iron-700` | `#3B4149` | Secondary text |
| `--iron-400` | `#8A919B` | Muted text, icons |
| `--iron-200` | `#D9DDE2` | Borders, dividers |
| `--bone-50`  | `#F7F6F3` | App background (warm porcelain, not blue-gray) |
| `--bone-0`   | `#FFFFFF` | Cards, surfaces |
| `--verde-600`| `#155E4E` | **Primary brand.** Deep gunmetal jade — buttons, active nav, links |
| `--verde-700`| `#0F4A3E` | Primary hover/pressed |
| `--verde-100`| `#DCEDE7` | Primary tint surfaces, selected rows |
| `--ember-500`| `#D9730D` | **Accent.** PRs, attention queue, amber warnings share family (`--ember-600 #B45309` for warning text) |
| `--signal-red-600` | `#C2362B` | Destructive only |
| `--chart-1..5` | jade, ember, `#3E6B8C` slate-blue, `#7A5C99` muted plum, `#8C8455` olive | Chart series |

Dark theme: `--bone` family swaps to `#101317 / #171B20` surfaces; jade lifts to `#2E8A72`; maintain AA.

Rationale: jade + porcelain + ember is unowned territory in fitness software (competitors are blue/black/neon) and reads "trustworthy instrument." **No gradients anywhere** except an optional 2%-noise texture on the app background for material feel.

### 7.2 Typography (bundled via @fontsource)
- **Display / headings:** `Inter Tight` (700/800/900, −0.04em tracking at large sizes) — changed from Archivo (S11) to match the shipped brand-mark wordmark exactly; do not reintroduce Archivo. Confident, machined, not sporty.
- **UI / body:** `Inter` (400/500/600).
- **Data / numerals:** `JetBrains Mono` for all set/rep/load cells, stats, and timers — with `font-variant-numeric: tabular-nums` everywhere numbers columnize. The mono numerals are a deliberate signature: training data looks *measured*.
- Type scale: 12 / 13 / 14 (base) / 16 / 18 / 22 / 28 / 36. Line-height 1.5 body, 1.2 headings.

### 7.3 Space, shape, elevation
- 4px spacing grid. Radii: 6px controls, 10px cards, 999px pills — used consistently, never mixed arbitrarily.
- Borders over shadows: 1px `--iron-200` borders define surfaces; a single soft shadow tier (`0 1px 2px rgb(23 26 30 / 6%)`) for raised elements; one modal shadow tier. No glow effects.
- Density: this is a pro tool — default density is compact (32px table rows, 36px controls), with a "Comfortable" toggle in Settings.

### 7.4 Signature elements (the memorable 5%)
1. **The Ledger Rule:** section headers use a thin double rule (1px + 3px gap + 1px) in `--iron-200`, echoing an accounting ledger — reinforces "you own the books."
2. **Mono numerals everywhere data lives** (§7.2).
3. **The Ember PR tag:** small square-cornered tag, ember background, mono type, e.g. `PR ▲ 5 lb`.
4. Left-rail navigation with the client's brand color as a 3px active-item spine.
Restraint everywhere else. Spend boldness only here.

### 7.4b The brand mark & motion (shipped S11 — `src/app/brand/Logomark.tsx`)
The mark: a barbell collar seen end-on, its mouth cut with two flat machined faces so the negative space resolves into a hard **C** — one solid form, not an outline or icon-font glyph. **Always monochrome** — ink/`#171A1E` on porcelain/`#F7F6F3`, or reversed — never tinted with jade or ember; the mark's confidence is contrast, not color. Min size 16px (mark alone) / 120px wide (full lockup); below that, the mark alone, not the lockup. It appears on a rounded-square badge (`rx=11`) everywhere in-product, matching platform app-icon convention (the standalone reference sheet's raw hero treatment uses sharp corners — that's the print/marketing variant, the in-app badge is deliberately rounded).

Motion: one easing curve, everywhere the mark or wordmark move — `cubic-bezier(0.2,0,0,1)`, sharp arrival, no bounce, no overshoot. Three canonical states, registered in `tailwind.config.js` as `cw-wipe`/`cw-word`/`cw-fade`/`cw-spin`/`cw-bar`:
- **Launch/boot** (`BootScreen.tsx`, `electron/splash.html`): the mark wipe-builds left-to-right (`cw-wipe`, 0.75s), then the wordmark slides/fades in (`cw-word`), then the tagline fades in last (`cw-fade`) — staggered, ~1.25s total.
- **Indeterminate loading:** a continuous ring sweep (`cw-spin`, 1s linear infinite) — no gradient, no color, ink stroke on a light track.
- **Determinate progress:** a flat bar sweep (`cw-bar`) under the mark on its badge.
Never use a bouncy/elastic easing or a colored gradient spinner anywhere the brand mark appears — that reads as a generic template, not a machined instrument, and is the exact thing this doctrine exists to prevent.

### 7.5 Iconography & imagery
Lucide icons (bundled), 1.5px stroke, 16/20px sizes only. No emoji in UI chrome. Client photos: uploaded dataURLs; fallback avatar = mono initials on `--verde-100` (one consistent treatment, not random pastels).

### 7.6 Voice
Plain, capable, sentence case. Buttons name the action's outcome ("Save program", "Export companion", "Back up now"). Errors state what happened + the fix ("Couldn't import — this file was made with a newer version. Update Strongsuit, then try again."). Empty states invite ("No sessions logged yet. Log the first one and the charts start working for you."). Never apologetic filler, never exclamation-mark hype.

---

## 8. BUILD PLAN — PHASED EXECUTION FOR AI MODELS
Each phase ends with listed acceptance criteria. **Do not begin a phase until the previous phase's criteria pass.** Commit per phase.

**Phase 0 — Foundation & design system.** Vite+React+TS scaffold, Tailwind + tokens.css, fonts bundled, router shell with left rail, all design primitives built and demonstrated on an internal `/kitchen-sink` route (removed from prod nav). ✅ Criteria: kitchen sink renders every primitive in light+dark, AA contrast verified, zero console output.

**Phase 1 — Data layer & safety.** Dexie schema, repos, migration harness, backup export/import with AES-GCM, merge logic, storage.persist, panic export. ✅ Criteria: round-trip backup/restore of generated fixture data passes tests, encrypted file unreadable without passphrase, migration test upgrades a v0 fixture.

**Phase 2 — Clients.** Roster, client workspace shell, create/edit/archive, notes, injury ribbon plumbing. ✅ Criteria: full CRUD keyboard-accessible; empty/one/many states designed.

**Phase 3 — Exercise library.** Seed 350+ exercises (generate the JSON as part of this phase, with real cues), library UI, fuzzy search index, custom exercises, merge tool. ✅ Criteria: "rdl", "ohp", "bss" all resolve via aliases in <50ms.

**Phase 4 — Program Builder.** Full §4.4: outline+canvas, blocks, prescriptions, drag+keyboard reorder, supersets, duplicate-week with progression, undo/redo, autosave, templates, assign-to-client. ✅ Criteria: build a 4-week program in under 3 minutes using keyboard only; undo stack survives 50 operations; refresh restores draft.

**Phase 5 — Logging & history.** Session logger (mobile-first), freestyle logging, history, exercise history drawer. ✅ Criteria: logging a prescribed session on a 390px viewport requires no horizontal scroll; per-set data persists instantly.

**Phase 6 — Analytics.** e1RM, tonnage, adherence, PR detection + feed, metrics charts. ✅ Criteria: charts render from fixtures; PR detection unit-tested; empty-data states designed.

**Phase 7 — Companion + documents.** Companion template, export pipeline, import/merge with dedupe, print stylesheets for program + progress report + intake. ✅ Criteria: exported Companion works offline in a private browser window on a phone-sized viewport; its `.ssdata` re-imports and appears as logs; printed program is clean at A4/Letter.

**Phase 8 — Operations.** Check-ins, metrics entry, calendar, business ledger, dashboard attention queue completion, command palette, onboarding wizard + demo data. ✅ Criteria: first-run to first-companion-export achievable in <10 minutes by a new user following only in-app guidance.

**Phase 9 — Hardening & release.** PWA config, error boundaries, reduced-motion pass, Lighthouse, cross-browser (Chrome/Safari/Firefox/iOS Safari), full QA sweep of §0 doctrine + §6 gates, produce `dist/` + a `HOW-TO-OWN-IT.md` buyer readme (install, backup habits, moving machines, FAQ).

---

## 9. LICENSING / COMMERCIAL NOTES (for the human, not the build)
- Sell as: one-time license, "free updates for the current major version," honest wording — never promise infinite lifetime development.
- Distribution: Gumroad primary ($59–$99 launch; anchor against "$1,000+/year you're paying now"), license key optional-cosmetic only (no phone-home DRM — it contradicts the privacy story; treat honesty as the moat).
- The Companion footer credit (§4.7) is the organic growth loop.

---

*End of specification. Build exactly to this document. Where a detail is unspecified, decide in favor of: data safety > speed of workflow > visual restraint.*
