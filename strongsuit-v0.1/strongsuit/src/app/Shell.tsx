import { useState, useEffect, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  LayoutDashboard, Users, ClipboardList, Dumbbell, Clapperboard,
  CalendarDays, Wallet, BarChart3, Settings, ShieldCheck, ShieldAlert, RadioTower,
  UserCog, UserPlus, Trophy, Menu, X, FlaskConical, Building2, Sparkles
} from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { daysSince } from '@/lib/core'
import { APP_TAGLINE } from '@/lib/brand'
import { FREE_TIER_CLIENT_LIMIT } from '@/lib/membership'
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
  { to: '/sync', labelKey: 'nav.sync', icon: RadioTower, module: 'sync' as ModuleKey },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart3, module: 'reports' as ModuleKey },
]

function navClass(isActive: boolean) {
  return `relative flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm font-medium transition-[color,background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
    isActive
      ? 'bg-rail-active text-rail-text before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-rail-spine before:animate-ember-pulse'
      : 'text-rail-muted hover:bg-rail-hover hover:text-rail-text hover:translate-x-0.5'
  }`
}

function BackupHealth() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()
  const days = daysSince(trainer?.lastBackupAt)
  const stale = days === null || days >= 7
  // Pluralised through the catalogue rather than a hardcoded "d ago": Polish
  // needs four forms here and Arabic six, which no template literal can express.
  const label = days === null ? t('backup.none')
    : days === 0 ? t('backup.today')
    : t('backup.daysAgo', { count: days })
  const title = days === null ? t('backup.tooltipNone') : t('backup.tooltipDays', { count: days })
  return (
    <NavLink
      to="/settings"
      className="flex items-center gap-2 rounded-ctl px-3 py-2 text-xs text-rail-faint hover:bg-rail-hover hover:text-rail-text"
      title={title}
    >
      {stale
        ? <ShieldAlert size={15} className="text-ember-500" />
        : <ShieldCheck size={15} className="text-rail-spine" />}
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
    return (
      <div className="workshop-canvas workshop-grain flex h-screen items-center justify-center">
        <LogoSpinner className="text-faint" size={40} />
      </div>
    )
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
  const logoVariant = trainer.sidebarLogoVariant ?? 'horizontal'
  // Grandfathered independent/studio editions count as unlocked (same gate as MembershipCard).
  const isMember = !!trainer.membershipActive
    || trainer.edition === 'independent'
    || trainer.edition === 'studio'

  return (
    <div className="relative flex h-full">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm transition-opacity md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Workshop rail — always dark; brand strip that doesn't theme-flip */}
      <aside className={`workshop-rail fixed inset-y-0 start-0 z-50 flex w-64 shrink-0 flex-col border-e border-rail-line transition-transform duration-200 ease-out md:static md:w-[13.5rem] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-start justify-between gap-2 px-4 pb-5 pt-6">
          {/* animated=true is safe as a constant: Shell itself never remounts across
              navigation (only <Outlet/> content changes), so this plays once per app
              session on first paint and holds its end state — never replays.
              tone="light" = porcelain mark on the dark rail. */}
          <div className="min-w-0">
            <BrandMark variant={logoVariant} animated tone="light" />
            {logoVariant !== 'lockup' && (
              <p className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-rail-faint">
                {APP_TAGLINE}
              </p>
            )}
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-rail-faint hover:text-rail-text md:hidden" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav className="stagger-in flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {coreItems.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }: { isActive: boolean }) => navClass(isActive)}>
              <Icon size={16} strokeWidth={1.5} />
              {t(labelKey)}
            </NavLink>
          ))}
          {studioItems.length > 0 && (
            <p className="mb-0.5 mt-4 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-rail-faint">
              {t('nav.sectionStudio')}
            </p>
          )}
          {studioItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }: { isActive: boolean }) => navClass(isActive)}>
              <Icon size={16} strokeWidth={1.5} />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-rail-line p-2">
          {/* SaaS plan chip — Free vs Membership is the product model (S15). */}
          <NavLink
            to="/settings"
            className="mb-1 flex items-center justify-between gap-2 rounded-ctl border border-rail-line bg-rail-hover px-3 py-2 text-xs transition-colors hover:border-rail-spine/50"
          >
            <span className="flex items-center gap-1.5 font-mono uppercase tracking-[0.12em] text-rail-muted">
              <Sparkles size={12} className={isMember ? 'text-rail-spine' : 'text-ember-500'} />
              {isMember
                ? t('nav.planMember')
                : t('nav.planFree', { limit: FREE_TIER_CLIENT_LIMIT })}
            </span>
            {!isMember && (
              <span className="font-medium text-rail-spine">{t('nav.planUpgrade')}</span>
            )}
          </NavLink>
          <BackupHealth />
          <NavLink
            to="/settings"
            className={({ isActive }: { isActive: boolean }) => navClass(isActive)}
          >
            <Settings size={16} strokeWidth={1.5} />
            {t('nav.settings')}
          </NavLink>
        </div>
      </aside>

      <main className="workshop-canvas workshop-grain panel-scroll flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-sm md:hidden">
          <BrandMark variant={logoVariant} />
          <button onClick={() => setSidebarOpen(true)} className="p-1 text-faint hover:text-ink" aria-label="Open menu">
            <Menu size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div key={location.pathname} className="mx-auto max-w-5xl animate-rise-in px-4 py-7 md:px-8 md:py-9">
            <Outlet />
          </div>
        </div>
      </main>
      <Toaster />
      <CommandPalette />
    </div>
  )
}
