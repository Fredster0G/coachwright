import { clientsRepo, checkInsRepo } from '@/db/repo'
import { readinessFromCheckIn } from './readiness'
import { fullName, isoDay } from './core'

/**
 * Fetches and formats all check-ins over the past 7 days across the active roster.
 */
export async function buildRosterCheckInContext(): Promise<string> {
  const activeClients = await clientsRepo.active()
  if (activeClients.length === 0) return 'No active clients.'

  const d = new Date()
  d.setDate(d.getDate() - 7)
  const aWeekAgo = isoDay(d)
  
  // Fetch check-ins for the last week
  const allCheckIns = await checkInsRepo.table
    .where('date')
    .aboveOrEqual(aWeekAgo)
    .toArray()

  if (allCheckIns.length === 0) return 'No check-ins logged in the last 7 days.'

  const checkInsByClient = new Map<string, typeof allCheckIns>()
  for (const c of allCheckIns) {
    if (!checkInsByClient.has(c.clientId)) checkInsByClient.set(c.clientId, [])
    checkInsByClient.get(c.clientId)!.push(c)
  }

  const lines: string[] = ['Roster Check-in Summary (Last 7 Days):']
  
  for (const client of activeClients) {
    const clientCheckIns = checkInsByClient.get(client.id) || []
    if (clientCheckIns.length === 0) {
      lines.push(`- ${fullName(client)}: No check-ins.`)
      continue
    }

    // Sort newest first
    clientCheckIns.sort((a, b) => b.date.localeCompare(a.date))
    const latest = clientCheckIns[0]
    const readiness = readinessFromCheckIn(latest)

    const parts = []
    parts.push(`${clientCheckIns.length} check-in(s)`)
    if (readiness) {
      parts.push(`Latest score: ${readiness.score}/100 ("${readiness.band}")`)
      if (readiness.drivers.length > 0) parts.push(`Driven by: ${readiness.drivers.join(', ')}`)
    }
    
    lines.push(`- ${fullName(client)}: ${parts.join('; ')}`)
  }

  return lines.join('\n')
}
