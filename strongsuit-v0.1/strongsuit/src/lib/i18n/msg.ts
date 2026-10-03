// ===== Translatable messages from pure engines =====
//
// Engines in lib/ (progression, readiness, …) explain themselves in prose.
// They return a Msg — a catalogue key plus params, where a param may itself
// be a Msg ("Mainly {driver}") — and keep an English string beside it for
// logs, tests and the assistant. Both come from the same catalogue entry, so
// they can't drift. The UI renders with renderMsg(msg, t).

import en, { type MessageKey } from './locales/en'
import { translate, type TranslateOptions } from './core'

export interface Msg {
  key: MessageKey
  params?: { [name: string]: string | number | Msg }
}

export function renderMsg(m: Msg, t: (key: MessageKey, opts?: TranslateOptions) => string): string {
  const opts: TranslateOptions = {}
  for (const [k, v] of Object.entries(m.params ?? {})) opts[k] = typeof v === 'object' ? renderMsg(v, t) : v
  return t(m.key, opts)
}

export const english = (m: Msg): string => renderMsg(m, (key, opts) => translate(key, en, en, 'en', opts))
