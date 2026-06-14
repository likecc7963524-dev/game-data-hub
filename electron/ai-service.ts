import { BrowserWindow } from 'electron'
import { fetch5EPlayer, fetch5EEvent } from './5eplay'
import { fetchLOL } from './lol-api'
import { fetchLOLPlayer } from './lol-player'
import { fetchValorant } from './val-api'
import { fetchLOLUpdate } from './lol-update'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AIConfig {
  apiKey: string
  baseUrl: string
  model: string
  enableWebSearch: boolean
}

let config: AIConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  enableWebSearch: false
}

const abortControllers = new Map<string, AbortController>()

export function setAIConfig(c: Partial<AIConfig>) { config = { ...config, ...c } }
export function getAIConfig(): AIConfig { return { ...config } }
export function stopSession(sessionId: string) {
  const ctrl = abortControllers.get(sessionId)
  if (ctrl) { ctrl.abort(); abortControllers.delete(sessionId) }
}

// ---- Build system prompt with date + search capability ----
function buildSystemPrompt(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日，星期${['日','一','二','三','四','五','六'][now.getDay()]}，北京时间${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

  let prompt = `你是 DeepSeek AI 助手，一个可以联网搜索的智能助手。

【当前时间】${dateStr}

`
  if (config.enableWebSearch) {
    prompt += `【联网搜索能力】你具备实时联网搜索能力。系统会自动检测查询类型：
- 新闻、时事、常识 → Bing 搜索
- CS2/CS:GO 电竞、战队排名、比赛 → 从 5EPlay 获取实时数据
- 查询会被先改写为搜索关键词，再执行搜索
请基于搜索/获取的数据给出准确回答。不要说"无法联网"或"知识截止于某日期"。`
  } else {
    prompt += `【注意】联网搜索功能未开启。如果用户问需要实时信息的问题，请建议用户在设置中开启联网搜索。`
  }

  return prompt
}

// ---- Bing search ----
async function bingSearch(query: string): Promise<string> {
  try {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-cn`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000)
    })
    if (!resp.ok) return ''

    const html = await resp.text()
    const results: { title: string; snippet: string; url: string }[] = []
    const blocks = html.split('class="b_algo"')

    for (let i = 1; i < blocks.length && results.length < 6; i++) {
      const block = blocks[i]
      const mH2 = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
      const mP = block.match(/<p class="b_lineclamp\d"[^>]*>([\s\S]*?)<\/p>/i)
      if (mH2) {
        const url = mH2[1]
        const title = mH2[2].replace(/<[^>]*>/g, '').trim()
        const snippet = mP ? mP[1].replace(/<[^>]*>/g, '').trim() : ''
        if (title && url.startsWith('http')) results.push({ title, snippet, url })
      }
    }

    if (results.length === 0) return ''
    return results.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`).join('\n\n')
  } catch {
    return ''
  }
}


// ---- Reformulate natural language into search keywords ----
async function reformulateQuery(userQuery: string): Promise<string> {
  if (!config.apiKey) return userQuery

  try {
    const now = new Date()
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: `你是一个搜索查询改写助手。将用户的自然语言转换为简洁的搜索关键词。规则：
1. 去掉"告诉我"、"给我"、"帮我"、"请问"、"我想知道"等口语前缀
2. 提取核心搜索意图，输出5-15个字的搜索关键词
3. 如果涉及时间（今天、最近、本周等），替换为具体日期：${dateStr}
4. 只输出搜索关键词，不要加引号、解释或标点` },
          { role: 'user', content: userQuery }
        ],
        max_tokens: 30,
        temperature: 0
      }),
      signal: AbortSignal.timeout(5000)
    })

    if (!resp.ok) return userQuery
    const data = await resp.json()
    const keywords = data.choices?.[0]?.message?.content?.trim()
    if (keywords && keywords.length >= 2 && keywords.length <= 50) {
      return keywords
    }
    return userQuery
  } catch {
    return userQuery // fallback to original query
  }
}

// ---- Main chat ----
export async function chat(win: BrowserWindow, sessionId: string, messages: ChatMessage[], agentId = 'lol-update') {
  if (!config.apiKey) {
    win.webContents.send(`chat-error-${sessionId}`, '请先在设置中填写 DeepSeek API Key')
    return
  }

  const ctrl = new AbortController()
  abortControllers.set(sessionId, ctrl)

  // Build final messages: system prompt replaces original system msg
  const systemMsg: ChatMessage = { role: 'system', content: buildSystemPrompt() }
  const nonSystem = messages.filter(m => m.role !== 'system')
  let finalMessages = [systemMsg, ...nonSystem]

  // Extract user query for search
  const userQuery = [...messages].reverse().find(m => m.role === 'user')?.content || ''

  // Web search — route by agent ID
  if (config.enableWebSearch && userQuery) {
    if (ctrl.signal.aborted) { abortControllers.delete(sessionId); return }
    try {
      win.webContents.send(`chat-chunk-${sessionId}`, `🔍 正在理解查询...\n`)
      const searchQuery = await reformulateQuery(userQuery)
      if (searchQuery !== userQuery) {
        win.webContents.send(`chat-chunk-${sessionId}`, `🧠 改写为: "${searchQuery}"\n`)
      }

      const sources: string[] = []
      const parts: string[] = []
      const fetchers: Promise<string>[] = []

      // Route by agent — each agent ONLY calls its own data source
      if (agentId === 'cs') {
        win.webContents.send(`chat-chunk-${sessionId}`, `🎮 正在查询 5EPlay...\n`)
        fetchers.push(fetch5EPlayer(userQuery).then(d => { if (d) { parts.unshift(d); sources.unshift('5EPlay') } return d }))
        fetchers.push(fetch5EEvent(userQuery).then(d => { if (d) { parts.push(d); sources.push('5EPlay') } return d }))
      } else if (agentId === 'lol') {
        win.webContents.send(`chat-chunk-${sessionId}`, `🏆 正在查询 Riot API + Leaguepedia...\n`)
        const lolPlayerRe = /(faker|chovy|showmaker|ruler|viper|gumayusi|zeus|oner|kanavi|scout|knight|bin|elk|meiko|canyon|peanut|theshy|rookie|doinb|deft|beryl|keria)/i
        if (lolPlayerRe.test(userQuery)) {
          const pn = userQuery.match(lolPlayerRe)?.[1] || ''
          fetchers.push(fetchLOLPlayer(pn).then(d => { if (d) { parts.unshift(d); sources.unshift('Leaguepedia') } return d }))
        }
        fetchers.push(fetchLOL(userQuery).then(d => { if (d) { parts.push(d); sources.push('Riot API') } return d }))
      } else if (agentId === 'val') {
        win.webContents.send(`chat-chunk-${sessionId}`, `⚡ 正在查询 Liquipedia Valorant...\n`)
        fetchers.push(fetchValorant(userQuery).then(d => { if (d) { parts.unshift(d); sources.unshift('Liquipedia') } return d }))
      } else if (agentId === 'lol-update') {
        win.webContents.send(`chat-chunk-${sessionId}`, `📋 正在查询 LOL 官方版本公告...\n`)
        fetchers.push(fetchLOLUpdate(userQuery).then(d => { if (d) { parts.unshift(d); sources.unshift('LOL官方公告') } return d }))
      } else {
        // AI assistant — Bing only
        win.webContents.send(`chat-chunk-${sessionId}`, `🌐 正在搜索 Bing...\n`)
        fetchers.push(bingSearch(searchQuery).then(d => { if (d) { parts.push(d); sources.push('Bing') } return d }))
      }

      await Promise.all(fetchers)

      const results = parts.join('\n\n---\n\n')
      const source = [...new Set(sources)].join(' + ') || 'Bing'

      if (results) {
        win.webContents.send(`chat-chunk-${sessionId}`, `✅ 已从 ${source} 获取数据\n\n`)
        const ctxMsg: ChatMessage = {
          role: 'user',
          content: `[系统] 以下是从 ${source} 获取的最新数据：\n\n${results}\n\n请基于以上数据回答用户的问题。重要：请列出所有匹配的比赛/数据，不要只选一条。如果数据缺少用户要的信息，请如实说明。`
        }
        finalMessages.push(ctxMsg)
      } else {
        win.webContents.send(`chat-chunk-${sessionId}`, '⚠️ 未找到搜索结果\n\n')
      }
    } catch {
      // search failure is non-fatal
    }
    if (ctrl.signal.aborted) { abortControllers.delete(sessionId); return }
  }

  // Call DeepSeek API
  try {
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: finalMessages,
        stream: true
      }),
      signal: ctrl.signal
    })

    if (ctrl.signal.aborted) { abortControllers.delete(sessionId); return }

    if (!resp.ok) {
      const errText = await resp.text()
      let msg = `API 错误 ${resp.status}`
      try { msg = JSON.parse(errText)?.error?.message || msg } catch { msg = errText.slice(0, 300) }
      win.webContents.send(`chat-error-${sessionId}`, msg)
      abortControllers.delete(sessionId)
      return
    }

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      if (ctrl.signal.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          win.webContents.send(`chat-done-${sessionId}`)
          abortControllers.delete(sessionId)
          return
        }
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content
          if (delta) win.webContents.send(`chat-chunk-${sessionId}`, delta)
        } catch { /* skip malformed chunks */ }
      }
    }

    win.webContents.send(`chat-done-${sessionId}`)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      win.webContents.send(`chat-chunk-${sessionId}`, '\n\n⏹ 已停止')
    } else {
      win.webContents.send(`chat-error-${sessionId}`, err.message || String(err))
    }
  } finally {
    abortControllers.delete(sessionId)
  }
}
