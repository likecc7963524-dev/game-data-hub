import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron
  },
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg: any) => ipcRenderer.invoke('set-config', cfg || {}),
  chatSend: (sessionId: string, messages: any, agentId: string) => {
    let safe: any
    try { safe = JSON.parse(JSON.stringify(messages)) } catch { safe = [] }
    ipcRenderer.send('chat-send', String(sessionId), safe, agentId || 'lol-update')
  },
  chatStop: (sessionId: string) => ipcRenderer.send('chat-stop', sessionId),
  testApi: (cfg: any) => ipcRenderer.invoke('test-api', cfg || {}),
  onChatChunk: (sessionId: string, cb: (text: string) => void) => {
    const handler = (_e: any, text: string) => cb(text)
    ipcRenderer.on(`chat-chunk-${sessionId}`, handler)
    return () => ipcRenderer.removeListener(`chat-chunk-${sessionId}`, handler)
  },
  onChatDone: (sessionId: string, cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(`chat-done-${sessionId}`, handler)
    return () => ipcRenderer.removeListener(`chat-done-${sessionId}`, handler)
  },
  onChatError: (sessionId: string, cb: (err: string) => void) => {
    const handler = (_e: any, err: string) => cb(err)
    ipcRenderer.on(`chat-error-${sessionId}`, handler)
    return () => ipcRenderer.removeListener(`chat-error-${sessionId}`, handler)
  }
})
