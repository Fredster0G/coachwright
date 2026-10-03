// ===== What brand a coach-facing artifact carries =====
// One rule for every printout (and the Companion file export): the coach's
// business name, logo and colour when custom branding is allowed
// (lib/membership.ts canUseCustomBranding), Coachwright's otherwise.

import type { Trainer } from '@/db/types'
import { canUseCustomBranding } from './membership'
import { APP_NAME } from './brand'

export interface ArtifactBrand { name: string; logo?: string; color?: string; custom: boolean }

export function artifactBrand(trainer: Trainer): ArtifactBrand {
  if (!canUseCustomBranding(trainer).allowed) return { name: APP_NAME, custom: false }
  return {
    name: trainer.businessName?.trim() || APP_NAME,
    logo: trainer.logoDataUrl || undefined,
    color: validHex(trainer.brandColor) ? trainer.brandColor : undefined,
    custom: true,
  }
}

export const validHex = (c?: string): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c)

/** Logos are stored on the (synced) trainer row: keep them small. */
export const LOGO_MAX_DIM = 256
