import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { clientsRepo, trainerRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { PARQ_QUESTIONS, PARQ_SOURCE, assumptionOfRiskText, informedConsentText } from '@/lib/parq'
import { APP_NAME } from '@/lib/brand'
import { artifactBrand } from '@/lib/branding'
import { useTranslation } from '@/lib/i18n'

export default function PrintIntakeSheet() {
  const { clientId = '' } = useParams()
  const navigate = useNavigate()

  const client = useLiveQuery(() => clientsRepo.get(clientId), [clientId])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const { t } = useTranslation()

  useEffect(() => {
    if (client && trainer) {
      setTimeout(() => window.print(), 500)
    }
  }, [client, trainer])

  if (!client || !trainer) return <div className="p-8">{t('print.intake.loading')}</div>

  const brand = artifactBrand(trainer)
  const business = brand.name
  const name = fullName(client)
  const hasScreening = !!client.screening

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans text-sm leading-relaxed">
      {/* Header */}
      <div className="mb-6 pb-4 border-b-2 border-black flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3">
            {brand.logo && <img src={brand.logo} alt="" className="h-10 w-auto max-w-[120px] object-contain" />}
            <h1 className="text-2xl font-bold uppercase tracking-tight">{business}</h1>
          </div>
          <h2 className="text-lg text-gray-600 mt-1">{t('print.intake.title', { name })}</h2>
        </div>
        <div className="text-end text-xs text-gray-500">
          <p>{t('print.intake.date', { date: new Date().toLocaleDateString() })}</p>
        </div>
      </div>

      {/* Client Info Section */}
      <div className="mb-8 break-inside-avoid">
        <h3 className="text-base font-bold bg-gray-100 p-2 mb-4 border-s-4 border-black">{t('print.intake.infoTitle')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="border-b border-gray-300 pb-2">
            <span className="text-xs text-gray-500 block">{t('print.intake.fullName')}</span>
            <span className="font-medium">{name || '________________________________'}</span>
          </div>
          <div className="border-b border-gray-300 pb-2">
            <span className="text-xs text-gray-500 block">{t('print.intake.email')}</span>
            <span className="font-medium">{client.email || '________________________________'}</span>
          </div>
          <div className="border-b border-gray-300 pb-2">
            <span className="text-xs text-gray-500 block">{t('print.intake.phone')}</span>
            <span className="font-medium">{client.phone || '________________________________'}</span>
          </div>
          <div className="border-b border-gray-300 pb-2">
            <span className="text-xs text-gray-500 block">{t('print.intake.startDate')}</span>
            <span className="font-medium">{client.startDate || '________________________________'}</span>
          </div>
          <div className="border-b border-gray-300 pb-2 col-span-2">
            <span className="text-xs text-gray-500 block">{t('print.intake.goals')}</span>
            <span className="font-medium">{client.goals || '________________________________________________________________'}</span>
          </div>
          <div className="border-b border-gray-300 pb-2 col-span-2">
            <span className="text-xs text-gray-500 block">{t('print.intake.injuries')}</span>
            <span className="font-medium">{client.injuries || '________________________________________________________________'}</span>
          </div>
        </div>
      </div>

      {/* PAR-Q+ Section */}
      <div className="mb-8 break-inside-avoid">
        <h3 className="text-base font-bold bg-gray-100 p-2 mb-4 border-s-4 border-black">
          {t('print.intake.parqTitle')}
        </h3>
        <p className="text-xs text-gray-500 mb-4">{PARQ_SOURCE}</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="py-2 text-start w-[80%]">{t('print.intake.question')}</th>
              <th className="py-2 text-center w-[10%]">{t('print.intake.yes')}</th>
              <th className="py-2 text-center w-[10%]">{t('print.intake.no')}</th>
            </tr>
          </thead>
          <tbody>
            {PARQ_QUESTIONS.map((q, i) => {
              const answered = hasScreening ? client.screening!.answers.find(a => a.q === q) : null
              return (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-3 pe-4">{q}</td>
                  <td className="py-3 text-center">
                    {answered ? (answered.yes ? '■' : '□') : '□'}
                  </td>
                  <td className="py-3 text-center">
                    {answered ? (answered.yes ? '□' : '■') : '□'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {hasScreening && (
          <div className="mt-4 p-3 border border-gray-300 rounded bg-gray-50 text-xs">
            <span className="font-bold">{t('print.intake.screeningResult')}</span>
            {client.screening!.cleared
              ? t('print.intake.cleared')
              : t('print.intake.flagged', { count: String(client.screening!.flags.length) })}
            {client.screening!.note && <span className="block mt-1 italic">{t('print.intake.note', { note: client.screening!.note })}</span>}
          </div>
        )}
        <div className="mt-4 text-xs text-gray-500">
          <p>{t('print.intake.physicianRecommendation')}</p>
        </div>
      </div>

      {/* Assumption of Risk */}
      <div className="mb-8 break-inside-avoid">
        <h3 className="text-base font-bold bg-gray-100 p-2 mb-4 border-s-4 border-black">{t('print.intake.riskTitle')}</h3>
        <div className="text-xs whitespace-pre-line text-gray-700 mb-6">
          {assumptionOfRiskText(business, name)}
        </div>
        <div className="grid grid-cols-2 gap-8 mt-6">
          <div className="border-b border-black pt-12">
            <span className="text-xs text-gray-500">{t('print.intake.signature')}</span>
          </div>
          <div className="border-b border-black pt-12">
            <span className="text-xs text-gray-500">{t('print.intake.dateLabel')}</span>
          </div>
        </div>
      </div>

      {/* Informed Consent */}
      <div className="mb-8 break-inside-avoid">
        <h3 className="text-base font-bold bg-gray-100 p-2 mb-4 border-s-4 border-black">{t('print.intake.consentTitle')}</h3>
        <div className="text-xs whitespace-pre-line text-gray-700 mb-6">
          {informedConsentText(business)}
        </div>
        <div className="grid grid-cols-2 gap-8 mt-6">
          <div className="border-b border-black pt-12">
            <span className="text-xs text-gray-500">{t('print.intake.signature')}</span>
          </div>
          <div className="border-b border-black pt-12">
            <span className="text-xs text-gray-500">{t('print.intake.dateLabel')}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
        {t('print.footer', { business, appName: APP_NAME })}
      </div>

      <div className="mt-8 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-800 text-white rounded font-medium cursor-pointer"
        >
          {t('print.back')}
        </button>
      </div>
    </div>
  )
}
