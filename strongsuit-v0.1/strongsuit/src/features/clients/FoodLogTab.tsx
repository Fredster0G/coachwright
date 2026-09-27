import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, Button } from '@/design'
import { foodEntriesRepo, foodItemsRepo, metricsRepo } from '@/db/repo'
import { today } from '@/lib/core'
import { nutritionPlan, ageFromBirthDate, toKg } from '@/lib/nutrition'
import { FoodScannerDialog } from '../nutrition/FoodScannerDialog'
import type { Client, FoodItem, FoodEntry, MealType } from '@/db/types'

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export default function FoodLogTab({ client }: { client: Client }) {
  const [date, setDate] = useState(today())
  const [scanMeal, setScanMeal] = useState<MealType | null>(null)

  // Targets calc
  const latestBw = useLiveQuery(async () => {
    const rows = await metricsRepo.table.where('[clientId+key]').equals([client.id, 'bodyweight']).sortBy('date')
    return rows.at(-1) ?? null
  }, [client.id])

  const age = client.birthDate ? ageFromBirthDate(client.birthDate) : null
  const effectiveGoal = client.nutritionGoal ?? (client.trainingGoal ? (client.trainingGoal === 'strength' || client.trainingGoal === 'power' ? 'maintain' : 'cut') : undefined) // simplification of goalPlan
  
  const plan = (latestBw && client.heightCm && client.sex && age !== null && client.activityLevel && effectiveGoal)
    ? nutritionPlan({
        weightKg: toKg(latestBw.value, latestBw.unit === 'kg' ? 'kg' : 'lb'),
        heightCm: client.heightCm,
        age,
        sex: client.sex,
        activity: client.activityLevel,
        goal: effectiveGoal as 'cut' | 'maintain' | 'gain',
      })
    : null

  // Entries
  const data = useLiveQuery(async () => {
    const entries = await foodEntriesRepo.forClientDate(client.id, date)
    const items = await Promise.all(
      entries.map(e => foodItemsRepo.get(e.foodItemId))
    )
    
    let cals = 0, p = 0, c = 0, f = 0
    const byMeal: Record<MealType, { entry: FoodEntry, item: FoodItem | undefined }[]> = {
      breakfast: [], lunch: [], dinner: [], snack: []
    }

    entries.forEach((entry, i) => {
      const item = items[i]
      if (item) {
        cals += item.calories * entry.servings
        p += item.protein * entry.servings
        c += item.carbs * entry.servings
        f += item.fat * entry.servings
      }
      byMeal[entry.meal].push({ entry, item })
    })

    return { entries: byMeal, totals: { cals, p, c, f } }
  }, [client.id, date])

  const totals = data?.totals ?? { cals: 0, p: 0, c: 0, f: 0 }
  const entries = data?.entries ?? { breakfast: [], lunch: [], dinner: [], snack: [] }

  const handleDayChange = (delta: number) => {
    const d = new Date(date + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    setDate(d.toISOString().split('T')[0])
  }

  const handleScanComplete = async (item: FoodItem) => {
    if (!scanMeal) return
    await foodEntriesRepo.create({
      clientId: client.id,
      date,
      foodItemId: item.id,
      meal: scanMeal,
      servings: 1
    })
    setScanMeal(null)
  }

  const handleDelete = async (entryId: string) => {
    await foodEntriesRepo.remove(entryId)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => handleDayChange(-1)}><ChevronLeft size={16} /></Button>
          <span className="font-medium text-ink w-24 text-center">{date === today() ? 'Today' : date}</span>
          <Button variant="ghost" onClick={() => handleDayChange(1)} disabled={date === today()}><ChevronRight size={16} /></Button>
        </div>
      </div>

      <Card>
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-xs font-medium text-faint uppercase tracking-wide">Calories</p>
            <p className="text-2xl font-bold text-ink">{totals.cals} <span className="text-sm font-normal text-muted">/ {plan ? plan.calories : '—'}</span></p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-2xs text-faint uppercase">Protein</p>
              <p className="font-mono text-sm">{totals.p}g <span className="text-muted">/ {plan?.proteinG}g</span></p>
            </div>
            <div>
              <p className="text-2xs text-faint uppercase">Carbs</p>
              <p className="font-mono text-sm">{totals.c}g <span className="text-muted">/ {plan?.carbsG}g</span></p>
            </div>
            <div>
              <p className="text-2xs text-faint uppercase">Fat</p>
              <p className="font-mono text-sm">{totals.f}g <span className="text-muted">/ {plan?.fatG}g</span></p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {plan && (
          <div className="h-2 w-full bg-line rounded-full overflow-hidden flex">
            <div className="bg-verde-600 h-full" style={{ width: `${Math.min(100, (totals.cals / plan.calories) * 100)}%` }} />
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {MEALS.map(meal => (
          <Card key={meal} className="p-0 overflow-hidden">
            <div className="bg-surface2 px-4 py-2 border-b border-line flex justify-between items-center">
              <h3 className="font-medium text-ink capitalize">{meal}</h3>
              <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setScanMeal(meal)}>
                <Plus size={14} className="mr-1" /> Add
              </Button>
            </div>
            <div className="divide-y divide-line">
              {entries[meal].length === 0 ? (
                <div className="p-4 text-sm text-faint text-center">No entries</div>
              ) : entries[meal].map(({ entry, item }) => (
                <div key={entry.id} className="p-4 flex justify-between items-center group">
                  <div>
                    <p className="font-medium text-sm text-ink">{item?.name || 'Unknown'}</p>
                    <p className="text-xs text-muted">{item?.brand} • {entry.servings} × {item?.servingSize}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">{item ? item.calories * entry.servings : 0} kcal</p>
                    <p className="text-xs text-faint group-hover:hidden">{item ? `${item.protein * entry.servings}P ${item.carbs * entry.servings}C ${item.fat * entry.servings}F` : ''}</p>
                    <button 
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs text-ember-600 hidden group-hover:inline-block"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {scanMeal && (
        <FoodScannerDialog
          open={!!scanMeal}
          onClose={() => setScanMeal(null)}
          onScan={handleScanComplete}
        />
      )}
    </div>
  )
}
