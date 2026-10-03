import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Inbox, Gauge, Flame, Trash2 } from 'lucide-react'
import { Card, Button, Input, EmptyState, Dialog, Label, toast } from '@/design'
import { checkInsRepo, habitsRepo, habitEntriesRepo } from '@/db/repo'
import type { CheckIn } from '@/db/types'
import { nowIso, newId, today as todayStr } from '@/lib/core'
import { readinessV2, MIN_BASELINE_DAYS } from '@/lib/readiness'
import { currentStreak } from '@/lib/habits'
import { useTranslation } from '@/lib/i18n'

/** Daily habit checklist with streaks (spec §4.26b). */
function HabitsCard({ clientId }: { clientId: string }) {
  const habits = useLiveQuery(() => habitsRepo.forClient(clientId), [clientId], [])
  const entries = useLiveQuery(() => habitEntriesRepo.forClient(clientId), [clientId], [])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const today = todayStr()
  const { t } = useTranslation()

  async function addHabit() {
    if (!name.trim()) return
    await habitsRepo.create({ clientId, name: name.trim(), active: true })
    setName(''); setAdding(false)
    toast(t('clients.toast.habitAdded'))
  }

  const active = habits.filter(h => h.active)

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Flame size={14} /> {t('clients.checkins.habitsTitle')}</div>
        <Button size="sm" variant="ghost" onClick={() => setAdding(a => !a)}><Plus size={13} /> {t('clients.checkins.addHabit')}</Button>
      </div>
      {adding && (
        <div className="mb-2 flex gap-2">
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={t('clients.checkins.habitPlaceholder')} onKeyDown={e => e.key === 'Enter' && addHabit()} />
          <Button size="sm" variant="primary" onClick={addHabit}>{t('clients.checkins.addBtn')}</Button>
        </div>
      )}
      {active.length === 0 ? (
        <p className="text-xs text-muted">{t('clients.checkins.noHabitsBody')}</p>
      ) : (
        <div className="space-y-1.5">
          {active.map(h => {
            const habitEntries = entries.filter(e => e.habitId === h.id)
            const doneToday = habitEntries.find(e => e.date === today)?.done ?? false
            const streak = currentStreak(habitEntries, today)
            return (
              <div key={h.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={doneToday} onChange={() => habitEntriesRepo.toggle(h.id, clientId, today)} className="accent-[var(--verde-600)]" />
                  {h.name}
                </label>
                <div className="flex items-center gap-2">
                  {streak > 0 && <span className="flex items-center gap-1 font-mono tabular-nums text-2xs text-ember-600"><Flame size={11} /> {streak}d</span>}
                  <button onClick={async () => { await habitsRepo.update(h.id, { active: false }); toast(t('clients.toast.habitArchived', { name: h.name })) }} className="text-faint hover:text-signal-600"><Trash2 size={12} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/** Today's readiness, scored against THIS client's own baseline (v2).
 *  Falls back to nothing while the baseline is still being learned — showing
 *  a confident number from three check-ins would be inventing precision. */
function ReadinessCard({ checkIns }: { checkIns: CheckIn[] }) {
  const r = readinessV2({ checkIns })
  const latest = [...checkIns].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const { t } = useTranslation()

  if (r.score === null) {
    return (
      <Card className="mb-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Gauge size={14} /> {t('clients.checkins.readinessTitle')}
        </div>
        <p className="mt-2 text-xs text-ink">{r.recommendation}</p>
        <p className="mt-1 text-2xs text-faint">
          {t('clients.checkins.readinessEmptyBody', { min: MIN_BASELINE_DAYS, count: r.historyDays })}
        </p>
      </Card>
    )
  }

  const tone = r.band === 'go' ? 'text-verde-600' : r.band === 'moderate' ? 'text-ember-600' : 'text-signal-600'
  const bar = r.band === 'go' ? 'bg-verde-600' : r.band === 'moderate' ? 'bg-ember-500' : 'bg-signal-600'
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Gauge size={14} /> {t('clients.checkins.readinessFrom', { date: latest?.date })}
        </div>
        <span className={`font-mono tabular-nums text-xl font-semibold ${tone}`}>{r.score}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${r.score}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink">{r.recommendation}</p>
      {/* Every domain against this client's own normal — the point of v2 is
          that the coach can see WHY, not just a number. */}
      <div className="mt-2 space-y-0.5">
        {r.domains.map(d => (
          <div key={d.domain} className="flex items-center justify-between text-2xs">
            <span className="capitalize text-muted">{d.domain}</span>
            <span className={`font-mono tabular-nums ${d.z <= -1 ? 'text-ember-600' : 'text-faint'}`}>
              {d.z > 0 ? '+' : ''}{t('clients.checkins.sd', { z: d.z })}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-2xs text-faint">
        {t('clients.checkins.readinessCompared', { days: r.historyDays, source: r.source })}
      </p>
    </Card>
  )
}

interface CheckInsTabProps {
  clientId: string
}

function LogCheckInDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    date: todayStr(),
    sleepHours: '',
    bodyweight: '',
    mood: '',
    energy: '',
    adherence: '',
    wins: '',
    blockers: ''
  })
  const { t } = useTranslation()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    
    const checkin: CheckIn = {
      id: newId(),
      clientId,
      date: form.date,
      source: 'trainer',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      sleepHours: form.sleepHours ? parseFloat(form.sleepHours) : undefined,
      bodyweight: form.bodyweight ? parseFloat(form.bodyweight) : undefined,
      mood: form.mood ? parseInt(form.mood) : undefined,
      energy: form.energy ? parseInt(form.energy) : undefined,
      adherence: form.adherence ? parseInt(form.adherence) : undefined,
      answers: [
        { question: t('clients.checkins.winsLabel'), answer: form.wins },
        { question: t('clients.checkins.blockersLabel'), answer: form.blockers }
      ].filter(a => !!a.answer)
    }

    await checkInsRepo.create(checkin)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.checkins.logCheckinTitle')}>
      <form onSubmit={save} className="space-y-4">
        <div><Label>{t('clients.checkins.dateLabel')}</Label><Input 
          type="date" required
          value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} 
        /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>{t('clients.checkins.sleepLabel')}</Label><Input 
            type="number" step="0.5" 
            value={form.sleepHours} onChange={e => setForm({ ...form, sleepHours: e.target.value })} 
          /></div>
          <div><Label>{t('clients.checkins.weightLabel')}</Label><Input 
            type="number" step="0.1" 
            value={form.bodyweight} onChange={e => setForm({ ...form, bodyweight: e.target.value })} 
          /></div>
          <div><Label>{t('clients.checkins.moodLabel')}</Label><Input 
            type="number" min="1" max="10" 
            value={form.mood} onChange={e => setForm({ ...form, mood: e.target.value })} 
          /></div>
          <div><Label>{t('clients.checkins.energyLabel')}</Label><Input 
            type="number" min="1" max="10" 
            value={form.energy} onChange={e => setForm({ ...form, energy: e.target.value })} 
          /></div>
          <div><Label>{t('clients.checkins.adherenceLabel')}</Label><Input 
            type="number" min="0" max="100" 
            value={form.adherence} onChange={e => setForm({ ...form, adherence: e.target.value })} 
          /></div>
        </div>
        
        <div>
          <Label>{t('clients.checkins.winsLabel')}</Label>
          <textarea 
            className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1" 
            rows={2} 
            value={form.wins} onChange={e => setForm({ ...form, wins: e.target.value })} 
          />
        </div>
        <div>
          <Label>{t('clients.checkins.blockersLabel')}</Label>
          <textarea 
            className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1" 
            rows={2} 
            value={form.blockers} onChange={e => setForm({ ...form, blockers: e.target.value })} 
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>{t('clients.checkins.cancelBtn')}</Button>
          <Button type="submit" variant="primary">{t('clients.checkins.saveCheckinBtn')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function CheckInsTab({ clientId }: CheckInsTabProps) {
  const checkins = useLiveQuery(
    async () => {
      const all = await checkInsRepo.table.where('clientId').equals(clientId).sortBy('date')
      return all.reverse()
    },
    [clientId],
    []
  )
  const { t } = useTranslation()

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{t('clients.checkins.title')}</h3>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="me-1.5" /> {t('clients.checkins.logCheckinTitle')}
        </Button>
      </div>

      <HabitsCard clientId={clientId} />

      {checkins.length === 0 ? (
        <EmptyState
          icon={<Inbox size={28} strokeWidth={1.5} />}
          title={t('clients.checkins.noCheckinsTitle')}
          body={t('clients.checkins.noCheckinsBody')}
        />
      ) : (
        <div className="space-y-4">
          {/* The whole history, not just the latest — v2 scores against this
              client's own baseline, so it needs the run to compare with. */}
          <ReadinessCard checkIns={checkins} />
          {checkins.map(c => (
            <Card key={c.id}>
              <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
                <div className="font-medium">{c.date}</div>
                <div className="text-xs text-faint uppercase px-2 py-0.5 bg-line rounded">{c.source}</div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {c.sleepHours !== undefined && <div><div className="text-xs text-faint">Sleep</div><div className="font-medium">{c.sleepHours} hrs</div></div>}
                {c.bodyweight !== undefined && <div><div className="text-xs text-faint">Weight</div><div className="font-medium">{c.bodyweight}</div></div>}
                {c.mood !== undefined && <div><div className="text-xs text-faint">Mood</div><div className="font-medium">{c.mood}/10</div></div>}
                {c.energy !== undefined && <div><div className="text-xs text-faint">Energy</div><div className="font-medium">{c.energy}/10</div></div>}
                {c.adherence !== undefined && <div><div className="text-xs text-faint">Adherence</div><div className="font-medium">{c.adherence}%</div></div>}
              </div>

              {c.answers && c.answers.length > 0 && (
                <div className="space-y-3 bg-surface2 p-3 rounded border border-line">
                  {c.answers.map((ans, i) => (
                    <div key={i}>
                      <div className="text-xs font-semibold text-faint uppercase">{ans.question}</div>
                      <div className="text-sm mt-0.5 whitespace-pre-wrap">{ans.answer}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Per-open mount: a fresh form each time, not the last check-in's values. */}
      {dialogOpen && <LogCheckInDialog clientId={clientId} open onClose={() => setDialogOpen(false)} />}
    </div>
  )
}
