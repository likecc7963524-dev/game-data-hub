import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { chat, setAIConfig, getAIConfig, stopSession } from './ai-service'
const CONFIG_PATH = join(app.getPath('userData'), 'ds-config.json')

function loadConfig() {
  try {
    if (existsSync(CONFIG_PATH)) {
      setAIConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')))
    }
  } catch { /* */ }
}

function saveConfig() {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(getAIConfig(), null, 2))
  } catch { /* */ }
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    title: '游戏数据通',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173/')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('get-config', () => getAIConfig())
ipcMain.handle('set-config', (_e, cfg) => {
  const safe = cfg && typeof cfg === 'object' ? cfg : {}
  setAIConfig({
    apiKey: String(safe.apiKey || ''),
    baseUrl: String(safe.baseUrl || 'https://api.deepseek.com/v1'),
    model: String(safe.model || 'deepseek-chat'),
    enableWebSearch: Boolean(safe.enableWebSearch)
  })
  saveConfig()
  return getAIConfig()
})

ipcMain.handle('test-api', async (_e, cfg: { apiKey: string; baseUrl: string; model: string }) => {
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      }),
      signal: AbortSignal.timeout(8000)
    })
    if (resp.ok) return { ok: true, message: `✓ 连接成功 (${resp.status})` }
    const errText = await resp.text()
    let msg = `HTTP ${resp.status}`
    try { msg = JSON.parse(errText)?.error?.message || msg } catch { msg = errText.slice(0, 200) }
    return { ok: false, message: msg }
  } catch (err: any) {
    return { ok: false, message: err.message || '连接失败' }
  }
})

ipcMain.on('chat-send', (event, sessionId, messages, agentId) => {
  if (!mainWindow) return
  if (!sessionId || typeof sessionId !== 'string') return
  if (!Array.isArray(messages)) {
    mainWindow.webContents.send(`chat-error-${sessionId}`, '消息格式错误')
    return
  }
  chat(mainWindow, sessionId, messages, agentId || 'lol-update')
})

ipcMain.on('chat-stop', (_e, sessionId: string) => {
  stopSession(sessionId)
})

app.whenReady().then(() => {
  loadConfig()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
