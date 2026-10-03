import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { GripVertical, Trash2, Plus, Link2, Unlink } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ExercisePrescription, SetPrescription } from '@/db/types'
import { exercisesRepo } from '@/db/repo'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from '@/lib/i18n'

interface ExerciseRowProps {
  blockId: string
  exercise: ExercisePrescription
  updateExercise: (exId: string, updates: Partial<ExercisePrescription>) => void
  removeExercise: (exId: string) => void
  onToggleSuperset?: () => void
  inSuperset?: boolean
  canJoin?: boolean
}

export default function ExerciseRow({
  blockId,
  exercise,
  updateExercise,
  removeExercise,
  onToggleSuperset,
  inSuperset,
  canJoin,
}: ExerciseRowProps) {
  const { t } = useTranslation()
  const exDef = useLiveQuery(() => exercisesRepo.get(exercise.exerciseId), [exercise.exerciseId])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id, data: { type: 'exercise', blockId } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  }

  const updateSet = (setIndex: number, updates: Partial<SetPrescription>) => {
    const newSets = [...exercise.sets]
    newSets[setIndex] = { ...newSets[setIndex], ...updates }
    updateExercise(exercise.id, { sets: newSets })
  }

  const addSet = () => {
    const lastSet = exercise.sets[exercise.sets.length - 1] || { reps: '10', loadMode: 'absolute' }
    updateExercise(exercise.id, { sets: [...exercise.sets, { ...lastSet }] })
  }

  const removeSet = (index: number) => {
    const newSets = exercise.sets.filter((_, i) => i !== index)
    updateExercise(exercise.id, { sets: newSets })
  }

  // Keyboard navigation (Spreadsheet style)
  const rowRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // ⌘↑/⌘↓ move exercise, S toggles superset — done at the block level or bubbled up?
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onToggleSuperset?.()
      return
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const inputs = Array.from(rowRef.current?.querySelectorAll('input') || [])
      const currentIndex = inputs.indexOf(e.currentTarget)
      if (currentIndex === -1) return

      let nextIndex = currentIndex
      const columns = 2 // reps, load (ignoring RPE for simplicity in basic nav, adjust if added)

      if (e.key === 'ArrowRight') nextIndex += 1
      if (e.key === 'ArrowLeft') nextIndex -= 1
      if (e.key === 'ArrowDown') nextIndex += columns
      if (e.key === 'ArrowUp') nextIndex -= columns

      if (nextIndex >= 0 && nextIndex < inputs.length) {
        e.preventDefault()
        inputs[nextIndex].focus()
        // Select all text to mimic spreadsheet replace behavior
        setTimeout(() => inputs[nextIndex].select(), 0)
      }
    }
  }

  if (!exDef) return null

  return (
    <div ref={setNodeRef} style={style} className="group relative bg-surface border border-line rounded-md mb-2 overflow-hidden shadow-sm">
      <div className="flex">
        {/* Drag Handle */}
        <div 
          {...attributes} 
          {...listeners}
          aria-label={t('builder.dragHandle')}
          className="w-8 flex-none bg-surface2 border-e border-line flex items-center justify-center cursor-grab active:cursor-grabbing text-faint hover:text-ink"
        >
          <GripVertical size={14} />
        </div>

        {/* Content */}
        <div className="flex-1" ref={rowRef}>
          {/* Header */}
          <div className="px-3 py-2 flex items-center justify-between border-b border-line/50">
            <span className="font-semibold text-ink text-sm">{exDef.name}</span>
            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-2 transition-opacity">
              {onToggleSuperset && (inSuperset || canJoin) && (
                <button
                  title={inSuperset ? t('builder.splitSuperset') : t('builder.joinSuperset')}
                  aria-label={inSuperset ? t('builder.splitSuperset') : t('builder.joinSuperset')}
                  onClick={onToggleSuperset}
                  className="text-muted hover:text-verde-600"
                >
                  {inSuperset ? <Unlink size={14} /> : <Link2 size={14} />}
                </button>
              )}
               <button title={t('builder.removeExercise')} aria-label={t('builder.removeExercise')} onClick={() => removeExercise(exercise.id)} className="text-muted hover:text-ember-600">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Sets Table */}
          <div className="p-2 space-y-1">
            <div className="flex text-xs font-medium text-faint px-2 mb-1">
              <div className="w-8">{t('builder.col.set')}</div>
              <div className="flex-1 max-w-[120px]">{t('builder.col.reps')}</div>
              <div className="flex-1 max-w-[120px]">{t('builder.col.load')}</div>
              <div className="w-8"></div>
            </div>

            {exercise.sets.map((set, i) => (
              <div key={i} className="flex items-center gap-2 px-2">
                <div className="w-8 text-xs font-mono text-muted">{i + 1}</div>
                <div className="flex-1 max-w-[120px]">
                  <input
                    type="text"
                    value={set.reps || ''}
                    onChange={e => updateSet(i, { reps: e.target.value })}
                    onKeyDown={e => handleKeyDown(e)}
                    className="w-full h-8 px-2 text-sm font-mono bg-surface2 border border-line rounded-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none transition-all placeholder:text-muted/40"
                    placeholder={t('builder.repsPlaceholder')}
                    aria-label={t('builder.setReps', { n: i + 1 })}
                  />
                </div>
                <div className="flex-1 max-w-[120px]">
                  <input
                    type="number"
                    value={set.load ?? ''}
                    onChange={e => updateSet(i, { load: e.target.value === '' ? undefined : Number(e.target.value) })}
                    onKeyDown={e => handleKeyDown(e)}
                    className="w-full h-8 px-2 text-sm font-mono bg-surface2 border border-line rounded-sm focus:border-ink focus:ring-1 focus:ring-ink outline-none transition-all placeholder:text-muted/40"
                    placeholder={t('builder.loadPlaceholder')}
                    aria-label={t('builder.setLoad', { n: i + 1 })}
                  />
                </div>
                <div className="w-8 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <button onClick={() => removeSet(i)} aria-label={t('builder.removeSet', { n: i + 1 })} className="text-muted hover:text-ember-600 p-1">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}

            <div className="px-2 pt-1">
              <button onClick={addSet} className="text-xs font-medium text-muted hover:text-ink flex items-center gap-1 transition-colors">
                <Plus size={12} /> {t('builder.addSet')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
