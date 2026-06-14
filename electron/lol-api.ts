// LOL data via Riot Games official esports API (free, no key required)
// Covers: LPL, LCK, LEC, LCS, Worlds, MSI, First Stand (~3 years depth)
const API = 'https://esports-api.lolesports.com/persisted/gw'
const H = {
  'x-api-key': '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z',
  'User-Agent': 'Mozilla/5.0'
}
const T = (ms: number) => ({ signal: AbortSignal.timeout(ms) })

const LEAGUES: { id: string; names: string[]; region: string }[] = [
  { id: '98767991314006698', names: ['lpl', 'lpl春', 'lpl夏', 'lpl春季', 'lpl夏季'], region: '中国' },
  { id: '98767991310872058', names: ['lck', 'lck春', 'lck夏', 'lck春季', 'lck夏季'], region: '韩国' },
  { id: '98767991302996019', names: ['lec', 'lec春', 'lec夏', 'lec春季', 'lec夏季'], region: '欧洲' },
  { id: '98767991299243165', names: ['lcs', 'lcs春', 'lcs夏'], region: '北美' },
  { id: '98767975604431411', names: ['worlds', 's赛', '世界赛', '全球总决赛', 's13', 's14', 's15', 's16'], region: '国际' },
  { id: '98767991325878492', names: ['msi', '季中赛', '季中冠军赛', '季中邀请赛'], region: '国际' },
  { id: '113464388705111224', names: ['first stand', 'first_stand', '先锋赛', 'firststand'], region: '国际' },
]

const DEFAULT_LEAGUES = ['lpl', 'lck'] // shown when user doesn't specify a league

const TEAMS = /(t1|geng|gen\.g|dk|dplus|kt|hle|hanwha|brion|drx|ns|nongshim|fearx|fox|dn|soopers|jdg|blg|lng|edg|wbg|tes|rng|ig|fpx|omg|al|tt|up|ra|we|nip|top|g2|fnc|mad|bds|sk|vit|th|kc|giantx|rogue|c9|tl|fly|nrg|100t|dig|imt|sr|lyon|psg|gam|dfm|shg|vke)/i
const PLAYERS = /(faker|chovy|showmaker|ruler|viper|gumayusi|zeus|oner|kanavi|scout|knight|bin|369|elk|meiko|canyon|peanut|lehends|deft|beryl|zeka|kingen|pyosik|bdd|aiming|kiin|doran|delight|keria|theshy|rookie|doinb|tian|jackeylove|crisp|ming|xioahu|wei|gala|light|missing|on|hang|able|care|ucal|cuzz|umti|morgan|dudu|clozer|bulldog|setab|vicla|fate|karis|pullbae|wayward|shanji|ale|zdz|hery|solokill|xiaoxu|naiyou|monki|beichuan|meteor|leyan|haichao|shanks|cryin|strive|angel|yuekai|care|fofo|ucal|neny|photic|assum|1xn|stay|hope|shaoye|kael|zhuo|wink|feather|vampire|niket|life|mark|hang|iwandy)/i

function detectLeague(q: string) {
  return LEAGUES.find(l => l.names.some(n => q.includes(n)))
}

function detectTeam(q: string) {
  const m = q.match(TEAMS)
  return m ? m[1] : null
}

function detectPlayer(q: string) {
  const m = q.match(PLAYERS)
  return m ? m[1] : null
}

async function getSchedule(leagueId: string, page?: string) {
  const p = page ? `&pageToken=${page}` : ''
  const r = await fetch(`${API}/getSchedule?hl=zh-CN&leagueId=${leagueId}${p}`, { headers: H, ...T(10000) })
  const d = await r.json()
  return d.data?.schedule || { events: [], pages: {} }
}

async function fetchAllEvents(leagueId: string, maxPages = 30): Promise<any[]> {
  let events: any[] = []
  let pageToken: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const schedule = await getSchedule(leagueId, pageToken)
    const newEvents = schedule.events || []
    if (newEvents.length === 0) break
    events = events.concat(newEvents)
    pageToken = schedule.pages?.older
    if (!pageToken) break
  }
  return events
}

function formatDate(d: Date): string {
  const now = Date.now()
  const diff = (now - d.getTime()) / 86400000
  if (diff < 1 && d.getDate() === new Date(now).getDate()) return '今天'
  if (diff < 2 && d.getDate() === new Date(now).getDate() - 1) return '昨天'
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export async function fetchLOL(query: string): Promise<string> {
  try {
    const sections: string[] = []
    const q = query.toLowerCase()
    const league = detectLeague(q)
    const teamName = detectTeam(q)
    const playerName = detectPlayer(q)

    // Determine which leagues to query
    let targetLeagues = league ? [league] : LEAGUES.filter(l => DEFAULT_LEAGUES.includes(l.names[0]))

    // If team mentioned, search all leagues to find it
    if (teamName) targetLeagues = LEAGUES.filter(l => !l.names[0].includes('worlds') && !l.names[0].includes('msi') && !l.names[0].includes('first'))

    // 1. League schedule + results
    for (const lg of targetLeagues) {
      const events = await fetchAllEvents(lg.id)
      if (events.length === 0) continue

      const now = Date.now()
      const completed = events
        .filter((e: any) => e.state === 'completed' && e.match?.teams?.[0] && e.match?.teams?.[1])
        .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      const upcoming = events
        .filter((e: any) => (e.state === 'unstarted' || e.state === 'inProgress') && e.match?.teams?.[0] && e.match?.teams?.[1])
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

      // Team filter
      const teamFilter = teamName ? (e: any) => {
        const t1 = (e.match?.teams?.[0]?.name || '').toLowerCase()
        const t2 = (e.match?.teams?.[1]?.name || '').toLowerCase()
        const tn = teamName.toLowerCase()
        return t1.includes(tn) || t2.includes(tn) || t1.replace(/\s/g, '').includes(tn.replace(/\s/g, '')) || t2.replace(/\s/g, '').includes(tn.replace(/\s/g, ''))
      } : null

      const filteredCompleted = teamFilter ? completed.filter(teamFilter) : completed
      const filteredUpcoming = teamFilter ? upcoming.filter(teamFilter) : upcoming

      if (filteredCompleted.length > 0 || filteredUpcoming.length > 0) {
        const label = lg.names[0].toUpperCase() === 'WORLDS' ? '🏆 Worlds' :
          lg.names[0].toUpperCase() === 'MSI' ? '🏆 MSI' :
          lg.names[0].toUpperCase() === 'FIRST_STAND' ? '🏆 先锋赛' :
          `🏆 ${lg.names[0].toUpperCase()} (${lg.region})`

        sections.push(`## ${label}`)
        sections.push(`数据范围: ${formatDate(new Date(events.map(e => new Date(e.startTime).getTime()).reduce((a,b) => Math.min(a,b))))} ~ ${formatDate(new Date(events.map(e => new Date(e.startTime).getTime()).reduce((a,b) => Math.max(a,b))))} | 共 ${events.length} 场比赛`)

        if (filteredUpcoming.length > 0) {
          const items = filteredUpcoming.slice(0, 10).map((e: any) => {
            const t1 = e.match?.teams?.[0]
            const t2 = e.match?.teams?.[1]
            const d = new Date(e.startTime)
            return `- 🔜 ${formatDate(d)} | ${t1.name} vs ${t2.name}`
          }).join('\n')
          sections.push(`### 即将开始\n${items}`)
        }

        if (filteredCompleted.length > 0) {
          // Show last 20 matches by default, or more if specific team
          const count = teamName ? Math.min(filteredCompleted.length, 50) : 20
          const items = filteredCompleted.slice(0, count).map((e: any) => {
            const t1 = e.match?.teams?.[0]
            const t2 = e.match?.teams?.[1]
            const s1 = t1.result?.gameWins ?? ''
            const s2 = t2.result?.gameWins ?? ''
            const score = s1 !== '' ? ` **${s1}:${s2}**` : ''
            const d = new Date(e.startTime)
            const win = t1.result?.outcome === 'win' ? ' ✅' : t2.result?.outcome === 'win' ? ' ❌' : ''
            return `- ${formatDate(d)} | ${t1.name}${score} ${t2.name}${win}`
          }).join('\n')
          const label = teamName ? `### ${teamName.toUpperCase()} 历史战绩 (${filteredCompleted.length} 场)` : '### 近期赛果'
          sections.push(`${label}\n${items}`)
        }
      }
    }

    // 2. Player mention
    if (playerName && !teamName) {
      sections.push(`## 👤 选手: ${playerName}`)
      sections.push(`详细数据: https://lol.fandom.com/wiki/${encodeURIComponent(playerName)}`)
    }

    // 3. Cross-league: if team not found in regionals, check worlds/msi
    if (teamName && sections.length === 0) {
      for (const lg of LEAGUES.filter(l => l.names[0] === 'worlds' || l.names[0] === 'msi')) {
        const events = await fetchAllEvents(lg.id)
        const completed = events
          .filter((e: any) => e.state === 'completed')
          .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        const tn = teamName.toLowerCase()
        const filtered = completed.filter((e: any) => {
          const t1 = (e.match?.teams?.[0]?.name || '').toLowerCase()
          const t2 = (e.match?.teams?.[1]?.name || '').toLowerCase()
          return t1.includes(tn) || t2.includes(tn)
        })
        if (filtered.length > 0) {
          const items = filtered.slice(0, 20).map((e: any) => {
            const t1 = e.match?.teams?.[0]
            const t2 = e.match?.teams?.[1]
            const s1 = t1.result?.gameWins ?? ''
            const s2 = t2.result?.gameWins ?? ''
            const score = s1 !== '' ? ` **${s1}:${s2}**` : ''
            const d = new Date(e.startTime)
            const win = t1.result?.outcome === 'win' ? ' ✅' : t2.result?.outcome === 'win' ? ' ❌' : ''
            return `- ${formatDate(d)} | ${t1.name}${score} ${t2.name}${win}`
          }).join('\n')
          sections.push(`## 🌍 ${lg.names[0].toUpperCase() === 'WORLDS' ? 'Worlds' : 'MSI'} — ${teamName.toUpperCase()}`)
          sections.push(`### 历史战绩 (${filtered.length} 场)\n${items}`)
        }
      }
    }

    return sections.length > 0 ? sections.join('\n\n') : ''
  } catch (e: any) {
    console.error('[LOL] error:', e.message)
    return ''
  }
}
