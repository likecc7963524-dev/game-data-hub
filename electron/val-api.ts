// Valorant data via Liquipedia (liquipedia.net/valorant) — dynamic search, covers all teams/players
const API = 'https://liquipedia.net/valorant/api.php'

function clean(s: string): string {
  return s.replace(/<\/?[^>]+>/g, '').replace(/&#160;/g, ' ').replace(/&\w+;/g, '').replace(/\s+/g, ' ').trim()
}

async function wikiFetch(params: string): Promise<any> {
  const r = await fetch(`${API}?${params}&format=json`, { signal: AbortSignal.timeout(10000) })
  return r.json()
}

async function searchWiki(query: string, limit = 5): Promise<string[]> {
  const d = await wikiFetch(`action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}`)
  return (d?.query?.search || []).map((s: any) => s.title)
}

async function getPageText(page: string): Promise<string> {
  const d = await wikiFetch(`action=parse&page=${encodeURIComponent(page)}&prop=text`)
  return d.parse?.text?.['*'] || ''
}

export async function fetchValorant(query: string): Promise<string> {
  try {
    const sections: string[] = []
    const q = query.toLowerCase()

    // 1. Always search Liquipedia for the query
    const searchResults = await searchWiki(query, 5)
    if (searchResults.length === 0) return ''

    // 2. Classify results: team page, player page, or tournament page
    const teamPages = searchResults.filter(t => !t.includes('/') && !t.includes('(') && t.length < 30)
    const tournamentPages = searchResults.filter(t => t.includes('/') || t.toLowerCase().includes('tournament') || t.toLowerCase().includes('champions') || t.toLowerCase().includes('masters') || t.toLowerCase().includes('league') || t.toLowerCase().includes('stage'))
    const playerPages = searchResults.filter(t => t.length >= 3 && t.length < 25 && !teamPages.includes(t) && !tournamentPages.includes(t))

    // 3. Fetch team data
    const pagesToFetch = [...teamPages.slice(0, 2), ...playerPages.slice(0, 1)]
    for (const page of pagesToFetch) {
      try {
        const text = await getPageText(page)
        if (!text) continue

        const cleaned = clean(text.substring(0, 8000))

        // Extract team roster (table-based)
        const hasRoster = /Player|Roster|roster|Active|active/i.test(cleaned)
        const hasResults = /Results|Match|vs|Score|Place|Date/i.test(cleaned)

        if (hasRoster || hasResults) {
          sections.push(`## 🎯 ${page.replace(/_/g, ' ')} — Liquipedia Valorant`)

          // Extract player names from links
          const linkRe = /"\/valorant\/([^"]+)"[^>]*>([^<]+)</gi
          const players: string[] = []
          let m
          while ((m = linkRe.exec(text)) !== null) {
            const name = m[2].trim()
            if (name && name.length > 2 && name.length < 25 && !name.includes('<') && !name.includes('{')) {
              players.push(name)
            }
          }
          const unique = [...new Set(players)].slice(0, 15)
          if (unique.length > 0) {
            sections.push(`### 成员\n${unique.map(n => `- ${n}`).join('\n')}`)
          }

          // Extract standings/results
          const placementRe = /(\d+(?:st|nd|rd|th))\s+(?:Place|place)/gi
          const placements = cleaned.match(placementRe) || []
          if (placements.length > 0) {
            sections.push(`### 成绩\n${placements.map(p => `- ${p}`).join('\n')}`)
          }

          // Find match scores
          const scoreRe = /\d+\s*[:\-]\s*\d+/g
          const scores = cleaned.match(scoreRe)?.slice(0, 10) || []
          if (scores.length > 0) {
            sections.push(`### 近期比分: ${scores.join(', ')}`)
          }

          sections.push(`\n🔗 https://liquipedia.net/valorant/${encodeURIComponent(page)}`)
        }
      } catch { /* skip failed pages */ }
    }

    // 4. Show tournament pages
    if (tournamentPages.length > 0 && sections.length === 0) {
      sections.push('## 🔍 Valorant 搜索结果 (Liquipedia)')
      tournamentPages.slice(0, 5).forEach(t => {
        sections.push(`- 📅 [${t}](https://liquipedia.net/valorant/${encodeURIComponent(t)})`)
      })
      if (teamPages.length > 0) {
        sections.push('\n### 战队')
        teamPages.slice(0, 5).forEach(t => {
          sections.push(`- 🎯 [${t}](https://liquipedia.net/valorant/${encodeURIComponent(t)})`)
        })
      }
    }

    return sections.length > 0 ? sections.join('\n\n') : ''
  } catch (e: any) {
    console.error('[Valorant] error:', e.message)
    return ''
  }
}
