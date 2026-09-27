# Your data in Coachwright

Where your data lives, how to get all of it out, and what happens if you stop paying or lose your
connection. Written for the coach, not for a developer. (Updated S23, when Coachwright moved to cloud
accounts. Technical detail: `docs/CLOUD.md`.)

---

## 1. Where your data actually is

Everything — clients, programs, session logs, check-ins, metrics, photos, invoices, messages — is saved to
**your Coachwright account** and synced to every device you sign in on: the desktop app, another computer,
or the web app in a browser.

Each device also keeps a working copy, so the app stays fast and **keeps working if the internet drops**.
Changes made offline wait on that device and upload when you're back online (**Account & sync** in the
sidebar shows anything still waiting).

- **Desktop app:** the working copy sits in your user profile — **Help → Show Data Folder**.
- **Web app:** the same account, in any browser. It leaves out the on-device AI features (assistant, voice
  logging, log-sheet scanning, meaning-based search), which need large downloads.

Your data is sent over HTTPS and protected by your password. It is **not** end-to-end encrypted — it has to
be readable by our servers to reach your other devices and your clients' Companion apps. We don't sell it
or use it for advertising or AI training.

---

## 2. Backups — your own extra copy

Your account lives on our servers; you can keep your own independent copy any time:

**Settings → Data → Back up now.** You get a single `.coachwright` file containing everything.

| | What it is | When to use it |
|---|---|---|
| **Plain** | Readable JSON | You want to inspect or process it yourself |
| **Encrypted** | Passphrase-protected | Storing it in cloud storage or emailing it |

**Restoring:** Settings → Data → Restore — **merge** (newest edit of each record wins) or **replace**
(wipe and load the file). Either way the result syncs to your account.

> Old `.strongsuit` backups from before the rename still import.

---

## 3. Getting your data out — completely

You are never locked in. Every export is a plain file you keep.

- **Whole business:** Settings → Data → Back up (§2).
- **One client, with full history:** Client → **Export data**. A portable package (profile, programs,
  logs, check-ins, metrics, notes, food log) that imports into any other Coachwright account — including a
  different coach's.
- **A departing staff member's whole book:** Team → export their client bundle.
- **A client's own copy:** Client → **Export Companion** → a single HTML file they open on any phone.
- **Printable documents:** program sheets, progress reports, PAR-Q+ intake forms and message digests print
  or save as PDF.

Coming *in*: **Clients → Import clients** reads a CSV export from TrueCoach, Trainerize, or a spreadsheet.

---

## 4. What happens if…

| If this happens | What happens |
|---|---|
| **Your internet drops** | Keep working on that device. Everything uploads when you reconnect. Other devices see it after that. |
| **You stop paying for Membership** | Nothing is deleted or locked. You drop to the free tier's 3-active-client cap (and custom branding switches off for accounts created after 15 Aug 2026). A membership keeps working for 7 days past the end of its paid period even if the app can't reach us. |
| **You bought a one-time licence before August 2026** | It never expires. |
| **You want to leave** | Export everything (§3). |
| **Coachwright's servers go away** | The web app and syncing between devices stop. The desktop app keeps its working copy on your computer, so you can still open it and export everything (§3). |

---

## 5. Your clients (Companion)

On a client's page, **Connect Companion** creates a one-time code for them to enter in the free Companion
app. They see their program, your messages and reminders; their logged workouts and messages come back to
you. **Disconnect** on the same screen signs their app out. Cycle-tracking data a client records in
Companion never leaves their phone.

---

## 6. Quick answers

**Do I need an internet connection?** To sign in the first time, and to sync. Day-to-day work continues
offline on a device you're already signed in on.

**Can I use it on two computers?** Yes — sign in on both. Same account, same data.

**Is my clients' data being sold or used for training?** No.

**Where do I report a problem?** Include what you were doing and anything in the developer console
(desktop: **View → Toggle Developer Tools**).
