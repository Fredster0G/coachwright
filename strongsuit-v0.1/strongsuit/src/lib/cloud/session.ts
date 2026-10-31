// ===== Coach account session =====
//
// The bearer token lives in localStorage, NOT in IndexedDB: the trainer row
// syncs to the cloud, and a session token must never ride along to other
// devices. Everything that talks to the server goes through `api()`, which
// attaches the token and turns a 401 into a signed-out state.

import { CLOUD_URL } from './config'

export interface CloudSession {
  token: string
  accountId: string
  email: string
}

const KEY = 'cw.cloud.session'
const listeners = new Set<() => void>()

function read(): CloudSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as CloudSession : null
  } catch {
    return null
  }
}

let current: CloudSession | null = read()

export function getSession(): CloudSession | null { return current }

function setSession(s: CloudSession | null) {
  current = s
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch { /* storage refused — session lasts for this tab only */ }
  for (const l of listeners) l()
}

export function onSessionChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export class CloudError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

/** Fetch against the cloud with the session token. Network failures throw a
 *  CloudError with status 0 so callers can tell "offline" from "refused". */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
  if (current) headers.authorization = `Bearer ${current.token}`
  let body = init.body
  if (init.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(init.json) }
  let res: Response
  try {
    res = await fetch(`${CLOUD_URL}${path}`, { ...init, headers, body })
  } catch {
    throw new CloudError('Can’t reach Coachwright Cloud — check your connection.', 0)
  }
  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) {
    if (res.status === 401 && current && !path.startsWith('/auth/login') && !path.startsWith('/auth/signup')) setSession(null)
    throw new CloudError(data.error || `Request failed (${res.status})`, res.status)
  }
  return data as T
}

interface AuthResponse { token: string; account: { id: string; email: string } }

export async function signUp(email: string, password: string, name?: string): Promise<CloudSession> {
  const r = await api<AuthResponse>('/auth/signup', { method: 'POST', json: { email, password, name } })
  const s = { token: r.token, accountId: r.account.id, email: r.account.email }
  setSession(s)
  return s
}

export async function signIn(email: string, password: string): Promise<CloudSession> {
  const r = await api<AuthResponse>('/auth/login', { method: 'POST', json: { email, password } })
  const s = { token: r.token, accountId: r.account.id, email: r.account.email }
  setSession(s)
  return s
}

export async function signOut(): Promise<void> {
  try { await api('/auth/logout', { method: 'POST' }) } catch { /* signing out locally regardless */ }
  setSession(null)
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api('/auth/password', { method: 'POST', json: { currentPassword, newPassword } })
}

/** Emails a one-time reset link. Resolves the same whether or not the email
 *  has an account — the server never says which. */
export async function requestPasswordReset(email: string): Promise<void> {
  await api('/auth/reset/request', { method: 'POST', json: { email } })
}

/** Redeem the emailed token: sets the new password, signs every device out,
 *  and signs this one in. */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<CloudSession> {
  const r = await api<AuthResponse>('/auth/reset/confirm', { method: 'POST', json: { token: token.trim(), newPassword } })
  const s = { token: r.token, accountId: r.account.id, email: r.account.email }
  setSession(s)
  return s
}

/** Permanently erase the account on the server (cancels a membership first).
 *  The caller erases this device's copy. */
export async function deleteAccount(password: string): Promise<void> {
  await api('/auth/account', { method: 'DELETE', json: { password } })
  setSession(null)
}
