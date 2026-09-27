import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Search, User, Settings, Plus, LayoutDashboard, Users, ClipboardList, Dumbbell,
  Clapperboard, CalendarDays, Wallet, BarChart3, UserCog, UserPlus, Trophy, RadioTower, Download, Zap,
  Calculator, MessageCircleQuestion, Building2, Bot,
} from 'lucide-react'
import { Dialog, toast } from '@/design'
import { QuickLogDialog } from '@/features/logging/QuickLogDialog'
import { clientsRepo, trainerRepo, logsRepo, invoicesRepo } from '@/db/repo'
import { exportBackup, downloadText } from '@/db/backup'
import { nowIso, today } from '@/lib/core'
import { createFuzzyIndex } from '@/lib/fuzzy'
import { fullName } from '@/lib/core'
import type { ModuleKey } from '@/db/types'
import { editionCapabilities } from '@/lib/edition'
import { useTranslation, type MessageKey } from '@/lib/i18n'
import { evalCalculator, parseNlQuery, clientsWithNoSessionSince, clientsWhoOwe } from './paletteQuery'

const NAV_ACTIONS: { to: string; labelKey: MessageKey; icon: React.ReactNode; module?: ModuleKey; requiresMultiSeat?: boolean }[] = [
  { to: '/', labelKey: 'nav.today', icon: <LayoutDashboard size={18} className="text-muted" /> },
  { to: '/clients', labelKey: 'nav.clients', icon: <Users size={18} className="text-muted" /> },
  { to: '/programs', labelKey: 'nav.programs', icon: <ClipboardList size={18} className="text-muted" /> },
  { to: '/exercises', labelKey: 'nav.exercises', icon: <Dumbbell size={18} className="text-muted" /> },
  { to: '/film-room', labelKey: 'nav.filmRoom', icon: <Clapperboard size={18} className="text-muted" />, module: 'filmRoom' },
  { to: '/calendar', labelKey: 'nav.calendar', icon: <CalendarDays size={18} className="text-muted" />, module: 'calendar' },
  { to: '/business', labelKey: 'nav.business', icon: <Wallet size={18} className="text-muted" />, module: 'business' },
  { to: '/studio', labelKey: 'nav.studioHub', icon: <Building2 size={18} className="text-muted" />, requiresMultiSeat: true },
  { to: '/team', labelKey: 'nav.team', icon: <UserCog size={18} className="text-muted" />, module: 'team', requiresMultiSeat: true },
  { to: '/leads', labelKey: 'nav.leads', icon: <UserPlus size={18} className="text-muted" />, module: 'leads' },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: <Trophy size={18} className="text-muted" />, module: 'leaderboard' },
  { to: '/sync', labelKey: 'nav.sync', icon: <RadioTower size={18} className="text-muted" />, module: 'sync' },
  { to: '/reports', labelKey: 'nav.reports', icon: <BarChart3 size={18} className="text-muted" />, module: 'reports' },
  { to: '/assistant', labelKey: 'nav.assistant', icon: <Bot size={18} className="text-muted" /> },
]

interface Action {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  onSelect: () => void
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { t, formatNumber } = useTranslation()

  // Close the palette first, then open Quick Log — two stacked dialogs fight
  // over focus and the caret ends up in the wrong one.
  const onQuickLog = useMemo(() => () => {
    setOpen(false)
    setTimeout(() => setQuickLogOpen(true), 0)
  }, [])

  // Listen for Cmd+K / Ctrl+K, and Cmd/Ctrl+L for Quick Log
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault()
        setQuickLogOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const hiddenModules = trainer?.hiddenModules ?? []
  const cap = editionCapabilities(trainer?.edition)
  // Only needed for the two NL query kinds below — fetched unconditionally
  // (cheap, roster-sized) rather than re-querying per keystroke.
  const logs = useLiveQuery(() => logsRepo.all(), [], [])
  const invoices = useLiveQuery(() => invoicesRepo.all(), [], [])

  const actions = useMemo<Action[]>(() => {
    const arr: Action[] = [
      {
        id: 'quick-log',
        title: t('palette.quickLog'),
        subtitle: t('palette.quickLogHint'),
        icon: <Zap size={18} className="text-verde-600" />,
        onSelect: () => onQuickLog(),
      },
      {
        id: 'settings',
        title: t('palette.settings'),
        subtitle: t('palette.settingsHint'),
        icon: <Settings size={18} className="text-muted" />,
        onSelect: () => navigate('/settings')
      },
      {
        id: 'new-client',
        title: t('palette.addClient'),
        subtitle: t('palette.addClientHint'),
        icon: <Plus size={18} className="text-verde-600" />,
        onSelect: () => navigate('/clients?new=true')
      },
      {
        id: 'new-program',
        title: t('palette.createProgram'),
        icon: <Plus size={18} className="text-verde-600" />,
        onSelect: () => navigate('/programs') // User can click new program there
      },
      {
        id: 'backup-now',
        title: t('palette.backupNow'),
        subtitle: t('palette.backupNowHint'),
        icon: <Download size={18} className="text-verde-600" />,
        onSelect: () => {
          exportBackup().then(({ filename, text }) => {
            downloadText(filename, text)
            trainerRepo.patch({ lastBackupAt: nowIso() })
          })
        },
      },
    ]

    for (const nav of NAV_ACTIONS) {
      if (nav.module && hiddenModules.includes(nav.module)) continue
      if (nav.requiresMultiSeat && !cap.multiSeat) continue
      arr.push({ id: `nav-${nav.to}`, title: t('palette.navGoTo', { target: t(nav.labelKey) }), icon: nav.icon, onSelect: () => navigate(nav.to) })
    }

    for (const c of clients) {
      arr.push({
        id: `client-${c.id}`,
        title: fullName(c),
        subtitle: t('palette.clientSubtitle'),
        icon: <User size={18} className="text-muted" />,
        onSelect: () => navigate(`/clients/${c.id}`)
      })
    }

    return arr
  }, [clients, navigate, hiddenModules, cap, onQuickLog, t])

  const searchIndex = useMemo(() => createFuzzyIndex(actions, a => [a.title, a.subtitle || '']), [actions])

  const calcResult = useMemo(() => evalCalculator(query), [query])
  const nlQuery = useMemo(() => parseNlQuery(query), [query])

  const results = useMemo(() => {
    const calcAction: Action[] = calcResult === null ? [] : [{
      id: 'calc',
      title: `= ${calcResult}`,
      subtitle: t('palette.copyResult'),
      icon: <Calculator size={18} className="text-verde-600" />,
      onSelect: () => { navigator.clipboard.writeText(String(calcResult)); toast(`Copied ${calcResult}.`) },
    }]

    if (nlQuery) {
      if (nlQuery.kind === 'no-session') {
        const matches = clientsWithNoSessionSince(clients, logs, nlQuery.days, today())
        if (matches.length === 0) {
          return [...calcAction, {
            id: 'nl-empty', title: t('palette.nobodyMatches'), icon: <MessageCircleQuestion size={18} className="text-muted" />,
            subtitle: t('palette.noSessionDays', { days: nlQuery.days }), onSelect: () => {},
          }]
        }
        return [...calcAction, ...matches.slice(0, 8).map(({ client: c, daysSince: d }) => ({
          id: `nl-${c.id}`, title: fullName(c), icon: <User size={18} className="text-muted" />,
          subtitle: d === null ? t('palette.neverLogged') : t('palette.noSessionInDays', { days: d }),
          onSelect: () => navigate(`/clients/${c.id}`),
        }))]
      }
      if (nlQuery.kind === 'owes') {
        const owing = clientsWhoOwe(clients, invoices)
        if (owing.length === 0) {
          return [...calcAction, {
            id: 'nl-empty', title: t('palette.nobodyOwes'), icon: <MessageCircleQuestion size={18} className="text-muted" />,
            subtitle: t('palette.noOwesHint'), onSelect: () => {},
          }]
        }
        return [...calcAction, ...owing.slice(0, 8).map(({ client: c, amount }) => ({
          id: `nl-${c.id}`, title: fullName(c), icon: <User size={18} className="text-muted" />,
          subtitle: t('palette.owesAmount', { amount: formatNumber(amount, { style: 'currency', currency: 'USD' }) }), onSelect: () => navigate(`/clients/${c.id}`),
        }))]
      }
    }

    if (!query.trim()) return [...calcAction, ...actions.slice(0, 8)]
    const hits = searchIndex(query)
    hits.sort((a, b) => b.score - a.score)
    return [...calcAction, ...hits.filter(h => h.score > 0).map(h => h.item).slice(0, 8)]
  }, [query, actions, searchIndex, calcResult, nlQuery, clients, logs, invoices, navigate, t, formatNumber])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Handle keyboard navigation within the dialog
  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = results[selectedIndex]
      if (action) {
        setOpen(false)
        action.onSelect()
      }
    }
  }

  function handleClose() {
    setOpen(false)
    setQuery('')
  }

  if (!open) return null

  return (
    <>
    <Dialog open={open} onClose={handleClose} title="">
      <div className="-mt-4 -mx-4 -mb-4">
        <div className="flex items-center px-4 py-3 border-b border-line">
          <Search size={20} className="text-muted me-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-ink placeholder-faint text-lg"
            placeholder={t('palette.search')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 bg-surface border border-line rounded px-2 py-1 text-xs text-faint font-mono">
            ESC
          </kbd>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="py-8 text-center text-faint">{t('palette.noResults')}</div>
          ) : (
            results.map((action, i) => {
              const isSelected = i === selectedIndex
              return (
                <button
                  key={action.id}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded text-start transition-colors ${isSelected ? 'bg-verde-100/60' : 'hover:bg-surface2'}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => {
                    handleClose()
                    action.onSelect()
                  }}
                >
                  <div className="flex-shrink-0">{action.icon}</div>
                  <div>
                    <div className="font-medium text-ink">{action.title}</div>
                    {action.subtitle && <div className="text-xs text-muted mt-0.5">{action.subtitle}</div>}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </Dialog>
    <QuickLogDialog open={quickLogOpen} onClose={() => setQuickLogOpen(false)} />
    </>
  )
}
