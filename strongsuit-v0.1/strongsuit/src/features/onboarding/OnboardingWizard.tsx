import { useEffect, useState } from 'react'
import { Check, Save, Play, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button, Input, Label, Card, FileDropzone, toastError } from '@/design'
import { trainerRepo, clientsRepo } from '@/db/repo'
import type { Trainer, Client } from '@/db/types'
import { newId, nowIso } from '@/lib/core'
import { APP_NAME } from '@/lib/brand'
import { Logomark } from '@/app/brand/Logomark'
import { importClientPackageText } from '@/db/portability'
import { parseCsv } from '@/lib/csv'
import ImportCsvDialog from '@/features/clients/ImportCsvDialog'

interface Props {
  trainer: Trainer
}

export default function OnboardingWizard({ trainer }: Props) {
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
        toastError("That CSV doesn't have any data rows to import.")
        return
      }
      setCsvImport({ headerRow: rows[0], dataRows: rows.slice(1) })
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't import that file.")
    } finally {
      setImporting(false)
    }
  }

  async function seedDemoData() {
    setSeeding(true)
    const t = nowIso()
    
    const demoClients: Client[] = [
      { id: newId(), createdAt: t, updatedAt: t, status: 'active', firstName: 'Alex', lastName: 'Demo', isDemo: true, email: 'alex@example.com', startDate: t, tags: [], goals: '', injuries: '', parqNotes: '' },
      { id: newId(), createdAt: t, updatedAt: t, status: 'active', firstName: 'Sam', lastName: 'Sample', isDemo: true, email: 'sam@example.com', startDate: t, tags: [], goals: '', injuries: '', parqNotes: '' },
      { id: newId(), createdAt: t, updatedAt: t, status: 'active', firstName: 'Jordan', lastName: 'Test', isDemo: true, email: 'jordan@example.com', startDate: t, tags: [], goals: '', injuries: '', parqNotes: '' }
    ]

    for (const c of demoClients) {
      await clientsRepo.create(c)
    }

    setSeeding(false)
    setStep(4)
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
      try { await navigator.storage.persist() } catch (e) { /* ignore */ }
    }
  }

  return (
    <div className="min-h-screen bg-surface2 flex items-center justify-center p-6">
      <Card className="max-w-xl w-full p-8 shadow-2xl border-line">

        {step === 1 && (
          <div className="text-center space-y-6">
            <Logomark size={48} animated className="mx-auto" />
            <h1 className="text-3xl font-display font-bold text-ink">Welcome to {APP_NAME}</h1>
            <p className="text-muted text-lg">
              The professional workshop instrument for coaches. Let's get your workspace set up in about 60 seconds.
            </p>
            <div className="pt-4">
              <Button variant="primary" className="w-full text-lg py-3" onClick={() => setStep(2)}>
                Get Started
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">Your Identity</h2>
              <p className="text-faint text-sm">This powers the Companion app that clients will see.</p>
            </div>

            <div className="space-y-4">
              <div><Label>Your Name</Label><Input 
                value={form.trainerName} onChange={e => setForm({ ...form, trainerName: e.target.value })} 
                autoFocus
              /></div>
              <div><Label>Business Name</Label><Input 
                value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} 
              /></div>
              
              <div>
                <Label>Units</Label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="units" value="lb" checked={form.units === 'lb'} onChange={() => setForm({ ...form, units: 'lb' })} />
                    <span className="text-ink font-medium">Pounds (lb)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="units" value="kg" checked={form.units === 'kg'} onChange={() => setForm({ ...form, units: 'kg' })} />
                    <span className="text-ink font-medium">Kilograms (kg)</span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-sm text-faint">
                  Custom branding (logos and colors) is unlocked automatically if you ever upgrade to Coachwright Membership. 
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(3)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">Demo Data</h2>
              <p className="text-faint text-sm">Explore with sample clients, bring in your real roster, or start empty.</p>
            </div>

            <div className="bg-surface2 p-6 rounded-xl border border-line text-center">
              <Play size={32} className="mx-auto text-verde-600 mb-4" />
              <h3 className="font-semibold text-lg text-ink mb-2">Explore with 3 sample clients</h3>
              <p className="text-muted text-sm mb-6 max-w-sm mx-auto">
                Includes sample history, check-ins, and active programs so you can see how the analytics and logger work. Remove them anytime in one click.
              </p>
              <Button variant="primary" className="w-full justify-center" onClick={seedDemoData} disabled={seeding}>
                {seeding ? 'Loading...' : 'Add Demo Data'}
              </Button>
            </div>

            <div>
              <Label>Or import your existing roster</Label>
              <p className="mb-2 text-2xs text-faint">A Coachwright client-package file, or a roster CSV exported from TrueCoach, Trainerize, and similar platforms.</p>
              <FileDropzone accept=".json,application/json,.csv,text/csv" onFile={handleRosterFile} />
              {importing && <p className="mt-1 text-2xs text-faint">Importing…</p>}
            </div>

            <div className="pt-4 flex justify-between border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button variant="ghost" onClick={() => setStep(4)}>
                Skip, start with an empty roster
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">Data Ownership</h2>
              <p className="text-faint text-sm">Your data is saved to your {APP_NAME} account and synced to every device you sign in on.</p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-5 rounded-xl border border-amber-200 dark:border-amber-900/50">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-500 rounded-lg shrink-0">
                  <Save size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900 dark:text-amber-500 mb-1">Your data lives in your account</h3>
                  <p className="text-amber-800/80 dark:text-amber-500/80 text-sm leading-relaxed mb-4">
                    Client data, programs, and history sync to your account and to every device you sign in on, including the web app. If the internet drops, changes wait on this device and upload when you're back.
                  </p>
                  <p className="text-amber-800/80 dark:text-amber-500/80 text-sm font-semibold">
                    Want your own copy too? We'll remind you to export a backup file every 7 days.
                  </p>
                </div>
              </div>
            </div>

            {importedCount !== null && (
              <p className="text-sm text-verde-600">
                {importedCount === 1 ? '1 client imported.' : `${importedCount} clients imported.`}
              </p>
            )}

            {/* Storage-persistence check — the single guarantee that actually
                matters for local-first data: will the browser keep it under
                storage pressure. Informational only, never a gate — a "not
                granted" browser still works, per Chromium/Firefox's own
                (heuristic, no-permission-prompt) persistence model. */}
            <div className="flex items-center gap-2 text-xs text-muted">
              {storagePersisted === null ? (
                <span className="text-faint">Checking storage…</span>
              ) : storagePersisted ? (
                <><ShieldCheck size={14} className="text-verde-600" /> Persistent storage granted — your data won't be cleared under storage pressure.</>
              ) : (
                <><ShieldAlert size={14} className="text-ember-600" /> Persistent storage not granted by this browser. Your data still works fully offline — regular backups matter a bit more here.</>
              )}
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button variant="primary" onClick={complete}><Check size={16} className="me-2" /> I understand, let's go</Button>
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
