import express from 'express'
import cors from 'cors'
import { chatCore, setAIConfig, getAIConfig, stopSession, type StreamWriter } from '../electron/ai-service'

const app = express()
app.use(cors())
app.use(express.json())

// ---- GET /api/config ----
app.get('/api/config', (_req, res) => {
  const cfg = getAIConfig()
  // Don't expose full API key, just show if it's set
  res.json({ ...cfg, apiKey: cfg.apiKey ? '***已设置***' : '' })
})

// ---- PUT /api/config ----
app.put('/api/config', (req, res) => {
  const cfg = req.body || {}
  setAIConfig({
    apiKey: String(cfg.apiKey || ''),
    baseUrl: String(cfg.baseUrl || 'https://api.deepseek.com/v1'),
    model: String(cfg.model || 'deepseek-chat'),
    enableWebSearch: Boolean(cfg.enableWebSearch),
  })
  const updated = getAIConfig()
  res.json({ ...updated, apiKey: updated.apiKey ? '***已设置***' : '' })
})

// ---- POST /api/test ----
app.post('/api/test', async (req, res) => {
  const { apiKey, baseUrl, model } = req.body || {}
  try {
    const resp = await fetch(`${baseUrl || 'https://api.deepseek.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model || 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(8000),
    })
    if (resp.ok) return res.json({ ok: true, message: `✓ 连接成功 (${resp.status})` })
    const errText = await resp.text()
    let msg = `HTTP ${resp.status}`
    try { msg = JSON.parse(errText)?.error?.message || msg } catch { msg = errText.slice(0, 200) }
    res.json({ ok: false, message: msg })
  } catch (err: any) {
    res.json({ ok: false, message: err.message || '连接失败' })
  }
})

// ---- POST /api/chat (SSE streaming) ----
app.post('/api/chat', (req, res) => {
  const { sessionId, messages, agentId } = req.body || {}
  if (!sessionId || !Array.isArray(messages)) {
    return res.status(400).json({ error: '缺少 sessionId 或 messages' })
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  // SSE writer adapter
  const writer: StreamWriter = {
    chunk: (sid, text) => res.write(`data: ${JSON.stringify({ sid, type: 'chunk', text })}\n\n`),
    done: (sid) => { res.write(`data: ${JSON.stringify({ sid, type: 'done' })}\n\n`); res.end() },
    error: (sid, msg) => { res.write(`data: ${JSON.stringify({ sid, type: 'error', text: msg })}\n\n`); res.end() },
  }

  // Handle client disconnect
  req.on('close', () => stopSession(sessionId))
  req.on('error', () => stopSession(sessionId))

  // Ensure messages have proper role format
  const msgs = messages.map((m: any) => ({
    role: m.role as 'system' | 'user' | 'assistant',
    content: String(m.content),
  }))

  chatCore(writer, sessionId, msgs, agentId || 'lol-update').catch(() => {
    if (!res.writableEnded) res.end()
  })
})

// ---- POST /api/chat/stop ----
app.post('/api/chat/stop', (req, res) => {
  const { sessionId } = req.body || {}
  stopSession(sessionId)
  res.json({ ok: true })
})

// ---- Health ----
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ---- Static files (production) ----
import * as path from 'path'
const webDist = path.join(__dirname, '..', 'web-dist')
app.use(express.static(webDist))
// SPA fallback: all non-API routes → index.html
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`✅ 服务端已启动: http://localhost:${PORT}`))
