const { app, BrowserWindow, shell, globalShortcut, ipcMain, Menu } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow = null
let backendProcess = null

function getBackendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'ebook-backend.exe')
  }
  return null
}

function killBackend() {
  if (!backendProcess) return
  try {
    spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], { shell: false })
  } catch (e) {}
  backendProcess = null
}

function startBackend() {
  const exePath = getBackendPath()
  if (!exePath || !fs.existsSync(exePath)) return
  backendProcess = spawn(exePath, [], { detached: false, stdio: 'ignore' })
}

function waitForBackend(url, retries = 60) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      fetch(url).then(() => resolve()).catch(() => {
        if (n <= 0) return reject(new Error('Backend non disponible'))
        setTimeout(() => check(n - 1), 500)
      })
    }
    check(retries)
  })
}

const LOADING_HTML = `data:text/html,<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #1a1a1a;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #94a3b8;
    gap: 16px;
    -webkit-app-region: drag;
  }
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid #1e293b;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { font-size: 13px; letter-spacing: 0.05em; }
</style></head>
<body>
  <div class="spinner"></div>
  <p>Démarrage en cours…</p>
</body>
</html>`

// ── IPC window controls ────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL().split('#')[0]
    if (url.split('#')[0] !== current) event.preventDefault()
  })

  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Couper', role: 'cut', enabled: params.editFlags.canCut },
      { label: 'Copier', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Coller', role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { label: 'Tout sélectionner', role: 'selectAll' },
    ])
    menu.popup()
  })

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer crashed:', details.reason)
    setTimeout(() => mainWindow.reload(), 1000)
  })

  if (app.isPackaged) {
    mainWindow.loadURL(LOADING_HTML)
    try {
      await waitForBackend('http://localhost:8000/api/config')
    } catch (e) {
      console.error('Backend non disponible:', e)
    }
    mainWindow.loadFile(path.join(process.resourcesPath, 'frontend-dist', 'index.html'))
  } else {
    mainWindow.loadURL('http://localhost:3000')
  }
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    mainWindow?.webContents.toggleDevTools()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('before-quit', killBackend)

app.on('window-all-closed', () => {
  killBackend()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
