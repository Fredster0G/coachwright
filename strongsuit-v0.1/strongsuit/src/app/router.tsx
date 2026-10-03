import { lazy, Suspense, type ReactNode } from 'react'
import { LOCAL_AI_ENABLED } from '@/lib/cloud/config'
import { createHashRouter, Navigate } from 'react-router-dom'
import Shell from './Shell'
import { RouteError } from './RouteError'
import { LogoSpinner } from '@/design'

// Eager: the two routes a coach lands on constantly. Everything else is
// code-split (Phase 9, debt #8) — the main chunk had grown past 800KB because
// every page, including Film Room and all four print sheets, was imported here
// up front. Lazy routes each become their own chunk fetched on first visit.
import DashboardPage from '@/features/dashboard/DashboardPage'
import ClientsPage from '@/features/clients/ClientsPage'

// Client detail is core navigation but far from free: it pulls all ten of its
// tabs plus the Companion exporter's inlined HTML template. Worth a chunk.
const ClientDetailPage = lazy(() => import('@/features/clients/ClientDetailPage'))

const ProgramsPage = lazy(() => import('@/features/programs/ProgramsPage'))
const ProgramBuilder = lazy(() => import('@/features/programs/builder/ProgramBuilder'))
const SessionLoggerPage = lazy(() => import('@/features/logging/SessionLoggerPage'))
const LibraryPage = lazy(() => import('@/features/library/LibraryPage'))
const FilmRoomPage = lazy(() => import('@/features/filmroom/FilmRoomPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const SciencePage = lazy(() => import('@/features/science/SciencePage'))
const BusinessPage = lazy(() => import('@/features/business/BusinessPage'))
const AccountPage = lazy(() => import('@/features/account/AccountPage'))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'))
const TeamPage = lazy(() => import('@/features/team/TeamPage'))
const StudioHubPage = lazy(() => import('@/features/studio/StudioHubPage'))
const LocationDetailPage = lazy(() => import('@/features/studio/LocationDetailPage'))
const LeadsPage = lazy(() => import('@/features/leads/LeadsPage'))
const LeaderboardPage = lazy(() => import('@/features/leaderboard/LeaderboardPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage'))
const KitchenSink = lazy(() => import('@/features/placeholders').then(m => ({ default: m.KitchenSink })))
const PrintSessionSheet = lazy(() => import('@/features/print/PrintSessionSheet'))
const PrintProgressReport = lazy(() => import('@/features/print/PrintProgressReport'))
const PrintIntakeSheet = lazy(() => import('@/features/print/PrintIntakeSheet'))
const PrintMessageDigest = lazy(() => import('@/features/print/PrintMessageDigest'))
const TvWorkoutPage = lazy(() => import('@/features/tv/TvWorkoutPage'))

/** Chunk-load fallback. Deliberately quiet and centred rather than a skeleton:
 *  on a local disk (or a `file://` Electron load) these chunks resolve in a few
 *  ms, so anything more elaborate would just flash. */
function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <LogoSpinner size={28} />
      {/* Loading state must not be conveyed by motion alone — under
          prefers-reduced-motion the spinner barely moves. */}
      <span className="sr-only">Loading…</span>
    </div>
  )
}

const load = (node: ReactNode) => <Suspense fallback={<RouteFallback />}>{node}</Suspense>

// Hash router: file-protocol friendly (spec §2.2)
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      // errorElement per child route so a crash renders inside the Shell
      // outlet — nav stays usable — instead of blanking the entire app.
      { index: true, element: <DashboardPage />, errorElement: <RouteError /> },
      { path: 'clients', element: <ClientsPage />, errorElement: <RouteError /> },
      { path: 'clients/:id', element: load(<ClientDetailPage />), errorElement: <RouteError /> },
      { path: 'programs', element: load(<ProgramsPage />), errorElement: <RouteError /> },
      { path: 'programs/:id/edit', element: load(<ProgramBuilder />), errorElement: <RouteError /> },
      { path: 'log', element: load(<SessionLoggerPage />), errorElement: <RouteError /> },
      { path: 'exercises', element: load(<LibraryPage />), errorElement: <RouteError /> },
      { path: 'film-room', element: load(<FilmRoomPage />), errorElement: <RouteError /> },
      { path: 'calendar', element: load(<CalendarPage />), errorElement: <RouteError /> },
      { path: 'science', element: load(<SciencePage />), errorElement: <RouteError /> },
      { path: 'business', element: load(<BusinessPage />), errorElement: <RouteError /> },
      { path: 'sync', element: load(<AccountPage />), errorElement: <RouteError /> },
      { path: 'reports', element: load(<ReportsPage />), errorElement: <RouteError /> },
      { path: 'team', element: load(<TeamPage />), errorElement: <RouteError /> },
      { path: 'studio', element: load(<StudioHubPage />), errorElement: <RouteError /> },
      { path: 'locations/:id', element: load(<LocationDetailPage />), errorElement: <RouteError /> },
      { path: 'leads', element: load(<LeadsPage />), errorElement: <RouteError /> },
      { path: 'leaderboard', element: load(<LeaderboardPage />), errorElement: <RouteError /> },
      { path: 'settings', element: load(<SettingsPage />), errorElement: <RouteError /> },
      // Desktop-only: the website build ships without on-device AI, and a
      // hand-typed /#/assistant there goes home rather than to an error page.
      LOCAL_AI_ENABLED
        ? { path: 'assistant', element: load(<AssistantPage />), errorElement: <RouteError /> }
        : { path: 'assistant', element: <Navigate to="/" replace /> },
      // A password-reset link opened on a device that's already signed in:
      // nothing to reset here — change the password from Account instead.
      { path: 'reset-password', element: <Navigate to="/sync" replace /> },
      { path: 'kitchen-sink', element: load(<KitchenSink />), errorElement: <RouteError /> },
    ],
  },
  // Sibling routes render outside the Shell (print stylesheets and the
  // full-screen gym display both need the chrome gone).
  { path: '/print/program/:clientId/:programId', element: load(<PrintSessionSheet />), errorElement: <RouteError /> },
  { path: '/print/progress/:clientId', element: load(<PrintProgressReport />), errorElement: <RouteError /> },
  { path: '/print/intake/:clientId', element: load(<PrintIntakeSheet />), errorElement: <RouteError /> },
  { path: '/print/messages/:clientId', element: load(<PrintMessageDigest />), errorElement: <RouteError /> },
  { path: '/tv/:clientId', element: load(<TvWorkoutPage />), errorElement: <RouteError /> },
])
