import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Unlink } from 'lucide-react'
import { Button, Card } from '@/design'
import { coachLinkRepo } from '@/db/repo'
import { ConnectFlow } from '@/features/sync/ConnectFlow'
import type { CoachLink } from '@/db/types'

/** Connection status only — messages and syncing live on the Coach tab. */
export function CoachCard() {
  const [coachLink, setCoachLink] = useState<CoachLink | undefined>()
  const [connecting, setConnecting] = useState(false)

  const refresh = () => { coachLinkRepo.get().then(setCoachLink) }
  useEffect(() => { refresh() }, [])

  async function disconnect() {
    if (!coachLink) return
    await coachLinkRepo.remove(coachLink.id)
    refresh()
  }

  if (connecting) {
    return (
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Link2 size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">Connect to your coach</p>
        </div>
        <ConnectFlow onConnected={() => { setConnecting(false); refresh() }} onSkip={() => setConnecting(false)} />
      </Card>
    )
  }

  if (!coachLink) {
    return (
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Link2 size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">Coach</p>
        </div>
        <p className="mb-3 text-xs text-muted">Not connected to a coach yet.</p>
        <Button variant="primary" className="w-full" onClick={() => setConnecting(true)}>Connect with a code</Button>
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">Coach</p>
        </div>
        <button
          onClick={disconnect} aria-label="Disconnect" title="Disconnect — your own logs and history stay on this device"
          className="-m-2 flex h-11 w-11 items-center justify-center p-2"
        >
          <Unlink size={16} className="text-faint hover:text-ember-600" />
        </button>
      </div>
      <p className="text-xs text-muted">
        Connected to {coachLink.coachName}. Messages and syncing live on the{' '}
        <Link to="/coach" className="text-verde-600 hover:underline">Coach tab</Link>.
        Disconnecting never deletes your own workout history.
      </p>
    </Card>
  )
}
