// ===== Quick Log — natural-language session entry =====
//
// A coach standing on the gym floor types (or dictates) "sam 3x5 225 back
// squat rpe 8" and gets a logged set. The whole module is PURE and
// synchronous: it takes text plus the candidate clients/exercises and returns
// a plan. No database access, no AI, no I/O — which is why it can be tested
// exhaustively and why it works identically whether or not a language model
// is installed.
//
// DESIGN RULE, and the reason this file exists at all: the parser NEVER
// guesses when it isn't sure. Logging against the wrong client corrupts
// someone's training history in a way that is easy to miss and hard to undo,
// so anything short of a confident match becomes an explicit question for the
// coach. A local LLM (docs/plans/02-LOCAL-AI.md) can later pre-process messier
// phrasing into the same shape, but it never gets to skip the confirmation —
// it feeds this pipeline, it doesn't bypass it.

import type { Msg } from './i18n/msg'

export interface ParsedPrescription {
  sets?: number
  reps?: number
  load?: number
  rpe?: number
  units?: 'lb' | 'kg'
  /** "bw", "bodyweight" — load is the client's own mass, not a number. */
  bodyweight?: boolean
}

export interface QuickLogDraft {
  raw: string
  clientQuery?: string
  exerciseQuery?: string
  prescription: ParsedPrescription
  /** yyyy-MM-dd, resolved from "yesterday" / "monday" etc. Absent = today. */
  date?: string
  notes?: string
}

export interface Candidate<T> {
  item: T
  score: number
  /** Why this matched — shown in the disambiguation UI so the coach isn't guessing. */
  matchedOn: string
}

export type ResolutionStatus = 'resolved' | 'ambiguous' | 'missing' | 'none'

export interface Resolution<T> {
  status: ResolutionStatus
  match?: T
  candidates: Candidate<T>[]
}

export interface Clarification {
  id: 'client' | 'exercise' | 'reps' | 'load'
  /** English wording; the UI translates from `status` + `query` instead. */
  question: string
  /** Why it's asked: nothing given, nothing matched `query`, or several did. */
  status: 'none' | 'missing' | 'ambiguous'
  query?: string
  /** Present for pick-one questions; absent when the coach must type a value. */
  options?: { id: string; label: string; hint?: string }[]
}

// A match must beat this to be trusted without asking.
const CONFIDENT = 0.72
// ...and must clear the runner-up by this much, or it's ambiguous.
const MARGIN = 0.15

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Case/punctuation-insensitive comparison key. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------- parsing

/**
 * Pull structured training data out of free text, leaving the words that
 * name a person and a movement.
 *
 * Handles the shorthand coaches actually type:
 *   3x5            3 sets of 5
 *   3x5x225        3 sets of 5 at 225
 *   5@225          5 reps at 225
 *   225x5          225 for 5 (load-first, common on the floor)
 *   rpe 8 / @8     RPE
 *   100kg / 225lb  explicit units
 *   bw             bodyweight
 *   yesterday      date
 *   "felt heavy"   quoted note
 */
export function parseQuickLog(text: string): QuickLogDraft {
  const raw = text
  let working = ` ${text} `
  const prescription: ParsedPrescription = {}
  let date: string | undefined
  let notes: string | undefined

  const eat = (re: RegExp, take: (m: RegExpMatchArray) => void) => {
    const m = working.match(re)
    if (m) {
      take(m)
      working = working.replace(m[0], ' ')
    }
  }

  // Quoted note first — it may contain any of the tokens below and must not
  // be parsed as data. "sam 3x5 225 squat 'felt heavy today'"
  eat(/["'“](.+?)["'”]/, m => { notes = m[1].trim() })

  // RPE before bare numbers, so "@8" isn't mistaken for a load.
  eat(/\brpe\s*([\d.]+)\b/i, m => { prescription.rpe = parseFloat(m[1]) })
  eat(/@\s*(10|[1-9](?:\.5)?)\s(?!lb|kg)/i, m => { prescription.rpe = parseFloat(m[1]) })

  // Bodyweight
  eat(/\b(bw|bodyweight|body\s?weight)\b/i, () => { prescription.bodyweight = true })

  // Dates
  eat(/\b(yesterday)\b/i, () => { date = isoOffsetDays(-1) })
  eat(/\b(today)\b/i, () => { date = isoOffsetDays(0) })
  eat(new RegExp(`\\b(?:last\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i'), m => {
    date = isoMostRecentWeekday(WEEKDAYS.indexOf(m[1].toLowerCase()))
  })

  // sets x reps x load  — "3x5x225"
  eat(/\b(\d{1,2})\s*[x×]\s*(\d{1,3})\s*[x×]\s*([\d.]+)\s*(lbs?|kgs?)?\b/i, m => {
    prescription.sets = +m[1]; prescription.reps = +m[2]; prescription.load = parseFloat(m[3])
    if (m[4]) prescription.units = m[4].toLowerCase().startsWith('k') ? 'kg' : 'lb'
  })

  // sets x reps @ load — "3x5 @ 225" / "3x5 225"
  if (prescription.sets == null) {
    eat(/\b(\d{1,2})\s*[x×]\s*(\d{1,3})\b\s*@?\s*([\d.]+)?\s*(lbs?|kgs?)?/i, m => {
      prescription.sets = +m[1]; prescription.reps = +m[2]
      if (m[3]) prescription.load = parseFloat(m[3])
      if (m[4]) prescription.units = m[4].toLowerCase().startsWith('k') ? 'kg' : 'lb'
    })
  }

  // load x reps — "225x5". Disambiguated from sets×reps by magnitude: nobody
  // does 225 sets, and a 3 lb working load is not what this shorthand means.
  if (prescription.sets == null && prescription.reps == null) {
    eat(/\b([\d.]+)\s*(lbs?|kgs?)?\s*[x×]\s*(\d{1,3})\b/i, m => {
      const first = parseFloat(m[1])
      if (first > 30) {
        prescription.load = first
        prescription.reps = +m[3]
        if (m[2]) prescription.units = m[2].toLowerCase().startsWith('k') ? 'kg' : 'lb'
      }
    })
  }

  // reps @ load — "5@225"
  if (prescription.reps == null) {
    eat(/\b(\d{1,3})\s*@\s*([\d.]+)\s*(lbs?|kgs?)?\b/i, m => {
      prescription.reps = +m[1]; prescription.load = parseFloat(m[2])
      if (m[3]) prescription.units = m[3].toLowerCase().startsWith('k') ? 'kg' : 'lb'
    })
  }

  // A lone number with an explicit unit is a load.
  if (prescription.load == null) {
    eat(/\b([\d.]+)\s*(lbs?|kgs?)\b/i, m => {
      prescription.load = parseFloat(m[1])
      prescription.units = m[2].toLowerCase().startsWith('k') ? 'kg' : 'lb'
    })
  }

  // Whatever survives is the person and the movement.
  const words = norm(working).split(' ').filter(Boolean)

  return {
    raw,
    ...splitNameAndExercise(words),
    prescription,
    date,
    notes,
  }
}

/** The leading word (or two, for a full name) is the client; the rest is the
 *  exercise. Both halves get re-checked against real candidates by the
 *  resolvers below, so a wrong split here is recoverable, not fatal. */
function splitNameAndExercise(words: string[]): { clientQuery?: string; exerciseQuery?: string } {
  if (words.length === 0) return {}
  if (words.length === 1) return { clientQuery: words[0] }
  return { clientQuery: words[0], exerciseQuery: words.slice(1).join(' ') }
}

/** Local calendar day (not `toISOString()`, which is the UTC day). */
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function isoOffsetDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDay(d)
}

/** The most recent occurrence of a weekday, looking backwards. */
function isoMostRecentWeekday(target: number): string {
  const d = new Date()
  const delta = (d.getDay() - target + 7) % 7
  d.setDate(d.getDate() - (delta === 0 ? 7 : delta))
  return localDay(d)
}

// -------------------------------------------------------------- resolving

/** Score a query against one candidate's searchable keys, 0–1. */
function scoreKeys(query: string, keys: string[]): { score: number; matchedOn: string } {
  const q = norm(query)
  let best = 0
  let on = ''
  for (const key of keys) {
    const k = norm(key)
    if (!k) continue
    let s = 0
    if (k === q) s = 1
    else if (k.startsWith(q)) s = 0.9
    else if (k.split(' ').some(w => w === q)) s = 0.85
    else if (k.split(' ').some(w => w.startsWith(q))) s = 0.75
    else if (k.includes(q)) s = 0.6
    else if (q.includes(k)) s = 0.55
    if (s > best) { best = s; on = key }
  }
  return { score: best, matchedOn: on }
}

function rank<T>(query: string | undefined, items: T[], keysOf: (t: T) => string[]): Resolution<T> {
  if (!query) return { status: 'none', candidates: [] }

  const scored: Candidate<T>[] = items
    .map(item => {
      const { score, matchedOn } = scoreKeys(query, keysOf(item))
      return { item, score, matchedOn }
    })
    .filter(c => c.score > 0.5)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return { status: 'missing', candidates: [] }

  const top = scored[0]
  const runnerUp = scored[1]
  const clear = !runnerUp || top.score - runnerUp.score >= MARGIN

  // Confident AND clearly ahead of the next candidate. Two "Sam"s on the
  // roster must always produce a question, never a coin flip.
  if (top.score >= CONFIDENT && clear) {
    return { status: 'resolved', match: top.item, candidates: scored.slice(0, 5) }
  }
  return { status: 'ambiguous', candidates: scored.slice(0, 5) }
}

export interface ClientLike { id: string; firstName: string; lastName: string }
export interface ExerciseLike { id: string; name: string; aliases?: string[] }

export function resolveClient<T extends ClientLike>(query: string | undefined, clients: T[]): Resolution<T> {
  return rank(query, clients, c => [`${c.firstName} ${c.lastName}`, c.firstName, c.lastName])
}

export function resolveExercise<T extends ExerciseLike>(query: string | undefined, exercises: T[]): Resolution<T> {
  return rank(query, exercises, e => [e.name, ...(e.aliases ?? [])])
}

// ------------------------------------------------------------------ plan

export interface QuickLogPlan<C extends ClientLike, E extends ExerciseLike> {
  draft: QuickLogDraft
  client: Resolution<C>
  exercise: Resolution<E>
  /** Everything the coach must answer before this can be written. Ordered:
   *  client first, because it's the one that does real damage if wrong. */
  clarifications: Clarification[]
  /** True only when nothing is left to ask. */
  ready: boolean
}

/**
 * Turn raw text into an actionable, confirmable plan.
 *
 * `ready` is false whenever ANY doubt remains. The UI must render the resolved
 * client's info card before writing regardless — `ready` means "I have no
 * questions", never "go ahead without showing anyone".
 */
export function buildQuickLogPlan<C extends ClientLike, E extends ExerciseLike>(
  text: string, clients: C[], exercises: E[],
): QuickLogPlan<C, E> {
  const draft = parseQuickLog(text)
  const client = resolveClient(draft.clientQuery, clients)
  const exercise = resolveExercise(draft.exerciseQuery, exercises)

  const clarifications: Clarification[] = []

  if (client.status === 'none') {
    clarifications.push({ id: 'client', status: 'none', question: 'Who is this for?' })
  } else if (client.status === 'missing') {
    clarifications.push({
      id: 'client', status: 'missing', query: draft.clientQuery,
      question: `No client matches “${draft.clientQuery}”. Who is this for?`,
    })
  } else if (client.status === 'ambiguous') {
    clarifications.push({
      id: 'client', status: 'ambiguous', query: draft.clientQuery,
      question: `Which client did you mean by “${draft.clientQuery}”?`,
      options: client.candidates.map(c => ({
        id: c.item.id,
        label: `${c.item.firstName} ${c.item.lastName}`,
      })),
    })
  }

  if (exercise.status === 'none') {
    clarifications.push({ id: 'exercise', status: 'none', question: 'Which exercise?' })
  } else if (exercise.status === 'missing') {
    clarifications.push({
      id: 'exercise', status: 'missing', query: draft.exerciseQuery,
      question: `No exercise matches “${draft.exerciseQuery}”. Which one?`,
    })
  } else if (exercise.status === 'ambiguous') {
    clarifications.push({
      id: 'exercise', status: 'ambiguous', query: draft.exerciseQuery,
      question: `Which exercise did you mean by “${draft.exerciseQuery}”?`,
      options: exercise.candidates.map(c => ({ id: c.item.id, label: c.item.name })),
    })
  }

  // Reps are the minimum needed for a set to mean anything. Load is genuinely
  // optional (bodyweight, machines with no readable stack), so it's never asked for.
  if (draft.prescription.reps == null) {
    clarifications.push({ id: 'reps', status: 'none', question: 'How many reps?' })
  }

  return { draft, client, exercise, clarifications, ready: clarifications.length === 0 }
}

/** One-line preview of exactly what will be written. Shown next to the client
 *  card so the coach confirms the whole thing, not just the name. */
/** describePlan's pieces as messages, for the UI to translate and join. */
export function describePlanMsgs(p: ParsedPrescription, units: 'lb' | 'kg' = 'lb'): Msg[] {
  const parts: Msg[] = []
  if (p.sets && p.reps) parts.push({ key: 'quicklog.plan.setsReps', params: { sets: p.sets, reps: p.reps } })
  else if (p.reps) parts.push({ key: 'quicklog.plan.reps', params: { reps: p.reps } })
  if (p.bodyweight) parts.push({ key: 'quicklog.plan.bodyweight' })
  else if (p.load != null) parts.push({ key: 'quicklog.plan.load', params: { load: p.load, units: p.units ?? units } })
  if (p.rpe != null) parts.push({ key: 'quicklog.plan.rpe', params: { rpe: p.rpe } })
  return parts.length ? parts : [{ key: 'quicklog.plan.none' }]
}

export function describePlan(p: ParsedPrescription, units: 'lb' | 'kg' = 'lb'): string {
  const parts: string[] = []
  if (p.sets && p.reps) parts.push(`${p.sets} × ${p.reps}`)
  else if (p.reps) parts.push(`${p.reps} reps`)
  if (p.bodyweight) parts.push('bodyweight')
  else if (p.load != null) parts.push(`${p.load} ${p.units ?? units}`)
  if (p.rpe != null) parts.push(`RPE ${p.rpe}`)
  return parts.join(' · ') || 'no sets yet'
}
