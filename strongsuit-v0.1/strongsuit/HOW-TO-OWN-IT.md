# How to own Coachwright

You bought this once. This document explains, concretely, what that gets you —
where your data lives, how to get all of it out, and what still works if the
company that sold it to you disappears tomorrow.

It is deliberately written for the coach, not for a developer.

---

## 1. Where your data actually is

Everything — clients, programs, session logs, check-ins, metrics, photos,
invoices, messages — lives in a database **inside the app on your own
computer**. There is no account, no login, and no server holding your business.

- **Desktop app (Windows):** the data sits in your user profile. Open it from
  the menu: **Help → Show Data Folder**.
- **Browser:** it lives in that browser's local storage for the site. Different
  browser or different computer = different, separate data.

Nothing is uploaded anywhere unless you explicitly turn on one of the optional
cloud tiers (§5) or click an export button.

**The practical consequence:** if you wipe that computer without a backup, the
data is gone. Nobody can recover it for you, because nobody else ever had it.
Back up (§2). This is the honest trade for not having a company hold your
business hostage.

---

## 2. Backups — do this weekly

**Settings → Data → Back up now.** You get a single `.coachwright` file
containing everything.

Two formats:

| | What it is | When to use it |
|---|---|---|
| **Plain** | Readable JSON | You want to inspect or process it yourself |
| **Encrypted** | Passphrase-protected | Storing it in cloud storage or emailing it |

The sidebar shows how long it's been since your last backup, and turns amber at
seven days. That indicator is the whole nagging system — there is no server to
remind you.

**Restoring:** Settings → Data → Restore. Two modes: **merge** (newest edit of
each record wins) or **replace** (wipe and load the file). Restore works on any
machine with the app installed.

> Old `.strongsuit` backups from before the rename still import. The file format
> deliberately kept its original identifiers so nothing you saved ever expires.

---

## 3. Getting your data out — completely

You are never locked in. Every export is a plain file you keep.

- **Whole business:** Settings → Data → Back up (§2).
- **One client, with full history:** Client → **Export data**. Produces a
  portable package (profile, programs, logs, check-ins, metrics, notes) that
  imports into any other Coachwright install — including a different coach's.
- **A departing staff member's whole book:** Team → export their client bundle.
- **A client's own copy:** Client → **Companion** → export. A single
  self-contained HTML file they open on any phone with no app and no internet.
- **Printable documents:** program sheets, progress reports, PAR-Q+ intake
  forms and message digests all print or save as PDF from the browser's own
  print dialog.

Coming *in* is just as open: **Clients → Import clients** reads a CSV export
from TrueCoach, Trainerize, or a plain spreadsheet, and lets you map the
columns yourself. No per-platform integration to go stale.

---

## 4. What keeps working if we vanish

This is the part that matters, so it is spelled out plainly.

| If this happens | What still works |
|---|---|
| The company shuts down | **Everything except Membership renewals.** The app is on your machine and never phones home for permission to *run*. A Membership token keeps working until its own expiry date (about 35 days from the last refresh); after that the app drops to the free tier's 3-client cap — every client, program and log stays exactly where it is. A one-time licence bought before August 2026 never expires. |
| The website goes offline | Same as above. Verifying your licence or Membership token never touches the network; only *renewing* a Membership does. |
| You stop paying | You keep the app and all your data. Membership lapses to the free tier (up to 3 active clients, and custom branding switches off for installs created after 15 Aug 2026). Nothing is deleted or locked. |
| Your internet is out | Everything except the optional cloud sync (§5), barcode food lookups, and first-time AI model downloads. Movement tracking, logging, programs, reports and printing are all fully offline. |
| You want to leave | Export everything (§3) and delete the app. |

There is no kill switch in this software. There is no telemetry. In normal use
the app makes **no network requests** unless you turn on something that needs
one, and each of these is opt-in and named:

- **Membership** — once you've started checkout, the app checks your
  subscription at launch and about daily. A free-tier install that never
  started checkout makes no membership calls at all.
- **Cloud sync** — only when you configure a relay (§5).
- **Barcode food lookup** — asks Open Food Facts about a barcode, and only in a
  cloud tier; fully-local mode refuses before any request is made.
- **Local AI models** — downloaded once, when you press Install in Settings;
  after that they run on your machine.

You can verify all of this in any browser's developer tools. The movement
analysis in Film Room runs on a model bundled inside the app, not a cloud API.

---

## 5. The optional cloud tiers (and what they don't change)

Some things genuinely need a server: syncing to a client's phone over the
internet, live messaging, and scheduled reminders. You choose in
**Settings → Cloud**:

1. **Fully local (default, free)** — nothing leaves your device, ever. Client
   data still moves via file export or same-WiFi sync.
2. **Self-hosted (free)** — you run the relay yourself. See
   `docs/MANAGED_HOSTING.md`.
3. **Managed ($15/mo)** — we run it for you.

Two things stay true on every tier:

- **The relay never sees your data in the clear.** Everything crossing it is
  encrypted with a key derived when you paired with that client's device. The
  server stores ciphertext it cannot read.
- **The cloud tier is a separate subscription from the app.** Cancelling it
  costs you no data and no features except the internet-only ones. The app
  itself stays paid-for and working.

---

## 6. Running it yourself, forever

If you want the strongest possible guarantee, you can host every piece:

- **The app** is a static site. The `dist/` folder from a build works from any
  web server, or straight off a USB stick.
- **The desktop app** is a standard Windows installer built from the same
  source.
- **The relay** (only if you use cloud sync) is a small Node service with a
  SQLite file — runbook in `docs/MANAGED_HOSTING.md`.

---

## 7. Quick answers

**Do I need an internet connection?** No, except for the optional cloud tiers.

**Can I use it on two computers?** Yes. They keep separate data; move it with a
backup file, or use a cloud tier to sync.

**Is my clients' data being sold or used for training?** No. It never leaves
your device unless you send it.

**What happens to a client's history if they leave me?** Export their package
and hand it to them or their next coach (§3). Unpairing never deletes anything.

**Where do I report a problem?** Include what you were doing and anything in the
developer console (desktop: **View → Toggle Developer Tools**). Since nothing is
logged to a server, that console is the only diagnostic that exists.
