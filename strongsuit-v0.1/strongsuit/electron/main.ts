import { app, BrowserWindow, ipcMain, Menu, protocol, net, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { pathToFileURL } from 'url'
import { buildAppMenu } from './menu'
import { loadWindowState, trackWindowState, MIN_SIZE } from './windowState'

const APP_NAME = 'Coachwright'
const APP_SCHEME = 'app'

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
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
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
    const allowed = parsedUrl.origin === 'http://localhost:5173'
      || navigationUrl.startsWith(`${APP_SCHEME}://`)
      || navigationUrl.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
    }
  })
  
  // A `target="_blank"` link (Stripe Checkout, the billing portal, video
  // links, print-preview "open in browser") never opens a second Electron
  // window — 'deny' always wins here. http/https instead get handed to the
  // OS's real default browser via shell.openExternal, which is what a link
  // clicked inside a desktop app should do; anything else (a custom scheme,
  // a javascript: URL) is denied outright with no fallback. Before this,
  // every such link was a silent no-op in the packaged app.
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
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
  protocol.handle(APP_SCHEME, request => {
    const { pathname } = new URL(request.url)
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
    const filePath = path.join(__dirname, '../dist', relative)
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
ipcMain.handle('show-app-menu', () => {
  if (mainWindow) Menu.getApplicationMenu()?.popup({ window: mainWindow })
})

