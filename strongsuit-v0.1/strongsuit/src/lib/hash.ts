const te = new TextEncoder()

/** sha-256 hex, used for tamper-evident waiver hashes and general integrity. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(text)))
  return Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('')
}
