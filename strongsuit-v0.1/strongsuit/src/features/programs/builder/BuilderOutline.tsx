import { useState } from 'react'
import { Plus, Copy, Trash2 } from 'lucide-react'
import type { Program, Week, ExercisePrescription } from '@/db/types'
import { newId } from '@/lib/core'
import { Button, Dialog, Field, Select } from '@/design'
import { useTranslation } from '@/lib/i18n'
import { progressSet, type WeekProgression } from './builderMutations'

interface BuilderOutlineProps {
  draft: Program
  commitChange: (newDraft: Program) => void
  activeDayId: string | null
  setActiveDayId: (id: string | null) => void
}

export default function BuilderOutline({
  draft,
  commitChange,
  activeDayId,
  setActiveDayId
}: BuilderOutlineProps) {
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [weekToDuplicate, setWeekToDuplicate] = useState<Week | null>(null)
  const [progressionMode, setProgressionMode] = useState<WeekProgression>('none')
  const { t } = useTranslation()

  const addWeek = () => {
    const wId = newId()
    const dId = newId()
    const newWeek: Week = {
      id: wId,
      label: t('builder.weekN', { n: draft.weeks.length + 1 }),
      days: [
        {
          id: dId,
          name: t('builder.dayN', { n: 1 }),
          blocks: []
        }
      ]
    }
    commitChange({
      ...draft,
      weeks: [...draft.weeks, newWeek]
    })
    setActiveDayId(dId)
  }

  const addDay = (weekId: string) => {
    const dId = newId()
    commitChange({
      ...draft,
      weeks: draft.weeks.map(w => {
        if (w.id === weekId) {
          return {
            ...w,
            days: [
              ...w.days,
              {
                id: dId,
                name: t('builder.dayN', { n: w.days.length + 1 }),
                blocks: []
              }
            ]
          }
        }
        return w
      })
    })
    setActiveDayId(dId)
  }

  const openDuplicateDialog = (week: Week) => {
    setWeekToDuplicate(week)
    setDuplicateOpen(true)
  }

  const executeDuplicate = () => {
    if (!weekToDuplicate) return
    const week = weekToDuplicate
    
    const newWeekId = newId()
    const clonedWeek: Week = {
      ...structuredClone(week),
      id: newWeekId,
      label: t('builder.copyOf', { label: week.label })
    }
    
    // Re-key and optionally progress
    clonedWeek.days = clonedWeek.days.map(d => ({
      ...d, id: newId(),
      blocks: d.blocks.map(b => ({
        ...b, id: newId(),
        exercises: b.exercises.map(e => {
          const newEx: ExercisePrescription = { ...e, id: newId(), sets: e.sets.map(s => progressSet(s, progressionMode)) }
          return newEx
        })
      }))
    }))

    commitChange({
      ...draft,
      weeks: [...draft.weeks, clonedWeek]
    })
    
    if (clonedWeek.days.length > 0) {
      setActiveDayId(clonedWeek.days[0].id)
    }
    setDuplicateOpen(false)
    setWeekToDuplicate(null)
  }

  const deleteWeek = (week: Week) => {
    if (!window.confirm(t('builder.confirmDeleteWeek', { label: week.label }))) return
    const weekId = week.id
    const newWeeks = draft.weeks.filter(w => w.id !== weekId)
    commitChange({ ...draft, weeks: newWeeks })
    
    // If active day was in the deleted week, reset active day
    const activeDayExists = newWeeks.some(w => w.days.some(d => d.id === activeDayId))
    if (!activeDayExists) {
      const firstDay = newWeeks[0]?.days[0]
      setActiveDayId(firstDay ? firstDay.id : null)
    }
  }

  const deleteDay = (weekId: string, dayId: string, name: string) => {
    if (!window.confirm(t('builder.confirmDeleteDay', { name }))) return
    const newWeeks = draft.weeks.map(w => {
      if (w.id === weekId) {
        return { ...w, days: w.days.filter(d => d.id !== dayId) }
      }
      return w
    })
    commitChange({ ...draft, weeks: newWeeks })
    if (activeDayId === dayId) {
      const firstDay = newWeeks[0]?.days[0]
      setActiveDayId(firstDay ? firstDay.id : null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 font-semibold text-sm text-ink border-b border-line flex items-center justify-between">
        <span>{t('builder.outline')}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {draft.weeks.map((week) => (
          <div key={week.id} className="space-y-1">
            <div className="flex items-center justify-between group px-2 py-1 rounded-sm hover:bg-surface2 transition-colors">
              <span className="text-sm font-semibold text-ink">{week.label}</span>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                <button title={t('builder.duplicateWeek')} aria-label={t('builder.duplicateWeek')} onClick={() => openDuplicateDialog(week)} className="text-muted hover:text-ink">
                  <Copy size={13} />
                </button>
                <button title={t('builder.deleteWeek')} aria-label={t('builder.deleteWeek')} onClick={() => deleteWeek(week)} className="text-muted hover:text-ember-600">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="ps-3 border-s-2 border-line/50 ms-2 space-y-0.5">
              {week.days.map((day) => {
                const isActive = day.id === activeDayId
                return (
                  <div 
                    key={day.id} 
                    onClick={() => setActiveDayId(day.id)}
                    className={`group flex items-center justify-between px-2 py-1 rounded-sm cursor-pointer transition-colors text-sm ${
                      isActive 
                        ? 'bg-verde-100 text-verde-700 font-medium'
                        : 'text-muted hover:bg-surface2 hover:text-ink'
                    }`}
                  >
                    <span>{day.name}</span>
                    <button 
                      title={t('builder.deleteDay')}
                      aria-label={t('builder.deleteDay')}
                      onClick={(e) => { e.stopPropagation(); deleteDay(week.id, day.id, day.name) }}
                      className={`opacity-0 group-hover:opacity-100 text-muted hover:text-ember-600 transition-opacity ${isActive ? 'hover:text-verde-700' : ''}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
              
              <button 
                onClick={() => addDay(week.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-faint hover:text-ink transition-colors mt-1"
              >
                <Plus size={12} /> {t('builder.addDay')}
              </button>
            </div>
          </div>
        ))}

        <div className="px-2 pt-2">
          <Button variant="ghost" size="sm" onClick={addWeek} className="w-full text-faint hover:text-ink">
            <Plus size={14} className="me-1.5" /> {t('builder.addWeek')}
          </Button>
        </div>
      </div>

      <Dialog open={duplicateOpen} onClose={() => setDuplicateOpen(false)} title={t('builder.dup.title')} width={400}>
        <div className="space-y-4">
          <Field label={t('builder.dup.progression')}>
            <Select value={progressionMode} onChange={e => setProgressionMode(e.target.value as WeekProgression)}>
              <option value="none">{t('builder.dup.none')}</option>
              <option value="load">{t('builder.dup.load')}</option>
              <option value="reps">{t('builder.dup.reps')}</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setDuplicateOpen(false)}>{t('builder.cancel')}</Button>
            <Button variant="primary" onClick={executeDuplicate}>{t('builder.dup.go')}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
