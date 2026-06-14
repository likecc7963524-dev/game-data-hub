/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    platform: string
    versions: { node: string; electron: string }
    getConfig: () => Promise<{
      apiKey: string; baseUrl: string; model: string; enableWebSearch: boolean
    } | null>
    setConfig: (cfg: any) => Promise<any>
    chatSend: (sessionId: string, messages: any[], agentId: string) => void
    chatStop: (sessionId: string) => void
    onChatChunk: (sessionId: string, cb: (text: string) => void) => () => void
    onChatDone: (sessionId: string, cb: () => void) => () => void
    onChatError: (sessionId: string, cb: (err: string) => void) => () => void
    testApi: (cfg: any) => Promise<{ ok: boolean; message: string }>
  }
}
