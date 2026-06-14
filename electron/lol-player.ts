// Player tournament history via Leaguepedia (lol.fandom.com) - free, no key
const LP_API = 'https://lol.fandom.com/api.php'
const T = (ms: number) => ({ signal: AbortSignal.timeout(ms) })

interface TournamentResult {
  date: string; place: number; event: string; result: string; opponent: string; roster: string[]
}

function cleanHtml(s: string): string {
  return s.replace(/<\/?[^>]+>/g, '').replace(/&#160;/g, ' ').replace(/&\w+;/g, '').replace(/\s+/g, ' ').trim()
}

async function parseTournamentResults(pageName: string): Promise<TournamentResult[]> {
  try {
    const r = await fetch(`${LP_API}?action=parse&page=${encodeURIComponent(pageName)}&format=json&prop=text`, { ...T(12000) })
    const d = await r.json()
    const text = d.parse?.text?.['*'] || ''
    if (!text) return []

    // Find the tournament results table — starts after "Tournament Results" header
    const results: TournamentResult[] = []
    const rows = text.split('<tr>')

    for (const row of rows) {
      // Look for date pattern: YYYY-MM-DD
      const dateMatch = row.match(/(\d{4}-\d{2}-\d{2})/)
      if (!dateMatch) continue

      // Extract place (1st, 2nd, 3-4, etc.)
      const placeMatch = row.match(/<td[^>]*>\s*(\d+)/)
      if (!placeMatch) continue

      // Clean the row
      const clean = cleanHtml(row)
      const parts = clean.split(/\s{2,}/).filter(Boolean)

      if (parts.length >= 4) {
        const date = dateMatch[1]
        const place = parseInt(placeMatch[1])
        const event = parts[2] || ''
        const resultPart = parts.find(p => /\d.+:\s*\d/.test(p)) || ''
        const rosterPart = parts.filter(p => /[A-Z][a-z]+/.test(p) && p.length > 2 && p.length < 15)

        // Extract opponent from score
        let opponent = ''
        let score = ''
        const scoreMatch = resultPart.match(/(\d+\s*:\s*\d+)\s*(.+)/)
        if (scoreMatch) {
          score = scoreMatch[1]
          opponent = scoreMatch[2].trim()
        }

        results.push({
          date,
          place,
          event: event.replace(/\d{4}-\d{2}-\d{2}/, '').trim(),
          result: score,
          opponent,
          roster: rosterPart.slice(0, 10)
        })
      }
    }

    return results
  } catch {
    return []
  }
}

export async function fetchLOLPlayer(playerName: string): Promise<string> {
  try {
    // Try multiple page name formats
    const pages = [
      `${playerName}/Tournament_Results`,
      `${playerName}/Tournament Results`,
    ]

    let results: TournamentResult[] = []
    for (const page of pages) {
      results = await parseTournamentResults(page)
      if (results.length > 0) break
    }

    if (results.length === 0) return ''

    const sections: string[] = []
    sections.push(`## 👤 ${playerName} — 生涯赛事记录 (Leaguepedia)`)

    // Summary
    const firstPlaces = results.filter(r => r.place === 1).length
    const top4 = results.filter(r => r.place <= 4).length
    sections.push(`🏆 冠军: ${firstPlaces} 次 | 前四: ${top4} 次 | 总记录: ${results.length} 场`)

    // Recent 15 results
    const recent = results.slice(0, 20)
    const items = recent.map(r => {
      const medal = r.place === 1 ? '🥇' : r.place === 2 ? '🥈' : r.place === 3 ? '🥉' : `${r.place}th`
      const rosterStr = r.roster.length > 0 ? r.roster.slice(0, 5).join(', ') : ''
      const line = `${r.date} | ${medal} | **${r.event}**`
      const detail = r.result ? `${r.result} vs ${r.opponent}` : ''
      return `- ${line}${detail ? ' — ' + detail : ''}${rosterStr ? '\n  阵容: ' + rosterStr : ''}`
    }).join('\n')

    sections.push(`### 最近赛事\n${items}`)

    // Add relevant Leaguepedia URL
    sections.push(`\n🔗 完整数据: https://lol.fandom.com/wiki/${encodeURIComponent(playerName)}/Tournament_Results`)

    return sections.join('\n\n')
  } catch (e: any) {
    console.error('[LOLPlayer] error:', e.message)
    return ''
  }
}

// Generate match URLs for in-app browsing
export function getMatchUrls(query: string, matchData?: any): { label: string; url: string }[] {
  const urls: { label: string; url: string }[] = []

  // Leaguepedia search URL
  const encoded = encodeURIComponent(query)
  urls.push({
    label: '🔍 Leaguepedia 搜索',
    url: `https://lol.fandom.com/wiki/Special:Search?query=${encoded}&scope=internal`
  })

  // Lolesports VODs
  urls.push({
    label: '🎥 LoL Esports VOD',
    url: `https://lolesports.com/vods/`
  })

  return urls
}
