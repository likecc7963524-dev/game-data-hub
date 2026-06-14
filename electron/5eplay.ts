// 5EPlay API: player detail + event bracket data
// Uses Node.js https (not fetch) to avoid Electron Chromium network stack timeouts
import { get } from 'https'

function httpsGetJSON(url: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = ''
      res.on('data', (c: string) => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

export async function fetch5EPlayer(query: string): Promise<string> {
  try {
    const playerNames = /(donk|zywoo|monesy|niko|s1mple|karrigan|ropz|elige|twistzz|broky|dev1ce|sh1ro|jl|frozen|blamef|yekindar|ax1le|hobbit|electronic|perfecto|magisk|dupreeh|apex|zont1x|magnojez|kyousuke|mir|fame|fl1t|jame|buster|heavygod|degster)/i
    const pm = query.match(playerNames)
    const searchKw = pm ? pm[1] : query.trim().substring(0, 30)

    const sd = await httpsGetJSON(`https://ya-api-app.5eplay.com/v1/search/player?keyword=${encodeURIComponent(searchKw)}&limit=1`, 10000)
    const player = sd?.data?.players?.[0]
    if (!player) return ''

    const pid = player.obj_id || player.player_id
    const playerName = (player.disp_name || player.name || '?').replace(/<\/?[^>]+>/g, '')

    const dd = await httpsGetJSON(`https://esports-data.5eplaycdn.com/v1/api/csgo/players/${pid}`, 15000)
    const info = dd?.data?.basic_info
    const stats = dd?.data?.player_data
    const profile = dd?.data?.player_profile
    if (!info || !stats) return ''

    const sections: string[] = []

    sections.push(`## 🔍 选手: ${playerName}
- 战队: ${info.team_name || 'N/A'}
- 国籍: ${info.country_zh || info.country_en || 'N/A'}
- 生日: ${info.birthday || 'N/A'}
- 奖金: ${info.bonus || 'N/A'}
- HLTV Top20: ${info.top20_num || '0'} 次`)

    sections.push(`## 📊 数据总览 (全部赛事)
- **Rating**: ${stats.rating || 'N/A'}
- **ADR**: ${stats.adr || 'N/A'}
- **KAST**: ${stats.kast || 'N/A'}%
- **KD**: ${stats.kd || 'N/A'}
- **KPR**: ${stats.kpr || 'N/A'}
- **DPR**: ${stats.dpr || 'N/A'}
- **爆头率**: ${stats.head_shot || 'N/A'}%
- **Impact**: ${stats.impact || 'N/A'}
- 击杀: ${stats.kill || 0} | 死亡: ${stats.death || 0}
- 地图数: ${stats.maps_played || 0} | 回合数: ${stats.rounds_played || 0}`)

    const honors = profile?.history_honor
    if (honors && honors.length > 0) {
      const championships = honors.filter((h: any) => h.rank_desc === '冠军')
      const honorList = honors.map((h: any) => {
        const tt = h.history_tt || {}
        const name = tt.name || 'N/A'
        const rank = h.rank_desc || h.rank || ''
        const date = tt.start_time ? tt.start_time.substring(0, 10) : ''
        const bonus = tt.bonus || ''
        return `- **${rank}** ${name}${date ? ' (' + date + ')' : ''}${bonus ? ' — ' + bonus : ''}`
      }).join('\n')
      sections.push(`## 🏆 生涯荣誉\n冠军数: **${championships.length}** | 总荣誉: **${honors.length}** 项\n\n${honorList}`)
    }

    const maps = stats.maps
    if (maps && maps.length > 0) {
      const topMaps = maps
        .filter((m: any) => m.use_num > 0)
        .sort((a: any, b: any) => b.use_num - a.use_num)
        .slice(0, 5)
        .map((m: any) => `- **${m.name}**: Rating ${m.rating} | KD ${m.kd} | ${m.use_num} 场`)
        .join('\n')
      if (topMaps) sections.push(`## 🗺️ 最佳地图\n${topMaps}`)
    }

    return sections.join('\n\n')
  } catch (e: any) {
    console.error('[5EPlayer] error:', e.message)
    return ''
  }
}

export async function fetch5EEvent(query: string): Promise<string> {
  try {
    const eventNames = /(pgl|iem|blast|esl|major|卡托维兹|科隆|里约|阿斯塔纳|亚特兰大|克拉科夫|布达佩斯|哥本哈根|巴黎|斯德哥尔摩|安特卫普|柏林|伦敦|达拉斯|悉尼|马尔默|科隆|星尘|赏金赛)/i
    const em = query.match(eventNames)
    const searchKw = em ? em[1] : query.trim().substring(0, 30)

    const sd = await httpsGetJSON(`https://ya-api-app.5eplay.com/v1/search/tournament?keyword=${encodeURIComponent(searchKw)}&limit=1`, 10000)
    const tournament = sd?.data?.tournaments?.[0]
    if (!tournament) return ''

    const tid = tournament.obj_id || tournament.tt_id
    const tname = (tournament.disp_name || tournament.name || '?').replace(/<\/?[^>]+>/g, '')

    const sd2 = await httpsGetJSON(`https://esports-data.5eplaycdn.com/v1/api/csgo/tournaments/${tid}/stages`, 15000)
    const stages = sd2?.data
    if (!stages || stages.length === 0) return ''

    const md = await httpsGetJSON(`https://esports-data.5eplaycdn.com/v1/api/csgo/matches?tt_ids=${tid}&game_status=1&limit=50&page=1`, 15000)
    const matchList = md?.data?.items || md?.data?.matches || []

    const sections: string[] = []
    sections.push(`## 🏆 赛事: ${tname}`)

    if (matchList.length > 0) {
      const formatted = matchList.map((m: any) => {
        const info = m.mc_info || m
        const home = (info.home_info?.disp_name || info.home_team_name || '').replace(/<\/?[^>]+>/g, '')
        const away = (info.opponent_info?.disp_name || info.away_team_name || '').replace(/<\/?[^>]+>/g, '')
        const hs = info.home_score || info.home_quick_score || ''
        const as = info.opponent_score || info.away_quick_score || ''
        const stage = info.stage_name || info.round_name || ''
        const score = hs !== '' && as !== '' ? `**${hs}:${as}**` : 'vs'
        return `- ${home} ${score} ${away}${stage ? ' — ' + stage : ''}`
      })
      sections.push(`### 比赛结果 (${formatted.length} 场)\n${formatted.join('\n')}`)
    }

    return sections.join('\n\n')
  } catch (e: any) {
    console.error('[5EEvent] error:', e.message)
    return ''
  }
}
