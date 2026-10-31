import { useState, useMemo, useEffect } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Program, Day, ExercisePrescription } from '@/db/types'
import { Button, EmptyState } from '@/design'
import { Plus } from 'lucide-react'
import ExerciseRow from './ExerciseRow'
import ExerciseSearch from './ExerciseSearch'
import { makeBlock, makeExercisePrescription } from './builderMutations'
import { useTranslation } from '@/lib/i18n'

interface DayCanvasProps {
  draft: Program
  dayId: string
  commitChange: (newDraft: Program) => void
}

export default function DayCanvas({ draft, dayId, commitChange }: DayCanvasProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [targetBlockId, setTargetBlockId] = useState<string | null>(null)
  const { t } = useTranslation()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const day = useMemo(() => {
    for (const w of draft.weeks) {
      for (const d of w.days) {
        if (d.id === dayId) return d
      }
    }
    return null
  }, [draft, dayId])

  // Find week to allow full update
  const getWeekId = () => {
    for (const w of draft.weeks) {
      if (w.days.some(d => d.id === dayId)) return w.id
    }
    return null
  }

  const updateDay = (newDay: Day) => {
    const weekId = getWeekId()
    if (!weekId) return
    const newWeeks = draft.weeks.map(w => {
      if (w.id === weekId) {
        return { ...w, days: w.days.map(d => d.id === dayId ? newDay : d) }
      }
      return w
    })
    commitChange({ ...draft, weeks: newWeeks })
  }

  // Keyboard listener for `/` to add exercise to the last block
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (!day) return
      // Don't intercept if user is typing in an input/textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      
      if (e.key === '/') {
        e.preventDefault()
        if (day.blocks.length === 0) {
          // Create block implicitly
          const newBlock = makeBlock()
          updateDay({ ...day, blocks: [...day.blocks, newBlock] })
          setTargetBlockId(newBlock.id)
        } else {
          setTargetBlockId(day.blocks[day.blocks.length - 1].id)
        }
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  if (!day) {
    return <div className="p-8 text-faint">{t('builder.dayNotFound')}</div>
  }



  const addBlock = () => {
    updateDay({ ...day, blocks: [...day.blocks, makeBlock()] })
  }

  const handleAddExercise = (exerciseDefId: string) => {
    if (!targetBlockId) return
    const newEx = makeExercisePrescription(exerciseDefId)
    const newBlocks = day.blocks.map(b => {
      if (b.id === targetBlockId) {
        return { ...b, exercises: [...b.exercises, newEx] }
      }
      return b
    })
    updateDay({ ...day, blocks: newBlocks })
    setSearchOpen(false)
  }

  const updateExercise = (blockId: string, exId: string, updates: Partial<ExercisePrescription>) => {
    const newBlocks = day.blocks.map(b => {
      if (b.id === blockId) {
        return {
          ...b,
          exercises: b.exercises.map(e => e.id === exId ? { ...e, ...updates } : e)
        }
      }
      return b
    })
    updateDay({ ...day, blocks: newBlocks })
  }

  // Supersets had no way to be made (the row's ⌘S hook was never wired, and
  // dragging between blocks is a no-op). Joining moves a lone exercise into
  // the block above; splitting moves it out into its own block below.
  const canJoin = (blockId: string) => day.blocks.findIndex(b => b.id === blockId) > 0
  const toggleSuperset = (blockId: string, exId: string) => {
    const idx = day.blocks.findIndex(b => b.id === blockId)
    const block = day.blocks[idx]
    const ex = block?.exercises.find(e => e.id === exId)
    if (!block || !ex) return
    const blocks = [...day.blocks]
    if (block.exercises.length > 1) {
      const rest = block.exercises.filter(e => e.id !== exId)
      blocks[idx] = { ...block, exercises: rest, type: rest.length > 1 ? block.type : 'straight' }
      blocks.splice(idx + 1, 0, { ...makeBlock(), exercises: [ex] })
    } else if (idx > 0) {
      const prev = blocks[idx - 1]
      blocks[idx - 1] = { ...prev, type: prev.type === 'straight' ? 'superset' : prev.type, exercises: [...prev.exercises, ex] }
      blocks.splice(idx, 1)
    } else return
    updateDay({ ...day, blocks })
  }

  const removeExercise = (blockId: string, exId: string) => {
    const newBlocks = day.blocks.map(b => {
      if (b.id === blockId) {
        return { ...b, exercises: b.exercises.filter(e => e.id !== exId) }
      }
      return b
    }).filter(b => b.exercises.length > 0 || b.id === targetBlockId) // Cleanup empty blocks unless we just added it
    updateDay({ ...day, blocks: newBlocks })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Find source and destination blocks
    const srcBlock = day.blocks.find(b => b.exercises.some(e => e.id === active.id))
    const dstBlock = day.blocks.find(b => b.exercises.some(e => e.id === over.id))

    if (!srcBlock || !dstBlock) return

    if (srcBlock.id === dstBlock.id) {
      // Reorder within the same block
      const oldIndex = srcBlock.exercises.findIndex(e => e.id === active.id)
      const newIndex = dstBlock.exercises.findIndex(e => e.id === over.id)
      const newExercises = arrayMove(srcBlock.exercises, oldIndex, newIndex)
      
      const newBlocks = day.blocks.map(b => b.id === srcBlock.id ? { ...b, exercises: newExercises } : b)
      updateDay({ ...day, blocks: newBlocks })
    } else {
      // Move between blocks (future expansion)
    }
  }

  return (
    <div className="max-w-3xl mx-auto h-full pb-32">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-ink">{day.name}</h2>
      </div>

      {day.blocks.length === 0 ? (
        <EmptyState
          icon={<Plus size={28} />}
          title={t('builder.emptyDay')}
          body={t('builder.emptyDayBody')}
          action={<Button variant="primary" onClick={() => {
            // Don't call addBlock() then read day.blocks — `day` is this
            // render's stale prop, so the just-added block wouldn't be in it
            // yet (updateDay hasn't round-tripped through Dexie). Build the
            // block here and target it directly instead.
            const newBlock = makeBlock()
            updateDay({ ...day, blocks: [...day.blocks, newBlock] })
            setTargetBlockId(newBlock.id)
            setSearchOpen(true)
          }}><Plus size={14} /> {t('builder.addExercise')}</Button>}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="space-y-6">
            {day.blocks.map(block => (
              <div key={block.id} className={`relative ${block.exercises.length > 1 ? 'rounded-card border-s-4 border-verde-600/50 ps-2' : ''}`}>
                {block.exercises.length > 1 && (
                  <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-verde-700">{t('builder.superset')}</p>
                )}
                <SortableContext items={block.exercises.map(e => e.id)} strategy={verticalListSortingStrategy}>
                  {block.exercises.map(ex => (
                    <ExerciseRow 
                      key={ex.id}
                      blockId={block.id}
                      exercise={ex}
                      updateExercise={(id, u) => updateExercise(block.id, id, u)}
                      removeExercise={(id) => removeExercise(block.id, id)}
                      inSuperset={block.exercises.length > 1}
                      canJoin={canJoin(block.id)}
                      onToggleSuperset={() => toggleSuperset(block.id, ex.id)}
                    />
                  ))}
                </SortableContext>
                
                <div className="mt-2">
                  <Button variant="ghost" size="sm" onClick={() => { setTargetBlockId(block.id); setSearchOpen(true); }} className="text-faint hover:text-ink">
                    <Plus size={14} className="me-1.5" /> {t('builder.addExercise')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DndContext>
      )}

      {/* Adding a new block entirely separate */}
      {day.blocks.length > 0 && (
        <div className="mt-8 pt-4 border-t border-line border-dashed">
          <Button variant="ghost" size="sm" onClick={addBlock} className="text-muted hover:text-ink">
            <Plus size={14} className="me-1.5" /> {t('builder.newBlock')}
          </Button>
        </div>
      )}

      <ExerciseSearch 
        open={searchOpen} 
        onClose={() => setSearchOpen(false)} 
        onSelect={(ex) => handleAddExercise(ex.id)} 
      />
    </div>
  )
}
