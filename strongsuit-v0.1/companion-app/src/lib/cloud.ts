// Companion talks to the same Coachwright Cloud as the coach app, but only to
// the `/client/*` routes, with a token scoped to ONE client of ONE coach
// (issued by redeeming the coach's connect code).

export const CLOUD_URL: string = (import.meta.env.VITE_CLOUD_URL as string | undefined)?.replace(/\/+$/, '')
  || (import.meta.env.DEV ? 'http://localhost:4000' : 'https://api.coachwright.app')

export class CloudError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function clientApi<T>(path: string, token: string | null, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (init.json !== undefined) headers['content-type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${CLOUD_URL}${path}`, {
      method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    })
  } catch {
    throw new CloudError('You’re offline — this will sync when you’re back online.', 0)
  }
  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new CloudError(data.error || `Request failed (${res.status})`, res.status)
  return data as T
}
