import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, X, Trash2 } from 'lucide-react'
import { exercisesRepo } from '@/db/repo'
import type { Day, ExercisePrescription, Program, SetPrescription } from '@/db/types'
import { Button, EmptyState } from '@/design'
import { makeBlock, makeExercisePrescription } from './builderMutations'
import { summarizeBlock } from './gridFormat'
import ExerciseSearch from './ExerciseSearch'
import { useTranslation } from '@/lib/i18n'

interface GridViewProps {
  draft: Program
  weekId: string | null
  commitChange: (newDraft: Program) => void
  onSelectDay: (dayId: string) => void
}

interface TargetCell { dayId: string; rowIndex: number }
interface ExpandedCell { dayId: string; blockId: string }

export default function GridView({ draft, weekId, commitChange, onSelectDay }: GridViewProps) {
  const exercises = useLiveQuery(() => exercisesRepo.all(), [], [])
  const { t } = useTranslation()
  const nameMap = useMemo(() => new Map(exercises.map(e => [e.id, e.name])), [exercises])

  const [searchOpen, setSearchOpen] = useState(false)
  const [targetCell, setTargetCell] = useState<TargetCell | null>(null)
  const [expandedCell, setExpandedCell] = useState<ExpandedCell | null>(null)

  const week = draft.weeks.find(w => w.id === weekId) ?? null

  function updateDay(dayId: string, newDay: Day) {
    if (!week) return
    const newWeeks = draft.weeks.map(w =>
      w.id === week.id ? { ...w, days: w.days.map(d => (d.id === dayId ? newDay : d)) } : w,
    )
    commitChange({ ...draft, weeks: newWeeks })
  }

  function handleCellClick(day: Day, rowIndex: number) {
    const existingBlock = day.blocks[rowIndex]
    if (existingBlock && existingBlock.exercises.length > 0) {
      if (existingBlock.exercises.length === 1) {
        setExpandedCell(c =>
          c?.dayId === day.id && c?.blockId === existingBlock.id ? null : { dayId: day.id, blockId: existingBlock.id },
        )
      } else {
        // Supersets/circuits are edited in full in Day view — Grid view's
        // inline panel only handles the common single-exercise case.
        onSelectDay(day.id)
      }
      return
    }
    if (existingBlock || rowIndex === day.blocks.length) {
      setTargetCell({ dayId: day.id, rowIndex })
      setSearchOpen(true)
    }
    // rowIndex > day.blocks.length with no block there: inert padding cell.
  }

  function handleAddExercise(exerciseDefId: string) {
    if (!targetCell || !week) return
    const day = week.days.find(d => d.id === targetCell.dayId)
    if (!day) return
    const existingBlock = day.blocks[targetCell.rowIndex]
    const newEx = makeExercisePrescription(exerciseDefId)
    const newBlocks = existingBlock
      ? day.blocks.map((b, i) => (i === targetCell.rowIndex ? { ...b, exercises: [...b.exercises, newEx] } : b))
      : [...day.blocks, { ...makeBlock(), exercises: [newEx] }]
    updateDay(day.id, { ...day, blocks: newBlocks })
    setSearchOpen(false)
    setTargetCell(null)
  }

  function updateExercise(dayId: string, blockId: string, exId: string, updates: Partial<ExercisePrescription>) {
    const day = week?.days.find(d => d.id === dayId)
    if (!day) return
    const newBlocks = day.blocks.map(b =>
      b.id === blockId ? { ...b, exercises: b.exercises.map(e => (e.id === exId ? { ...e, ...updates } : e)) } : b,
    )
    updateDay(dayId, { ...day, blocks: newBlocks })
  }

  if (!week || week.days.length === 0) {
    return (
      <EmptyState
        icon={<Plus size={28} strokeWidth={1.25} />}
        title={t('builder.grid.emptyTitle')}
        body={t('builder.grid.emptyBody')}
      />
    )
  }

  const rowCount = Math.max(1, ...week.days.map(d => d.blocks.length))

  const expandedDay = expandedCell ? week.days.find(d => d.id === expandedCell.dayId) : undefined
  const expandedBlock = expandedDay?.blocks.find(b => b.id === expandedCell?.blockId)
  const expandedEx = expandedBlock?.exercises[0]

  return (
    <div className="h-full overflow-auto pb-8">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {week.days.map(day => (
              <th key={day.id} className="border-b border-line px-2 py-2 text-start">
                <button
                  type="button"
                  onClick={() => onSelectDay(day.id)}
                  className="text-xs font-semibold uppercase tracking-wide text-faint hover:text-ink"
                  title={t('builder.grid.openDay')}
                >
                  {day.name}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {week.days.map(day => {
                const block = day.blocks[rowIndex]
                const clickable = !!block || rowIndex === day.blocks.length
                const isExpanded = !!block && expandedCell?.dayId === day.id && expandedCell?.blockId === block.id
                return (
                  <td key={day.id} className="border-b border-line/50 p-1.5 align-top">
                    {block && block.exercises.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleCellClick(day, rowIndex)}
                        className={`w-full rounded-ctl border px-2.5 py-2 text-start transition-colors ${
                          isExpanded ? 'border-verde-600 bg-verde-100/60' : 'border-line bg-surface hover:border-verde-600/40'
                        }`}
                      >
                        <div className="truncate text-sm font-medium text-ink">
                          {block.exercises.map(e => nameMap.get(e.exerciseId) || '…').join(' + ')}
                        </div>
                        <div className="mt-0.5 truncate text-2xs text-faint">{summarizeBlock(block)}</div>
                      </button>
                    ) : clickable ? (
                      <button
                        type="button"
                        onClick={() => handleCellClick(day, rowIndex)}
                        aria-label={t('builder.grid.addCell', { day: day.name })}
                        className="flex w-full items-center justify-center rounded-ctl border border-dashed border-line py-2 text-faint hover:border-verde-600/40 hover:text-verde-600"
                      >
                        <Plus size={14} />
                      </button>
                    ) : (
                      <div className="h-9" />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {expandedDay && expandedBlock && expandedEx && (
        <div className="mx-1.5 mt-3 rounded-card border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-faint">{expandedDay.name}</p>
              <p className="text-sm font-semibold text-ink">{nameMap.get(expandedEx.exerciseId) || '…'}</p>
            </div>
            <button type="button" onClick={() => setExpandedCell(null)} aria-label={t('builder.grid.close')} className="text-faint hover:text-ink">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex text-2xs font-medium text-faint">
              <div className="w-8">{t('builder.col.set')}</div>
              <div className="flex-1 max-w-[120px]">{t('builder.col.reps')}</div>
              <div className="flex-1 max-w-[120px]">{t('builder.col.load')}</div>
              <div className="w-8" />
            </div>
            {expandedEx.sets.map((set: SetPrescription, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 text-xs font-mono text-muted">{i + 1}</div>
                <div className="flex-1 max-w-[120px]">
                  <input
                    type="text"
                    value={set.reps || ''}
                    onChange={e => {
                      const newSets = [...expandedEx.sets]
                      newSets[i] = { ...newSets[i], reps: e.target.value }
                      updateExercise(expandedDay.id, expandedBlock.id, expandedEx.id, { sets: newSets })
                    }}
                    className="h-8 w-full rounded-sm border border-line bg-surface2 px-2 font-mono text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
                    placeholder={t('builder.repsPlaceholder')}
                    aria-label={t('builder.setReps', { n: i + 1 })}
                  />
                </div>
                <div className="flex-1 max-w-[120px]">
                  <input
                    type="number"
                    value={set.load ?? ''}
                    onChange={e => {
                      const newSets = [...expandedEx.sets]
                      newSets[i] = { ...newSets[i], load: e.target.value === '' ? undefined : Number(e.target.value) }
                      updateExercise(expandedDay.id, expandedBlock.id, expandedEx.id, { sets: newSets })
                    }}
                    className="h-8 w-full rounded-sm border border-line bg-surface2 px-2 font-mono text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
                    placeholder={t('builder.loadPlaceholder')}
                    aria-label={t('builder.setLoad', { n: i + 1 })}
                  />
                </div>
                <div className="w-8">
                  {expandedEx.sets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newSets = expandedEx.sets.filter((_, idx) => idx !== i)
                        updateExercise(expandedDay.id, expandedBlock.id, expandedEx.id, { sets: newSets })
                      }}
                      aria-label={t('builder.removeSet', { n: i + 1 })}
                      className="p-1 text-faint hover:text-ember-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const last = expandedEx.sets[expandedEx.sets.length - 1] || { reps: '10', loadMode: 'absolute' as const }
                updateExercise(expandedDay.id, expandedBlock.id, expandedEx.id, { sets: [...expandedEx.sets, { ...last }] })
              }}
              className="mt-1 text-faint hover:text-ink"
            >
              <Plus size={12} className="me-1" /> {t('builder.addSet')}
            </Button>
          </div>
          <p className="mt-3 text-2xs text-faint">
            {t('builder.grid.moreHint')}{' '}
            <button type="button" onClick={() => onSelectDay(expandedDay.id)} className="font-medium text-verde-600 hover:underline">
              {t('builder.grid.openDay')}
            </button>
            .
          </p>
        </div>
      )}

      <ExerciseSearch open={searchOpen} onClose={() => { setSearchOpen(false); setTargetCell(null) }} onSelect={ex => handleAddExercise(ex.id)} />
    </div>
  )
}
