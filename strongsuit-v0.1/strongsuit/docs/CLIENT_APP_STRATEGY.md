# CLIENT APP STRATEGY — a second app, for the person being coached

> **⚠️ SUPERSEDED IN PART (S23, 2026-09-27).** Coachwright moved to cloud accounts: coach data lives on
> Coachwright Cloud (readable by the operator, not end-to-end encrypted), the self-hosted and $15/mo
> managed relay tiers no longer exist, and Companion connects with a coach-issued code instead of E2EE
> pairing / WiFi / file sync. Anything below that says otherwise is history. Current design:
> `strongsuit-v0.1/strongsuit/docs/CLOUD.md`.

Everything else in this codebase is built for the **coach**. This doc is the architecture and pricing
doctrine for the other half of the relationship: the client — the person doing the workouts — who today
only ever sees a one-shot HTML file the coach exports for them (`companion/template.html`). That file is
real and stays; this doc is about giving the client something more durable to actually live in, on their
own phone, that works whether or not they have a coach at all.

Same rule as `SERVER_STRATEGY.md` §2.5, extended to a second persona: **local-first by default, cloud is
always opt-in, and nobody is required to pay anything to get the core product.** The client's version of
"pay once" is "pay nothing, ever, unless you specifically want cross-device sync" — see §4.

## 1. Two apps, not one, and why

Coachwright (the coach app) and **Companion** (the client app) are deliberately separate products, not one
app with a login screen that branches:

- **Different owners of the data.** A coach's Dexie DB holds every client's history. A client's own device
  should hold *their* history and nothing else — a client's personal data must not require trusting, or
  even knowing about, a coach's install at all. Two separate local databases, always.
- **Different install targets.** A coach runs a desktop app (Electron, already shipped) and eventually a
  coach-side mobile app (`docs/ANDROID_STRATEGY.md`, scaffolded via Capacitor, not yet built/tested — debt
  #17). A client wants something on their phone, today, with zero friction — see §2 for why that's a PWA,
  not a native app, for now.
- **Different business model.** The coach pays once for the app, optionally $15/mo for managed relay
  hosting (§2.5 of `SERVER_STRATEGY.md`). The client pays nothing by default; §4 below is the honest case
  for when a client might pay something themselves, and it's a different number for a different reason.

"Companion" is already the shipped brand name for the client-facing surface (`BRANDING_PLAN.md`) — this
doc does not rename anything, it describes the second, richer thing that name now covers alongside the
existing single-file export.

## 2. What "Companion" becomes — three ways a client can end up using it

| Path | What it is | Data lives | Requires a coach? |
|---|---|---|---|
| **Companion file (today, unchanged)** | The single HTML file `Export Companion` produces — a coach's brand + that client's program, opened in any browser, no install. | `localStorage`, scoped to wherever that file is opened. Already persists between visits (see `template.html`'s `LOCAL_KEY`) — it just isn't installable or synced. | Yes — this only ever exists because a coach generated it. |
| **Companion app, coach-linked** | The new installable PWA (§3), paired to a coach via the existing Studio Link pairing-code flow. Receives assigned programs, sends logged sessions/check-ins back, gets live messages/reminders if the coach's relay tier is on. | The client's own Dexie DB, on their device. | Yes, but the client owns the install — swapping phones doesn't mean asking the coach to re-export anything. |
| **Companion app, standalone** | The same installable PWA, opened with no pairing at all. A genuine self-training log: workouts, body metrics, and Film Room self-review, entirely for the client's own use. | Same local Dexie DB. | **No.** This is the actual new capability this doc is about — Companion becomes a product a person can use even if they never hire a coach, and if they later do, pairing links their existing local history forward instead of starting over. |

The file export isn't being deprecated — it's still the fastest path for a coach who wants to send one
week's workout to a client who will never install anything. The app is for the relationship (or the solo
habit) that's going to last longer than one file.

**Why a PWA and not a native app, for now:** a PWA installs from a browser (Add to Home Screen), needs no
App Store account, no $99/yr developer fee, no review process, and — critically — keeps the "no account,
nothing to sign up for" promise that's the whole point of this product. It gets a real home-screen icon
and offline support via a service worker, which is the actual bar a client cares about ("is this a real
app or a bookmark"). If demand shows up for App Store/Play Store presence specifically, wrapping the same
codebase in Capacitor is the same well-understood path already chosen for the coach app (`docs/
ANDROID_STRATEGY.md`) — a later step, not a blocker to shipping this.

## 3. Architecture

New sibling project, `companion-app/` (parallel to `sync-server/`, alongside `strongsuit/`), **not** a
route bolted onto the coach app:

- **React + TypeScript + Vite + Dexie** — the same stack as the coach app, on purpose. Same repo-pattern
  discipline (`db/repo/`, never touch Dexie directly from components), same pure-logic-with-unit-tests
  convention, same design-token rules. A different install target, not a different way of building software.
- **Its own Dexie database**, entirely separate from the coach app's `strongsuit` IndexedDB store (they can
  even be open in the same browser at the same time without colliding — different DB name).
- **Entities (new, minimal — grow this as real features land, don't pre-build a schema for features that
  don't exist yet):**
  - `CompanionProfile` — one row, created on first open. Name, unit preference, theme. No email, no
    password, no account — the profile *is* the local database; there's nothing to log into.
  - `CoachLink` — present only if paired. `coachDeviceId`, `coachPublicKey`, `pairedAt`, `clientIdOnCoachSide`.
    Reuses the *exact* pairing/ECDH crypto already built for coach↔coach-device sync (`lib/sync.ts`) — a
    client pairing to a coach is not a new crypto scheme, it's the same `Device` concept the coach app
    already has, just initiated from the other side.
  - `PersonalWorkout` / `PersonalLog` — the client's own freeform training log, used with or without a
    coach. Same shape philosophy as the coach app's `SessionLog` (exercise, sets, reps, load, RPE) so a
    future "coach adopts this client's existing history" import isn't a data-model rewrite.
  - `PersonalMetric` — bodyweight and the same research-backed measurement presets already built for
    coaches (`lib/metricPresets.ts` is pure logic — reusable as-is, no reason to fork it).
- **PWA plumbing:** a real `manifest.json` (name, icons, standalone display mode) + a service worker
  (`vite-plugin-pwa`, the same plugin already flagged as not-yet-configured for the coach app in debt #4 —
  this is where it actually gets proven out first, then back-ported to the coach app).
- **Sync, only when paired AND the coach's relay is on:** if `CoachLink` exists and the coach's own
  `cloudCapabilities()` (already built, `lib/cloudCapability.ts`) reports `sync`/`messaging` available, the
  client app can push logged sessions to the coach and pull assigned programs/messages/reminders over the
  *same* relay the coach is already paying for (or self-hosting). **The client never pays for this** — it
  rides the coach's subscription, because the coach is the one who benefits from real-time visibility into
  their client's training. This is a hosting-level extension of the sync/messaging endpoints already
  shipped and verified live in `sync-server/server.ts`, not a new server.
- **Sync when NOT paired, or paired to a coach who's fully local:** file export/import (same `.cwsync`-style
  packet mechanism the coach app already has) is the free path to move a client's own data between their
  own devices. This is the parity case with the coach app's "fully local" tier — always available, zero cost,
  slightly more manual.

## 3.5. How client data actually reaches the coach, and back — the exact flow

This is the part worth being precise about, because "it syncs to the cloud" is meaningless without saying
*whose* cloud, over *what* transport, and what happens on each side's own database. There is **no shared
database** anywhere in this design — a coach and a paired client each keep their own separate Dexie DB,
on their own device, forever. "Sync" always means: seal a small packet, move it through a relay neither
side has to trust, unseal it, and merge it into the receiving side's own local tables with the same
newest-wins reconciliation (`mergeUpsert`, `db/repo/base.ts`) the coach app already uses for its own
multi-device sync. Nothing here is a new protocol — it's the existing one, used twice.

**Step 1 — pairing establishes the shared key, once.** The client scans/enters the coach's pairing code
(same `encodePairingCode`/`decodePairingCode`/`safetyNumber` flow already built in `lib/sync.ts`, just
initiated from the Companion app instead of a second coach device). This does an ECDH exchange and both
sides end up holding the same derived AES key — the coach's side records it as a `Device` (`role:
'client'`, linked to the matching `Client` row so the coach knows *whose* data this is); the client's side
records it as `CoachLink`. Nobody but these two parties can ever derive that key. This step needs no relay
at all — it can happen over the same QR-code/text-code exchange the coach app already uses for pairing a
second desktop.

**Step 2 — the transport belongs to the coach's setup, never the client's.** Once paired, whichever
transport moves packets is a property of the coach's hosting choice: their relay (self-hosted or managed —
either counts, `cloudCapabilities()` already reports which), their desktop app over the same WiFi network
(§7's LAN row — no server anywhere), or a sealed file moved by hand. The client's Personal Cloud
subscription (§4) is a **completely separate thing** — it only ever syncs a client's own data between
their own devices; it never substitutes for the coach's relay and never gives the client a channel to a
coach who isn't running one. This matters because it means a client can be a paying Personal Cloud
subscriber and STILL have zero live connection to their coach if that coach is on the fully-local tier —
the two subscriptions unlock different things and shouldn't be conflated in the UI copy (see §4's "what
this is not").

**Step 3 — what actually moves, and in which direction:**
- **Client → coach:** logged sessions, check-ins, and body metrics the client entered in their own
  `PersonalWorkout`/`PersonalLog`/`PersonalMetric` tables get sealed with the pairing key and pushed to
  `/sync/push` (existing endpoint, `type: 'client'`, tagged with the coach-side `Client.id` from pairing).
  The coach's app pulls and merges these into its own `SessionLog`/`CheckIn`/`Metric` tables for that
  client, using the same merge logic it already applies to its own multi-device sync — a client's phone is,
  from the coach database's point of view, just another device that occasionally submits records for a
  client it already knows about.
- **Coach → client:** an assigned program, coach messages, and reminders get sealed and pushed the other
  direction, pulled by the Companion app and merged into the client's own local `Program`-shaped read
  (client-side is read-mostly here — a client doesn't edit the program a coach assigned them, they log
  against it). This reuses the messaging/reminder endpoints (`/messages/*`, `/reminders/*`) already
  shipped and verified live in `sync-server/server.ts` — the Companion app is simply the second, real
  consumer of those endpoints the coach side has been waiting on since debt #23 (`companion/template.html`
  never got this wiring because it's a static file, not an app that can hold a persistent local DB to sync
  into — Companion-the-app is what finally closes that loop).

**Step 4 — when does this actually run.** No push infrastructure exists (same honest ceiling documented in
`SERVER_STRATEGY.md` §2.5) — the client app polls on open, and periodically while foregrounded, exactly
like the coach app's own "Live" panel does today. A client who never opens the app doesn't get reminders
pushed to their lock screen; they see what's due the next time they do open it. Don't oversell this in UI
copy — "syncs when you open the app," not "instant."

**Net effect, stated plainly:** a client's data reaching "the cloud" only ever means it transiting, briefly
and as ciphertext, through whichever relay the COACH operates — the client's own Personal Cloud
subscription (§4) never creates a client↔coach channel by itself. If a client wants their personal data to
sync between their own two phones but their coach never turns cloud on, both keep working independently:
the coach relationship stays on the free file-export path, and the client's cross-device sync (if they've
paid for it) still works for their *own* devices.

## 4. Personal Cloud — pricing for a client who wants sync without a coach

This is the concrete new thing this doc adds: a client who either has no coach, or has a coach who hasn't
turned on cloud, can pay **for their own account, not the coach's**, to unlock the same category of value
a coach's relay tier gives a coach — it just needs its own price, because it's a different buyer with a
different willingness to pay than a business owner running a studio.

| Tier | Price | Unlocks |
|---|---|---|
| **Free (default)** | $0, forever | Everything in §3 that doesn't need a server: full local logging, on-device Film Room self-review (this NEVER gets paywalled — it's zero marginal cost, runs entirely on-device, gating it would be dishonest, same reasoning as why the coach app's tracking is free), manual file-based backup/export, pairing to a coach (free either way — see §3). |
| **Companion Cloud (personal)** | **$3.99/mo, or $29/yr** (~40% off annual) | Automatic cross-device sync of the client's own local data (open the same log on their phone and a laptop browser without manually exporting a file each time), automatic cloud backup (vs. free tier's manual export), and extended trend history/exportable reports beyond what the free tier's on-device charts show by default. |

**Why $3.99/mo and not $15/mo (the coach tier):** the coach's $15/mo buys *business* infrastructure — a
relay serving potentially dozens of that coach's clients, justified against what a coach already pays for
software. A solo client paying for their own sync is a consumer-app purchase, and needs consumer-app
pricing — priced near the bottom of the fitness-app subscription market (well under MyFitnessPal Premium,
in the range of a lightweight utility subscription) specifically *because* the core product is already free
and this is a genuine nice-to-have, not something being artificially held back to force a purchase.

**Same doctrine as §3 of `SERVER_STRATEGY.md` — bring-your-own-account, don't build a payment processor:**
Companion Cloud is provisioned the same honest way the coach's managed tier already is — a Stripe Payment
Link (or equivalent) the client pays through, which is not a backend Coachwright runs. **No payment
processing gets built into the client app itself; this doc does not authorize adding real card entry
anywhere in `companion-app/`.** The realistic mechanism: the same `sync-server/`'s `api_keys` /
per-identity provisioning pattern already built for coaches extends to a `client_keys`-shaped table (or
reuses the same table with a `kind: 'coach' | 'client'` column — an implementation detail for whoever
builds this, not decided here), gated by the same manual-provisioning-at-low-volume honesty already
documented for coaches (`SERVER_STRATEGY.md` §2.5's "no Stripe webhook wired yet" caveat applies here too).

**What this is not:** not a second way for a coach to get charged, not a tier that changes anything about
what a coach's own clients see for free once paired, and not a subscription required to use the app at
all. A client who never pays anything still gets a fully real, fully-featured local training log forever.

## 5. What's built vs. what's still just this document (be honest about it)

As of the session that added this doc: **nothing in `companion-app/` exists yet beyond an initial scaffold**
(see `PROGRESS.md`'s session log for exactly what was scaffolded vs. what's still a stub). This file is the
architecture and pricing decisions made *before* writing code, not a description of a finished product —
update the "what's built" list in `PROGRESS.md` as pieces land, and don't let this doc's confident tone
imply more exists than actually does. The coach-side pieces this depends on (E2EE pairing crypto, the relay's
messaging/reminders endpoints, `cloudCapabilities()`) are real and already shipped/tested — that part of the
foundation is solid; the client-side app consuming it is the new work.

## 6. Build order (do these in order — each one is usable on its own)

1. **Scaffold** — `companion-app/` as a real Vite+React+Dexie project, PWA manifest + service worker, a
   minimal Shell (bottom tab nav: Home / Log / Progress / Settings), `CompanionProfile` first-run flow with
   an explicit "I have a coach" (pairing code entry, reusing `decodePairingCode`/`safetyNumber` from
   `lib/sync.ts`) vs. "I'm training myself" (skip pairing) choice.
2. **Standalone logging** — `PersonalWorkout`/`PersonalLog`/`PersonalMetric` CRUD, a simple session logger
   (can start simpler than the coach app's program-driven logger — a client without a coach doesn't have a
   prescribed program to follow, just wants to record what they did).
3. ~~**Coach pairing → program pull, log push**~~ **DONE** — real ECDH pairing (`PairingFlow.tsx`), real
   `/sync/push` + `/messages/push`+`/pull` (`companionSyncApi.ts`), a file-based fallback for coaches with
   no relay at all (`exportLogsFile`), and the coach-side `clientId` remap (`syncApi.ts`'s
   `remapClientId`) that makes synced data land under the right `Client` row. Verified end-to-end against
   a live `sync-server`. See §7 for exactly how each of the coach's three hosting tiers is handled — this
   was the one part of the build order that needed a companion-side AND coach-side change together, now
   both are in. **Update (S13): the coach→client direction is now equally real** — `applyCoachPacket`
   (`companionSyncApi.ts`) merges assigned programs, the coach's exercise rows, and coach messages from a
   sealed coach packet, whichever transport delivered it (relay pull, LAN response, imported file), and a
   read-only Program viewer (`features/program/ProgramPage.tsx`) renders it. Messages now ride sync
   packets in BOTH directions too, so messaging works on every tier including fully-local (§8.3).
4. **Personal Cloud settings screen** — the pricing UI from §4, honestly marked as not-yet-purchasable if
   the provisioning backend isn't wired yet (same "coming soon, no fake button" rule as everywhere else in
   this codebase).
5. **Film Room self-review** — port the client-visible parts of `lib/pose.ts`/`filmroom/tracker.ts` (both
   already pure/reusable, zero coach-specific logic in the tracking math itself) so a client can review
   their own lifts on-device, free, no coach required.

## 7. One design, all three coach hosting tiers — the actual mechanism, end to end

This is the concrete answer to "how does this work whether the coach is on their own cloud, our cloud, or
no cloud at all": **there is exactly one data shape and one merge function on each side, and the hosting
tier only changes which of two transports carries it.** Nothing about how data is shaped, validated, or
merged depends on which tier the coach picked — that's what makes this actually maintainable instead of
three parallel special cases that drift out of sync with each other over time.

### The one payload shape, the one merge point

Every client→coach sync — whichever transport carries it — is the same sealed `{tables: {sessionLogs,
metrics}}` packet (`companionSyncApi.ts`'s `buildOutboundLogsPacket`), and every packet the coach receives
— however it arrived — goes through the exact same function on the coach side: `applyPacket()`
(`strongsuit/src/features/sync/syncApi.ts`). That function does two things, in order, regardless of
transport:
1. Rejects replays (`packet.seq <= device.lastSeq`) — a monotonic guard that doesn't care if this packet
   came over the network five seconds ago or a file from last week.
2. Calls `remapClientId()` — rewrites the placeholder `clientId` Companion had to stamp (its own device id,
   since a client-side app has no way to know the coach's internal `Client.id`) onto the real one, read off
   `Device.clientId` (set once, when the coach accepted this pairing and chose which of their `Client`
   records it belongs to) — then merges via the same `mergeUpsert` (newest-`updatedAt`-wins) the coach app
   already uses for its own multi-device sync.

Because the merge point is one function, a coach can freely mix transports for the same client — sync over
the network most days, accept an emailed file the one day their server was down — without the two paths
ever disagreeing about how to reconcile the data.

### What differs per tier — only the transport

| Coach's tier | What carries the packet | Client-side call | Coach-side receive |
|---|---|---|---|
| **Fully local** (no relay at all) — file | A file, shared any way a coach and client already share files (AirDrop, email, USB, a messaging app) | `exportLogsFile(coachLink)` → `downloadText()` out; the Coach tab's "Import packet" (`importCoachPacketText` → `applyCoachPacket`) in | The coach's **existing** "Local Import" file input on that device's row in Studio Link (`DeviceRow`'s `onFile` → `applyPacket`), and "Local Export" going the other way — already built, needed zero new code once `remapClientId` existed |
| **Fully local — same WiFi** (also no server) | One HTTP POST from the client's phone straight to the coach's desktop app on the local network (the Electron app hosts a tiny endpoint while its WiFi Sync dialog is open; the QR code IS the address). The response carries the coach's return packet — one tap is a full two-way sync. Nothing transits the internet. | `syncOverLan(coachLink, lanUrl)` → `POST {lanUrl}/sync/push`, then `applyCoachPacket` on the response | `WiFiSyncDialog.tsx`'s existing IPC handler → `applyPacket`, then `buildPacket` for the return trip (the S13 IPC fix in `electron/main.ts`/`preload.ts` made this loop actually respond) |
| **Self-hosted relay** | HTTPS to whatever address the coach is running `sync-server` at | `pushLogsToCoach(coachLink)` → `POST {relayUrl}/sync/push`; `pullFromCoach` → `GET /sync/pull/coach/{deviceId}` | The coach's **existing** cloud-sync pull (`SyncCenterPage.tsx`'s `doCloudSync` → `applyPacket`) — same code, same merge. Coach packets are keyed per client device on the relay (`(id, type)` composite key, S13) so multiple clients never overwrite each other |
| **Managed by us** | HTTPS to `relay.coachwright.app` (or whatever the managed instance's address is) | Same calls, just pointed at the managed URL + that coach's per-coach API key (`/keys/register`, already built) | Identical to self-hosted — the managed instance runs the exact same `server.ts`, just multi-tenant with per-coach keys instead of one shared key |

The client only ever needs to know two things to pick the right row: whether their coach gave them a
server address at all (self-hosted or managed both count — the client-side code doesn't need to know or
care which), and if so, what it is plus an API key if the coach's instance requires one. Both are entered
once, during pairing (`PairingFlow.tsx`), and stored on `CoachLink`. If a coach later changes tiers (e.g.
upgrades from self-hosted to managed), the client just needs the new address — nothing about the pairing
itself (the ECDH identity, the safety number already confirmed) needs to be redone.

### Why this stays "manageable and transferable" for the client specifically

- **The client's own data never lives anywhere but their own device**, regardless of tier. Pairing and
  syncing only ever copies a subset of it (logged workouts, metrics) outward to a coach who's supposed to
  see it — it never becomes the client's system of record. Uninstalling Companion, switching phones, or
  switching coaches entirely never puts the client's own training history at risk, because none of those
  events touch the local Dexie DB that actually owns it.
- **Backup/restore (§3, `db/backup.ts`) is tier-independent** — a client can move their own full history to
  a new device with the JSON export/import round trip regardless of what their coach's hosting situation
  is, or even if they have no coach at all.
- **Switching coaches is just replacing one `CoachLink` row.** Unpairing (already built, `CoachCard.tsx`'s
  unpair button) never touches `workouts`/`metrics`/`messages` — a client's training history survives a
  coach change intact, and pairing with a new coach is the same `PairingFlow` regardless of what tier that
  new coach happens to be on.
- **A coach's own multi-tenancy is already handled server-side** (`sync-server/server.ts`'s per-coach API
  keys, `assertOwnsCoach`) — a client's data is scoped to exactly one coach's rows in the relay's database
  by construction; there is no cross-coach data path for a client's pushed logs to leak through even on the
  shared managed instance.

## 8. The security model and the client-experience FAQ — direct answers, stated once

These are the questions a coach (or the person selling to one) will actually ask. Each answer below is a
consequence of the design above, not new policy — this section exists so nobody has to re-derive them.

### 8.1 What is a coach actually paying for, per tier — and what does their client pay?

| | Coach pays | Every client of that coach pays |
|---|---|---|
| Fully local (file or WiFi) | Nothing beyond the one-time app license | **Nothing** |
| Self-hosted relay | Nothing to us — their own VPS/box (~$5/mo elsewhere) running `sync-server` | **Nothing** |
| Managed relay | $15/mo to us | **Nothing** |

A client never pays to be coached — full stop. The relay money buys *convenience of transport* (live sync
and messaging while the apps are closed to each other), never features and never data access. The only
thing a client can ever pay for is Personal Cloud (§4), which is about **their own** devices and has
nothing to do with any coach.

### 8.2 "Do clients just connect to the coach's server?"

Yes — and only the coach's. A client's Companion app knows at most three addresses, all describing the
coach's setup: a relay URL, a LAN address for the coach's desktop app, or neither (file exchange). All
three are entered/edited in Settings → Coach without re-pairing. The client never runs infrastructure and
never needs an account anywhere. Even when the relay is ours (managed tier), the client is not our
customer and has no relationship with us: their packets are ciphertext addressed to their coach.

### 8.3 "Does messaging only work if there's a server?"

No. Live-while-apart messaging needs a relay (something has to hold the ciphertext while the other side is
offline — physics, not pricing). But messages are also just rows, and as of S13 they ride inside every
sync packet in both directions. A fully-local coach's client types a message; it queues locally and
delivers with the next WiFi sync or file exchange — same for the coach's replies. The UI says which one
is happening ("Saved — goes out with your next sync"), and one message id follows a message across every
transport, so a message that traveled twice (relay today, packet tomorrow) lands on the same row instead
of duplicating the thread. What the relay tier actually buys for messaging is *immediacy*, not existence.

### 8.4 "What if the client already uses our cloud (Personal Cloud) — how does that mix with the coach's?"

They compose without touching. Personal Cloud syncs the client's own database between the client's own
devices; the CoachLink syncs a narrow subset (logs, metrics, their side of the thread) with one coach over
the coach's transport. A client can have both, either, or neither. Nothing about pairing reads the
client's Personal Cloud state, and nothing about Personal Cloud can reach a coach. If a client with
Personal Cloud pairs with a coach, the coach still only ever receives what pairing scopes to them — the
client's fuller history (every note, every unshared metric) never leaves their own account.

### 8.5 "Coach switches hosting tiers — what breaks for the client?"

Nothing cryptographic, nothing historical. The pairing is an ECDH key exchange between two devices; it has
no idea what transport will carry packets and survives every transport change. Coach moves from
self-hosted to managed: client updates one URL field. Coach cancels hosting entirely: the same pairing
keeps working over WiFi/file. Client switches coaches: delete the CoachLink, pair with the new coach —
local history untouched (§7). The failure mode that plagues competitor platforms — "coach stopped paying,
client's history is hostage" — is structurally impossible here because the client's history never lived
anywhere but their device.

### 8.6 "How secure is this actually?" — the cryptography, plainly

- **Identity:** each device generates a long-lived ECDH P-256 keypair in the browser's WebCrypto
  implementation. Private keys are marked non-extractable in use and never leave the device — there is no
  account system to phish and no server-side key escrow because there are no server-side keys at all.
- **Pairing:** public keys are exchanged via the pairing code; both sides derive the same 6-digit safety
  number (SAS) from the two public keys and are asked to read it aloud — a matching number proves no
  machine-in-the-middle swapped keys during the exchange (same model Signal users know).
- **Session key:** ECDH shared secret → HKDF-SHA256 (salt `coachwright-sync-v1`) → a 256-bit AES-GCM key.
- **Packets:** every sync payload and every message is AES-GCM sealed (fresh random 96-bit IV per packet,
  authenticated encryption — tampering fails decryption, it doesn't produce garbage data). Packets carry a
  monotonic `seq`; both sides refuse replays. Relays and LAN endpoints only ever see ciphertext: a
  compromised relay can drop or delay packets, but cannot read or alter them undetected.
- **Honest limits (don't oversell):** there's no forward secrecy ratchet (one long-lived pairing key per
  relationship — a future enhancement, not a current claim); the relay sees traffic metadata (who syncs
  with whom, when, payload sizes); and packet contents are only as safe as the two devices themselves.
  Local IndexedDB is not encrypted at rest beyond what the OS provides — same posture as the coach app,
  documented in its Guide.

### 8.7 "Frictionless" — what the pairing actually asks of a client, worst case

Install nothing (PWA), create no account, remember no password. Pair once: paste one code each way, read
six digits aloud. Then per tier: managed/self-hosted = tap "Sync now"; same room = tap "WiFi sync" (the
address is remembered after the first time); fully remote with a fully-local coach = attach one exported
file to any message. That's the entire lifetime friction budget, and every step of it was verified live
this session (§7's mechanisms, PROGRESS.md S13 log).

## 9. Battery, background work, notifications, widgets — the platform-constraints doctrine (S13)

"Work in the background without draining the battery" has exactly one honest architecture on the web
platform, and Companion now implements it. State the constraints plainly; never fake around them.

### 9.1 The battery rule: events, not timers

`lib/autoSync.ts` syncs on **events only** — app open, return-to-foreground (`visibilitychange`), network
back (`online`) — throttled to at most once per 15 minutes, with deliberately **no `setInterval` and no
persistent socket anywhere**. A backgrounded Companion does literally zero work: no polling loop, no
WebSocket heartbeat, no wakelock. This is why it costs no meaningful battery — the app is only ever doing
network work in the seconds someone is actually looking at it. Any future feature that wants a timer loop
while hidden is wrong by doctrine; find the event that should drive it instead.

### 9.2 Notifications while the app is closed: Web Push (implemented), and its honest limits

Polling can't notify a closed app without burning battery; the OS's push channel exists precisely so ONE
shared socket serves every app on the device. Implemented end-to-end in S13: the relay holds VAPID keys
(auto-generated and persisted, or env-supplied — `sync-server/server.ts`), exposes
`/push/vapid`+`/push/subscribe`+`/push/unsubscribe`, and fires a **metadata-only** push ("New message —
open Companion to read it") when a coach's message lands; `public/sw.js` shows it and a tap opens the
Coach tab; Settings → Notifications is the opt-in (`lib/push.ts`). Content never rides the push — it
stays E2EE and is fetched by the app itself on open, so FCM/APNs/Mozilla carry nothing readable.

The limits, stated for UI copy and sales conversations alike:
- **Requires the coach to have a relay** (self-hosted or managed). A fully-local coach's client still gets
  in-app alerts on next open — physics: something must originate a push, and there is no server to do it.
- **iOS:** Web Push works only for PWAs added to the Home Screen, iOS 16.4+. Not installed = no push on
  iPhone. Android/desktop: broadly supported.
- Delivery is best-effort OS-mediated — "you'll hear about it," not "guaranteed within seconds."

### 9.3 Widgets and true background sync: the Capacitor line

Home-screen widgets, guaranteed background refresh, and lock-screen surfaces are **native-app
capabilities; no web standard exposes them** (as of this writing). Companion does not pretend otherwise —
there is no fake "widget" feature. The path when demand justifies it is the one already chosen for the
coach app (`docs/ANDROID_STRATEGY.md`): wrap the SAME codebase in Capacitor, which unlocks native
widgets, background tasks, and store presence without a rewrite. Until then the honest story is: install
the PWA (real icon, offline, push where the platform allows) — and the one feature that would genuinely
need native today is widgets.

### 9.4 WiFi/LAN sync and battery

The LAN transport is a single HTTP request-response when the user taps — the phone's radio is already on,
the coach's desktop hosts the endpoint only while their WiFi Sync dialog is open, and nothing scans,
advertises, or listens continuously on either side. mDNS auto-discovery ("your coach's computer is
nearby!") was considered and rejected for now: it requires continuous multicast listening (battery, and
impossible in a plain PWA anyway) for a convenience the QR-scanned address already provides at zero cost.
