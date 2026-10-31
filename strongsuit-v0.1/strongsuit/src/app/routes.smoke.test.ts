import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'

// ===== Route module smoke test =====
//
// S14 code-split every route behind React.lazy (820KB → 476KB main chunk).
// That was the right call, but it changed the failure mode of a bad import
// from "the build fails" to "the app explodes the first time someone clicks
// that nav item" — and a route nobody happened to click during testing ships
// broken. This test is the cheap guard against exactly that class of bug.
//
// It imports every lazily-routed module and asserts it actually resolves with
// the export the router expects. It won't catch a render-time crash (that
// needs a DOM), but it does catch the things that actually go wrong: a moved
// or renamed file, a bad path alias, a default export that quietly became a
// named one, and a circular import that leaves the module namespace empty at
// evaluation time.
//
// Kept in lockstep with app/router.tsx by the "every entry is reachable"
// assertion at the bottom.

/** Every module the router lazy-loads, keyed by the route that uses it. */
const LAZY_ROUTES: Record<string, () => Promise<{ default?: unknown }>> = {
  '/clients/:id': () => import('@/features/clients/ClientDetailPage'),
  '/programs': () => import('@/features/programs/ProgramsPage'),
  '/programs/:id/edit': () => import('@/features/programs/builder/ProgramBuilder'),
  '/log': () => import('@/features/logging/SessionLoggerPage'),
  '/exercises': () => import('@/features/library/LibraryPage'),
  '/film-room': () => import('@/features/filmroom/FilmRoomPage'),
  '/calendar': () => import('@/features/calendar/CalendarPage'),
  '/science': () => import('@/features/science/SciencePage'),
  '/locations/:id': () => import('@/features/studio/LocationDetailPage'),
  '/business': () => import('@/features/business/BusinessPage'),
  '/sync': () => import('@/features/account/AccountPage'),
  '/reports': () => import('@/features/reports/ReportsPage'),
  '/team': () => import('@/features/team/TeamPage'),
  '/studio': () => import('@/features/studio/StudioHubPage'),
  '/leads': () => import('@/features/leads/LeadsPage'),
  '/leaderboard': () => import('@/features/leaderboard/LeaderboardPage'),
  '/settings': () => import('@/features/settings/SettingsPage'),
  '/assistant': () => import('@/features/assistant/AssistantPage'),
  '/print/program/:clientId/:programId': () => import('@/features/print/PrintSessionSheet'),
  '/print/progress/:clientId': () => import('@/features/print/PrintProgressReport'),
  '/print/intake/:clientId': () => import('@/features/print/PrintIntakeSheet'),
  '/print/messages/:clientId': () => import('@/features/print/PrintMessageDigest'),
  '/tv/:clientId': () => import('@/features/tv/TvWorkoutPage'),
}

/** Eagerly imported by the router — a break here blanks the whole app. */
const EAGER_ROUTES: Record<string, () => Promise<{ default?: unknown }>> = {
  'Shell': () => import('@/app/Shell'),
  '/': () => import('@/features/dashboard/DashboardPage'),
  '/clients': () => import('@/features/clients/ClientsPage'),
}

// Cold-transforming a whole route module is genuinely slow — ClientDetailPage
// pulls ten tabs plus an inlined HTML template and takes ~20s the first time.
// We're asserting "it resolves", not "it's fast", so the budget is generous.
const IMPORT_TIMEOUT_MS = 60_000

describe('route modules resolve', () => {
  it.each(Object.keys(LAZY_ROUTES))('lazy route %s loads and default-exports a component', async route => {
    const mod = await LAZY_ROUTES[route]()
    expect(mod).toBeTruthy()
    // React.lazy requires a default export; a named-only export fails at
    // render time with a message that doesn't name the offending route.
    expect(mod.default, `${route} has no default export`).toBeTypeOf('function')
  }, IMPORT_TIMEOUT_MS)

  it.each(Object.keys(EAGER_ROUTES))('eager route %s loads and default-exports a component', async route => {
    const mod = await EAGER_ROUTES[route]()
    expect(mod.default, `${route} has no default export`).toBeTypeOf('function')
  }, IMPORT_TIMEOUT_MS)

  it('KitchenSink is a named export the router unwraps explicitly', async () => {
    // The one route that isn't a default export — router.tsx maps it via
    // `.then(m => ({ default: m.KitchenSink }))`. If it ever becomes a default
    // export, that mapping silently yields undefined.
    const mod = await import('@/features/placeholders')
    expect(mod.KitchenSink).toBeTypeOf('function')
  })

  it('RouteError resolves — it is every route errorElement', async () => {
    const mod = await import('@/app/RouteError')
    expect(mod.RouteError).toBeTypeOf('function')
  })
})

describe('router coverage', () => {
  it('covers every lazy() module registered in router.tsx', async () => {
    // Guards against this file drifting out of date: add a route to
    // router.tsx and forget it here, and coverage silently lapses.
    //
    // router.tsx is read as SOURCE rather than imported, because importing it
    // executes createHashRouter(), which touches `document` and can't run in
    // this project's node test environment. Reading the text also means this
    // check can't be fooled by a module that happens to import cleanly.
    // `?raw` rather than node:fs — this tsconfig is DOM-targeted and has no
    // node types, and Vite resolves ?raw natively (same mechanism the Companion
    // exporter already uses for template.html).
    const src = (await import('./router.tsx?raw')).default

    // Compare on module basename, not the raw specifier: Vite rewrites the
    // `@/` alias (and the dynamic-import call itself) when it transforms this
    // test file, so the arrow-function source below no longer contains the
    // string that appears in router.tsx. The basename survives both.
    const basename = (spec: string) => spec.split('/').pop()!.replace(/\.[jt]sx?$/, '')

    const specifiers = [...src.matchAll(/lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g)].map(m => basename(m[1]))
    expect(specifiers.length, 'no lazy imports found — did router.tsx change shape?').toBeGreaterThan(10)

    // Match ANY quoted path in the arrow-function body, because Vite rewrites
    // `import('@/x')` to its own dynamic-import helper with a resolved path —
    // so a regex anchored on the literal `import(` finds nothing here.
    const covered = new Set(
      [...Object.values(LAZY_ROUTES), ...Object.values(EAGER_ROUTES)]
        .map(fn => fn.toString().match(/['"]([^'"]*\/[^'"]+)['"]/)?.[1])
        .filter(Boolean)
        .map(s => basename(s as string)),
    )
    expect(covered.size, 'could not extract any module paths — did the transform change?').toBeGreaterThan(10)
    // KitchenSink is the one route imported via a `.then()` unwrap rather than
    // a plain default export, so it has its own assertion above.
    covered.add('placeholders')

    const uncovered = specifiers.filter(s => !covered.has(s))
    expect(uncovered, `lazy imports in router.tsx with no smoke coverage: ${uncovered.join(', ')}`).toEqual([])
  })
})
