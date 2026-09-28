import { useState, useEffect, useSyncExternalStore, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  LayoutDashboard, Users, ClipboardList, Dumbbell, Clapperboard,
  CalendarDays, Wallet, BarChart3, Settings, ShieldCheck, ShieldAlert, Cloud, CloudOff,
  UserCog, UserPlus, Trophy, Menu, X, FlaskConical, Building2
} from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { daysSince } from '@/lib/core'
import { getSyncStatus, onSyncStatus } from '@/lib/cloud/syncEngine'
import { BrandMark } from './brand/Logomark'
import { useMenuNavigation } from './useMenuNavigation'
import { Toaster, LogoSpinner } from '@/design'
import CommandPalette from '@/features/shell/CommandPalette'
import OnboardingWizard from '@/features/onboarding/OnboardingWizard'
import EulaScreen from '@/features/onboarding/EulaScreen'
import type { ModuleKey } from '@/db/types'
import { useTranslation, type MessageKey } from '@/lib/i18n'
import { editionCapabilities } from '@/lib/edition'

interface NavItem {
  to: string
  labelKey: MessageKey
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  end?: boolean
  module?: ModuleKey
  /** Gated on editionCapabilities().multiSeat, not just hiddenModules — a
   *  single-seat trainer managing "staff" doesn't make sense as a freely
   *  available capability. See lib/edition.ts. */
  requiresMultiSeat?: boolean
}

const NAV_CORE: NavItem[] = [
  { to: '/', labelKey: 'nav.today', icon: LayoutDashboard, end: true },
  { to: '/clients', labelKey: 'nav.clients', icon: Users },
  { to: '/programs', labelKey: 'nav.programs', icon: ClipboardList },
  { to: '/exercises', labelKey: 'nav.exercises', icon: Dumbbell },
  { to: '/film-room', labelKey: 'nav.filmRoom', icon: Clapperboard, module: 'filmRoom' as ModuleKey },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays, module: 'calendar' as ModuleKey },
  { to: '/science', labelKey: 'nav.science', icon: FlaskConical, module: 'science' as ModuleKey },
]
const NAV_STUDIO: NavItem[] = [
  { to: '/studio', labelKey: 'nav.studioHub', icon: Building2, requiresMultiSeat: true },
  { to: '/business', labelKey: 'nav.business', icon: Wallet, module: 'business' as ModuleKey },
  { to: '/team', labelKey: 'nav.team', icon: UserCog, module: 'team' as ModuleKey, requiresMultiSeat: true },
  { to: '/leads', labelKey: 'nav.leads', icon: UserPlus, module: 'leads' as ModuleKey },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy, module: 'leaderboard' as ModuleKey },
  { to: '/sync', labelKey: 'nav.sync', icon: Cloud },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart3, module: 'reports' as ModuleKey },
]

/** Always-visible sync state: the account is where the data lives now, so
 *  "is it up there?" matters more day to day than the backup age below. */
function SyncHealth() {
  const s = useSyncExternalStore(onSyncStatus, getSyncStatus)
  const { t } = useTranslation()
  const problem = s.phase === 'error' || s.phase === 'signed-out' || !!s.refusedClients
  const waiting = s.phase === 'offline' || (s.pending > 0 && s.phase !== 'syncing')
  const label = s.refusedClients ? t('sync.health.refused')
    : s.phase === 'error' ? t('sync.health.error')
    : s.phase === 'signed-out' ? t('sync.health.signedOut')
    : s.phase === 'syncing' ? t('sync.health.syncing')
    : s.phase === 'offline' ? (s.pending ? `${t('sync.health.offline')} · ${t('sync.health.pending', { count: s.pending })}` : t('sync.health.offline'))
    : s.pending ? t('sync.health.pending', { count: s.pending })
    : t('sync.health.synced')
  const Icon = problem || s.phase === 'offline' ? CloudOff : Cloud
  return (
    <NavLink
      to="/sync"
      className="flex items-center gap-2 rounded-ctl px-3 py-2 text-xs text-muted hover:bg-surface"
      title={s.error ? `${t('sync.health.tooltip')} — ${s.error}` : t('sync.health.tooltip')}
    >
      <Icon size={15} className={problem ? 'text-signal-600' : waiting ? 'text-ember-600' : 'text-verde-600'} />
      <span className="font-mono tabular-nums">{label}</span>
    </NavLink>
  )
}

function BackupHealth() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()
  const days = daysSince(trainer?.lastBackupAt)
  // The account is the primary copy since S23; a backup is an extra one, so
  // this nudges after a month rather than alarming every new coach.
  const stale = days !== null && days >= 30
  // Pluralised through the catalogue rather than a hardcoded "d ago": Polish
  // needs four forms here and Arabic six, which no template literal can express.
  const label = days === null ? t('backup.none')
    : days === 0 ? t('backup.today')
    : t('backup.daysAgo', { count: days })
  const title = days === null ? t('backup.tooltipNone') : t('backup.tooltipDays', { count: days })
  return (
    <NavLink
      to="/settings"
      className="flex items-center gap-2 rounded-ctl px-3 py-2 text-xs text-muted hover:bg-surface"
      title={title}
    >
      {stale
        ? <ShieldAlert size={15} className="text-ember-600" />
        : <ShieldCheck size={15} className={days === null ? 'text-faint' : 'text-verde-600'} />}
      <span className="font-mono tabular-nums">{label}</span>
    </NavLink>
  )
}

export default function Shell() {
  const trainer = useLiveQuery(() => trainerRepo.get(), [], null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { t } = useTranslation()
  useMenuNavigation() // native menu bar → router (Electron only; no-op in the browser)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (!trainer) {
    return <div className="h-screen flex items-center justify-center bg-surface2"><LogoSpinner className="text-faint" size={40} /></div>
  }

  if (!trainer.onboardingComplete) {
    return <OnboardingWizard trainer={trainer} />
  }

  if (!trainer.eulaAcceptedAt) {
    return <EulaScreen trainer={trainer} />
  }

  const hidden = new Set(trainer.hiddenModules ?? [])
  const cap = editionCapabilities(trainer.edition)
  const coreItems = NAV_CORE.filter(item => !item.module || !hidden.has(item.module))
  const studioItems = NAV_STUDIO.filter(item =>
    (!item.module || !hidden.has(item.module)) && (!item.requiresMultiSeat || cap.multiSeat),
  )

  return (
    <div className="flex h-full relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-ink/20 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 start-0 z-50 flex w-64 md:w-52 shrink-0 flex-col border-e border-line bg-surface transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-5">
          {/* animated=true is safe as a constant: Shell itself never remounts across
              navigation (only <Outlet/> content changes), so this plays once per app
              session on first paint and holds its end state — never replays. */}
          <BrandMark variant={trainer.sidebarLogoVariant ?? 'horizontal'} animated />
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-faint hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {coreItems.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }: { isActive: boolean }) =>
                // Signature element #4: 3px verde spine on the active item
                `relative flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-verde-100/60 text-ink before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-verde-600'
                    : 'text-muted hover:bg-surface2 hover:text-ink'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.5} />
              {t(labelKey)}
            </NavLink>
          ))}
          {studioItems.length > 0 && (
            <p className="mb-0.5 mt-3 px-3 text-2xs font-semibold uppercase tracking-wide text-faint">{t('nav.sectionStudio')}</p>
          )}
          {studioItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }: { isActive: boolean }) =>
                `relative flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-verde-100/60 text-ink before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-verde-600'
                    : 'text-muted hover:bg-surface2 hover:text-ink'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.5} />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-2">
          <SyncHealth />
          <BackupHealth />
          <NavLink
            to="/settings"
            className={({ isActive }: { isActive: boolean }) =>
              `flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-verde-100/60 text-ink' : 'text-muted hover:bg-surface2 hover:text-ink'
              }`
            }
          >
            <Settings size={16} strokeWidth={1.5} />
            {t('nav.settings')}
          </NavLink>
        </div>
      </aside>

      <main className="panel-scroll min-w-0 flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between border-b border-line bg-surface px-4 py-3 shrink-0">
          <BrandMark variant={trainer.sidebarLogoVariant ?? 'horizontal'} />
          <button onClick={() => setSidebarOpen(true)} className="text-faint hover:text-ink p-1">
            <Menu size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
            <Outlet />
          </div>
        </div>
      </main>
      <Toaster />
      <CommandPalette />
    </div>
  )
}
