import React, { useState, useCallback, Component } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { Layers, List, Languages, Download, Settings, Upload, Terminal } from 'lucide-react'
import { useWebSocket } from './useWebSocket'
import ProjetPage     from './pages/ProjetPage'
import ImportPage     from './pages/ImportPage'
import GlossairePage  from './pages/GlossairePage'
import TraductionPage from './pages/TraductionPage'
import ExportPage     from './pages/ExportPage'
import ConsolePage    from './pages/ConsolePage'
import SettingsPage   from './pages/SettingsPage'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e, info) { console.error('[ErrorBoundary]', e, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <p className="text-status-error font-semibold mb-2">Erreur d'interface</p>
          <p className="text-text-muted text-sm mb-6 font-mono">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm">
            Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const NAV = [
  { to: '/',           icon: Layers,    label: 'Projets'    },
  { to: '/import',     icon: Upload,    label: 'Import'     },
  { to: '/glossaire',  icon: List,      label: 'Glossaire'  },
  { to: '/traduction', icon: Languages, label: 'Traduction' },
  { to: '/export',     icon: Download,  label: 'Export'     },
  { to: '/console',    icon: Terminal,  label: 'Console'    },
]

export default function App() {
  const [stats, setStats]       = useState(null)
  const [wsEvents, setWsEvents] = useState([])

  const onMessage = useCallback((msg) => {
    if (msg.type === 'stats') setStats(msg.data)
    if (msg.stats) setStats(msg.stats)
    setWsEvents(prev => [msg, ...prev.slice(0, 49)])
  }, [])

  const wsConnected = useWebSocket(onMessage)

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 bg-bg-card border-r border-border flex flex-col shrink-0">
        <div className="p-6 border-b border-border">
          <h1 className="text-base font-bold text-text-primary tracking-wide">eBook Translate</h1>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${isActive ? 'bg-accent/20 text-accent-light' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}>
              <Icon size={16} />{label}
            </NavLink>
          ))}
        </nav>

        {stats && stats.total > 0 && (
          <div className="px-4 pb-2 pt-3 border-t border-border">
            <div className="flex justify-between text-xs text-text-muted mb-1.5">
              <span>{stats.traduits} / {stats.total} chapitres</span>
              <span>{Math.round(stats.traduits / stats.total * 100)}%</span>
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${stats.traduits / stats.total * 100}%` }} />
            </div>
          </div>
        )}

        <div className="p-3 border-t border-border">
          <NavLink to="/parametres"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
              ${isActive ? 'bg-accent/20 text-accent-light' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}>
            <Settings size={16} />Paramètres
          </NavLink>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-bg">
        <ErrorBoundary>
        <Routes>
          <Route path="/"            element={<ProjetPage />} />
          <Route path="/import"      element={<ImportPage />} />
          <Route path="/glossaire"   element={<GlossairePage wsEvents={wsEvents} />} />
          <Route path="/traduction"  element={<TraductionPage stats={stats} wsEvents={wsEvents} />} />
          <Route path="/export"      element={<ExportPage />} />
          <Route path="/console"     element={<ConsolePage wsEvents={wsEvents} connected={wsConnected} />} />
          <Route path="/parametres"  element={<SettingsPage />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}
