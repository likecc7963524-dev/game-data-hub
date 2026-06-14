import { useState, useRef, useEffect, useCallback } from 'react'
import bgCyberpunk from './assets/bg-cyberpunk.jpg'
import bgCS from './assets/bg-cs.jpg'
import bgLOL from './assets/bg-lol.jpg'
import bgVal from './assets/bg-val.jpg'
import bgLOLUpdate from './assets/bg-lol-update.jpg'

interface Message { id: string; role: 'user' | 'assistant'; text: string }
interface Agent {
  id: string; name: string; icon: string; desc: string
  color: string; glow: string; bgImage: string
  messages: Message[] }

const agents: Agent[] = [
  {
    id: 'cs', name: 'CS 电竞', icon: '🎮', desc: '5EPlay 实时数据 · 选手/赛事/排名',
    color: '#ff6b35', glow: 'rgba(255,107,53,0.5)',
    bgImage: bgCS, messages: []
  },
  {
    id: 'lol', name: 'LOL 电竞', icon: '🏆', desc: 'Riot API · LPL/LCK/世界赛 · 战队/赛程',
    color: '#c8aa6e', glow: 'rgba(200,170,110,0.5)',
    bgImage: bgLOL, messages: []
  },
  {
    id: 'val', name: '瓦洛兰特', icon: '⚡', desc: 'Liquipedia 数据 · VCT/Champions · 战队/选手',
    color: '#ff2d55', glow: 'rgba(255,45,85,0.5)',
    bgImage: bgVal, messages: []
  },
  {
    id: 'lol-update', name: 'LOL 更新速览', icon: '📋', desc: '国服官方公告 · 英雄/装备改动 · 一键速览',
    color: '#00e599', glow: 'rgba(0,229,153,0.45)',
    bgImage: bgLOLUpdate, messages: []
  },
]

export default function App() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [agentStates, setAgentStates] = useState<Agent[]>(() => agents.map(a => ({ ...a, messages: [] })))
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1')
  const [model, setModel] = useState('deepseek-chat')
  const [webSearch, setWebSearch] = useState(true)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef(`s-${Date.now()}`)

  const activeAgent = activeId ? agentStates.find(a => a.id === activeId) : null
  const messages = activeAgent?.messages || []

  useEffect(() => {
    window.electronAPI?.getConfig().then(cfg => {
      if (cfg) {
        setApiKey(cfg.apiKey || '')
        setBaseUrl(cfg.baseUrl || 'https://api.deepseek.com/v1')
        setModel(cfg.model || 'deepseek-chat')
        setWebSearch(Boolean(cfg.enableWebSearch))
      }
    })
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamText])
  useEffect(() => { if (activeId) inputRef.current?.focus() }, [activeId])

  const updateAgentMessages = (id: string, msgs: Message[]) => {
    setAgentStates(prev => prev.map(a => a.id === id ? { ...a, messages: msgs } : a))
  }

  const saveConfig = async () => {
    await window.electronAPI?.setConfig({ apiKey, baseUrl, model, enableWebSearch: webSearch })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || streaming || !activeAgent) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text }
    const newMsgs = [...activeAgent.messages, userMsg]
    updateAgentMessages(activeAgent.id, newMsgs)
    setInput('')
    setStreaming(true)
    setStreamText('')

    const sid = `s-${Date.now()}`
    sessionRef.current = sid
    const cleanup: (() => void)[] = []

    cleanup.push(window.electronAPI!.onChatChunk(sid, chunk => setStreamText(p => p + chunk)))
    cleanup.push(window.electronAPI!.onChatDone(sid, () => {
      setStreamText(prev => {
        if (prev) updateAgentMessages(activeAgent.id, [...newMsgs, { id: `a-${Date.now()}`, role: 'assistant', text: prev }])
        return ''
      })
      setStreaming(false)
      cleanup.forEach(f => f())
    }))
    cleanup.push(window.electronAPI!.onChatError(sid, err => {
      updateAgentMessages(activeAgent.id, [...newMsgs, { id: `e-${Date.now()}`, role: 'assistant', text: `⚠️ ${err}` }])
      setStreaming(false)
      cleanup.forEach(f => f())
    }))

    const apiMsgs = [
      { role: 'system', content: '' },
      ...newMsgs.map(m => ({ role: m.role, content: m.text }))
    ]
    window.electronAPI!.chatSend(sid, apiMsgs, activeId)
  }, [input, streaming, activeAgent])

  const stop = () => {
    window.electronAPI!.chatStop(sessionRef.current)
    setStreaming(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const switchTab = (id: string) => {
    setActiveId(prev => prev === id ? null : id)
    setStreamText('')
  }

  return (
    <div style={shell}>
      {/* Cyberpunk 2077 main background — only on homepage */}
      {!activeId && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `url(${bgCyberpunk})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.35
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,8,15,0.7) 0%, rgba(8,12,26,0.4) 50%, rgba(5,8,15,0.8) 100%)' }} />
        <div style={scanlines} />
        <div style={neonGrid} />
      </div>
      )}

      {/* top bar */}
      <header style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={logo} onClick={() => { setActiveId(null); setStreamText('') }} title="返回主页">
            <span style={{ fontSize: 11, letterSpacing: 1 }}>DS</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0', letterSpacing: 0.5 }}>游戏数据通</div>
            <div style={{ fontSize: 9, color: '#4ade80', letterSpacing: 2, textTransform: 'uppercase' }}>竞技数据查询</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => switchTab(a.id)}
              style={{
                ...agentTab,
                background: a.id === activeId ? a.color : 'rgba(255,255,255,0.04)',
                color: a.id === activeId ? '#000' : '#8892b0',
                border: a.id === activeId ? `1px solid ${a.color}` : '1px solid rgba(255,255,255,0.06)',
                boxShadow: a.id === activeId ? `0 0 14px ${a.glow}` : 'none'
              }}
            >
              <span style={{ fontSize: 13 }}>{a.icon}</span>
              <span style={{ letterSpacing: 0.3 }}>{a.name}</span>
            </button>
          ))}
          <button onClick={() => setSettingsOpen(true)} style={gearBtn}>⚙️</button>
        </div>
      </header>

      {/* content */}
      {activeId ? (
        /* Chat view */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          {/* Agent game-themed background */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: `url(${activeAgent?.bgImage})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            opacity: 0.42
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,9,13,0.88) 0%, rgba(8,9,13,0.60) 50%, rgba(8,9,13,0.90) 100%)' }} />
          </div>

          {/* Agent header */}
          <div style={{ ...chatHeader, borderColor: activeAgent?.color + '22' }}>
            <button onClick={() => { setActiveId(null); setStreamText('') }} style={backBtn}>← 返回</button>
            <span style={{ fontSize: 10, color: '#4a5568' }}>/</span>
            <span style={{ fontSize: 12, color: activeAgent?.color, fontWeight: 600 }}>
              {activeAgent?.icon} <span style={{ letterSpacing: 0.5 }}>{activeAgent?.name}</span>
            </span>
          </div>

          {/* Messages */}
          <div style={chatArea}>
            {messages.length === 0 && !streaming && (
              <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                <div style={{ fontSize: 52, marginBottom: 14, filter: `drop-shadow(0 0 14px ${activeAgent?.glow})` }}>{activeAgent?.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#e2e8f0', letterSpacing: 1 }}>{activeAgent?.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, letterSpacing: 0.3 }}>{activeAgent?.desc}</div>
                <div style={{ marginTop: 18, width: 48, height: 1, margin: '18px auto 0', background: `linear-gradient(90deg, transparent, ${activeAgent?.color}, transparent)` }} />
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} style={{ ...msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ ...avatarS, background: activeAgent?.color, boxShadow: `0 0 10px ${activeAgent?.glow}`, marginRight: 10, flexShrink: 0 }}>
                    {activeAgent?.icon}
                  </div>
                )}
                <div style={{
                  ...bubble,
                  background: m.role === 'user' ? activeAgent?.color : 'rgba(10,12,18,0.82)',
                  backdropFilter: m.role === 'user' ? 'none' : 'blur(6px)',
                  color: m.role === 'user' ? '#000' : '#cbd5e1',
                  border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  maxWidth: '75%'
                }}>
                  {m.text}
                </div>
                {m.role === 'user' && (
                  <div style={{ ...avatarS, background: 'rgba(255,255,255,0.06)', color: '#94a3b8', marginLeft: 10, flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)' }}>👤</div>
                )}
              </div>
            ))}

            {streamText && (
              <div style={{ ...msgRow, justifyContent: 'flex-start' }}>
                <div style={{ ...avatarS, background: activeAgent?.color, boxShadow: `0 0 10px ${activeAgent?.glow}`, marginRight: 10 }}>{activeAgent?.icon}</div>
                <div style={{ ...bubble, background: 'rgba(10,12,18,0.82)', backdropFilter: 'blur(6px)', color: '#cbd5e1', borderRadius: '14px 14px 14px 4px', maxWidth: '75%', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {streamText}
                </div>
              </div>
            )}

            {streaming && !streamText && (
              <div style={{ ...msgRow, justifyContent: 'flex-start' }}>
                <div style={{ ...avatarS, background: activeAgent?.color, boxShadow: `0 0 10px ${activeAgent?.glow}`, marginRight: 10 }}>{activeAgent?.icon}</div>
                <div style={{ ...bubble, background: 'rgba(10,12,18,0.82)', backdropFilter: 'blur(6px)', color: '#4a5568', borderRadius: '14px 14px 14px 4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={loadingDot}>●</span><span style={{ ...loadingDot, animationDelay: '0.2s' }}>●</span><span style={{ ...loadingDot, animationDelay: '0.4s' }}>●</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ ...inputBar, borderColor: activeAgent?.color + '18' }}>
            <input
              ref={inputRef}
              style={{ ...inputField, borderColor: activeAgent?.color + '33', color: '#e2e8f0' }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={apiKey ? `跟 ${activeAgent?.name} 说点什么... (Enter 发送)` : '请先在设置中填写 API Key'}
              disabled={streaming || !apiKey}
            />
            {!streaming ? (
              <button onClick={send} disabled={!input.trim() || !apiKey} style={{
                ...sendBtn, background: activeAgent?.color, color: '#000',
                opacity: (!input.trim() || !apiKey) ? 0.3 : 1,
                boxShadow: (!input.trim() || !apiKey) ? 'none' : `0 0 16px ${activeAgent?.glow}`
              }}>
                发送
              </button>
            ) : (
              <button onClick={stop} style={{ ...sendBtn, background: '#ef4444', color: '#fff', boxShadow: '0 0 12px rgba(239,68,68,0.4)' }}>■ 停止</button>
            )}
          </div>
        </div>
      ) : (
        /* Homepage — 2x2 grid */
        <div style={home}>
          <div style={grid}>
            {agents.map(a => (
              <button
                key={a.id}
                onClick={() => setActiveId(a.id)}
                style={{
                  ...cardSlot,
                  borderColor: a.color + '22',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = a.color + 'cc'
                  e.currentTarget.style.boxShadow = `0 0 40px ${a.glow}, inset 0 0 50px ${a.glow.replace('0.5', '0.08').replace('0.45', '0.08')}`
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = a.color + '22'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {/* Card color wash */}
                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 30%, ${a.color}20 0%, transparent 70%)`, borderRadius: 10, pointerEvents: 'none' }} />
                {/* Corner accents */}
                <span style={{ position: 'absolute', top: 0, left: 0, width: 18, height: 18, borderTop: `2px solid ${a.color}`, borderLeft: `2px solid ${a.color}`, borderTopLeftRadius: 6, opacity: 0.7, zIndex: 2 }} />
                <span style={{ position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderBottom: `2px solid ${a.color}`, borderRight: `2px solid ${a.color}`, borderBottomRightRadius: 6, opacity: 0.7, zIndex: 2 }} />
                {/* Content */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 32, marginBottom: 10, filter: `drop-shadow(0 0 10px ${a.glow})` }}>{a.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', marginBottom: 4, letterSpacing: 1 }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: '#8892b0', letterSpacing: 0.2, lineHeight: 1.4 }}>{a.desc}</div>
                  <div style={{ marginTop: 10, width: 24, height: 2, background: a.color, borderRadius: 1, opacity: 0.6 }} />
                </div>
              </button>
            ))}
          </div>

          {!apiKey && (
            <div style={{ marginTop: 30, textAlign: 'center', position: 'relative', zIndex: 2 }}>
              <button onClick={() => setSettingsOpen(true)} style={cyberBtn}>
                ⚡ 配置 API 密钥
              </button>
            </div>
          )}
        </div>
      )}

      {/* settings modal */}
      {settingsOpen && (
        <div style={overlay} onClick={() => setSettingsOpen(false)}>
          <div style={panel} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: 1 }}>⚙️ 系统设置</h3>

            <label style={lbl}>API Key</label>
            <input style={inp} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
            <div style={hint}>从 <a href="https://platform.deepseek.com/api_keys" target="_blank" style={{ color: '#4ade80' }}>platform.deepseek.com</a> 获取</div>

            <label style={lbl}>API 地址</label>
            <input style={inp} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />

            <label style={lbl}>模型</label>
            <select style={sel} value={model} onChange={e => setModel(e.target.value)}>
              <option value="deepseek-chat">DeepSeek-V3 (通用)</option>
              <option value="deepseek-reasoner">DeepSeek-R1 (推理)</option>
            </select>

            <label style={{ ...lbl, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} style={{ accentColor: '#4ade80', width: 16, height: 16 }} />
              🌐 联网搜索
            </label>
            <div style={{ fontSize: 9, color: '#4a5568', marginTop: 3, marginLeft: 24 }}>Bing + HLTV + 5EPlay + LOL官方公告</div>

            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={async () => {
                setTesting(true); setTestResult('');
                const r = await window.electronAPI?.testApi({ apiKey, baseUrl, model });
                setTestResult(r?.message || '无响应');
                setTesting(false);
              }} disabled={testing || !apiKey} style={{ ...cancelBtn, color: '#4ade80', borderColor: '#4ade80' }}>
                {testing ? '测试中...' : '🔗 测试连接'}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSettingsOpen(false)} style={cancelBtn}>取消</button>
                <button onClick={saveConfig} style={{ ...cyberBtn, padding: '8px 18px', fontSize: 12 }}>{saved ? '✓ 已保存' : '保存'}</button>
              </div>
            </div>
            {testResult && (
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11, background: testResult.startsWith('✓') ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)', color: testResult.startsWith('✓') ? '#4ade80' : '#ef4444' }}>
                {testResult}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════ Styles ═══════════ */

const shell: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100vh',
  background: '#08090d', color: '#cbd5e1',
  fontFamily: '"PingFang SC", "Microsoft YaHei", monospace',
  position: 'relative', overflow: 'hidden'
}

// Scanline overlay
const scanlines: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
  zIndex: 1,
}

// Neon grid
const neonGrid: React.CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 0,
  backgroundImage: `
    linear-gradient(rgba(0,255,200,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,255,200,0.025) 1px, transparent 1px)
  `,
  backgroundSize: '60px 60px',
  maskImage: 'linear-gradient(0deg, transparent 30%, rgba(0,0,0,1) 70%)',
  WebkitMaskImage: 'linear-gradient(0deg, transparent 30%, rgba(0,0,0,1) 70%)',
}

// Top bar
const topBar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 20px', flexShrink: 0,
  background: 'rgba(8,9,13,0.88)', backdropFilter: 'blur(14px)',
  borderBottom: '1px solid rgba(74,222,128,0.06)',
  position: 'relative', zIndex: 10
}

const logo: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 6,
  background: 'linear-gradient(135deg, #1a2a1f, #0d1f14)',
  border: '1px solid #4ade8044',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#4ade80', fontWeight: 900, fontSize: 11,
  cursor: 'pointer', letterSpacing: 1,
  boxShadow: '0 0 14px rgba(74,222,128,0.12)'
}

const agentTab: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '6px 14px', borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.06)',
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
  fontWeight: 500, transition: 'all 0.2s',
  background: 'rgba(255,255,255,0.04)', color: '#8892b0'
}

const gearBtn: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.04)',
  padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 14,
  fontFamily: 'inherit', color: '#8892b0', transition: 'all 0.2s'
}

// Homepage
const home: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '40px 48px', position: 'relative', zIndex: 1
}

const grid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr',
  gap: 16, maxWidth: 540, width: '100%'
}

const cardSlot: React.CSSProperties = {
  position: 'relative',
  padding: '24px 20px 20px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.06)',
  cursor: 'pointer', textAlign: 'center',
  fontFamily: 'inherit', transition: 'all 0.3s ease',
  background: '#0d1117',
  color: '#cbd5e1', overflow: 'hidden'
}

// Chat
const chatHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '6px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
  background: 'rgba(8,9,13,0.7)', backdropFilter: 'blur(10px)',
  flexShrink: 0, position: 'relative', zIndex: 2
}
const backBtn: React.CSSProperties = {
  border: 'none', background: 'rgba(255,255,255,0.04)',
  borderRadius: 6, cursor: 'pointer', fontSize: 12,
  color: '#8892b0', fontFamily: 'inherit', padding: '4px 10px'
}

const chatArea: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '18px 20px',
  display: 'flex', flexDirection: 'column', gap: 14,
  position: 'relative', zIndex: 1
}
const msgRow: React.CSSProperties = { display: 'flex', alignItems: 'flex-end' }
const bubble: React.CSSProperties = {
  padding: '10px 16px', fontSize: 13, lineHeight: 1.65,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word'
}
const avatarS: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 700
}

const inputBar: React.CSSProperties = {
  display: 'flex', gap: 10, padding: '14px 20px',
  borderTop: '1px solid rgba(255,255,255,0.05)',
  flexShrink: 0, alignItems: 'center',
  background: 'rgba(8,9,13,0.85)', backdropFilter: 'blur(10px)',
  position: 'relative', zIndex: 10
}
const inputField: React.CSSProperties = {
  flex: 1, padding: '10px 18px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
  background: 'rgba(255,255,255,0.03)', color: '#e2e8f0'
}
const sendBtn: React.CSSProperties = {
  padding: '10px 24px', borderRadius: 8,
  border: 'none', fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  transition: 'all 0.2s'
}
const loadingDot: React.CSSProperties = {
  animation: 'blink 1.4s ease-in-out infinite', fontSize: 8, letterSpacing: 3
}

// Settings
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000
}
const panel: React.CSSProperties = {
  background: '#0d1117', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '24px 28px', width: 400,
  boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(74,222,128,0.04)'
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: '#64748b', marginBottom: 4, marginTop: 12,
  letterSpacing: 0.5, textTransform: 'uppercase'
}
const hint: React.CSSProperties = { fontSize: 9, color: '#4a5568', marginTop: 2 }
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.08)', fontSize: 13,
  outline: 'none', fontFamily: 'inherit',
  background: 'rgba(255,255,255,0.04)', color: '#e2e8f0',
  boxSizing: 'border-box'
}
const sel: React.CSSProperties = {
  width: '100%', padding: '9px 10px', borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.08)', fontSize: 13,
  outline: 'none', fontFamily: 'inherit',
  background: 'rgba(255,255,255,0.04)', color: '#e2e8f0'
}

const cyberBtn: React.CSSProperties = {
  padding: '10px 24px', borderRadius: 7,
  border: '1px solid #4ade80',
  background: 'rgba(74,222,128,0.06)',
  color: '#4ade80', fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.2s',
  boxShadow: '0 0 16px rgba(74,222,128,0.15)'
}
const cancelBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  color: '#8892b0', cursor: 'pointer', fontSize: 12,
  fontFamily: 'inherit', transition: 'all 0.2s'
}

// Keyframes
if (typeof document !== 'undefined') {
  const s = document.createElement('style')
  s.textContent = '@keyframes blink{0%,100%{opacity:0.15}50%{opacity:1}}'
  document.head.appendChild(s)
}

