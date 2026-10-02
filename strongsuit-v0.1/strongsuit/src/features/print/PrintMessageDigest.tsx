import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { clientsRepo, trainerRepo, messagesRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { APP_NAME } from '@/lib/brand'
import { artifactBrand } from '@/lib/branding'
import { useTranslation } from '@/lib/i18n'

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', 'in-person': 'In Person', phone: 'Phone', other: 'Other',
}

export default function PrintMessageDigest() {
  const { clientId = '' } = useParams()
  const navigate = useNavigate()

  const client = useLiveQuery(() => clientsRepo.get(clientId), [clientId])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const messages = useLiveQuery(() => messagesRepo.forClient(clientId), [clientId])
  const { t } = useTranslation()

  useEffect(() => {
    if (client && trainer && messages) {
      setTimeout(() => window.print(), 500)
    }
  }, [client, trainer, messages])

  if (!client || !trainer || !messages) return <div className="p-8">{t('print.digest.loading')}</div>

  const brand = artifactBrand(trainer)
  const business = brand.name
  const name = fullName(client)

  // Reverse to show chronological (oldest first) for print
  const sorted = [...messages].reverse()

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans text-sm">
      {/* Header */}
      <div className="mb-6 pb-4 border-b-2 border-black flex flex-wrap justify-between items-end gap-x-4 gap-y-2">
        <div>
          <div className="flex items-center gap-3">
            {brand.logo && <img src={brand.logo} alt="" className="h-10 w-auto max-w-[120px] object-contain" />}
            <h1 className="text-2xl font-bold uppercase tracking-tight">{business}</h1>
          </div>
          <h2 className="text-lg text-gray-600 mt-1">{t('print.digest.title', { name })}</h2>
        </div>
        <div className="text-end text-xs text-gray-500">
          <p>{t('print.digest.messageCount', { count: String(sorted.length) })}</p>
          <p>{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="py-12 text-center text-gray-400">{t('print.digest.empty')}</div>
      ) : (
        <div className="space-y-3">
          {sorted.map(msg => (
            <div
              key={msg.id}
              className="flex gap-3 items-start border-b border-gray-100 pb-3"
            >
              {/* Direction + Channel badge */}
              <div className="flex flex-col items-center gap-1 w-20 shrink-0">
                <span
                  className="text-xs font-bold uppercase rounded px-2 py-0.5"
                  style={{
                    background: msg.direction === 'outbound' ? '#171A1E' : '#155E4E',
                    color: '#fff',
                  }}
                >
                  {msg.direction === 'outbound' ? t('print.digest.sent') : t('print.digest.received')}
                </span>
                <span className="text-xs text-gray-400">
                  {CHANNEL_LABELS[msg.channel] || msg.channel}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>

              {/* Date */}
              <div className="text-xs text-gray-400 font-mono shrink-0 w-24 text-end">
                {msg.date}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
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
