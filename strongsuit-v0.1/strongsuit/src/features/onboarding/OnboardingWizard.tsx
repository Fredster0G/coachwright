import { useEffect, useState } from 'react'
import { Check, Save, Play, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button, Input, Label, Card, FileDropzone, toastError } from '@/design'
import { trainerRepo } from '@/db/repo'
import type { Trainer } from '@/db/types'
import { seedDemoRoster } from '@/db/demo'
import { useTranslation } from '@/lib/i18n'
import { APP_NAME } from '@/lib/brand'
import { Logomark } from '@/app/brand/Logomark'
import { importClientPackageText } from '@/db/portability'
import { parseCsv } from '@/lib/csv'
import ImportCsvDialog from '@/features/clients/ImportCsvDialog'

interface Props {
  trainer: Trainer
}

export default function OnboardingWizard({ trainer }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    trainerName: trainer.trainerName || '',
    businessName: trainer.businessName || '',
    units: trainer.units || 'lb',
  })
  const [seeding, setSeeding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [csvImport, setCsvImport] = useState<{ headerRow: string[]; dataRows: string[][] } | null>(null)
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)

  useEffect(() => {
    if (step !== 4) return
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(setStoragePersisted).catch(() => setStoragePersisted(false))
    } else {
      setStoragePersisted(false)
    }
  }, [step])

  // Logo handling removed as it's gated for new free-tier accounts

  async function handleRosterFile(file: File) {
    const text = await file.text()
    const isJson = file.name.toLowerCase().endsWith('.json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')
    setImporting(true)
    try {
      if (isJson) {
        const reports = await importClientPackageText(text)
        setImportedCount(reports.length)
        setStep(4)
        return
      }
      const rows = parseCsv(text)
      if (rows.length < 2) {
        toastError(t('onboard.csvEmpty'))
        return
      }
      setCsvImport({ headerRow: rows[0], dataRows: rows.slice(1) })
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('onboard.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  // Real sample data (db/demo.ts): an active program, three weeks of
  // sessions, check-ins and weigh-ins per client — what step 3 promises.
  // It used to create three bare client rows, with a timestamp as startDate.
  async function seedDemoData() {
    setSeeding(true)
    try {
      await seedDemoRoster(form.units as 'lb' | 'kg')
      setStep(4)
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    } finally {
      setSeeding(false)
    }
  }

  async function complete() {
    await trainerRepo.patch({
      trainerName: form.trainerName,
      businessName: form.businessName,
      units: form.units as 'lb' | 'kg',
      onboardingComplete: true
    })
    
    // Attempt storage persist
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist() } catch { /* informational only */ }
    }
  }

  return (
    <div className="min-h-screen bg-surface2 flex items-center justify-center p-6">
      <Card className="max-w-xl w-full p-8 shadow-2xl border-line">

        {step === 1 && (
          <div className="text-center space-y-6">
            <Logomark size={48} animated className="mx-auto" />
            <h1 className="text-3xl font-display font-bold text-ink">{t('onboard.welcome', { app: APP_NAME })}</h1>
            <p className="text-muted text-lg">
              {t('onboard.intro')}
            </p>
            <div className="pt-4">
              <Button variant="primary" className="w-full text-lg py-3" onClick={() => setStep(2)}>
                {t('onboard.getStarted')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">{t('onboard.identity')}</h2>
              <p className="text-faint text-sm">{t('onboard.identityHint')}</p>
            </div>

            <div className="space-y-4">
              <div><Label>{t('onboard.yourName')}</Label><Input 
                value={form.trainerName} onChange={e => setForm({ ...form, trainerName: e.target.value })} 
                autoFocus
              /></div>
              <div><Label>{t('onboard.businessName')}</Label><Input 
                value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} 
              /></div>
              
              <div>
                <Label>{t('onboard.units')}</Label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="units" value="lb" checked={form.units === 'lb'} onChange={() => setForm({ ...form, units: 'lb' })} />
                    <span className="text-ink font-medium">{t('onboard.lb')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="units" value="kg" checked={form.units === 'kg'} onChange={() => setForm({ ...form, units: 'kg' })} />
                    <span className="text-ink font-medium">{t('onboard.kg')}</span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-sm text-faint">
                  {t('onboard.brandingNote')}
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(1)}>{t('onboard.back')}</Button>
              <Button variant="primary" onClick={() => setStep(3)}>{t('onboard.continue')}</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">{t('onboard.demoTitle')}</h2>
              <p className="text-faint text-sm">{t('onboard.demoHint')}</p>
            </div>

            <div className="bg-surface2 p-6 rounded-xl border border-line text-center">
              <Play size={32} className="mx-auto text-verde-600 mb-4" />
              <h3 className="font-semibold text-lg text-ink mb-2">{t('onboard.demoCardTitle')}</h3>
              <p className="text-muted text-sm mb-6 max-w-sm mx-auto">
                {t('onboard.demoCardBody')}
              </p>
              <Button variant="primary" className="w-full justify-center" onClick={seedDemoData} disabled={seeding}>
                {seeding ? t('onboard.loading') : t('onboard.addDemo')}
              </Button>
            </div>

            <div>
              <Label>{t('onboard.importLabel')}</Label>
              <p className="mb-2 text-2xs text-faint">{t('onboard.importHint')}</p>
              <FileDropzone accept=".json,application/json,.csv,text/csv" onFile={handleRosterFile} />
              {importing && <p className="mt-1 text-2xs text-faint">{t('onboard.importing')}</p>}
            </div>

            <div className="pt-4 flex justify-between border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(2)}>{t('onboard.back')}</Button>
              <Button variant="ghost" onClick={() => setStep(4)}>
                {t('onboard.skip')}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">{t('onboard.dataTitle')}</h2>
              <p className="text-faint text-sm">{t('onboard.dataHint', { app: APP_NAME })}</p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-5 rounded-xl border border-amber-200 dark:border-amber-900/50">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-500 rounded-lg shrink-0">
                  <Save size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900 dark:text-amber-500 mb-1">{t('onboard.dataCardTitle')}</h3>
                  <p className="text-amber-800/80 dark:text-amber-500/80 text-sm leading-relaxed mb-4">
                    {t('onboard.dataCardBody')}
                  </p>
                  <p className="text-amber-800/80 dark:text-amber-500/80 text-sm font-semibold">
                    {t('onboard.dataCardBackup')}
                  </p>
                </div>
              </div>
            </div>

            {importedCount !== null && (
              <p className="text-sm text-verde-600">
                {t('onboard.imported', { count: importedCount })}
              </p>
            )}

            {/* Storage-persistence check — will the browser keep this device's
                cache (and any not-yet-uploaded changes) under storage pressure. Informational only, never a gate — a "not
                granted" browser still works, per Chromium/Firefox's own
                (heuristic, no-permission-prompt) persistence model. */}
            <div className="flex items-center gap-2 text-xs text-muted">
              {storagePersisted === null ? (
                <span className="text-faint">{t('onboard.storageChecking')}</span>
              ) : storagePersisted ? (
                <><ShieldCheck size={14} className="text-verde-600" /> {t('onboard.storageYes')}</>
              ) : (
                <><ShieldAlert size={14} className="text-ember-600" /> {t('onboard.storageNo')}</>
              )}
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(3)}>{t('onboard.back')}</Button>
              <Button variant="primary" onClick={complete}><Check size={16} className="me-2" /> {t('onboard.finish')}</Button>
            </div>
          </div>
        )}

      </Card>

      {csvImport && (
        <ImportCsvDialog
          headerRow={csvImport.headerRow}
          dataRows={csvImport.dataRows}
          open={!!csvImport}
          onClose={() => { setCsvImport(null); setStep(4) }}
          activeClientCount={0}
          hasActiveMembership={false}
        />
      )}
    </div>
  )
}
