import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ShieldCheck, CalendarHeart } from 'lucide-react'
import { Button, Card, Input, Label, PageHeader } from '@/design'
import { profileRepo, coachLinkRepo } from '@/db/repo'
import { exportBackup, downloadText, importBackup } from '@/db/backup'
import { enablePush, disablePush, pushSupported } from '@/lib/push'
import type { CompanionProfile, Units, Theme } from '@/db/types'
import { today } from '@/lib/core'
import { CoachCard } from './CoachCard'

function NotificationsCard({ profile, onChanged }: { profile: CompanionProfile; onChanged: () => void }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    setStatus('')
    try {
      const link = await coachLinkRepo.get()
      if (profile.notifyEnabled) {
        await disablePush(link)
        setStatus('Off.')
      } else if (link) {
        setStatus(await enablePush(link))
      } else {
        setStatus('Connect to a coach first — notifications are about what they send you.')
      }
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Bell size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold text-ink">Notifications</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Hear about new coach messages and reminders{pushSupported() ? ' — even with the app closed, if your coach has a server' : ''}.
        Never used for marketing; there's nothing to market.
      </p>
      <Button variant={profile.notifyEnabled ? 'secondary' : 'primary'} className="w-full" onClick={toggle} disabled={busy}>
        {profile.notifyEnabled ? 'Turn off' : 'Turn on'}
      </Button>
      {status && <p className="mt-2 text-2xs text-muted">{status}</p>}
    </Card>
  )
}

/** Entry point for cycle tracking. Lives here rather than in the bottom nav
 *  deliberately — a permanent nav icon tells anyone who glances at the phone
 *  that this person tracks it, and that isn't the app's to disclose. */
function CycleCard({ enabled }: { enabled: boolean }) {
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <CalendarHeart size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold text-ink">Cycle & symptoms</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        {enabled
          ? 'On. Stored only on this device and never sent to a coach.'
          : 'Optional. Log symptoms and let them adjust your training — stored only on this device, never sent to a coach.'}
      </p>
      <Link to="/cycle">
        <Button variant={enabled ? 'secondary' : 'primary'} className="w-full">
          {enabled ? 'Open' : 'Learn more'}
        </Button>
      </Link>
    </Card>
  )
}

export function SettingsPage({ profile, onProfileChange }: {
  profile: CompanionProfile
  onProfileChange: (p: CompanionProfile) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function patch(changes: Partial<CompanionProfile>) {
    await profileRepo.patch(changes)
    const updated = await profileRepo.get()
    if (updated) onProfileChange(updated)
  }

  async function backupNow() {
    const backup = await exportBackup()
    downloadText(`companion-backup-${today()}.json`, JSON.stringify(backup, null, 2))
  }

  // Restore REPLACES everything on the phone, so it asks first; a wrong file
  // used to throw silently (nothing on screen) after no warning at all.
  async function onImport(file: File) {
    if (!window.confirm('Restore replaces everything on this phone with the backup file. Continue?')) return
    try {
      await importBackup(await file.text())
      const updated = await profileRepo.get()
      if (updated) onProfileChange(updated)
      setRestoreMsg({ ok: true, text: 'Restored.' })
    } catch (err) {
      setRestoreMsg({ ok: false, text: err instanceof SyntaxError ? 'That file isn’t a Companion backup.' : err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="You" title="Settings" />

      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Profile</p>
        <Label>Name</Label>
        <Input defaultValue={profile.name} onBlur={e => patch({ name: e.target.value })} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <Label>Units</Label>
            <select value={profile.units} onChange={e => patch({ units: e.target.value as Units })} className="w-full rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="lb">Pounds (lb)</option>
              <option value="kg">Kilograms (kg)</option>
            </select>
          </div>
          <div>
            <Label>Theme</Label>
            <select value={profile.theme} onChange={e => patch({ theme: e.target.value as Theme })} className="w-full rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
      </Card>

      <CoachCard />

      <NotificationsCard profile={profile} onChanged={async () => {
        const updated = await profileRepo.get()
        if (updated) onProfileChange(updated)
      }} />


      <CycleCard enabled={!!profile.cycleTrackingEnabled} />

      <Card>
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">Backup & restore</p>
        </div>
        <p className="mb-3 text-xs text-muted">
          Everything lives on this device — a backup is one file holding all of it,
          {profile.cycleTrackingEnabled ? ' including your cycle log. Keep the file somewhere you\'re happy for it to be.' : ' so keep the file somewhere private.'}
        </p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={backupNow}>Back up now</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
          <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>Restore</Button>
        </div>
        {restoreMsg && <p role="status" className={`mt-2 text-xs ${restoreMsg.ok ? 'text-verde-600' : 'text-signal-600'}`}>{restoreMsg.text}</p>}
      </Card>
    </div>
  )
}
