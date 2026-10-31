import templateHtml from './template.html?raw'
import type { Client, Program, Trainer, Exercise, CoachMessage } from '@/db/types'
import { artifactBrand } from '@/lib/branding'

export function generateCompanionFile(
  client: Client,
  program: Program,
  trainer: Trainer,
  exercises: Exercise[],
  messages: CoachMessage[] = []
) {
  const brand = artifactBrand(trainer)

  const payload = {
    client: {
      id: client.id,
      name: client.firstName || 'Client',
    },
    program,
    trainer: {
      name: brand.name,
      logo: brand.logo,
    },
    exercises: exercises.map(e => ({ id: e.id, name: e.name })),
    messages: messages.map(m => ({ id: m.id, date: m.date, content: m.content, direction: m.direction }))
  }

  const json = JSON.stringify(payload)
  
  // Replace the placeholder strings inside the HTML template
  const finalHtml = templateHtml
    .replace('/*__SS_PAYLOAD__*/', `<script>window.__SS_PAYLOAD = ${json};</script>`)
    .replace('/*__SS_BRAND_COLOR__*/', brand.color ?? '#3b82f6')

  // Trigger download
  const blob = new Blob([finalHtml], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${client.firstName || 'client'}_companion.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
