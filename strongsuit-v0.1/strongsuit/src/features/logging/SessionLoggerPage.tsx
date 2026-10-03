import { useState, useEffect, useRef } from 'react'
import { LOCAL_AI_ENABLED } from '@/lib/cloud/config'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, Plus, Trash2, PlayCircle, Mic, Square, ScanLine } from 'lucide-react'
import { Button, Card, SectionHeader, LogoSpinner } from '@/design'
import { toast, toastError } from '@/design/overlay'
import { today, stamp } from '@/lib/core'
import { clientsRepo, programsRepo, exercisesRepo, logsRepo, trainerRepo, staffRepo } from '@/db/repo'
import type { SessionLog, Client, Exercise, LogEntry, LoggedSet, Trainer, Staff } from '@/db/types'
import { getActiveStaffId } from '@/lib/activeStaff'
import { createSessionLogTemplate, completeSet, shownLoad } from './api'
import { Stepper } from './Stepper'
import { RestTimer } from './RestTimer'
import { VideoViewerDialog } from '../library/VideoViewer'
import { exerciseVideos } from '@/lib/videoEmbed'
import ExerciseSearch from '../programs/builder/ExerciseSearch'
import { suggestNext, type Suggestion, type Performance } from '@/lib/progression'
import { isSpeechModelInstalled, transcribeAudio } from '@/lib/speech'
import { createVoiceRecorder, type VoiceRecorder } from './voiceCapture'
import { parseSetLog, isEmpty as parsedIsEmpty } from '@/lib/setLogParser'
import { isOcrModelInstalled } from '@/lib/ocr'
import { LogSheetScanDialog } from './LogSheetScanDialog'
import type { ParsedLogSheet } from '@/lib/logSheetParser'
import { useTranslation } from '@/lib/i18n'

export default function SessionLoggerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const clientId = searchParams.get('clientId')
  const programId = searchParams.get('programId')
  const dayId = searchParams.get('dayId')

  const [client, setClient] = useState<Client | null>(null)
  const [trainer, setTrainer] = useState<Trainer | null>(null)
  const [log, setLog] = useState<SessionLog | null>(null)
  const [exercises, setExercises] = useState<Record<string, Exercise>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [searchOpen, setSearchOpen] = useState(false)
  const [restSeconds, setRestSeconds] = useState<number | null>(null)
  const [restKey, setRestKey] = useState(0)
  const [videoFor, setVideoFor] = useState<Exercise | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({})
  const [staff, setStaff] = useState<Staff[]>([])

  // ---- Voice logging (opt-in, on-device — lib/speech.ts) ----
  // Only one set can be "listening" at a time — a shared recorder instance
  // rather than one per row, since a coach only has one voice.
  const [speechReady, setSpeechReady] = useState(false)
  const [recordingKey, setRecordingKey] = useState<string | null>(null)
  const [transcribingKey, setTranscribingKey] = useState<string | null>(null)
  const recorderRef = useRef<VoiceRecorder | null>(null)

  useEffect(() => {
    if (LOCAL_AI_ENABLED) isSpeechModelInstalled().then(setSpeechReady)
  }, [])

  // ---- Log-sheet scanning (opt-in, on-device — lib/ocr.ts) ----
  const [ocrReady, setOcrReady] = useState(false)
  const [scanForEntry, setScanForEntry] = useState<number | null>(null)

  useEffect(() => {
    if (LOCAL_AI_ENABLED) isOcrModelInstalled().then(setOcrReady)
  }, [])

  /** Fills the entry's sets sequentially starting from the first one —
   *  scanning is for a workout already done, so every filled set is marked
   *  done and gets the rest timer skipped (unlike the live status-toggle
   *  flow, there's no "rest" to time after the fact). Extends the sets
   *  array with new rows if the scan found more sets than the entry has. */
  function applyScannedSets(eIdx: number, sets: ParsedLogSheet['sets']) {
    if (!log) return
    const entry = log.entries[eIdx]
    const newSets = [...entry.sets]
    sets.forEach((s, i) => {
      const existing = newSets[i] ?? { done: false }
      newSets[i] = {
        ...existing,
        done: true,
        ...(s.load != null ? { actualLoad: s.load } : {}),
        ...(s.reps != null ? { actualReps: s.reps } : {}),
        ...(s.rpe != null ? { rpe: s.rpe } : {}),
      }
    })
    updateEntry(eIdx, { sets: newSets })
    toast(t('logger.scanApplied', { count: sets.length }))
  }

  async function toggleVoiceSet(key: string, updateSet: (updates: Partial<LoggedSet>) => void) {
    if (recordingKey === key) {
      // Stop and transcribe the set that's currently listening.
      setRecordingKey(null)
      setTranscribingKey(key)
      try {
        const audio = await recorderRef.current!.stop()
        const text = await transcribeAudio(audio)
        const parsed = parseSetLog(text)
        if (parsedIsEmpty(parsed)) {
          toast(t('logger.heardNothing', { text: text || t('logger.nothing') }))
        } else {
          const updates: Partial<LoggedSet> = {}
          if (parsed.load != null) updates.actualLoad = parsed.load
          if (parsed.reps != null) updates.actualReps = parsed.reps
          if (parsed.rpe != null) updates.rpe = parsed.rpe
          updateSet(updates)
          const heard = [
            parsed.load != null ? `${parsed.load} ${trainer?.units ?? 'lb'}` : null,
            parsed.reps != null ? `× ${parsed.reps}` : null,
            parsed.rpe != null ? `RPE ${parsed.rpe}` : null,
          ].filter(Boolean).join(' ')
          toast(t('logger.heard', { text: parsed.raw, parsed: heard }))
        }
      } catch (e) {
        toastError(e instanceof Error ? e.message : t('logger.transcribeFailed'))
      } finally {
        setTranscribingKey(null)
      }
      return
    }
    if (recordingKey || transcribingKey) return // one at a time
    try {
      recorderRef.current = createVoiceRecorder()
      await recorderRef.current.start()
      setRecordingKey(key)
    } catch {
      toastError(t('logger.micFailed'))
    }
  }

  // Initialize
  useEffect(() => {
    if (!clientId) {
      navigate('/')
      return
    }

    async function init() {
      try {
        const [c, tr, s] = await Promise.all([
          clientsRepo.get(clientId!),
          trainerRepo.getOrCreate(),
          staffRepo.all(),
        ])
        setStaff(s)
        if (!c) {
          toastError(t('logger.clientNotFound'))
          navigate('/')
          return
        }
        setClient(c)
        setTrainer(tr)

        const allEx = await exercisesRepo.all()
        const exMap: Record<string, Exercise> = {}
        for (const ex of allEx) exMap[ex.id] = ex
        setExercises(exMap)

        let policy = undefined
        if (programId && dayId) {
          const p = await programsRepo.get(programId)
          if (p) {
            policy = p.progressionPolicy
            let foundDay = null
            for (const w of p.weeks) {
              for (const d of w.days) {
                if (d.id === dayId) foundDay = d
              }
            }
            if (foundDay) {
              const template = createSessionLogTemplate(c.id, p, foundDay)
              setLog(template)
              
              if (policy) {
                const sugs: Record<string, Suggestion> = {}
                for (const entry of template.entries) {
                  const dbHist = await logsRepo.exerciseHistory(c.id, entry.exerciseId)
                  const history: Performance[] = dbHist.map(h => ({
                    date: h.date,
                    sets: h.sets.map(s => ({ load: s.actualLoad, reps: s.actualReps, rpe: s.rpe, done: s.done }))
                  }))
                  const s = suggestNext(policy, history, tr.units)
                  if (s) sugs[entry.exerciseId] = s
                }
                setSuggestions(sugs)
              }
            }
          }
        }

        // Freestyle fallback if no program/day found or passed
        setLog(prev => prev ?? (stamp({
          clientId: c.id,
          date: today(),
          title: t('logger.freestyle'),
          entries: [],
          source: 'trainer' as const
        } as Partial<SessionLog>) as SessionLog))
      } catch (e) {
        console.error(e)
        toastError(t('logger.loadFailed'))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [clientId, programId, dayId, navigate])

  const handleSave = async () => {
    if (!log) return
    setSaving(true)
    try {
      const activeStaffId = getActiveStaffId(staff)
      await logsRepo.create(activeStaffId ? { ...log, staffId: activeStaffId } : log)
      toast(t('logger.saved'))
      navigate(`/clients/${log.clientId}?tab=logs`)
    } catch (e) {
      console.error(e)
      toastError(t('logger.saveFailed'))
      setSaving(false)
    }
  }

  const updateEntry = (index: number, updates: Partial<LogEntry>) => {
    if (!log) return
    const newEntries = [...log.entries]
    newEntries[index] = { ...newEntries[index], ...updates }
    setLog({ ...log, entries: newEntries })
  }

  const removeEntry = (index: number) => {
    if (!log) return
    const newEntries = [...log.entries]
    newEntries.splice(index, 1)
    setLog({ ...log, entries: newEntries })
  }

  const handleAddExercise = (exerciseId: string) => {
    if (!log) return
    const newEntry: LogEntry = {
      exerciseId,
      sets: [{ done: false }]
    }
    setLog({ ...log, entries: [...log.entries, newEntry] })
    setSearchOpen(false)
  }

  if (loading || !client || !log) {
    return (
      <div className="flex h-full items-center justify-center">
        <LogoSpinner className="text-faint" size={24} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl h-full pb-32 pt-6 px-4">
      <SectionHeader 
        title={log.title || t('logger.session')}
        action={
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(-1)}><ChevronLeft size={16}/> {t('logger.cancel')}</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? <LogoSpinner size={16} className="me-1.5" /> : <Check size={16} className="me-1.5" />}
              {t('logger.save')}
            </Button>
          </div>
        }
      />
      <div className="mb-6 -mt-2 text-sm text-faint font-medium">
        {t('logger.loggingFor', { name: `${client.firstName} ${client.lastName}`, date: log.date })}
      </div>

      <div className="space-y-6 mt-6">
        {log.entries.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-line rounded-lg">
            <p className="text-faint mb-4">{t('logger.noExercises')}</p>
            <Button variant="secondary" onClick={() => setSearchOpen(true)}>
              <Plus size={16} className="me-1.5" /> {t('logger.addExercise')}
            </Button>
          </div>
        ) : (
          log.entries.map((entry, eIdx) => {
            const ex = exercises[entry.exerciseId]
            return (
              <Card key={eIdx} className="overflow-hidden">
                <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-ink">{ex?.name || t('logger.unknownExercise')}</h3>
                    {ex && exerciseVideos(ex).length > 0 && (
                      <button onClick={() => setVideoFor(ex)} className="text-verde-600 hover:text-verde-700" title={t('logger.watchVideo')} aria-label={t('logger.watchVideo')}>
                        <PlayCircle size={16} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {ocrReady && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setScanForEntry(eIdx)}
                        className="text-faint hover:text-ink"
                        title={t('logger.scanSheet')} aria-label={t('logger.scanSheet')}
                      >
                        <ScanLine size={14} />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => removeEntry(eIdx)} aria-label={t('logger.removeExercise', { name: ex?.name ?? t('logger.unknownExercise') })} className="text-faint hover:text-signal-600">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {suggestions[entry.exerciseId] && (
                  <div className="mb-4 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-md text-sm">
                    <div className="flex items-center gap-2 text-indigo-900 font-medium mb-1">
                      <span className="bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded text-xs">{t('logger.suggestion')}</span>
                      {suggestions[entry.exerciseId].load && <span>{suggestions[entry.exerciseId].load} {trainer?.units}</span>}
                      {suggestions[entry.exerciseId].reps && <span>× {suggestions[entry.exerciseId].reps}</span>}
                    </div>
                    <p className="text-indigo-700/80 text-xs italic">{suggestions[entry.exerciseId].reason}</p>
                  </div>
                )}

                <div className="space-y-3">
                  {entry.sets.map((set, sIdx) => {
                    const updateSet = (updates: Partial<typeof set>) => {
                      const newSets = [...entry.sets]
                      newSets[sIdx] = { ...set, ...updates }
                      updateEntry(eIdx, { sets: newSets })
                    }
                    const voiceKey = `${eIdx}-${sIdx}`
                    const isRecording = recordingKey === voiceKey
                    const isTranscribing = transcribingKey === voiceKey
                    const voiceBusyElsewhere = (recordingKey !== null && !isRecording) || (transcribingKey !== null && !isTranscribing)
                    return (
                      <div key={sIdx} className={`flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg border ${set.done ? 'border-verde-600/30 bg-verde-100/60' : 'border-line bg-surface'}`}>
                        {/* Status Toggle (Big touch target) */}
                        <button
                          onClick={() => {
                            const nowDone = !set.done
                            updateSet(nowDone ? completeSet(set) : { done: false })
                            if (nowDone) {
                              setRestSeconds(entry.restSeconds ?? trainer?.defaultRestSeconds ?? 90)
                              setRestKey(k => k + 1)
                            }
                          }}
                          aria-label={set.done ? t('logger.markNotDone', { n: sIdx + 1 }) : t('logger.markDone', { n: sIdx + 1 })}
                          aria-pressed={set.done}
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${set.done ? 'bg-verde-600 text-white' : 'bg-surface2 text-faint hover:bg-line'}`}
                        >
                          <Check size={20} strokeWidth={set.done ? 3 : 2} />
                        </button>
                        
                        <div className="flex-1 grid grid-cols-2 gap-4">
                          {/* Load Input */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-medium text-faint">{t('logger.load', { units: trainer?.units === 'kg' ? 'kg' : 'lb' })}</label>
                              {set.targetLoad != null && <span className="text-[10px] text-muted">{t('logger.target', { value: `${set.targetLoad}${set.targetLoadMode === 'rpe' ? ' RPE' : set.targetLoadMode === 'percent1rm' ? '%' : ''}` })}</span>}
                            </div>
                            <Stepper 
                              value={shownLoad(set)}
                              onChange={(v) => updateSet({ actualLoad: v })}
                              step={2.5}
                              min={0}
                              className="w-full"
                            />
                          </div>

                          {/* Reps Input */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-medium text-faint">{t('logger.reps')}</label>
                              {set.targetReps != null && <span className="text-[10px] text-muted">{t('logger.target', { value: set.targetReps })}</span>}
                            </div>
                            <Stepper 
                              value={set.actualReps} 
                              onChange={(v) => updateSet({ actualReps: v })}
                              step={1}
                              min={0}
                              placeholder="-"
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* RPE (Optional, fits on same row on wide screens, wraps on small) */}
                        <div className="sm:w-24">
                           <label className="text-xs font-medium text-faint mb-1 block">{t('logger.rpe')}</label>
                           <Stepper 
                             value={set.rpe} 
                             onChange={(v) => updateSet({ rpe: v })}
                             step={0.5}
                             min={1}
                             max={10}
                             placeholder="-"
                             className="w-full"
                           />
                        </div>

                        {/* Voice logging — only shown once the model is installed
                            (Settings → On-device AI); speaks straight into
                            actualLoad/actualReps/rpe above, heard-text confirmed
                            via toast rather than applied silently. */}
                        {speechReady && (
                          <button
                            type="button"
                            onClick={() => toggleVoiceSet(voiceKey, updateSet)}
                            disabled={voiceBusyElsewhere || isTranscribing}
                            title={isRecording ? t('logger.voiceStop') : t('logger.voiceStart')}
                            aria-label={isRecording ? t('logger.voiceStop') : t('logger.voiceStart')}
                            className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                              isRecording ? 'bg-signal-600 text-white animate-pulse' : 'bg-surface2 text-muted hover:bg-line'
                            }`}
                          >
                            {isTranscribing ? <LogoSpinner size={16} /> : isRecording ? <Square size={16} /> : <Mic size={16} />}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => {
                    const newSets = [...entry.sets, { done: false }]
                    updateEntry(eIdx, { sets: newSets })
                  }}>
                    <Plus size={14} className="me-1.5" /> {t('logger.addSet')}
                  </Button>

                  <input
                    type="text"
                    placeholder={t('logger.notePlaceholder')}
                    aria-label={t('logger.notePlaceholder')}
                    className="flex-1 ms-4 bg-transparent border-b border-dashed border-line text-sm focus:outline-none focus:border-verde-600"
                    value={entry.notes || ''}
                    onChange={e => updateEntry(eIdx, { notes: e.target.value })}
                  />
                </div>
              </Card>
            )
          })
        )}

        {log.entries.length > 0 && (
          <div className="flex justify-center pt-4">
            <Button variant="secondary" onClick={() => setSearchOpen(true)}>
              <Plus size={16} className="me-1.5" /> {t('logger.addAnother')}
            </Button>
          </div>
        )}
      </div>

      <ExerciseSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(ex) => handleAddExercise(ex.id)}
      />

      {restSeconds != null && (
        <RestTimer key={restKey} seconds={restSeconds} onDismiss={() => setRestSeconds(null)} />
      )}

      <VideoViewerDialog
        title={videoFor?.name ?? t('logger.video')}
        links={videoFor ? exerciseVideos(videoFor) : []}
        open={!!videoFor}
        onClose={() => setVideoFor(null)}
      />

      <LogSheetScanDialog
        open={scanForEntry != null}
        onClose={() => setScanForEntry(null)}
        units={trainer?.units ?? 'lb'}
        onApply={sets => { if (scanForEntry != null) applyScannedSets(scanForEntry, sets) }}
      />
    </div>
  )
}
