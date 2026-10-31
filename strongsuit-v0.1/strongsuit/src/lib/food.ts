import { newId, nowIso } from './core'
import type { FoodItem } from '@/db/types'

// Open Food Facts API spec: https://openfoodfacts.github.io/openfoodfacts-server/api/
const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product'

export interface FoodLookupError {
  type: 'not_found' | 'network_error' | 'invalid_response'
  message: string
}

/**
 * Queries Open Food Facts for a barcode.
 */
export async function lookupBarcode(barcode: string): Promise<FoodItem | FoodLookupError> {
  try {
    const res = await fetch(`${OFF_API_BASE}/${barcode}.json`)
    
    if (res.status === 404) {
      return { type: 'not_found', message: 'Product not found in Open Food Facts database.' }
    }
    
    if (!res.ok) {
      return { type: 'network_error', message: `Open Food Facts returned ${res.status}.` }
    }

    const data = await res.json()
    if (data.status !== 1 || !data.product) {
      return { type: 'not_found', message: 'Product not found.' }
    }

    const p = data.product
    const nut = p.nutriments || {}

    // Convert to our internal FoodItem model
    const t = nowIso()
    const item: FoodItem = {
      id: newId(),
      createdAt: t,
      updatedAt: t,
      barcode,
      name: p.product_name || 'Unknown Product',
      brand: p.brands ? p.brands.split(',')[0].trim() : undefined,
      calories: Math.round(nut['energy-kcal_100g'] || nut.energy_100g || 0),
      protein: Math.round(nut.proteins_100g || 0),
      carbs: Math.round(nut.carbohydrates_100g || 0),
      fat: Math.round(nut.fat_100g || 0),
      servingSize: p.serving_size || '100g', // OFF often defaults to 100g base values
    }

    // If they have serving size nutrition, use that instead of 100g values
    if (nut['energy-kcal_serving'] !== undefined) {
      item.calories = Math.round(nut['energy-kcal_serving'])
      item.protein = Math.round(nut.proteins_serving || 0)
      item.carbs = Math.round(nut.carbohydrates_serving || 0)
      item.fat = Math.round(nut.fat_serving || 0)
    }

    return item
  } catch (err) {
    return { type: 'network_error', message: err instanceof Error ? err.message : 'Network error' }
  }
}
