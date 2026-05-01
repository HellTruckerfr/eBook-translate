const { app, BrowserWindow, shell, globalShortcut } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

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
    // taskkill /F /T tue aussi les processus enfants (extraction onefile)
    spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], { shell: false })
  } catch (e) {}
  backendProcess = null
}

function startBackend() {
  const exePath = getBackendPath()
  if (!exePath || !fs.existsSync(exePath)) return
  backendProcess = spawn(exePath, [], { detached: false, stdio: 'ignore' })
  // pas de unref() — on garde la référence pour pouvoir le tuer proprement
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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1a1a1a', symbolColor: '#94a3b8', height: 32 },
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

  // Bloque toute navigation qui sortirait du fichier HTML chargé (hash routing only)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL().split('#')[0]
    if (url.split('#')[0] !== current) event.preventDefault()
  })

  // Recharge la page si le renderer crashe
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer crashed:', details.reason)
    setTimeout(() => mainWindow.reload(), 1000)
  })

  if (app.isPackaged) {
    try {
      await waitForBackend('http://localhost:8000/api/config')
    } catch (e) {
      console.error('Backend non disponible:', e)
    }
    mainWindow.loadFile(path.join(process.resourcesPath, 'frontend-dist', 'index.html'))
  } else {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    mainWindow?.webContents.toggleDevTools()
  })
})

app.on('before-quit', killBackend)

app.on('window-all-closed', () => {
  killBackend()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
