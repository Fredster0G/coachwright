// ===== Welcome sequence for a new client =====
//
// "Automated onboarding" (ROADMAP §2.6) built on what already exists: each
// step becomes a scheduled reminder (sync-server /reminders), released to the
// client's Companion app on its first open after the send time. The coach
// writes the steps once (Settings → Welcome sequence) and starts them per
// client from the Messages tab.
//
// Reminder ids are `onb~<clientId>~<step>`, and the client row records when
// the sequence started — the server's upsert resets `sent`, so re-scheduling
// a delivered step would deliver it again. Start once; cancel steps singly.

import type { OnboardingStep } from '@/db/types'

export const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
  { dayOffset: 0, content: 'Welcome aboard, {firstName}! Your program is in the app — message me here any time.' },
  { dayOffset: 2, content: 'How did your first sessions feel, {firstName}? Anything too easy or too hard?' },
  { dayOffset: 7, content: 'One week in! Log a quick check-in (sleep, energy, soreness) so I can adjust your plan.' },
  { dayOffset: 14, content: 'Two weeks done. Snap a progress photo today — it’s the best way to see change later.' },
]

/** Local hour each step goes out (the client sees it on their next open after). */
export const SEND_HOUR = 9

export interface PlannedReminder { id: string; content: string; sendAt: Date }

export const onboardingReminderId = (clientId: string, step: number) => `onb~${clientId}~${step}`

/**
 * The reminders to schedule when starting the sequence at `now`. Day-0 goes
 * out shortly (it's the welcome); later steps at SEND_HOUR local on their
 * day. Empty / blank steps are skipped.
 */
export function planOnboarding(
  steps: readonly OnboardingStep[], client: { id: string; firstName: string }, now: Date,
): PlannedReminder[] {
  return steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.content.trim() && Number.isFinite(s.dayOffset) && s.dayOffset >= 0)
    .map(({ s, i }) => {
      let sendAt: Date
      if (s.dayOffset === 0) sendAt = new Date(now.getTime() + 60_000)
      else {
        sendAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.floor(s.dayOffset), SEND_HOUR)
      }
      const content = s.content.replace(/\{firstName\}/g, client.firstName.trim() || 'there').trim()
      return { id: onboardingReminderId(client.id, i), content, sendAt }
    })
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())
}
