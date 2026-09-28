import { app, BrowserWindow, ipcMain, Menu, protocol, net, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { pathToFileURL } from 'url'
import { buildAppMenu } from './menu'
import { loadWindowState, trackWindowState, MIN_SIZE } from './windowState'
import { resolveAppAsset, windowOpenAction } from './policy'

const APP_NAME = 'Coachwright'
const APP_SCHEME = 'app'
const DEV_ORIGIN = 'http://localhost:5173'
const APP_ORIGINS = [`${APP_SCHEME}://coachwright`, DEV_ORIGIN]

// Registered before `app.ready` (required — Electron docs) so the scheme
// behaves like http/https for relative-URL resolution (`standard: true`,
// needed because index.html's assets use relative `./assets/...` paths) and
// can serve ES modules (`supportFetchAPI`/`corsEnabled`).
//
// THIS IS THE ACTUAL FIX for the packaged app never having worked: it always
// shipped via `loadFile()` over the raw `file://` protocol, and Chromium
// treats every `file://` document as its own opaque origin — which blocks
// `<script type="module">` and the `modulePreload`/dynamic `import()` calls
// this app's route code-splitting depends on with a bare `ERR_FAILED`, no
// further detail. Dev mode never hit this because it loads over a real
// `http://localhost:5173` origin. Serving the packaged build over a custom
// privileged scheme instead — the standard fix for Electron + Vite ESM
// output — gives it a real, stable origin ES modules can load under.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
      // Needed so public/sw.js (a self-removing worker since S23) can run
      // once and unregister the old offline cache on existing installs.
      allowServiceWorkers: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null


function createWindow() {
  // Splash shows immediately (native window boot is instant; the renderer's
  // own BootScreen takes over once the page itself loads) — frameless, no
  // chrome, closed the moment the main window is ready to paint.
  //
  // Path note: splash.html is a static asset in electron/, and `tsc` only
  // emits .js — it was never copied into dist-electron/, so the previous
  // `path.join(__dirname, 'splash.html')` resolved to a file that does not
  // exist and every launch logged ERR_FILE_NOT_FOUND behind a blank splash
  // window. `electron/**/*` is in package.json's build.files, so going up one
  // level from dist-electron/ works in the packaged app too.
  const splashPath = path.join(__dirname, '../electron/splash.html')
  if (fs.existsSync(splashPath)) {
    splashWindow = new BrowserWindow({
      width: 360,
      height: 360,
      frame: false,
      resizable: false,
      transparent: false,
      backgroundColor: '#171A1E',
      show: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    splashWindow.loadFile(splashPath)
  }

  // Create Main Window, restoring last session's size/position (T11).
  const saved = loadWindowState()
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    // macOS keeps the native inset traffic lights — already looks right, and
    // the app menu lives in the system-wide bar outside the window. Windows
    // and Linux go fully frameless: the native fallback for those platforms
    // is a boxy classic title bar plus an always-visible menu row, which
    // reads as dated. TitleBar.tsx (renderer) draws the real chrome for
    // those platforms instead, driven by the IPC handlers below.
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : { frame: false as const }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  buildAppMenu(mainWindow, APP_NAME)
  trackWindowState(mainWindow)

  // Per-window events (not per-app IPC channels, so re-adding these on a
  // second createWindow() call — the macOS `activate`-with-no-windows path —
  // is fine; each new mainWindow gets its own listeners).
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximized-change', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-maximized-change', false))

  mainWindow.once('ready-to-show', () => {
    splashWindow?.close()
    splashWindow = null
    // Maximize before showing, so a restored-maximized window doesn't visibly
    // pop from its windowed size to full screen on every launch.
    if (saved.maximized) mainWindow?.maximize()
    mainWindow?.show()
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // Load the Vite app. Dev talks to the real Vite dev server (a genuine
  // http:// origin, so ES modules load with no special handling needed).
  // Packaged loads over the app:// protocol registered in app.whenReady()
  // below — see the scheme-registration comment up top for why this can't
  // just be loadFile() over file://.
  // CW_SERVE_DIST=1 runs an unpackaged build exactly like the packaged one
  // (built dist/ over app://) — for checking the real renderer path without
  // making an installer.
  const isDev = !app.isPackaged && !process.env.CW_SERVE_DIST
  if (isDev) {
    mainWindow.loadURL(DEV_ORIGIN)
  } else {
    mainWindow.loadURL(`${APP_SCHEME}://coachwright/index.html`)
  }

  // Open devtools
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }
}



// Prevent new windows and arbitrary navigation
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // Dev server, the packaged app's own app:// origin, or (legacy) file://
    // — anything else gets blocked.
    const allowed = parsedUrl.origin === DEV_ORIGIN
      || navigationUrl.startsWith(`${APP_SCHEME}://`)
      || navigationUrl.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
    }
  })
  
  // `window.open` / `target="_blank"`: the app's own pages (print sheets,
  // TV mode — `#/print/...`, `#/tv/...`) open as another app window with the
  // same locked-down preferences; web links (Stripe Checkout, the billing
  // portal, video links) go to the OS's default browser; anything else (a
  // custom scheme, javascript:) is refused. S25: before, app:// pages were
  // refused too, so Print and TV mode silently did nothing in the packaged app.
  contents.setWindowOpenHandler(({ url }) => {
    const action = windowOpenAction(url, APP_ORIGINS)
    if (action === 'app-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100, height: 850, autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      }
    }
    if (action === 'external') shell.openExternal(url)
    return { action: 'deny' }
  })
})

app.whenReady().then(() => {
  // Serves the packaged renderer over app:// instead of file:// — see the
  // scheme-registration comment near the top of this file. `request.url`
  // for the document itself is `app://coachwright/index.html`; every asset
  // it references with a relative path (`./assets/x.js`) arrives here as
  // `app://coachwright/assets/x.js`, since `standard: true` above makes this
  // scheme resolve relative URLs the same way http/https do.
  const distRoot = path.join(__dirname, '../dist')
  protocol.handle(APP_SCHEME, request => {
    // resolveAppAsset refuses paths that decode to outside dist/ (an encoded
    // `..%2F` survives URL parsing) — S25.
    const filePath = resolveAppAsset(distRoot, new URL(request.url).pathname)
    if (!filePath) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(filePath).toString())
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- IPC Handlers for the custom window chrome (TitleBar.tsx) ---
// Windows/Linux run with frame:false (see createWindow), which drops the
// native minimize/maximize/close affordances and the menu bar's display —
// these replace them. Registered once at module scope, not inside
// createWindow, since ipcMain.handle throws if a channel is registered
// twice and createWindow can run again (macOS activate-with-no-windows).

ipcMain.handle('window-minimize', () => { mainWindow?.minimize() })
ipcMain.handle('window-maximize-toggle', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.handle('window-close', () => { mainWindow?.close() })
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)
// Local-AI sizing (hardwareProbe.ts). The renderer asked for this since the
// Local AI card was built, but no handler existed — so the desktop app always
// reported "can't tell how much memory", and OCR, voice, the assistant and
// the larger pose models were never offered on desktop (found S25).
ipcMain.handle('system-info', async () => {
  let freeDiskGb: number | undefined
  try {
    const st = await fs.promises.statfs(app.getPath('userData'))
    freeDiskGb = Math.round((st.bavail * st.bsize) / 1024 ** 3)
  } catch { /* unknown */ }
  return { totalMemGb: os.totalmem() / 1024 ** 3, cores: os.cpus().length, freeDiskGb }
})

ipcMain.handle('show-app-menu', () => {
  if (mainWindow) Menu.getApplicationMenu()?.popup({ window: mainWindow })
})

