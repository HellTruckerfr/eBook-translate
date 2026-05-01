import React, { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'

const TYPE_STYLE = {
  chapitre_traduit:    { color: 'text-status-done',     label: 'TRADUIT'   },
  import_progress:     { color: 'text-status-progress', label: 'IMPORT'    },
  import_done:         { color: 'text-accent-light',    label: 'IMPORT'    },
  traduction_terminee: { color: 'text-accent-light',    label: 'DONE'      },
  glossaire_progress:  { color: 'text-status-progress', label: 'GLOSSAIRE' },
  glossaire_termine:   { color: 'text-accent-light',    label: 'GLOSSAIRE' },
  error:               { color: 'text-status-error',    label: 'ERREUR'    },
  stats:               { color: 'text-text-muted',      label: 'STATS'     },
}

function formatEvent(ev) {
  const style = TYPE_STYLE[ev.type] || { color: 'text-text-muted', label: ev.type.toUpperCase() }

  switch (ev.type) {
    case 'chapitre_traduit': {
      const d = ev.data || {}
      if (d.error) return { style: { color: 'text-status-error', label: 'ERREUR' }, text: `Ch.${d.id} — ${d.error}` }
      return { style, text: `Ch.${d.id} traduit — ${d.mots_fr ?? '?'} mots` }
    }
    case 'import_progress':
      return { style, text: `Chapitre ${ev.chapitre} importé` }
    case 'import_done':
      return { style, text: `Import terminé — ${ev.total} chapitres` }
    case 'traduction_terminee': {
      const g = ev.stats || {}
      return { style, text: `Traduction terminée — ${g.traduits ?? '?'}/${g.total ?? '?'} chapitres` }
    }
    case 'glossaire_progress':
      if (ev.error) return { style: { color: 'text-status-error', label: 'GLOSSAIRE' }, text: `Batch ${ev.batch}/${ev.total} ERREUR — ${ev.error}` }
      return { style, text: `Batch ${ev.batch}/${ev.total} — ${ev.inseres} termes insérés` }
    case 'glossaire_termine':
      return { style, text: `Glossaire terminé — ${ev.termes ?? '?'} termes${ev.error ? ` (erreur: ${ev.error})` : ''}` }
    case 'error':
      return { style, text: ev.message || JSON.stringify(ev) }
    case 'stats':
      return { style, text: `${ev.data?.traduits ?? '?'}/${ev.data?.total ?? '?'} traduits` }
    default:
      return { style, text: JSON.stringify(ev) }
  }
}

export default function ConsolePage({ wsEvents, connected }) {
  const bottomRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [wsEvents])

  const visible = wsEvents.filter(e => e.type !== 'stats')

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <Terminal size={18} className="text-accent-light" />
        <h2 className="text-2xl font-bold text-text-primary">Console</h2>
        <span className="text-xs text-text-muted ml-2">{visible.length} événements</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded border font-mono ${
          connected
            ? 'text-status-done border-status-done/30 bg-status-done/10'
            : 'text-status-error border-status-error/30 bg-status-error/10'
        }`}>
          {connected ? '● connecté' : '○ déconnecté'}
        </span>
      </div>

      <div className="flex-1 bg-bg-card border border-border rounded-lg overflow-y-auto font-mono text-xs p-4 space-y-0.5 min-h-0">
        {visible.length === 0 && (
          <p className="text-text-muted">En attente d'événements...</p>
        )}
        {[...visible].reverse().map((ev, i) => {
          const { style, text } = formatEvent(ev)
          return (
            <div key={i} className="flex items-start gap-3 py-0.5">
              <span className={`${style.color} w-20 shrink-0 text-right font-bold`}>{style.label}</span>
              <span className="text-text-secondary break-all">{text}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
