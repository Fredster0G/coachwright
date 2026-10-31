// ===== Pure decisions for the main process — no Electron import, so tested =====
import * as path from 'path'

/** Map an app:// pathname to a file inside `root`, or null if it would
 *  escape it. `new URL()` normalises literal `..` segments but not an
 *  encoded slash (`..%2F..%2Fetc`), which only becomes a traversal after
 *  decoding — so the check has to happen on the resolved path. */
export function resolveAppAsset(root: string, pathname: string): string | null {
  let relative: string
  try { relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname) } catch { return null }
  const base = path.resolve(root)
  // Backslashes are separators on Windows; treat them as such everywhere.
  const target = path.resolve(base, '.' + '/' + relative.replace(/\\/g, '/'))
  return target.startsWith(base + path.sep) ? target : null
}

export type OpenAction = 'app-window' | 'external' | 'deny'

/** What `window.open` / `target="_blank"` should do. The app's own pages
 *  (print sheets, TV mode) open as another app window; web links go to the
 *  OS browser; anything else (custom schemes, javascript:) is refused. */
export function windowOpenAction(url: string, appOrigins: readonly string[]): OpenAction {
  let parsed: URL
  try { parsed = new URL(url) } catch { return 'deny' }
  if (appOrigins.some(o => url === o || url.startsWith(o + '/') || url.startsWith(o + '#'))) return 'app-window'
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return 'external'
  return 'deny'
}
