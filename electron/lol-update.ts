import * as https from 'https'

// ---- Types ----
interface Article {
  title: string
  date: string
  url: string
}

// ---- HTTPS helper (mirrors 5eplay.ts pattern) ----
function httpsGet(url: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        try {
          resolve(new TextDecoder('gbk').decode(buf))
        } catch {
          resolve(buf.toString('utf-8'))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ---- Fetch article list from a single page ----
async function fetchArticleList(page: number): Promise<Article[]> {
  const url = `https://lol.qq.com/gicp/news/423/2/1334/${page}.html`
  try {
    const html = await httpsGet(url)
    const articles: Article[] = []
    // Parse each <li class="newsitem"> block
    const itemRe = /<li class="newsitem">([\s\S]*?)<\/li>/gi
    let itemMatch
    while ((itemMatch = itemRe.exec(html)) !== null) {
      const block = itemMatch[1]
      // Extract link and title
      const linkMatch = block.match(/<a class="item-href"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
      // Extract date
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
  } catch (err: any) {
    console.error('[LOLUpdate] fetchArticleList error:', err.message)
    return []
  }
}

// ---- Fetch article detail content ----
async function fetchArticleContent(url: string): Promise<string> {
  try {
    const html = await httpsGet(url, 12000)
    // Extract article content from <div class="article" id="article">
    const contentMatch = html.match(/<div class="article"[^>]*id="article"[^>]*>([\s\S]*?)<\/div>\s*(?:<!--评论组件-->|<div class="art-com")/i)
    if (!contentMatch) return ''

    let content = contentMatch[1]
    // Remove script/style/iframe tags
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    content = content.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    // Remove img tags (too noisy in text context)
    content = content.replace(/<img[^>]*\/?>/gi, '')
    // Remove links but keep text
    content = content.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    // Convert block elements to newlines
    content = content.replace(/<\/(div|p|h[1-6]|li|tr|blockquote|br)[^>]*>/gi, '\n')
    content = content.replace(/<br\s*\/?>/gi, '\n')
    // Remove all remaining HTML tags
    content = content.replace(/<[^>]*>/g, '')
    // Decode HTML entities
    content = content.replace(/&nbsp;/g, ' ')
    content = content.replace(/&rarr;/g, '→')
    content = content.replace(/&mdash;/g, '—')
    content = content.replace(/&ldquo;/g, '"')
    content = content.replace(/&rdquo;/g, '"')
    content = content.replace(/&amp;/g, '&')
    content = content.replace(/&lt;/g, '<')
    content = content.replace(/&gt;/g, '>')
    content = content.replace(/&emsp;/g, '  ')
    // Collapse multiple blank lines
    content = content.replace(/\n{3,}/g, '\n\n')
    // Trim
    content = content.trim()

    return content
  } catch (err: any) {
    console.error('[LOLUpdate] fetchArticleContent error:', err.message)
    return ''
  }
}

// ---- Hero name alias map (common abbreviations → full names found in articles) ----
const HERO_ALIASES: Record<string, string[]> = {
  '剑魔': ['亚托克斯', '暗裔剑魔'],
  '亚托克斯': ['暗裔剑魔', '剑魔'],
  '格温': ['灵罗娃娃'],
  '彗': ['异画师'],
  '贾克斯': ['武器大师'],
  '李青': ['盲僧'],
  '盲僧': ['李青'],
  '魔腾': ['永恒梦魇', '梦魇'],
  '梦魇': ['魔腾', '永恒梦魇'],
  '奥莉安娜': ['发条魔灵', '发条'],
  '发条': ['奥莉安娜', '发条魔灵'],
  '瑞兹': ['符文法师'],
  '塞拉斯': ['解脱者'],
  '悠米': ['魔法猫咪'],
  '猫咪': ['悠米', '魔法猫咪'],
  '韦鲁斯': ['惩戒之箭'],
  '赵信': ['德邦总管'],
  '亚恒': [],
  '斯卡纳': ['蝎子'],
  '蝎子': ['斯卡纳'],
  '沃利贝尔': ['狗熊', '不灭狂雷'],
  '狗熊': ['沃利贝尔', '不灭狂雷'],
  '辛吉德': ['炼金术士', '炼金'],
  '炼金': ['辛吉德', '炼金术士'],
  '兰博': ['机械公敌'],
  '佛耶戈': ['破败之王'],
  '乐芙兰': ['诡术妖姬', '妖姬'],
  '妖姬': ['乐芙兰', '诡术妖姬'],
  '布兰德': ['火男', '复仇焰魂'],
  '火男': ['布兰德', '复仇焰魂'],
  '俄洛伊': ['海兽祭司'],
  '格雷福斯': ['法外狂徒', '男枪'],
  '男枪': ['格雷福斯', '法外狂徒'],
  '希瓦娜': ['龙女'],
  '龙女': ['希瓦娜'],
}

// ---- Score and rank articles by query relevance ----
function searchArticles(query: string, articles: Article[]): Article[] {
  const q = query.toLowerCase()
  const scored = articles.map(a => {
    let score = 0
    const title = a.title.toLowerCase()
    // Exact query match in title
    if (title.includes(q)) score += 50
    // Version number match (e.g., "26.11", "15.24")
    const verMatch = q.match(/(\d+)\.(\d+)/)
    if (verMatch) {
      const ver = verMatch[0]
      if (title.includes(ver)) score += 100
    }
    // Date match (e.g., "6月11日", "2026-06-10")
    if (a.date.includes(q)) score += 30
    // Generic update intent words
    if (/最近|最新|更新|速览|有什么|改了什么|公告|版本/.test(q)) {
      score += 5 // boost recency — later articles have higher array index
    }
    // Hero name / alias matching: check query against hero names and aliases
    for (const [alias, expansions] of Object.entries(HERO_ALIASES)) {
      if (q.includes(alias)) {
        score += 20
        // Check if any expansion is in the title
        for (const exp of expansions) {
          if (title.includes(exp)) score += 60
        }
        // Also check if alias itself is in title
        if (title.includes(alias)) score += 30
      }
    }
    // Check for individual Chinese characters of hero names (2-3 char names)
    for (const key of Object.keys(HERO_ALIASES)) {
      if (key.length >= 2 && q.includes(key) && title.includes(key)) {
        score += 40
      }
    }
    return { article: a, score }
  })
  // Sort by score desc, then filter above threshold
  scored.sort((a, b) => b.score - a.score)
  // Return top matches (score > 0, max 5)
  return scored.filter(s => s.score > 0).slice(0, 5).map(s => s.article)
}

// ---- Main export: fetch LOL update info based on query ----
export async function fetchLOLUpdate(query: string): Promise<string> {
  try {
    // Step 1: Fetch the latest articles (page 1)
    let allArticles = await fetchArticleList(1)

    // Step 2: Search for matching articles
    let matched = searchArticles(query, allArticles)

    // Step 3: If not enough matches on page 1, expand to pages 2-5
    if (matched.length < 2) {
      for (let page = 2; page <= 5; page++) {
        const pageArticles = await fetchArticleList(page)
        allArticles = allArticles.concat(pageArticles)
        matched = searchArticles(query, allArticles)
        if (matched.length >= 3) break
      }
    }

    // Step 4: If user is asking about something specific but still no match, try pages 6-11
    const isSpecificQuery = !/最近|最新|有什么|更新|速览|公告|版本|改了什么/.test(query) || query.length > 10
    if (matched.length === 0 && isSpecificQuery) {
      for (let page = 6; page <= 11; page++) {
        const pageArticles = await fetchArticleList(page)
        matched = searchArticles(query, [...allArticles, ...pageArticles])
        if (matched.length >= 2) break
      }
    }

    if (matched.length === 0) {
      // If still nothing, return the latest 1 article as a fallback for general queries
      if (/最近|最新|更新|有什么|速览|公告|版本/.test(query)) {
        matched = allArticles.slice(0, 1)
      } else {
        return '' // no results for specific query
      }
    }

    // Step 5: Fetch content for top matched articles (max 3)
    const sections: string[] = []
    for (const article of matched.slice(0, 3)) {
      const content = await fetchArticleContent(article.url)
      if (content) {
        sections.push(`## ${article.title}\n**发布日期**: ${article.date}\n\n${content}`)
      } else {
        sections.push(`## ${article.title}\n**发布日期**: ${article.date}\n\n> 无法获取文章详情，请点击原文查看：${article.url}`)
      }
    }

    if (sections.length === 0) return ''
    return sections.join('\n\n---\n\n')
  } catch (err: any) {
    console.error('[LOLUpdate] fetchLOLUpdate error:', err.message)
    return ''
  }
}
