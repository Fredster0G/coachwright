import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldCheck, Upload, Download, Zap, Plus, Trash2, LayoutGrid } from 'lucide-react'
import { trainerRepo, automationRulesRepo } from '@/db/repo'
import { exportBackup, importBackup, isEncryptedBackup, downloadText, type ImportMode } from '@/db/backup'
import { fullName, nowIso } from '@/lib/core'
import { BACKUP_ACCEPT } from '@/lib/brand'
import { Button, Card, SectionHeader, Field, Input, Select, toast, toastError, Dialog, Tag } from '@/design'
import { clientsRepo } from '@/db/repo'
import { DEFAULT_RULES, TRIGGER_LABELS } from '@/lib/automations'
import type { AutomationTrigger, ModuleKey } from '@/db/types'
import Guide from './Guide'
import { LocalAiCard } from './LocalAiCard'
import { LOCAL_AI_ENABLED } from '@/lib/cloud/config'
import { LicenceCard } from './LicenceCard'
import { MembershipCard } from './MembershipCard'
import { BookingCard } from './BookingCard'
import { OnboardingSequenceCard } from './OnboardingSequenceCard'
import { NotificationsCard } from './NotificationsCard'
import { BRAND_MARK_VARIANTS, BrandMark, type BrandMarkVariant } from '@/app/brand/Logomark'
import { canUseCustomBranding } from '@/lib/membership'
import { resizeImageToDataUrl } from '@/lib/media'
import { LOGO_MAX_DIM, validHex } from '@/lib/branding'
import { useTranslation, type MessageKey } from '@/lib/i18n'

const getModuleInfo = (t: (k: MessageKey) => string): { key: ModuleKey; label: string; hint: string }[] => [
  { key: 'filmRoom', label: t('settings.modules.filmRoom.label'), hint: t('settings.modules.filmRoom.hint') },
  { key: 'calendar', label: t('settings.modules.calendar.label'), hint: t('settings.modules.calendar.hint') },
  { key: 'science', label: t('settings.modules.science.label'), hint: t('settings.modules.science.hint') },
  { key: 'business', label: t('settings.modules.business.label'), hint: t('settings.modules.business.hint') },
  { key: 'team', label: t('settings.modules.team.label'), hint: t('settings.modules.team.hint') },
  { key: 'leads', label: t('settings.modules.leads.label'), hint: t('settings.modules.leads.hint') },
  { key: 'leaderboard', label: t('settings.modules.leaderboard.label'), hint: t('settings.modules.leaderboard.hint') },
  { key: 'reports', label: t('settings.modules.reports.label'), hint: t('settings.modules.reports.hint') },
]

function ModulesCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()
  if (!trainer) return null
  const hidden = new Set(trainer.hiddenModules ?? [])

  async function toggle(key: ModuleKey) {
    const next = new Set(trainer!.hiddenModules ?? [])
    if (next.has(key)) next.delete(key); else next.add(key)
    await trainerRepo.patch({ hiddenModules: Array.from(next) })
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <LayoutGrid size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">{t('settings.modules.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        {t('settings.modules.hint')}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {getModuleInfo(t).map(m => (
          <label key={m.key} className="flex items-start gap-2.5 rounded-ctl border border-line px-3 py-2.5">
            <input
              type="checkbox" checked={!hidden.has(m.key)} onChange={() => toggle(m.key)}
              className="mt-0.5 accent-[var(--verde-600)]"
            />
            <span>
              <span className="block text-sm font-medium text-ink">{m.label}</span>
              <span className="block text-2xs text-faint">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </Card>
  )
}

function BrandCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()
  const logoRef = useRef<HTMLInputElement>(null)
  if (!trainer) return null
  const canBrand = canUseCustomBranding(trainer)
  
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <p className="font-display text-base font-semibold">{t('settings.brand.title')}</p>
        {!canBrand.allowed && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <Zap size={12} className="fill-amber-500" /> {t('settings.brand.upgrade')}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('settings.brand.businessName')}>
          <Input
            defaultValue={trainer.businessName}
            onBlur={e => trainerRepo.patch({ businessName: e.target.value })}
            placeholder={t('settings.brand.businessNamePlaceholder')}
          />
        </Field>
        <Field label={t('settings.brand.trainerName')}>
          <Input defaultValue={trainer.trainerName} onBlur={e => trainerRepo.patch({ trainerName: e.target.value })} />
        </Field>
        <Field label={t('settings.brand.logo')} hint={t('settings.brand.logoHint')}>
          <div className="flex items-center gap-2">
            {trainer.logoDataUrl
              ? <img src={trainer.logoDataUrl} alt={t('settings.brand.logo')} className="h-9 w-auto max-w-[96px] rounded border border-line bg-white object-contain p-0.5" />
              : <span className="text-2xs text-faint">{t('settings.brand.noLogo')}</span>}
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (!f) return
                try { await trainerRepo.patch({ logoDataUrl: await resizeImageToDataUrl(f, LOGO_MAX_DIM, 0.92, 'image/png') }) }
                catch (err) { toastError(err instanceof Error ? err.message : String(err)) }
              }} />
            <Button size="sm" disabled={!canBrand.allowed} onClick={() => logoRef.current?.click()}>{trainer.logoDataUrl ? t('settings.brand.replaceLogo') : t('settings.brand.uploadLogo')}</Button>
            {trainer.logoDataUrl && <Button size="sm" variant="ghost" onClick={() => trainerRepo.patch({ logoDataUrl: undefined })}>{t('settings.brand.removeLogo')}</Button>}
          </div>
        </Field>
        <Field label={t('settings.brand.color')} hint={t('settings.brand.colorHint')}>
          <div className="flex items-center gap-2">
            <input type="color" disabled={!canBrand.allowed} aria-label={t('settings.brand.color')}
              value={validHex(trainer.brandColor) ? trainer.brandColor : '#1f6f50'}
              onChange={e => { const brandColor = e.target.value; void trainerRepo.patch({ brandColor }) }}
              className="h-9 w-12 cursor-pointer rounded border border-line bg-surface disabled:cursor-not-allowed disabled:opacity-50" />
            {trainer.brandColor && <Button size="sm" variant="ghost" onClick={() => trainerRepo.patch({ brandColor: undefined })}>{t('settings.brand.resetColor')}</Button>}
          </div>
        </Field>
        <Field label={t('settings.brand.units')}>
          <Select value={trainer.units} onChange={e => trainerRepo.patch({ units: e.target.value as 'lb' | 'kg' })}>
            <option value="lb">{t('settings.brand.unitsLb')}</option>
            <option value="kg">{t('settings.brand.unitsKg')}</option>
          </Select>
        </Field>
        <Field label={t('settings.brand.theme')}>
          <Select
            value={trainer.theme}
            onChange={e => {
              const theme = e.target.value as 'light' | 'dark' | 'system'
              trainerRepo.patch({ theme })
              const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
              document.documentElement.classList.toggle('dark', dark)
            }}
          >
            <option value="system">{t('settings.brand.themeSystem')}</option>
            <option value="light">{t('settings.brand.themeLight')}</option>
            <option value="dark">{t('settings.brand.themeDark')}</option>
          </Select>
        </Field>
      </div>
      <p className="mt-3 text-2xs text-faint">
        {!canBrand.allowed 
          ? canBrand.reason 
          : t('settings.brand.hintAllowed')}
      </p>
    </Card>
  )
}

function BrandMarkCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()
  if (!trainer) return null
  const canBrand = canUseCustomBranding(trainer)
  if (!canBrand.allowed) return null

  const current = trainer.sidebarLogoVariant ?? 'horizontal'
  return (
    <Card>
      <p className="mb-1 font-display text-base font-semibold">{t('settings.logo.title')}</p>
      <p className="mb-3 text-xs text-muted">{t('settings.logo.hint')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BRAND_MARK_VARIANTS.map(v => (
          <button
            key={v.key}
            onClick={() => trainerRepo.patch({ sidebarLogoVariant: v.key as BrandMarkVariant })}
            className={`flex flex-col items-center gap-3 rounded-ctl border px-3 py-4 transition-colors ${
              current === v.key ? 'border-verde-600 bg-verde-100/40' : 'border-line hover:bg-surface2'
            }`}
          >
            <div className="flex h-10 items-center justify-center">
              <BrandMark variant={v.key as BrandMarkVariant} />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-ink">{v.label}</p>
              <p className="text-2xs text-faint">{v.hint}</p>
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}

function AddRuleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    name: '', trigger: 'no-session-days' as AutomationTrigger,
    thresholdDays: '7', thresholdSessions: '2', message: '',
  })
  const { t } = useTranslation()
  const needsDays = form.trigger === 'no-session-days' || form.trigger === 'checkin-overdue-days' || form.trigger === 'payment-overdue-days'
  const needsCount = form.trigger === 'package-low-sessions'
  const placeholder = needsDays
    ? t('settings.automations.messageHintDays')
    : needsCount
    ? t('settings.automations.messageHintCount')
    : form.trigger === 'checkin-cadence-slipping'
    ? t('settings.automations.messageHintSlipping')
    : form.trigger === 'completion-trend-declining'
    ? t('settings.automations.messageHintDeclining')
    : 'Needs attention'

  async function save() {
    if (!form.name.trim()) return
    await automationRulesRepo.create({
      name: form.name.trim(), trigger: form.trigger,
      thresholdDays: needsDays ? Number(form.thresholdDays) || 7 : undefined,
      thresholdSessions: needsCount ? Number(form.thresholdSessions) || 2 : undefined,
      message: form.message.trim() || placeholder,
      active: true,
    })
    toast(t('settings.toast.ruleAdded', { name: form.name }))
    setForm({ name: '', trigger: 'no-session-days', thresholdDays: '7', thresholdSessions: '2', message: '' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('settings.automations.addRuleTitle')} width={460}>
      <div className="space-y-3">
        <Field label={t('settings.automations.nameLabel')}><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('settings.automations.namePlaceholder')} /></Field>
        <Field label={t('settings.automations.triggerLabel')}>
          <Select value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value as AutomationTrigger }))}>
            {Object.entries(TRIGGER_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        {needsDays && (
          <Field label={t('settings.automations.daysLabel')}><Input type="number" min="1" value={form.thresholdDays} onChange={e => setForm(f => ({ ...f, thresholdDays: e.target.value }))} className="font-mono tabular-nums" /></Field>
        )}
        {needsCount && (
          <Field label={t('settings.automations.sessionsLabel')}><Input type="number" min="0" value={form.thresholdSessions} onChange={e => setForm(f => ({ ...f, thresholdSessions: e.target.value }))} className="font-mono tabular-nums" /></Field>
        )}
        <Field label={t('settings.automations.messageLabel')} hint={
          needsDays ? t('settings.automations.messageHintDays')
          : needsCount ? t('settings.automations.messageHintCount')
          : form.trigger === 'checkin-cadence-slipping' ? t('settings.automations.messageHintSlipping')
          : form.trigger === 'completion-trend-declining' ? t('settings.automations.messageHintDeclining')
          : t('settings.automations.messageHintPlain')
        }>
          <Input value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder={placeholder} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('settings.automations.cancelBtn')}</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>{t('settings.automations.saveRuleBtn')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

function AutomationsCard() {
  const [addOpen, setAddOpen] = useState(false)
  const rules = useLiveQuery(() => automationRulesRepo.all(), [], [])
  const { t } = useTranslation()

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Zap size={16} className="text-verde-600" /><p className="font-display text-base font-semibold">{t('settings.automations.title')}</p></div>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> {t('settings.automations.addRuleBtn')}</Button>
      </div>
      <p className="mb-3 text-xs text-muted">
        {t('settings.automations.hint')}
      </p>
      <div className="mb-3">
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-faint">{t('settings.automations.alwaysOn')}</p>
        <div className="space-y-1">
          {DEFAULT_RULES.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2 text-sm">
              <span className="text-ink">{r.name}</span>
              <Tag>{TRIGGER_LABELS[r.trigger]}</Tag>
            </div>
          ))}
        </div>
      </div>
      {rules.length > 0 && (
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-faint">{t('settings.automations.yourRules')}</p>
          <div className="space-y-1">
            {rules.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2 text-sm">
                <div>
                  <span className="text-ink">{r.name}</span>
                  <span className="ms-2 text-2xs text-faint">{r.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => automationRulesRepo.update(r.id, { active: !r.active })} className="text-2xs text-muted hover:text-ink">
                    {r.active ? t('settings.automations.statusOn') : t('settings.automations.statusOff')}
                  </button>
                  <button onClick={async () => { await automationRulesRepo.remove(r.id); toast(t('settings.toast.ruleRemoved')) }} className="text-faint hover:text-signal-600"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <AddRuleDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </Card>
  )
}

function BackupCard() {
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation()

  async function backUp() {
    setBusy(true)
    try {
      const { filename, text } = await exportBackup(passphrase || undefined)
      downloadText(filename, text)
      await trainerRepo.patch({ lastBackupAt: nowIso() })
      toast(passphrase ? t('settings.toast.encryptedBackupDownloaded') : t('settings.toast.backupDownloaded'))
    } catch {
      toastError(t('settings.toast.backupFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">{t('settings.backup.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        {t('settings.backup.hint')}
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-xs">
          <Field label={t('settings.backup.passphraseLabel')} hint={t('settings.backup.passphraseHint')}>
            <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder={t('settings.backup.passphrasePlaceholder')} />
          </Field>
        </div>
        <Button variant="primary" onClick={backUp} disabled={busy}>
          <Download size={14} /> {busy ? t('settings.backup.btnBusy') : t('settings.backup.btnLabel')}
        </Button>
      </div>
      {passphrase && (
        <p className="mt-2 text-2xs text-ember-600">{t('settings.backup.passphraseWarning')}</p>
      )}
    </Card>
  )
}

function RestoreCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [passphrase, setPassphrase] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const { t } = useTranslation()

  async function onFile(file: File) {
    const text = await file.text()
    if (isEncryptedBackup(text) && !passphrase) {
      toastError(t('settings.toast.restorePassphraseNeeded'))
      return
    }
    if (mode === 'replace') {
      setPendingFile(file)
      return
    }
    await executeRestore(file, text)
  }

  async function executeRestore(file: File, preloadedText?: string) {
    try {
      const text = preloadedText ?? await file.text()
      const report = await importBackup(text, mode, passphrase || undefined)
      const total = Object.values(report.perTable).reduce((n, t) => n + t.applied, 0)
      toast(t('settings.toast.restoreComplete', { count: total, mode: mode === 'merge' ? 'merged' : 'restored' }))
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('settings.toast.restoreFailed'))
    } finally {
      setPendingFile(null)
      setConfirmText('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Upload size={16} className="text-muted" />
        <p className="font-display text-base font-semibold">{t('settings.restore.title')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('settings.restore.modeLabel')}>
          <Select value={mode} onChange={e => setMode(e.target.value as ImportMode)}>
            <option value="merge">{t('settings.restore.modeMerge')}</option>
            <option value="replace">{t('settings.restore.modeReplace')}</option>
          </Select>
        </Field>
        <Field label={t('settings.restore.passphraseLabel')} hint={t('settings.restore.passphraseHint')}>
          <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
        </Field>
      </div>
      {mode === 'replace' && (
        <p className="mt-2 text-2xs text-signal-600">{t('settings.restore.replaceWarning')}</p>
      )}
      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept={BACKUP_ACCEPT}
          className="hidden"
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button onClick={() => fileRef.current?.click()}>{t('settings.restore.chooseBtn')}</Button>
      </div>

      <Dialog open={!!pendingFile} onClose={() => setPendingFile(null)} title={t('settings.restore.dialogTitle')} width={400}>
        <div className="space-y-3">
          <p className="text-sm text-ink">
            {t('settings.restore.dialogBody')}
          </p>
          <Field label={t('settings.restore.dialogConfirmLabel')}>
            <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={t('settings.restore.dialogConfirmPlaceholder')} />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingFile(null)}>{t('settings.restore.cancelBtn')}</Button>
            <Button variant="primary" onClick={() => pendingFile && executeRestore(pendingFile)} disabled={confirmText !== 'RESTORE'}>
              {t('settings.restore.replaceBtn')}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}

function DataCard() {
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const [targetId, setTargetId] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const { t } = useTranslation()

  const targetClient = clients.find(c => c.id === targetId)

  async function wipeClient() {
    if (!targetClient) return
    await clientsRepo.hardDelete(targetClient.id)
    toast(t('settings.toast.clientWiped', { name: fullName(targetClient) }))
    setTargetId('')
    setConfirmName('')
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-ember-600" />
        <p className="font-display text-base font-semibold text-ember-600">{t('settings.danger.title')}</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        {t('settings.danger.hint')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 items-end">
        <Field label={t('settings.danger.selectLabel')}>
          <Select value={targetId} onChange={e => { setTargetId(e.target.value); setConfirmName('') }}>
            <option value="">{t('settings.danger.selectDefault')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </Select>
        </Field>
        {targetClient && (
          <Field label={t('settings.danger.confirmLabel', { name: fullName(targetClient) })}>
            <Input 
              value={confirmName} 
              onChange={e => setConfirmName(e.target.value)} 
              placeholder={fullName(targetClient)} 
            />
          </Field>
        )}
      </div>
      {targetClient && (
        <div className="mt-3 flex justify-end">
          <Button 
            variant="ghost" 
            className="text-ember-600 hover:bg-ember-500/10 hover:text-ember-600"
            onClick={wipeClient} 
            disabled={confirmName !== fullName(targetClient)}
          >
            {t('settings.danger.deleteBtn', { name: fullName(targetClient) })}
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <SectionHeader title={t('settings.title')} />
      <MembershipCard />
      <LicenceCard />
      <BrandCard />
      <BrandMarkCard />
      <ModulesCard />
      <BookingCard />
      <OnboardingSequenceCard />
      <NotificationsCard />
      {LOCAL_AI_ENABLED && <LocalAiCard />}
      <AutomationsCard />
      <Guide />
      <BackupCard />
      <RestoreCard />
      <DataCard />
    </div>
  )
}
