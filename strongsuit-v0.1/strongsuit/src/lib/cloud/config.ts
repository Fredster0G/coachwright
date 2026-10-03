// ===== Build/runtime configuration for Coachwright Cloud =====
//
// Two builds from one codebase:
//   - desktop (Electron) and the default web build: the full app
//   - `VITE_TARGET=web`: the website — same app, minus every on-device AI
//     feature (model downloads of 100MB–1GB+ don't belong in a browser tab)
//
// Both talk to the same backend (sync-server/), set by VITE_CLOUD_URL at build
// time.

export const CLOUD_URL: string = (import.meta.env.VITE_CLOUD_URL as string | undefined)?.replace(/\/+$/, '')
  || (import.meta.env.DEV ? 'http://localhost:4000' : 'https://api.coachwright.app')

/** True for the website build. Gates every local-AI surface. */
export const IS_WEB_BUILD: boolean = import.meta.env.VITE_TARGET === 'web'

/** Local AI (assistant, voice logging, OCR, semantic search, check-in digest)
 *  is desktop-only. */
export const LOCAL_AI_ENABLED = !IS_WEB_BUILD
