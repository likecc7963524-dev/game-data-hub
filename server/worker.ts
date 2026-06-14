// Cloudflare Worker — 完全免费，不需要信用卡
// 日 10 万次请求，全球 CDN 加速

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface AIConfig { apiKey: string; baseUrl: string; model: string; enableWebSearch: boolean }

let config: AIConfig = { apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', enableWebSearch: false }
const abortControllers = new Map<string, AbortController>()

// ========== fetch-based httpsGet (replaces Node.js https.get) ==========
async function httpsGet(url: string, timeout = 10000): Promise<string> {
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(timeout) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const buf = await resp.arrayBuffer()
  return new TextDecoder('gbk').decode(buf)
}

// ========== LOL Update Scraper (fetch-based) ==========
async function fetchArticleList(page: number) {
  const url = `https://lol.qq.com/gicp/news/423/2/1334/${page}.html`
  try {
    const html = await httpsGet(url)
    const articles: { title: string; date: string; url: string }[] = []
    const itemRe = /<li class="newsitem">([\s\S]*?)<\/li>/gi
    let m
    while ((m = itemRe.exec(html)) !== null) {
      const block = m[1]
      const linkMatch = block.match(/<a class="item-href"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
      const dateMatch = block.match(/<span class="item-time">([^<]*)<\/span>/i)
      if (linkMatch) {
        articles.push({
          url: linkMatch[1].startsWith('http') ? linkMatch[1] : `https://lol.qq.com${linkMatch[1]}`,
          title: linkMatch[2].replace(/<[^>]*>/g, '').trim(),
          date: dateMatch ? dateMatch[1].trim() : ''
        })
      }
    }
    return articles
  } catch { return [] as typeof articles }
}

async function fetchArticleContent(url: string): Promise<string> {
  try {
    const html = await httpsGet(url)
    const cm = html.match(/<div class="article"[^>]*id="article"[^>]*>([\s\S]*?)<\/div>\s*(?:<!--评论组件-->|<div class="art-com")/i)
    if (!cm) return ''
    let c = cm[1]
    c = c.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    c = c.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    c = c.replace(/<img[^>]*\/?>/gi, '')
    c = c.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    c = c.replace(/<\/(div|p|h[1-6]|li|tr|blockquote|br)[^>]*>/gi, '\n')
    c = c.replace(/<br\s*\/?>/gi, '\n')
    c = c.replace(/<[^>]*>/g, '')
    c = c.replace(/&nbsp;/g, ' ').replace(/&rarr;/g, '→').replace(/&emsp;/g, '  ').replace(/&mdash;/g, '—').replace(/&amp;/g, '&')
    c = c.replace(/\n{3,}/g, '\n\n').trim()
    return c
  } catch { return '' }
}

const HERO_ALIASES: Record<string, string[]> = {
  '剑魔':['亚托克斯','暗裔剑魔'],'格温':['灵罗娃娃'],'彗':['异画师'],'贾克斯':['武器大师'],'李青':['盲僧'],
  '盲僧':['李青'],'魔腾':['永恒梦魇','梦魇'],'奥莉安娜':['发条魔灵','发条'],'瑞兹':['符文法师'],
  '塞拉斯':['解脱者'],'悠米':['魔法猫咪','猫咪'],'韦鲁斯':['惩戒之箭'],'赵信':['德邦总管'],
  '斯卡纳':['蝎子'],'沃利贝尔':['狗熊','不灭狂雷'],'辛吉德':['炼金术士'],'兰博':['机械公敌'],
  '佛耶戈':['破败之王'],'乐芙兰':['诡术妖姬','妖姬'],'布兰德':['火男','复仇焰魂'],
}

function searchArticles(query: string, articles: { title: string; date: string; url: string }[]) {
  const q = query.toLowerCase()
  return articles.map(a => {
    let score = 0
    const t = a.title.toLowerCase()
    if (t.includes(q)) score += 50
    const vm = q.match(/(\d+)\.(\d+)/); if (vm && t.includes(vm[0])) score += 100
    if (a.date.includes(q)) score += 30
    if (/最近|最新|更新|速览|有什么|改了什么|公告|版本/.test(q)) score += 5
    for (const [alias, exps] of Object.entries(HERO_ALIASES)) {
      if (q.includes(alias)) { score += 20; for (const e of exps) { if (t.includes(e)) score += 60 }; if (t.includes(alias)) score += 30 }
    }
    return { a, score }
  }).sort((a, b) => b.score - a.score).filter(s => s.score > 0).slice(0, 5).map(s => s.a)
}

async function fetchLOLUpdateWeb(query: string): Promise<string> {
  try {
    let all = await fetchArticleList(1)
    let matched = searchArticles(query, all)
    if (matched.length < 2) {
      for (let p = 2; p <= 5; p++) { all = all.concat(await fetchArticleList(p)); matched = searchArticles(query, all); if (matched.length >= 3) break }
    }
    const specific = !/最近|最新|有什么|更新|速览|公告|版本|改了什么/.test(query) || query.length > 10
    if (matched.length === 0 && specific) {
      for (let p = 6; p <= 11; p++) { matched = searchArticles(query, all.concat(await fetchArticleList(p))); if (matched.length >= 2) break }
    }
    if (matched.length === 0 && /最近|最新|更新|有什么|速览|公告|版本/.test(query)) matched = all.slice(0, 1)
    if (matched.length === 0) return ''
    const sections: string[] = []
    for (const a of matched.slice(0, 3)) {
      const c = await fetchArticleContent(a.url)
      sections.push(c ? `## ${a.title}\n**发布日期**: ${a.date}\n\n${c}` : `## ${a.title}\n**发布日期**: ${a.date}\n\n> 无法获取详情：${a.url}`)
    }
    return sections.length ? sections.join('\n\n---\n\n') : ''
  } catch { return '' }
}

// ========== Bing Search ==========
async function bingSearch(query: string): Promise<string> {
  try {
    const resp = await fetch(`https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-cn`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) return ''
    const html = await resp.text()
    const results: { title: string; snippet: string; url: string }[] = []
    const blocks = html.split('class="b_algo"')
    for (let i = 1; i < blocks.length && results.length < 6; i++) {
      const mH2 = blocks[i].match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
      const mP = blocks[i].match(/<p class="b_lineclamp\d"[^>]*>([\s\S]*?)<\/p>/i)
      if (mH2 && mH2[1].startsWith('http')) results.push({ title: mH2[2].replace(/<[^>]*>/g, '').trim(), snippet: mP ? mP[1].replace(/<[^>]*>/g, '').trim() : '', url: mH2[1] })
    }
    return results.length ? results.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`).join('\n\n') : ''
  } catch { return '' }
}

// ========== Query Reformulation ==========
async function reformulateQuery(userQuery: string): Promise<string> {
  if (!config.apiKey) return userQuery
  try {
    const now = new Date(); const ds = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: `你是搜索查询改写助手。将自然语言转换为5-15字搜索关键词。去掉口语前缀。${ds}` }, { role: 'user', content: userQuery }], max_tokens: 30, temperature: 0 }),
      signal: AbortSignal.timeout(5000)
    })
    if (!resp.ok) return userQuery
    const kw = ((await resp.json() as any).choices?.[0]?.message?.content || '').trim()
    return (kw.length >= 2 && kw.length <= 50) ? kw : userQuery
  } catch { return userQuery }
}

function buildSystemPrompt(): string {
  const now = new Date(); const ds = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日，星期${['日','一','二','三','四','五','六'][now.getDay()]}，${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  let p = `你是 DeepSeek AI 助手，可联网搜索。当前时间：${ds}\n\n`
  p += config.enableWebSearch ? `联网搜索已开启：新闻/时事→Bing，LOL版本→官方公告。请基于搜索数据给出准确回答。` : `联网未开启。`
  return p
}

// ========== Core Chat ==========
async function chat(sessionId: string, messages: ChatMessage[], agentId: string, onChunk: (text: string) => void): Promise<void> {
  if (!config.apiKey) { onChunk(`data: ${JSON.stringify({ type: 'error', text: '请先设置 API Key' })}\n\n`); return }
  const ctrl = new AbortController(); abortControllers.set(sessionId, ctrl)
  const sm: ChatMessage = { role: 'system', content: buildSystemPrompt() }
  const final = [sm, ...messages.filter(m => m.role !== 'system')]
  const uq = [...messages].reverse().find(m => m.role === 'user')?.content || ''

  if (config.enableWebSearch && uq) {
    if (ctrl.signal.aborted) return
    onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: '🔍 正在理解查询...\n' })}\n\n`)
    const sq = await reformulateQuery(uq)
    if (sq !== uq) onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: `🧠 改写为: "${sq}"\n` })}\n\n`)
    const parts: string[] = []; const sources: string[] = []
    if (agentId === 'lol-update') {
      onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: '📋 正在查询 LOL 官方版本公告...\n' })}\n\n`)
      const d = await fetchLOLUpdateWeb(uq); if (d) { parts.unshift(d); sources.unshift('LOL官方公告') }
    } else {
      onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: '🌐 正在搜索 Bing...\n' })}\n\n`)
      const d = await bingSearch(sq); if (d) { parts.push(d); sources.push('Bing') }
    }
    if (ctrl.signal.aborted) return
    const src = [...new Set(sources)].join(' + ') || 'Bing'
    if (parts.length) {
      onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: `✅ 已从 ${src} 获取数据\n\n` })}\n\n`)
      final.push({ role: 'user', content: `[系统] 以下是从 ${src} 获取的数据：\n\n${parts.join('\n\n---\n\n')}\n\n请基于以上数据回答。列出所有匹配项，不要只选一条。` })
    } else { onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: '⚠️ 未找到结果\n\n' })}\n\n`) }
  }
  if (ctrl.signal.aborted) return

  try {
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: final, stream: true }),
      signal: ctrl.signal
    })
    if (ctrl.signal.aborted) return

    if (!resp.ok) {
      const et = await resp.text()
      let msg = `API 错误 ${resp.status}`;
      try { msg = (JSON.parse(et) as any).error?.message || msg } catch { msg = et.slice(0, 200) }
      throw new Error(msg)
    }

    const reader = resp.body!.getReader(); const dec = new TextDecoder(); let buf = ''
    while (true) {
      if (ctrl.signal.aborted) break
      const { done, value } = await reader.read(); if (done) break
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim(); if (!t.startsWith('data: ')) continue
        const d = t.slice(6); if (d === '[DONE]') { onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'done' })}\n\n`); return }
        try { const delta = (JSON.parse(d) as any).choices?.[0]?.delta?.content; if (delta) onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: delta })}\n\n`) } catch { /* skip */ }
      }
    }
    onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'done' })}\n\n`)
  } catch (err: any) {
    if (err.name === 'AbortError') onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'chunk', text: '\n\n⏹ 已停止' })}\n\n`)
    else onChunk(`data: ${JSON.stringify({ sid: sessionId, type: 'error', text: err.message })}\n\n`)
  } finally { abortControllers.delete(sessionId) }
}

// ========== Worker Entry ==========
export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url); const path = url.pathname
    const h: Record<string, string> = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    if (req.method === 'OPTIONS') return new Response(null, { headers: h })

    try {
      if (path === '/api/health') return new Response(JSON.stringify({ ok: true }), { headers: { ...h, 'Content-Type': 'application/json' } })

      if (path === '/api/config' && req.method === 'GET') {
        const c = config; return new Response(JSON.stringify({ ...c, apiKey: c.apiKey ? '***已设置***' : '' }), { headers: { ...h, 'Content-Type': 'application/json' } })
      }
      if (path === '/api/config' && req.method === 'PUT') {
        const b: any = await req.json(); config = { ...config, ...b }; const c = config
        return new Response(JSON.stringify({ ...c, apiKey: c.apiKey ? '***已设置***' : '' }), { headers: { ...h, 'Content-Type': 'application/json' } })
      }
      if (path === '/api/test') {
        const b: any = await req.json()
        try {
          const r = await fetch(`${b.baseUrl || 'https://api.deepseek.com/v1'}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.apiKey}` }, body: JSON.stringify({ model: b.model || 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }) })
          if (r.ok) return new Response(JSON.stringify({ ok: true, message: `✓ 连接成功 (${r.status})` }), { headers: { ...h, 'Content-Type': 'application/json' } })
          const et = await r.text(); let msg = `HTTP ${r.status}`;
          try { msg = (JSON.parse(et) as any).error?.message || msg } catch { msg = et.slice(0, 200) }
          return new Response(JSON.stringify({ ok: false, message: msg }), { headers: { ...h, 'Content-Type': 'application/json' } })
        } catch (err: any) { return new Response(JSON.stringify({ ok: false, message: err.message }), { headers: { ...h, 'Content-Type': 'application/json' } }) }
      }
      if (path === '/api/chat') {
        const b: any = await req.json(); const { sessionId, messages, agentId } = b || {}
        if (!sessionId || !Array.isArray(messages)) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400, headers: { ...h, 'Content-Type': 'application/json' } })
        const { readable, writable } = new TransformStream(); const w = writable.getWriter(); const enc = new TextEncoder()
        const msgs = messages.map((m: any) => ({ role: m.role || 'user', content: String(m.content || '') }))
        chat(sessionId, msgs, agentId || 'lol-update', (text: string) => w.write(enc.encode(text)))
          .catch(() => { try { w.close() } catch { /* */ } })
          .then(() => { try { w.close() } catch { /* */ } })
        req.signal.addEventListener('abort', () => abortControllers.get(sessionId)?.abort())
        return new Response(readable, { headers: { ...h, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
      }
      if (path === '/api/chat/stop') { const b: any = await req.json(); abortControllers.get(b?.sessionId || '')?.abort(); return new Response(JSON.stringify({ ok: true }), { headers: { ...h, 'Content-Type': 'application/json' } }) }

      return new Response('Not Found', { status: 404, headers: h })
    } catch (err: any) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...h, 'Content-Type': 'application/json' } }) }
  }
}
