import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Home, Dumbbell, LineChart, MessageCircle, Settings as SettingsIcon } from 'lucide-react'
import type { CompanionProfile } from '@/db/types'
import { HomePage } from '@/features/home/HomePage'
import { LogPage } from '@/features/log/LogPage'
import { ProgressPage } from '@/features/progress/ProgressPage'
import { CoachPage } from '@/features/coach/CoachPage'
import { BookPage } from '@/features/coach/BookPage'
import { ProgramPage } from '@/features/program/ProgramPage'
import { FilmRoomPage } from '@/features/filmroom/FilmRoomPage'
import { CyclePage } from '@/features/cycle/CyclePage'
import { SettingsPage } from '@/features/settings/SettingsPage'

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/log', label: 'Log', icon: Dumbbell },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/coach', label: 'Coach', icon: MessageCircle },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const

/** Bottom-tab nav — this is a phone app first; a coach's sidebar-and-desk
 *  layout would be the wrong shape here even on a wider screen. The Program
 *  viewer and Film Room are sub-pages (reached from Home), not extra tabs —
 *  five is already the ceiling for comfortable thumb targets. */
export function Shell({ profile, onProfileChange }: {
  profile: CompanionProfile
  onProfileChange: (p: CompanionProfile) => void
}) {
  return (
    <HashRouter>
      <div className="mx-auto flex h-full max-w-md flex-col">
        {/* pt respects the notch/status bar when installed standalone; pb
            clears the fixed nav plus the home-indicator inset. */}
        <main className="flex-1 overflow-y-auto px-4 pb-[calc(76px+env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
          <Routes>
            <Route path="/" element={<HomePage profile={profile} />} />
            <Route path="/log" element={<LogPage />} />
            <Route path="/progress" element={<ProgressPage units={profile.units} />} />
            <Route path="/coach" element={<CoachPage />} />
            <Route path="/book" element={<BookPage />} />
            <Route path="/program" element={<ProgramPage units={profile.units} />} />
            <Route path="/film-room" element={<FilmRoomPage />} />
            {/* Sub-page, not a tab — reached from Settings. Deliberately not
                surfaced in the bottom nav: this is optional, and a permanent
                nav icon announces to anyone glancing at the phone that the
                person tracks it. */}
            <Route path="/cycle" element={<CyclePage />} />
            <Route path="/settings" element={<SettingsPage profile={profile} onProfileChange={onProfileChange} />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="flex items-stretch justify-around">
            {TABS.map(t => (
              <NavLink
                key={t.to} to={t.to} end={'end' in t ? t.end : undefined}
                className={({ isActive }) =>
                  `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors ${isActive ? 'text-verde-600' : 'text-faint hover:text-muted'}`}
              >
                {({ isActive }) => (
                  <>
                    <span className={`rounded-full px-3 py-0.5 transition-colors ${isActive ? 'bg-verde-600/10' : ''}`}>
                      <t.icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                    </span>
                    {t.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </HashRouter>
  )
}
