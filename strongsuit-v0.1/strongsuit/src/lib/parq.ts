// ===== Pre-participation screening (spec §4.22) =====
// A PAR-Q+ style readiness screen so a coach documents risk BEFORE training —
// the single most important liability step in personal training. This is not
// medical advice; a "yes" flag routes the client to a physician, and the
// result is recorded (with a waiver) as an audit trail.
//
// Sources:
// - Warburton et al. 2011/2021 — PAR-Q+ (Physical Activity Readiness
//   Questionnaire for Everyone), the validated self-screening standard.
// - ACSM's Guidelines for Exercise Testing and Prescription (11th ed.) —
//   pre-participation health screening algorithm.

import type { ParqAnswer, ScreeningResult } from '@/db/types'
import { today } from './core'

/** The seven core PAR-Q+ general-health questions (plain-language). */
export const PARQ_QUESTIONS: string[] = [
  'Has a doctor ever said you have a heart condition, or that you should only do physical activity supervised by a doctor?',
  'Do you feel pain in your chest during physical activity, or at rest in the past month?',
  'Do you lose balance from dizziness, or have you lost consciousness in the last 12 months?',
  'Do you have a bone, joint, or soft-tissue problem that could be made worse by exercise?',
  'Are you currently taking prescribed medication for a chronic medical condition?',
  'Do you have any other reason (physical or medical) why you should not do physical activity?',
  'Are you pregnant, or have you given birth in the last 6 months?',
]

/**
 * Score a completed screen. Any "yes" means clearance from a physician is
 * recommended before (or to guide) training — the PAR-Q+ rule.
 */
export function screen(answers: ParqAnswer[], note?: string): ScreeningResult {
  const flags = answers.filter(a => a.yes).map(a => a.q)
  return {
    date: today(),
    answers,
    cleared: flags.length === 0,
    flags,
    note,
  }
}

export const CLEARED_COPY =
  'All questions answered “no.” The client is cleared to begin under standard guidelines. Re-screen at least yearly, or after any change in health.'

export const FLAGGED_COPY =
  'One or more “yes” answers. Recommend the client obtain physician clearance before starting or continuing, and keep training within any limits the physician sets. Document the clearance when received.'

export const PARQ_SOURCE = 'PAR-Q+ (Warburton et al., 2021); ACSM Guidelines, 11th ed.'

// ---- standard liability documents (templates; a lawyer should localize) ----
export const ASSUMPTION_OF_RISK_TITLE = 'Assumption of Risk & Release of Liability'
export function assumptionOfRiskText(business: string, clientName: string): string {
  return [
    `${ASSUMPTION_OF_RISK_TITLE}`,
    ``,
    `I, ${clientName || '____________________'}, understand that physical exercise — including resistance training, conditioning, and related activities programmed by ${business || 'my coach'} — involves inherent risks, including muscle strains, sprains, falls, cardiovascular events, and in rare cases serious injury.`,
    ``,
    `I confirm that I have completed a pre-participation health screening truthfully, that I have obtained physician clearance where recommended, and that I will stop and seek medical attention if I experience pain, dizziness, or distress.`,
    ``,
    `I voluntarily assume these risks. To the fullest extent permitted by law, I release ${business || 'my coach'} from liability for injury or loss arising from my participation, except where caused by gross negligence or willful misconduct.`,
    ``,
    `I understand my coach is a fitness professional, not a physician or dietitian, and that guidance provided is not medical, diagnostic, or dietetic treatment.`,
  ].join('\n')
}

export const INFORMED_CONSENT_TITLE = 'Informed Consent to Train'
export function informedConsentText(business: string): string {
  return [
    `${INFORMED_CONSENT_TITLE}`,
    ``,
    `I consent to participate in a personalized training program delivered by ${business || 'my coach'}. The purpose, methods, and expected benefits have been explained to me, along with the risks and the alternatives.`,
    ``,
    `I understand results vary between individuals and are not guaranteed. I may ask questions at any time and may stop participating at any time.`,
    ``,
    `I understand nutrition guidance provided is general education based on published sports-nutrition consensus, is not medical or dietetic treatment, and that I should consult a physician or registered dietitian for medical conditions, pregnancy, or a history of disordered eating.`,
  ].join('\n')
}
