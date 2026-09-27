import { useState, useMemo, useEffect, useRef } from 'react'
import { LOCAL_AI_ENABLED } from '@/lib/cloud/config'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Plus, Dumbbell, Pencil, PlayCircle, Trash2, Sparkles } from 'lucide-react'
import { exercisesRepo } from '@/db/repo'
import type { Exercise, ExerciseCategory, ExerciseVideoLink } from '@/db/types'
import { createFuzzyIndex } from '@/lib/fuzzy'
import { isEmbeddingsModelInstalled } from '@/lib/embeddings'
import { ensureExercisesIndexed, semanticSearch, type IndexProgress } from '@/lib/exerciseSemanticIndex'
import { stamp } from '@/lib/core'
import { exerciseVideos } from '@/lib/videoEmbed'
import { VideoViewerDialog } from './VideoViewer'
import {
  Button, Input, Dialog, Table, Tag, SectionHeader, EmptyState, Field, Textarea, Select, toast
} from '@/design'

const CATEGORIES: ExerciseCategory[] = ['squat', 'hinge', 'push', 'pull', 'lunge', 'carry', 'core', 'conditioning', 'mobility']

function ExerciseDetailDialog({
  exercise,
  open,
  onClose
}: {
  exercise: Exercise | null,
  open: boolean,
  onClose: () => void
}) {
  const isNew = exercise && !exercise.id
  const isCustom = isNew || exercise?.isCustom

  const [form, setForm] = useState<Partial<Exercise>>({})

  // Initialize form when exercise changes
  useEffect(() => {
    if (exercise) {
      setForm({ ...exercise })
    }
  }, [exercise])

  const set = <K extends keyof Exercise>(k: K) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value as Exercise[K] }))

  const videoLinks = form.videoLinks ?? []
  const setVideoLinks = (links: ExerciseVideoLink[]) => setForm(f => ({ ...f, videoLinks: links }))

  const setArray = (k: keyof Exercise) => (e: { target: { value: string } }) => {
    // split by newline or comma depending on the field
    const val = e.target.value
    if (k === 'cues') {
      setForm(f => ({ ...f, cues: val.split('\n').filter(s => s.trim()) }))
    } else {
      setForm(f => ({ ...f, [k]: val.split(',').map(s => s.trim()).filter(Boolean) }))
    }
  }

  async function save() {
    if (!form.name?.trim() || !form.category) return

    const payload = {
      ...form,
      cues: form.cues || [],
      primaryMuscles: form.primaryMuscles || [],
      equipment: form.equipment || [],
      aliases: form.aliases || [],
      videoLinks: videoLinks.filter(l => l.url.trim()),
    } as Exercise

    if (isNew) {
      payload.isCustom = true
      await exercisesRepo.create(payload as Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>)
      toast(`Created custom exercise: ${payload.name}`)
    } else if (exercise) {
      await exercisesRepo.update(exercise.id, payload)
      toast(`Updated ${payload.name}`)
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={isNew ? "New exercise" : "Edit exercise"} width={480}>
      <div className="grid grid-cols-2 gap-3">
        {isCustom ? (
          <>
            <Field label="Name"><Input autoFocus value={form.name || ''} onChange={set('name')} /></Field>
            <Field label="Category">
              <Select value={form.category || 'squat'} onChange={set('category')}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Aliases" hint="comma separated">
              <Input value={(form.aliases || []).join(', ')} onChange={setArray('aliases')} />
            </Field>
            <Field label="Primary Muscles" hint="comma separated">
              <Input value={(form.primaryMuscles || []).join(', ')} onChange={setArray('primaryMuscles')} />
            </Field>
          </>
        ) : (
          <div className="col-span-2 mb-2 p-3 bg-surface2 rounded-md border border-line text-sm text-muted">
            <p className="font-semibold text-ink mb-1">{form.name}</p>
            <p>Seed library exercises have locked core metadata to ensure program builder reliability. You can still customize cues, equipment, and video links.</p>
          </div>
        )}

        <Field label="Equipment" hint="comma separated">
          <Input value={(form.equipment || []).join(', ')} onChange={setArray('equipment')} />
        </Field>
        <Field label="Default Tracking">
          <Select value={form.defaultTracking || 'weight_reps'} onChange={set('defaultTracking')}>
            <option value="weight_reps">Weight & Reps</option>
            <option value="reps">Reps only</option>
            <option value="time">Time</option>
            <option value="distance">Distance</option>
            <option value="rpe_only">RPE only</option>
          </Select>
        </Field>

        <div className="col-span-2">
          <Field label="Video links" hint="YouTube/Vimeo play in-app; anything else opens in a new tab">
            <div className="space-y-2">
              {videoLinks.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="w-28 shrink-0" placeholder="Label" value={link.label}
                    onChange={e => setVideoLinks(videoLinks.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                  />
                  <Input
                    type="url" placeholder="https://" value={link.url}
                    onChange={e => setVideoLinks(videoLinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setVideoLinks(videoLinks.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setVideoLinks([...videoLinks, { label: videoLinks.length ? `Angle ${videoLinks.length + 1}` : 'Coaching cue', url: '' }])}>
                <Plus size={13} /> Add video link
              </Button>
            </div>
          </Field>
        </div>

        <div className="col-span-2">
          <Field label="Coaching Cues" hint="one per line. imperative voice (e.g. 'Chest up')">
            <Textarea value={(form.cues || []).join('\n')} onChange={setArray('cues')} rows={4} />
          </Field>
        </div>
      </div>
      
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!form.name?.trim()}>Save exercise</Button>
      </div>
    </Dialog>
  )
}

export default function LibraryPage() {
  const exercises = useLiveQuery(() => exercisesRepo.all(), [], undefined)
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<ExerciseCategory | 'all'>('all')
  
  const [editItem, setEditItem] = useState<Exercise | null>(null)
  const [videoItem, setVideoItem] = useState<Exercise | null>(null)

  // Build the in-memory fuzzy index when the exercises array changes
  const searcher = useMemo(() => {
    return createFuzzyIndex(exercises || [], e => [e.name, ...e.aliases])
  }, [exercises])

  // ---- Semantic search (opt-in, on-device — lib/exerciseSemanticIndex.ts) ----
  // Fuzzy search above stays the instant, always-on default; this is a
  // second mode a coach turns on deliberately, and only once the model is
  // actually installed (Settings → On-device AI) — never auto-enabled, and
  // never silently triggers the ~130MB download itself.
  const [semanticMode, setSemanticMode] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [indexing, setIndexing] = useState<IndexProgress | null>(null)
  const [semanticResults, setSemanticResults] = useState<Exercise[] | null>(null)
  const [semanticSearching, setSemanticSearching] = useState(false)
  const searchSeq = useRef(0)

  useEffect(() => {
    if (LOCAL_AI_ENABLED) isEmbeddingsModelInstalled().then(setModelReady)
  }, [])

  // Index (or refresh) the library the moment semantic mode is actually
  // turned on, not on every render — indexing an already-current library is
  // cheap (see ensureExercisesIndexed's own comment) but still real async
  // work with a progress state worth showing once, not on every keystroke.
  useEffect(() => {
    if (!semanticMode || !modelReady || !exercises) return
    let cancelled = false
    setIndexing({ done: 0, total: exercises.length })
    ensureExercisesIndexed(exercises, p => { if (!cancelled) setIndexing(p) })
      .finally(() => { if (!cancelled) setIndexing(null) })
    return () => { cancelled = true }
  }, [semanticMode, modelReady, exercises])

  // Debounced so typing doesn't fire a fresh model inference on every
  // keystroke; searchSeq guards against an in-flight older query's result
  // landing after a newer one's, since embedText's latency isn't fixed.
  useEffect(() => {
    if (!semanticMode || !modelReady || indexing) { setSemanticResults(null); return }
    const q = query.trim()
    if (!q) { setSemanticResults(null); return }
    const seq = ++searchSeq.current
    setSemanticSearching(true)
    const timer = setTimeout(() => {
      semanticSearch(q, exercises || []).then(results => {
        if (searchSeq.current === seq) { setSemanticResults(results.map(r => r.exercise)); setSemanticSearching(false) }
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [semanticMode, modelReady, indexing, query, exercises])

  const filtered = useMemo(() => {
    if (!exercises) return []
    let list = exercises

    if (semanticMode && modelReady && query.trim()) {
      list = semanticResults ?? []
    } else if (query.trim()) {
      // Fuzzy search
      const results = searcher(query)
      list = results.map(r => r.item)
    } else {
      // sort alphabetically if no search
      list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    }

    // Category filter
    if (activeCat !== 'all') {
      list = list.filter(e => e.category === activeCat)
    }

    return list
  }, [exercises, query, activeCat, searcher, semanticMode, modelReady, semanticResults])

  const loading = exercises === undefined

  const openNew = () => {
    setEditItem(stamp({
      name: '', aliases: [], category: activeCat !== 'all' ? activeCat : 'squat',
      primaryMuscles: [], equipment: [], cues: [], isCustom: true, defaultTracking: 'weight_reps'
    } as any) as Exercise)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <SectionHeader
        title="Exercise Library"
        action={
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus size={14} /> New exercise
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        {/* Search */}
        <div className="flex max-w-md items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              className="ps-9"
              placeholder={semanticMode ? "Describe what you need (e.g. 'low-impact rear delt work')…" : "Search 1,000+ exercises by name or slang (e.g. 'rdl')..."}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {LOCAL_AI_ENABLED && <button
            type="button"
            onClick={() => modelReady && setSemanticMode(m => !m)}
            disabled={!modelReady}
            title={modelReady
              ? 'Search by meaning, not just name — describe what you need in plain language.'
              : 'Download the semantic search model in Settings → On-device AI to turn this on.'}
            className={`flex shrink-0 items-center gap-1 rounded-ctl border px-2.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              semanticMode ? 'border-verde-600 bg-verde-100/60 text-verde-700' : 'border-line text-muted hover:bg-surface2'
            }`}
          >
            <Sparkles size={13} />
            Meaning
          </button>}
        </div>
        {semanticMode && indexing && (
          <p className="text-2xs text-faint">Indexing library for semantic search… {indexing.done}/{indexing.total}</p>
        )}

        {/* Category Chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCat('all')}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              activeCat === 'all' ? 'bg-ink text-surface border-ink' : 'bg-surface text-muted border-line hover:border-ink/30'
            }`}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors capitalize ${
                activeCat === cat ? 'bg-ink text-surface border-ink' : 'bg-surface text-muted border-line hover:border-ink/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse p-4 text-sm text-faint">Loading library…</div>
      ) : semanticMode && (semanticSearching || indexing) && query.trim() ? (
        <div className="animate-pulse p-4 text-sm text-faint">
          {indexing ? 'Indexing library…' : 'Searching by meaning…'}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Dumbbell size={28} strokeWidth={1.25} />}
          title="No exercises found"
          body={
            semanticMode && query
              ? "Nothing scored as a close enough match by meaning — try rephrasing, or turn off Meaning to search by name."
              : query ? "Try a different search term or category." : "Your library is empty."
          }
          action={!query && <Button variant="primary" onClick={openNew}><Plus size={14} /> Add exercise</Button>}
        />
      ) : (
        <Table head={
          <>
            <th className="w-1/3">Exercise</th>
            <th>Category</th>
            <th>Equipment</th>
            <th>Muscles</th>
            <th className="w-12"></th>
          </>
        }>
          {filtered.map(ex => (
            <tr key={ex.id} className="group cursor-pointer hover:bg-surface2" onClick={() => setEditItem(ex)}>
              <td>
                <div className="flex flex-col">
                  <div className="font-medium text-ink flex items-center gap-2">
                    {ex.name}
                    {ex.isCustom && <Tag tone="neutral">Custom</Tag>}
                    {exerciseVideos(ex).length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); setVideoItem(ex) }}
                        className="text-verde-600 hover:text-verde-700" title="Watch video" aria-label="Watch video"
                      >
                        <PlayCircle size={14} />
                      </button>
                    )}
                  </div>
                  {ex.aliases.length > 0 && (
                    <div className="text-xs text-faint truncate mt-0.5">
                      aka: {ex.aliases.join(', ')}
                    </div>
                  )}
                </div>
              </td>
              <td className="capitalize text-sm text-muted">{ex.category}</td>
              <td className="text-sm text-muted">{ex.equipment.join(', ') || '—'}</td>
              <td className="text-sm text-muted">{ex.primaryMuscles.join(', ') || '—'}</td>
              <td className="text-end">
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pencil size={14} />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <ExerciseDetailDialog
        exercise={editItem}
        open={editItem !== null}
        onClose={() => setEditItem(null)}
      />
      <VideoViewerDialog
        title={videoItem?.name ?? 'Video'}
        links={videoItem ? exerciseVideos(videoItem) : []}
        open={videoItem !== null}
        onClose={() => setVideoItem(null)}
      />
    </div>
  )
}
