import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { programsRepo, clientsRepo, exercisesRepo, trainerRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { Logomark } from '@/app/brand/Logomark'
import { artifactBrand } from '@/lib/branding'
import { useTranslation } from '@/lib/i18n'

export default function PrintSessionSheet() {
  const { clientId = '', programId = '' } = useParams()
  const navigate = useNavigate()

  const client = useLiveQuery(() => clientsRepo.get(clientId), [clientId])
  const program = useLiveQuery(() => programsRepo.get(programId), [programId])
  const exercises = useLiveQuery(() => exercisesRepo.all(), [])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()

  useEffect(() => {
    if (client && program && exercises && trainer) {
      // Trigger print dialog once data is loaded
      setTimeout(() => {
        window.print()
      }, 500)
    }
  }, [client, program, exercises, trainer])

  if (!client || !program || !exercises || !trainer) return <div className="p-8">{t('print.session.loading')}</div>

  const exMap = new Map(exercises.map(e => [e.id, e.name]))
  
  const brand = artifactBrand(trainer)
  const business = brand.name

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans">
      <div className="mb-8 pb-4 border-b-2 border-black flex flex-wrap justify-between items-end gap-x-4 gap-y-2">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">{fullName(client)}</h1>
          <h2 className="text-xl text-gray-600 mt-1">{program.name}</h2>
        </div>
        <div className="flex items-center gap-2 text-end text-sm text-gray-500">
          <div>
            <p className="font-semibold text-gray-700">{business}</p>
            <p>{new Date().toLocaleDateString()}</p>
          </div>
          {/* tone pinned: this page is always white paper, regardless of the app's current theme */}
          {brand.logo
            ? <img src={brand.logo} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
            : <Logomark size={28} tone="dark" />}
        </div>
      </div>

      <div className="space-y-12">
        {program.weeks.map((week) => (
          <div key={week.id} className="break-inside-avoid">
            <h3 className="text-2xl font-bold bg-gray-100 p-2 mb-6 border-s-4 border-black">{week.label}</h3>
            
            <div className="space-y-8 ps-4">
              {week.days.map((day) => (
                <div key={day.id} className="break-inside-avoid">
                  <h4 className="text-xl font-bold mb-4">{day.name}</h4>
                  
                  <div className="space-y-6">
                    {day.blocks.map((block) => (
                      <div key={block.id} className="border border-gray-300 rounded p-4">
                        {block.label && (
                          <div className="font-bold text-gray-800 mb-3 text-lg border-b border-gray-200 pb-1">
                            {block.intervalSpec ? t('print.session.intervalSpec', { label: block.label, spec: block.intervalSpec }) : block.label}
                          </div>
                        )}

                        <table className="w-full text-start text-sm border-collapse">
                          <thead>
                            <tr className="border-b-2 border-gray-300">
                              <th className="py-2 w-1/2">{t('print.progress.exercise')}</th>
                              <th className="py-2 text-center w-16">{t('print.session.sets')}</th>
                              <th className="py-2 text-center">{t('print.session.load')}</th>
                              <th className="py-2 text-center">{t('print.session.repsTime')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {block.exercises.map((ex) => {
                              const exName = exMap.get(ex.exerciseId) || t('print.session.unknownExercise')
                              return (
                                <tr key={ex.id} className="border-b border-gray-200">
                                  <td className="py-3 pe-4 align-top">
                                    <div className="font-semibold text-base">{exName}</div>
                                    {ex.note && <div className="text-xs text-gray-500 mt-1 italic">{ex.note}</div>}
                                    {ex.tempo && <div className="text-xs text-gray-500 mt-1">{t('print.session.tempo', { tempo: ex.tempo })}</div>}
                                    {ex.restSeconds && <div className="text-xs text-gray-500 mt-1">{t('print.session.rest', { rest: String(ex.restSeconds) })}</div>}
                                  </td>
                                  <td className="py-3 text-center align-top font-bold text-gray-400">
                                    {ex.sets.map((_, i) => <div key={i} className="mb-2 h-8 flex items-center justify-center">{i + 1}</div>)}
                                  </td>
                                  <td className="py-3 text-center align-top px-2">
                                    {ex.sets.map((set, i) => (
                                      <div key={i} className="mb-2 h-8 border border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs">
                                        {set.load ? set.load : '___'}
                                      </div>
                                    ))}
                                  </td>
                                  <td className="py-3 text-center align-top px-2">
                                    {ex.sets.map((set, i) => (
                                      <div key={i} className="mb-2 h-8 border border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs">
                                        {set.reps ? set.reps : set.timeSeconds ? `${set.timeSeconds}s` : '___'}
                                      </div>
                                    ))}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 print:hidden">
        <button 
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-800 text-white rounded font-medium cursor-pointer"
        >
          {t('print.backToClient')}
        </button>
      </div>
    </div>
  )
}
