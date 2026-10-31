import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Zap, AlertTriangle, Check } from 'lucide-react'
import { Dialog, Button, Input, Avatar, Tag, toast, toastError } from '@/design'
import { clientsRepo, exercisesRepo, logsRepo, programsRepo, trainerRepo, staffRepo } from '@/db/repo'
import { buildQuickLogPlan, describePlanMsgs, type Clarification } from '@/lib/quickLog'
import { renderMsg } from '@/lib/i18n/msg'
import { fullName, daysSince, today } from '@/lib/core'
import type { Client, LoggedSet } from '@/db/types'
import { getActiveStaffId } from '@/lib/activeStaff'
import { useTranslation, type MessageKey } from '@/lib/i18n'

/**
 * Quick Log — type a set the way you'd say it out loud.
 *
 *   "sam 3x5 225 back squat rpe 8"
 *
 * Two rules drive this whole component, and they're the reason it isn't just
 * a text box that writes straight to the database:
 *
 *  1. IT ASKS RATHER THAN GUESSES. If "sam" could be Sam Rivera or Samantha
 *     Cole, it asks. Logging to the wrong client corrupts a training history
 *     quietly, and the coach may not notice for weeks.
 *  2. IT SHOWS WHO IT'S ABOUT, ABOVE THE INPUT, BEFORE ANYTHING IS WRITTEN.
 *     The client card is the guarantee — the coach confirms a face and a name,
 *     not a parse. It is deliberately the first thing in the dialog, above the
 *     text, so it cannot be missed while typing.
 *
 * Parsing is entirely deterministic (`lib/quickLog.ts`) and needs no AI. When
 * a local model is installed it can pre-normalise messier phrasing into the
 * same shape — but it never skips the confirmation below.
 */
export function QuickLogDialog({ open, onClose, presetClientId }: {
  open: boolean
  onClose: () => void
  /** When opened from inside a client's workspace, that client is pre-locked. */
  presetClientId?: string
}) {
  const [text, setText] = useState('')
  const [clientOverride, setClientOverride] = useState<string | undefined>(presetClientId)
  const [exerciseOverride, setExerciseOverride] = useState<string>()
  const [repsOverride, setRepsOverride] = useState<number>()
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const exercises = useLiveQuery(() => exercisesRepo.all(), [], [])
  const trainer = useLiveQuery(() => trainerRepo.get(), [], undefined)
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const units = trainer?.units ?? 'lb'

  useEffect(() => {
    if (!open) return
    setText(''); setExerciseOverride(undefined); setRepsOverride(undefined)
    setClientOverride(presetClientId)
    // Focus after the dialog paints, or the caret lands nowhere.
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open, presetClientId])

  const plan = useMemo(
    () => buildQuickLogPlan(text, clients, exercises),
    [text, clients, exercises],
  )

  // An explicit answer always beats the parser's guess.
  const client = clientOverride
    ? clients.find(c => c.id === clientOverride)
    : plan.client.match
  const exercise = exerciseOverride
    ? exercises.find(e => e.id === exerciseOverride)
    : plan.exercise.match
  const reps = repsOverride ?? plan.draft.prescription.reps

  const answered = (c: Clarification) =>
    (c.id === 'client' && !!clientOverride) ||
    (c.id === 'exercise' && !!exerciseOverride) ||
    (c.id === 'reps' && repsOverride != null)

  const openQuestions = plan.clarifications.filter(c => !answered(c))
  const canLog = !!client && !!exercise && reps != null && !busy

  async function commit() {
    if (!client || !exercise || reps == null) return
    setBusy(true)
    try {
      const p = plan.draft.prescription
      const setCount = p.sets ?? 1
      const sets: LoggedSet[] = Array.from({ length: setCount }, () => ({
        actualReps: reps,
        actualLoad: p.bodyweight ? undefined : p.load,
        rpe: p.rpe,
        done: true,
      }))

      const date = plan.draft.date ?? today()
      const existing = (await logsRepo.forClient(client.id)).find(l => l.date === date)

      if (existing) {
        // Same day = same session. Append rather than creating a second log,
        // which would fragment the day's volume across two rows.
        await logsRepo.update(existing.id, {
          entries: [...existing.entries, { exerciseId: exercise.id, sets, notes: plan.draft.notes }],
        })
      } else {
        // No createdAt/updatedAt here — makeRepo's create() stamps them.
        await logsRepo.create({
          clientId: client.id,
          date,
          title: t('quicklog.sessionTitle'),
          entries: [{ exerciseId: exercise.id, sets, notes: plan.draft.notes }],
          // 'trainer', not 'manual' — DataSource distinguishes who authored the
          // row (the coach here) from a Companion import, not how it was typed.
          source: 'trainer',
          staffId: getActiveStaffId(staff) ?? undefined,
        })
      }

      toast(t('quicklog.logged', { exercise: exercise.name, client: fullName(client) }))
      onClose()
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('quicklog.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('quicklog.title')} width={520}>
      <div className="space-y-3">
        {/* ── The guarantee: who this is about, above the text, before anything
            is written. Rendered as a placeholder when unresolved so the space
            never collapses and the coach always looks in the same place. ── */}
        <ClientCard client={client} pending={!client} />

        <div>
          <Input
            ref={inputRef}
            value={text}
            onChange={e => {
              setText(e.target.value)
              // A fresh parse invalidates prior answers — except a client that
              // was locked in by the caller, which the text can't override.
              if (!presetClientId) setClientOverride(undefined)
              setExerciseOverride(undefined)
              setRepsOverride(undefined)
            }}
            onKeyDown={e => { if (e.key === 'Enter' && canLog && openQuestions.length === 0) commit() }}
            placeholder={t('quicklog.placeholder')}
            aria-label={t('quicklog.describe')}
          />
          <p className="mt-1 text-2xs text-faint">
            {t('quicklog.help')}
          </p>
        </div>

        {openQuestions.map(q => (
          <div key={q.id} className="rounded-ctl border border-ember-500/40 bg-ember-500/5 px-3 py-2.5">
            <p className="flex items-start gap-1.5 text-xs font-medium text-ink">
              <AlertTriangle size={13} className="mt-px shrink-0 text-ember-600" />
              {t(`quicklog.q.${q.id}.${q.status}` as MessageKey, { query: q.query ?? '' })}
            </p>
            {q.options ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.options.map(o => (
                  <button
                    key={o.id}
                    onClick={() => {
                      if (q.id === 'client') setClientOverride(o.id)
                      if (q.id === 'exercise') setExerciseOverride(o.id)
                    }}
                    className="rounded-ctl border border-line bg-surface px-2.5 py-1 text-xs text-ink hover:border-verde-600 hover:bg-verde-100"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : q.id === 'reps' ? (
              <input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={t('quicklog.repsPlaceholder')}
                aria-label={t('quicklog.q.reps.none')}
                className="mt-2 h-8 w-24 rounded-ctl border border-line bg-surface px-2 text-sm text-ink"
                onChange={e => setRepsOverride(e.target.value ? +e.target.value : undefined)}
              />
            ) : (
              <p className="mt-1 text-2xs text-muted">{t('quicklog.addAbove')}</p>
            )}
          </div>
        ))}

        {/* Exactly what will be written — the coach confirms the whole thing,
            not just the name on the card. */}
        {(exercise || reps != null) && (
          <div className="rounded-ctl border border-line bg-surface2 px-3 py-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-faint">{t('quicklog.willLog')}</p>
            <p className="mt-1 text-sm text-ink">
              {exercise?.name ?? <span className="text-faint">{t('quicklog.exerciseUnknown')}</span>}
              {' · '}
              <span className="font-mono tabular-nums">
                {describePlanMsgs({ ...plan.draft.prescription, reps: reps ?? undefined }, units).map(m => renderMsg(m, t)).join(' · ')}
              </span>
            </p>
            <p className="mt-0.5 text-2xs text-muted">
              {plan.draft.date && plan.draft.date !== today() ? plan.draft.date : t('quicklog.today')}
              {plan.draft.notes ? ` · “${plan.draft.notes}”` : ''}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('quicklog.cancel')}</Button>
          <Button variant="primary" onClick={commit} disabled={!canLog || openQuestions.length > 0}>
            <Check size={14} /> {t('quicklog.logIt')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** The confirmation card. Shows enough context to be certain this is the right
 *  person — not just a name, which two clients can share. */
function ClientCard({ client, pending }: { client?: Client; pending: boolean }) {
  const program = useLiveQuery(
    async () => (client?.activeProgramId ? programsRepo.get(client.activeProgramId) : undefined),
    [client?.activeProgramId],
    undefined,
  )
  const lastLog = useLiveQuery(
    async () => (client ? (await logsRepo.forClient(client.id))[0] : undefined),
    [client?.id],
    undefined,
  )
  const { t } = useTranslation()

  if (pending || !client) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-dashed border-line px-3 py-3 text-xs text-faint">
        <div className="h-9 w-9 shrink-0 rounded-full border border-dashed border-line" />
        <span>{t('quicklog.pending')}</span>
      </div>
    )
  }

  const days = daysSince(lastLog?.date)

  return (
    <div className="rounded-card border border-verde-600/40 bg-verde-100/40 px-3 py-3">
      <div className="flex items-center gap-3">
        <Avatar person={client} src={client.photoDataUrl} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{fullName(client)}</p>
          <p className="truncate text-2xs text-muted">
            {days === null ? t('quicklog.noSessions')
              : days === 0 ? t('quicklog.lastToday')
              : t('quicklog.lastDaysAgo', { n: days })}
            {program ? ` · ${program.name}` : ''}
          </p>
        </div>
        <Tag tone="verde">{t('quicklog.loggingTo')}</Tag>
      </div>
      {client.injuries?.trim() && (
        <p className="mt-2 flex items-start gap-1.5 border-t border-verde-600/20 pt-2 text-2xs text-ember-600">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          {client.injuries}
        </p>
      )}
    </div>
  )
}

/** Toolbar/keyboard entry point. */
export function QuickLogButton({ clientId }: { clientId?: string }) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Zap size={14} /> {t('quicklog.button')}
      </Button>
      <QuickLogDialog open={open} onClose={() => setOpen(false)} presetClientId={clientId} />
    </>
  )
}

export default QuickLogDialog
