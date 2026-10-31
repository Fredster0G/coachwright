import type { ReactNode } from 'react'
import {
  BookOpen, ChevronDown, Rocket, Users, ClipboardList, PenLine,
  Clapperboard, Apple, Gauge, Wallet, Smartphone, ShieldCheck, Keyboard, Lock,
  CalendarDays, Cloud,
} from 'lucide-react'
import { Card, Kbd } from '@/design'
import { APP_NAME } from '@/lib/brand'

function Section({ icon, title, children, defaultOpen }: {
  icon: ReactNode; title: string; children: ReactNode; defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="text-verde-600">{icon}</span>
        {title}
        <ChevronDown size={16} className="ms-auto text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 pb-4 ps-[26px] text-sm leading-relaxed text-muted">{children}</div>
    </details>
  )
}

/** Numbered step list with tabular-numeral markers. */
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-verde-100 font-mono text-2xs font-semibold text-verde-700">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  )
}

const B = ({ children }: { children: ReactNode }) => <span className="font-medium text-ink">{children}</span>

export default function Guide() {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <BookOpen size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">Guide &amp; tutorial</p>
      </div>
      <p className="mb-2 text-xs text-muted">
        Everything {APP_NAME} does, start to finish. Open any section. Nothing here talks to the internet — this manual ships inside the app.
      </p>

      <div>
        <Section icon={<Rocket size={16} />} title="The big idea (read this first)" defaultOpen>
          <p>
            {APP_NAME} is a coaching workstation that lives in your account: sign in on your computer, another computer, or the web app and it’s all there. Free covers up to 3 clients, genuinely, no trial clock. Coachwright Membership ($29/mo) removes that cap.
          </p>
          <p>
            It keeps working through a flaky gym connection — changes wait on this device and upload when you’re back online. Clients get their programs and message you through the free Companion app — see “Your account &amp; sync” below.
          </p>
        </Section>

        <Section icon={<Users size={16} />} title="Set up your brand & add clients">
          <Steps items={[
            <>In <B>Settings → Brand kit</B>, set your business name, your name, units, and theme. Your brand shows on Companion files and printed docs.</>,
            <>Open <B>Clients → New client</B>. Name and start date are all you need to begin; goals and injuries can come later.</>,
            <>Migrating from another platform? <B>Clients → Import clients</B> takes a roster CSV exported from TrueCoach, Trainerize, My PT Hub, or a plain spreadsheet — map columns once, preview, import. It also accepts a {APP_NAME} client-package file for moving between two installs.</>,
            <>Injuries you enter show as an <B>amber ribbon</B> on the client and inside the program builder, so you never miss a limitation.</>,
            <>Archive clients you’re not training (their history is kept). Permanent delete lives in <B>Settings → Danger zone</B>, behind a typed confirmation.</>,
          ]} />
        </Section>

        <Section icon={<ClipboardList size={16} />} title="Build a program">
          <Steps items={[
            <>Go to <B>Programs → New</B>. A program is weeks → days → blocks → exercises.</>,
            <>Press <Kbd>/</Kbd> to focus the exercise search. Type gym slang — “rdl”, “ohp”, “bss” — and aliases resolve it instantly.</>,
            <>Edit sets, reps, and load like a spreadsheet; arrow keys move between cells. Drag rows to reorder. The <B>link</B> button on an exercise makes it a superset with the one above (the same button splits it out again).</>,
            <><B>Duplicate week</B> is the fastest way to progress — it can auto-add load or reps. Undo/redo (<Kbd>⌘Z</Kbd>) covers everything.</>,
            <>In the builder’s <B>Settings</B>, tick <B>Reusable template</B> to keep a program in your library. <B>Assign to client</B> gives that client their own copy and makes it their active program. To reuse a client’s program, <B>Duplicate</B> it from the Programs list first.</>,
          ]} />
        </Section>

        <Section icon={<PenLine size={16} />} title="Log sessions & read progress">
          <p>
            From a client’s page, <B>Log session</B> opens the next day of their program (the one after the last day logged), pre-filled with targets. Ticking a set done records the target as performed unless you change it. Big touch targets — it works on the gym floor on a phone. For a one-off set, <Kbd>⌘L</Kbd> opens <B>Quick log</B>: type it the way you’d say it.
          </p>
          <p>
            Tap any exercise to open its <B>history drawer</B>: last five performances, an e1RM trend, a <B>Suggested next</B> load with the reasoning behind it, and a percent-based warm-up ramp.
          </p>
          <p>
            The <B>Printer icon</B> on a client’s page opens their printable documents — a <B>Progress Report</B> stats sheet, PAR-Q+ intake, message digest, and the current program — all generated from what’s already logged, no extra data entry.
          </p>
        </Section>

        <Section icon={<CalendarDays size={16} />} title="Calendar & scheduling">
          <p>
            <B>Calendar</B> shows a real month grid — click a day to see and add appointments, or switch to <B>List</B> view for a scrollable agenda. Sessions link back to the client they’re for.
          </p>
          <p>
            Set your <B>booking hours</B> in Settings and clients connected through Companion can request a free slot; requests wait on the Calendar and Dashboard for you to accept or decline.
          </p>
        </Section>

        <Section icon={<Clapperboard size={16} />} title="Film Room — full walkthrough">
          <p className="text-ink">Compare movement side-by-side or overlaid, frame by frame, with on-device tracking. Videos never leave your computer.</p>
          <Steps items={[
            <><B>Load videos.</B> “Client video” is the one that gets tracked; “Reference video” is your model rep (a coach demo, or the client’s own PR). Either works alone.</>,
            <><B>Controls for each video.</B> In side-by-side, every clip has its own transport bar — play/pause, one-frame steps, and a scrubber. Control them independently to line up the same moment in each.</>,
            <><B>Lock sync.</B> Scrub both to the same point (e.g. the start of the descent), then <B>Lock sync here</B>. Now one bar drives both, holding the offset. Unlock to separate them again.</>,
            <><B>Overlay & blend.</B> Switch to <B>Overlay</B> to stack the clips; the blend slider fades between them to see exactly where paths diverge.</>,
            <><B>Flip.</B> <B>Flip client</B> / <B>Flip ref</B> mirror a clip horizontally so a left-facing and right-facing lifter line up.</>,
            <><B>Frame rate.</B> Set it to how the clip was shot (24/30/60/120) so one-frame steps and tempo are accurate. Slow playback to 0.25× for detail.</>,
            <><B>Measure.</B> <B>Line</B> draws a bar path or back angle (two clicks). <B>Angle</B> measures a joint (three clicks — the middle click is the joint).</>,
          ]} />
          <p className="mt-2">
            <B>Track movement</B> turns on the AI: a live skeleton, joint angles, and a readout of reps, tempo (down/up seconds), depth as a % of range, and left/right symmetry %. Play through a few reps and it calibrates itself and picks the working joint automatically — reps completed during that calibration window are replayed back in, so nothing early gets silently dropped. Position tracking is smoothed and visibility-weighted, so a hand or the seat of a machine briefly crossing in front of a joint doesn’t throw off the skeleton the way it used to. The first time you turn it on it loads the tracking model from inside the app (a moment on slow machines) — after that it’s instant, and always offline.
          </p>
          <p>
            When two videos are <B>locked</B>, they’re continuously re-aligned during playback (not just at the moment you scrub), so they stay in step instead of drifting apart over a long clip.
          </p>
          <p>
            Under the live stats you get a <B>rep-by-rep table</B> — bottom angle, down/up tempo and depth for every rep, with the ones that drift off the set’s own average marked. That’s usually where the useful coaching is: not the last rep, but the rep where depth started falling off.
          </p>
          <p>
            <B>Notes</B> let you drop a timestamped comment at any point in the clip — click a note to jump straight back to that moment. <B>Snapshot PNG</B> saves the frame you’re looking at with the skeleton and bar path drawn on it — the image to actually send someone. Once you’ve tracked a rep or two, the <B>Summary</B> panel turns the session’s stats and notes into a <B>Copy</B>-able or <B>Download</B>-able plain-language write-up, a printable <B>stats sheet</B>, or a one-click <B>Send to client</B> if the client is set up to receive messages.
          </p>
          <p>
            Clients running the <B>Companion</B> app have their own cut-down version of this for filming themselves — free, on their phone, no coach needed. Their video never leaves their device; if they send you anything it’s the text summary only.
          </p>
        </Section>

        <Section icon={<Apple size={16} />} title="Nutrition targets">
          <p>
            On a client’s <B>Nutrition</B> tab, fill in sex, height, birth date, activity, and goal, and log one bodyweight. {APP_NAME} computes calories and macros (protein, carbs, fat), plus fiber and water.
          </p>
          <p>
            Every number is followed by a <B>“Why these numbers”</B> section that cites the research behind it (Mifflin-St Jeor for metabolism, Morton et al. for protein, and so on). It’s built on published sports-nutrition consensus — not medical advice; send clients with medical conditions to a dietitian or physician.
          </p>
        </Section>

        <Section icon={<Gauge size={16} />} title="Readiness score">
          <p>
            Log a client’s check-in (sleep, energy, mood, adherence) and the <B>Check-ins</B> tab shows a 0–100 <B>readiness</B> score with a green/amber/red band and a coaching cue — train hard, cap intensity, or back off. It names what drove the score and the model behind it.
          </p>
        </Section>

        <Section icon={<Wallet size={16} />} title="Business — profit, expenses & the gym’s cut">
          <Steps items={[
            <>Record client payments on their <B>Billing</B> tab. They aggregate on the <B>Business</B> page.</>,
            <><B>Profit planner:</B> set the profit you need this month. {APP_NAME} subtracts expenses and shows the gap, a month-end projection, and roughly how many more sessions it takes to hit your goal.</>,
            <><B>Expenses:</B> add rent, insurance, software, and the like. Monthly ones carry forward automatically.</>,
            <><B>Invoices:</B> create them from a client’s Billing tab — drafts, sent, paid, optional monthly repeat, and discount codes you set up in <B>Settings → Coupons</B>.</>,
            <><B>The gym’s cut:</B> on a client’s Billing tab, set what the facility takes — a <B>percent</B> of their income or a <B>flat monthly fee</B>. It’s subtracted from your real profit on the Business page, so the number you see is what you actually keep.</>,
          ]} />
        </Section>

        <Section icon={<Smartphone size={16} />} title="Companion files (send programs to clients)">
          <p>
            From a client with an active program, <B>Export Companion</B> builds a single HTML file — your brand, their workout — that they open in any browser with no app and no account. They tick off sets and answer check-ins; a <B>Send my work to my coach</B> button hands back a small data file you import from the client’s <B>Logs</B> tab. It merges in as logged sessions and check-ins, de-duplicated automatically.
          </p>
        </Section>

        <Section icon={<Cloud size={16} />} title="Your account & sync">
          <p>
            Everything is saved to your {APP_NAME} account and syncs automatically to every device you sign in on,
            including the web app. It keeps working if the internet drops — changes wait on this device and upload
            when you’re back online. <B>Account &amp; sync</B> in the sidebar shows what’s pending.
          </p>
          <p>
            <B>Companion.</B> On a client’s page, <B>Connect Companion</B> gives you a one-time code for them to enter
            in the Companion app. They see their program, messages and reminders; their logged sessions come back to you.
          </p>
          <p>
            <B>Scheduled reminders.</B> On a client’s <B>Messages</B> tab you can queue a reminder for a date and time.
            It reaches them the next time they open Companion after that time — a nudge, not a locked-phone alarm.
            Anything not yet delivered is listed underneath and can be cancelled.
          </p>
        </Section>

        <Section icon={<ShieldCheck size={16} />} title="Back up & move machines">
          <Steps items={[
            <><B>Back up now</B> (below) saves one file with everything in it. Add a passphrase to encrypt it — but there’s no recovery, so store the passphrase safely.</>,
            <>The shield in the sidebar tracks days since your last backup and turns amber after 30 days — your account is the main copy; a backup is an extra one.</>,
            <>Moving to a new computer? Just sign in there — your account brings everything with it. A backup file is your own extra copy, independent of the cloud.</>,
          ]} />
        </Section>

        <Section icon={<Keyboard size={16} />} title="Keyboard shortcuts">
          <ul className="space-y-1.5">
            <li><Kbd>⌘K</Kbd> / <Kbd>Ctrl K</Kbd> — command palette: jump anywhere, do anything</li>
            <li><Kbd>⌘L</Kbd> / <Kbd>Ctrl L</Kbd> — Quick log a set</li>
            <li><Kbd>/</Kbd> — focus exercise search in the program builder</li>
            <li><Kbd>⌘Z</Kbd> / <Kbd>⇧⌘Z</Kbd> — undo / redo in the builder</li>
            <li><Kbd>Space</Kbd> — play/pause in the Film Room</li>
            <li><Kbd>←</Kbd> <Kbd>→</Kbd> — step one frame (hold <Kbd>⇧</Kbd> for five) in the Film Room</li>
          </ul>
        </Section>

        <Section icon={<Lock size={16} />} title="Privacy & how it works">
          <p>
            Your data is stored in your {APP_NAME} account, sent only over HTTPS, and cached on the devices you sign in on. We don’t sell it or use it for ads. The movement-tracking AI is an open-source model bundled inside the app — it runs on your device with <B>no API keys and no network calls</B>, and your videos never leave your device.
          </p>
          <p>
            The desktop app also runs the on-device assistant, voice logging, log-sheet scanning and meaning-based search. The web app leaves those out — they need large model downloads that don’t belong in a browser tab.
          </p>
          <p>
            For the full picture — where the data lives, how to get all of it out, and what happens if you stop paying — see <B>HOW-TO-OWN-IT.md</B>, included with the app.
          </p>
        </Section>
      </div>
    </Card>
  )
}
