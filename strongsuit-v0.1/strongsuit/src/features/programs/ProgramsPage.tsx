import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardList, Plus, FileSignature } from 'lucide-react'
import { programsRepo, clientsRepo, staffRepo } from '@/db/repo'
import type { Program, ProgramStatus } from '@/db/types'
import { stamp, fullName } from '@/lib/core'
import { getActiveStaffId } from '@/lib/activeStaff'
import {
  Button, Select, Card, SectionHeader,
  EmptyState, Tag, Table
} from '@/design'
import { useTranslation, type MessageKey } from '@/lib/i18n'

const STATUS_LABEL: Record<ProgramStatus, MessageKey> = {
  draft: 'programs.status.draft', active: 'programs.status.active',
  completed: 'programs.status.completed', template: 'programs.status.template',
}

const STATUS_TONE: Record<ProgramStatus, 'neutral' | 'verde' | 'ember' | 'ember'> = {
  draft: 'neutral',
  active: 'verde',
  completed: 'ember', // placeholder tone
  template: 'ember' // placeholder tone
}

export default function ProgramsPage() {
  const navigate = useNavigate()
  const programs = useLiveQuery(() => programsRepo.all(), [], undefined)
  const clients = useLiveQuery(() => clientsRepo.all(), [], undefined)
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const [filter, setFilter] = useState<'all' | ProgramStatus>('all')
  const { t } = useTranslation()

  const filtered = useMemo(() => {
    if (!programs) return []
    let list = programs
    if (filter !== 'all') {
      list = list.filter(p => p.status === filter)
    }
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) // newest first
  }, [programs, filter])

  const loading = programs === undefined || clients === undefined

  const createNewProgram = async () => {
    const fresh = stamp({
      name: t('programs.defaultName'),
      description: '',
      status: 'draft',
      weeks: [],
      staffId: getActiveStaffId(staff) ?? undefined,
    } as unknown as Program)
    await programsRepo.create(fresh)
    navigate(`/programs/${fresh.id}/edit`)
  }

  const getClientName = (clientId?: string) => {
    if (!clientId) return t('programs.template')
    const c = clients?.find(c => c.id === clientId)
    return c ? fullName(c) : t('programs.unknownClient')
  }

  return (
    <div className="max-w-5xl mx-auto">
      <SectionHeader
        title={t('programs.title')}
        action={
          <Button variant="primary" size="sm" onClick={createNewProgram}>
            <Plus size={14} /> {t('programs.new')}
          </Button>
        }
      />

      <div className="mb-4">
        <Select className="w-40" value={filter} onChange={e => setFilter(e.target.value as 'all' | ProgramStatus)} aria-label={t('programs.filter')}>
          <option value="all">{t('programs.filter.all')}</option>
          <option value="draft">{t('programs.filter.draft')}</option>
          <option value="active">{t('programs.filter.active')}</option>
          <option value="completed">{t('programs.filter.completed')}</option>
          <option value="template">{t('programs.filter.template')}</option>
        </Select>
      </div>

      {loading ? (
        <Card className="animate-pulse text-sm text-faint">{t('programs.loading')}</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} strokeWidth={1.25} />}
          title={filter === 'all' ? t('programs.emptyTitle') : t('programs.emptyFilteredTitle')}
          body={filter === 'all' ? t('programs.emptyBody') : t('programs.emptyFilteredBody')}
          action={filter === 'all' && <Button variant="primary" onClick={createNewProgram}><Plus size={14} /> {t('programs.createFirst')}</Button>}
        />
      ) : (
        <Table head={<><th>{t('programs.col.name')}</th><th>{t('programs.col.client')}</th><th>{t('programs.col.status')}</th><th className="w-32">{t('programs.col.updated')}</th></>}>
          {filtered.map(p => (
            <tr key={p.id}>
              <td>
                <Link to={`/programs/${p.id}/edit`} className="flex flex-col group">
                  <span className="font-medium text-ink group-hover:text-verde-600 transition-colors">
                    {p.name}
                  </span>
                  {p.description && <span className="text-xs text-muted truncate max-w-sm mt-0.5">{p.description}</span>}
                </Link>
              </td>
              <td>
                {p.status === 'template' ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted">
                    <FileSignature size={14} /> {t('programs.template')}
                  </div>
                ) : (
                  <span className="text-sm text-ink">{getClientName(p.clientId)}</span>
                )}
              </td>
              <td><Tag tone={STATUS_TONE[p.status]}>{t(STATUS_LABEL[p.status])}</Tag></td>
              <td className="font-mono tabular-nums text-xs text-muted">
                {new Date(p.updatedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}
