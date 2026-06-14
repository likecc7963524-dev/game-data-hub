import { createRoot } from 'react-dom/client'
import App from './App'

// In browser mode, inject web API adapter as window.electronAPI
if (typeof window !== 'undefined' && !(window as any).electronAPI) {
  import('./api').then(m => { (window as any).electronAPI = m.electronAPI })
}

createRoot(document.getElementById('root')!).render(<App />)
