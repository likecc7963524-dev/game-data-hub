// Web-compatible replacement for window.electronAPI
// Uses fetch + SSE (EventSource via fetch stream) instead of Electron IPC

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

interface Config {
  apiKey: string
  baseUrl: string
  model: string
  enableWebSearch: boolean
}

function sseFetch(
  url: string, body: any,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): () => void {
  let aborted = false

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async resp => {
    if (!resp.ok || !resp.body) { onError(`HTTP ${resp.status}`); return }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      if (aborted) { reader.cancel(); break }
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (aborted) break
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        try {
          const parsed = JSON.parse(trimmed.slice(6))
          if (parsed.type === 'chunk') onChunk(parsed.text)
          else if (parsed.type === 'done') onDone()
          else if (parsed.type === 'error') onError(parsed.text)
        } catch { /* skip */ }
      }
    }
  }).catch(err => {
    if (!aborted) onError(err.message || '连接失败')
  })

  return () => { aborted = true }
}

export const electronAPI = {
  platform: 'web',
  versions: { node: 'web', electron: 'web' },

  getConfig: () => fetch(`${API_BASE}/api/config`).then(r => r.json()),

  setConfig: (cfg: any) =>
    fetch(`${API_BASE}/api/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg || {}),
    }).then(r => r.json()),

  chatSend: (sessionId: string, messages: any, agentId: string) => {
    sseFetch(
      `${API_BASE}/api/chat`,
      { sessionId: String(sessionId), messages, agentId: agentId || 'lol-update' },
      // onChunk
      (text) => {
        const handler = chatHandlers.get(sessionId)
        if (handler?.onChunk) handler.onChunk(text)
      },
      // onDone
      () => {
        const handler = chatHandlers.get(sessionId)
        if (handler?.onDone) handler.onDone()
        chatHandlers.delete(sessionId)
      },
      // onError
      (err) => {
        const handler = chatHandlers.get(sessionId)
        if (handler?.onError) handler.onError(err)
        chatHandlers.delete(sessionId)
      }
    )
  },

  chatStop: (sessionId: string) =>
    fetch(`${API_BASE}/api/chat/stop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    }),

  testApi: (cfg: any) =>
    fetch(`${API_BASE}/api/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg || {}),
    }).then(r => r.json()),

  // SSE handlers registry
  onChatChunk: (sessionId: string, cb: (text: string) => void) => {
    const existing = chatHandlers.get(sessionId) || {}
    chatHandlers.set(sessionId, { ...existing, onChunk: cb })
    return () => { chatHandlers.delete(sessionId) }
  },
  onChatDone: (sessionId: string, cb: () => void) => {
    const existing = chatHandlers.get(sessionId) || {}
    chatHandlers.set(sessionId, { ...existing, onDone: cb })
    return () => { chatHandlers.delete(sessionId) }
  },
  onChatError: (sessionId: string, cb: (err: string) => void) => {
    const existing = chatHandlers.get(sessionId) || {}
    chatHandlers.set(sessionId, { ...existing, onError: cb })
    return () => { chatHandlers.delete(sessionId) }
  },
}

const chatHandlers = new Map<string, { onChunk?: (t: string) => void; onDone?: () => void; onError?: (e: string) => void }>()
