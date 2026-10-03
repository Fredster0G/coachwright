import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button, Card, EmptyState, Input, Label, PageHeader } from '@/design'
import { workoutsRepo } from '@/db/repo'
import { today } from '@/lib/core'
import type { ExerciseSet, PersonalWorkout } from '@/db/types'

interface DraftExercise { name: string; sets: ExerciseSet[] }

function NewWorkoutForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today())
  const [exercises, setExercises] = useState<DraftExercise[]>([{ name: '', sets: [{ reps: 0 }] }])

  function setExercise(i: number, patch: Partial<DraftExercise>) {
    setExercises(ex => ex.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  }
  function setSet(i: number, si: number, patch: Partial<ExerciseSet>) {
    setExercises(ex => ex.map((e, idx) => (idx === i ? { ...e, sets: e.sets.map((s, sidx) => (sidx === si ? { ...s, ...patch } : s)) } : e)))
  }
  function addSet(i: number) {
    setExercises(ex => ex.map((e, idx) => (idx === i ? { ...e, sets: [...e.sets, { reps: 0 }] } : e)))
  }
  function addExercise() {
    setExercises(ex => [...ex, { name: '', sets: [{ reps: 0 }] }])
  }
  function removeExercise(i: number) {
    setExercises(ex => ex.filter((_, idx) => idx !== i))
  }

  async function save() {
    const cleaned = exercises.filter(e => e.name.trim())
    if (!cleaned.length) return
    await workoutsRepo.create({ date, title: title.trim() || 'Workout', exercises: cleaned })
    onSaved()
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-ink">New workout</h2>
        <button onClick={onCancel} aria-label="Cancel" className="-m-2 flex h-11 w-11 items-center justify-center p-2"><X size={18} className="text-faint" /></button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Push day" />
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        {exercises.map((ex, i) => (
          <div key={i} className="rounded-ctl border border-line p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Input value={ex.name} onChange={e => setExercise(i, { name: e.target.value })} placeholder="Exercise name" className="flex-1" />
              {exercises.length > 1 && (
                <button onClick={() => removeExercise(i)} aria-label="Remove exercise" className="-m-1 flex h-10 w-10 shrink-0 items-center justify-center p-1"><Trash2 size={15} className="text-faint hover:text-ember-600" /></button>
              )}
            </div>
            <div className="space-y-1.5">
              {ex.sets.map((s, si) => (
                <div key={si} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-mono tnum text-faint">{si + 1}</span>
                  <Input type="number" inputMode="numeric" value={s.reps || ''} onChange={e => setSet(i, si, { reps: Number(e.target.value) })} placeholder="reps" className="flex-1" />
                  <Input type="number" inputMode="decimal" value={s.load ?? ''} onChange={e => setSet(i, si, { load: Number(e.target.value) || undefined })} placeholder="load" className="flex-1" />
                  <Input type="number" inputMode="decimal" value={s.rpe ?? ''} onChange={e => setSet(i, si, { rpe: Number(e.target.value) || undefined })} placeholder="RPE" className="w-16" />
                </div>
              ))}
            </div>
            <button onClick={() => addSet(i)} className="mt-1.5 text-2xs text-verde-600 hover:underline">+ add set</button>
          </div>
        ))}
      </div>

      <Button variant="ghost" onClick={addExercise} className="mt-2 w-full"><Plus size={14} /> Add exercise</Button>
      <Button variant="primary" onClick={save} className="mt-3 w-full">Save workout</Button>
    </Card>
  )
}

export function LogPage() {
  const [workouts, setWorkouts] = useState<PersonalWorkout[]>([])
  const [adding, setAdding] = useState(false)

  const refresh = () => { workoutsRepo.all().then(setWorkouts) }
  useEffect(() => { refresh() }, [])

  async function remove(id: string) {
    // The coach's copy isn't deleted (Companion uploads, never deletes) — say so.
    if (!window.confirm('Delete this workout from this phone? If it already synced, your coach still has their copy.')) return
    await workoutsRepo.remove(id)
    refresh()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Training" title="Log"
        action={!adding ? <Button variant="primary" onClick={() => setAdding(true)}><Plus size={14} /> New</Button> : undefined}
      />

      {adding && <NewWorkoutForm onSaved={() => { setAdding(false); refresh() }} onCancel={() => setAdding(false)} />}

      {!adding && (workouts.length === 0 ? (
        <EmptyState title="No workouts logged yet" body="Tap New to record what you did today." />
      ) : (
        <div className="space-y-2">
          {workouts.map(w => (
            <Card key={w.id}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{w.title}</span>
                <div className="flex items-center gap-1">
                  <span className="text-2xs text-faint">{w.date}</span>
                  <button onClick={() => remove(w.id)} aria-label="Delete workout" className="-m-1 flex h-10 w-10 items-center justify-center p-1"><Trash2 size={14} className="text-faint hover:text-ember-600" /></button>
                </div>
              </div>
              <div className="space-y-0.5">
                {w.exercises.map((ex, i) => (
                  <p key={i} className="text-xs text-muted">
                    {ex.name} — {ex.sets.map(s => `${s.reps}${s.load ? `×${s.load}` : ''}`).join(', ')}
                  </p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  )
}
