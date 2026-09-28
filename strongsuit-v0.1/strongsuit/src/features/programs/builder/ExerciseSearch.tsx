import { useState, useMemo, useEffect } from 'react'
import { Search } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { exercisesRepo } from '@/db/repo'
import type { Exercise } from '@/db/types'
import { createFuzzyIndex } from '@/lib/fuzzy'
import { Dialog, Tag } from '@/design'

interface ExerciseSearchProps {
  open: boolean
  onClose: () => void
  onSelect: (exercise: Exercise) => void
}

export default function ExerciseSearch({ open, onClose, onSelect }: ExerciseSearchProps) {
  const [query, setQuery] = useState('')
  const exercises = useLiveQuery(() => exercisesRepo.all(), [], undefined)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  const searcher = useMemo(() => {
    return createFuzzyIndex(exercises || [], e => [e.name, ...e.aliases])
  }, [exercises])

  const results = useMemo(() => {
    if (!exercises) return []
    if (!query.trim()) return exercises.slice(0, 20) // Show first 20 by default
    return searcher(query).slice(0, 20).map(r => r.item)
  }, [query, searcher, exercises])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex])
      }
    }
  }

  // Effect to ensure selectedIndex stays in bounds when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results.length])

  return (
    <Dialog open={open} onClose={onClose} title="Add Exercise" width={480}>
      <div className="relative border-b border-line">
        <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="exercise-search-results"
          aria-activedescendant={results[selectedIndex] ? `exercise-option-${results[selectedIndex].id}` : undefined}
          aria-label="Search exercises"
          className="w-full bg-transparent py-3 ps-9 pe-3 text-sm text-ink outline-none placeholder:text-muted"
          placeholder="Search exercises (e.g. 'rdl')..."
        />
      </div>

      <div className="max-h-[60vh] overflow-y-auto py-2">
        {results.length === 0 ? (
          <div className="py-8 text-center text-sm text-faint">
            No exercises found.
          </div>
        ) : (
          <div className="px-1" role="listbox" id="exercise-search-results" aria-label="Exercises">
            {results.map((ex, idx) => (
              <div
                key={ex.id}
                id={`exercise-option-${ex.id}`}
                role="option"
                aria-selected={idx === selectedIndex}
                onClick={() => onSelect(ex)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
                  idx === selectedIndex ? 'bg-verde-100 text-verde-700' : 'hover:bg-surface2 text-ink'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{ex.name}</span>
                  {ex.aliases.length > 0 && (
                    <span className="text-xs opacity-60">aka: {ex.aliases.join(', ')}</span>
                  )}
                </div>
                <Tag tone={idx === selectedIndex ? 'verde' : 'neutral'}>{ex.category}</Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
