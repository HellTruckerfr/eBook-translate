import React, { useState, useEffect, useRef } from 'react'
import { Play, Square, RefreshCw, ChevronRight, ChevronLeft, X, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../api'

const ARCS = [
  { id: 1, nom: "Le système vampire",       debut: 1,    fin: 138  },
  { id: 2, nom: "Ils arrivent !",            debut: 139,  fin: 383  },
  { id: 3, nom: "Un nouveau monde",          debut: 384,  fin: 534  },
  { id: 4, nom: "Guerre civile",             debut: 535,  fin: 808  },
  { id: 5, nom: "Bataille pour le trône",    debut: 808,  fin: 945  },
  { id: 6, nom: "Le plus grand être humain", debut: 946,  fin: 1572 },
  { id: 7, nom: "Le retour d'une légende",   debut: 1573, fin: 1985 },
  { id: 8, nom: "Le Dernier Vampire",        debut: 1986, fin: 2545 },
]

const STATUS_COLOR = {
  en_attente: 'bg-status-waiting/40',
  en_cours:   'bg-status-progress',
  traduit:    'bg-status-done',
  relu:       'bg-status-reviewed',
}

export default function TraductionPage({ stats, wsEvents }) {
  const [arcStats, setArcStats] = useState([])
  const [running, setRunning] = useState(false)
  const [selectedArc, setSelectedArc] = useState(null)
  const [chapitres, setChapitres] = useState([])
  const [editChapitre, setEditChapitre] = useState(null)
  const [workers, setWorkers] = useState(1)
  const [error, setError] = useState(null)
  const [lastErrors, setLastErrors] = useState([])
  const [usage, setUsage] = useState(null)
  const statsTimerRef = useRef(null)

  useEffect(() => {
    loadStats()
    api.statutTraduction().then(s => setRunning(s.running)).catch(() => {})
  }, [])

  useEffect(() => {
    const last = wsEvents[0]
    if (!last) return
    if (last.type === 'traduction_terminee') {
      setRunning(false)
      loadStats()
    }
    if (last.type === 'chapitre_traduit') {
      if (last.data?.error) setLastErrors(prev => [last.data, ...prev.slice(0, 4)])
      if (last.usage) setUsage(last.usage)
      loadStatsDebounced()
    }
    if (last.type === 'error') {
      setError(last.message)
      setRunning(false)
    }
  }, [wsEvents])

  const loadStats = async () => {
    try {
      const data = await api.getStats()
      setArcStats(data.arcs || [])
    } catch (e) {
      console.error('loadStats failed:', e)
    }
  }

  const loadStatsDebounced = () => {
    clearTimeout(statsTimerRef.current)
    statsTimerRef.current = setTimeout(loadStats, 600)
  }

  const loadChapitres = async (arcId) => {
    setSelectedArc(arcId)
    const data = await api.getChapitres({ arc_id: arcId, limit: 999 })
    setChapitres(data)
  }

  const start = async (arcId = null) => {
    setError(null)
    setLastErrors([])
    setRunning(true)
    try {
      await api.lancerTraduction(arcId)
    } catch (e) {
      setRunning(false)
      setError(e.message)
    }
  }

  const stop = async () => {
    await api.arreterTraduction()
    setRunning(false)
  }

  const reset = async () => {
    await api.resetTraductionBloques()
    setRunning(false)
    setError(null)
  }

  const resetTout = async () => {
    const total = arcStats.reduce((s, a) => s + a.traduits, 0)
    if (!confirm(`Remettre ${total} chapitre(s) traduit(s) en attente et relancer depuis le début ?`)) return
    await api.resetTraductionTout()
    setRunning(false)
    setError(null)
    setLastErrors([])
    await loadStats()
  }

  const retranslate = async (id) => {
    await api.traduireChapitre(id)
    if (selectedArc) loadChapitres(selectedArc)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Traduction</h2>
          {stats && (
            <p className="text-text-secondary text-sm mt-1">
              {stats.traduits} / {stats.total} chapitres traduits
              {stats.en_cours > 0 && <span className="text-status-progress ml-2">· {stats.en_cours} en cours</span>}
              {usage && (
                <span className="text-text-muted ml-3">
                  · ~${usage.cout_usd.toFixed(4)} USD · {((usage.prompt_tokens + usage.completion_tokens) / 1000).toFixed(1)}k tokens
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>Workers :</span>
            <select value={workers} onChange={e => setWorkers(Number(e.target.value))}
              className="bg-bg-card border border-border rounded px-2 py-1 outline-none text-text-primary">
              {[1,2,3,5,8,10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {running ? (
            <div className="flex items-center gap-2">
              <button onClick={reset} title="Forcer le reset si bloqué"
                className="flex items-center gap-1.5 text-text-muted hover:text-text-secondary px-3 py-2.5 rounded-lg text-sm border border-border hover:border-border transition-colors">
                <RotateCcw size={13} /> Reset
              </button>
              <button onClick={stop}
                className="flex items-center gap-2 bg-status-error/20 border border-status-error/30 text-status-error px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-status-error/30 transition-colors">
                <Square size={14} /> Arrêter
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={resetTout}
                className="flex items-center gap-1.5 border border-border text-text-muted hover:text-status-error hover:border-status-error/40 px-3 py-2.5 rounded-lg text-sm transition-colors">
                <RotateCcw size={13} /> Réinitialiser
              </button>
              <button onClick={() => start()}
                className="flex items-center gap-2 bg-accent hover:bg-accent-glow text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                <Play size={14} /> Lancer tout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Erreurs */}
      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error rounded-lg px-4 py-3 mb-4 text-sm flex items-start justify-between gap-3">
          <span><strong>Erreur :</strong> {error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70">✕</button>
        </div>
      )}
      {lastErrors.length > 0 && (
        <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 mb-4 text-sm">
          <p className="text-status-error font-medium mb-1">Dernières erreurs de traduction :</p>
          {lastErrors.map((e, i) => (
            <p key={i} className="text-text-secondary text-xs font-mono truncate">Ch.{e.id} — {e.error}</p>
          ))}
        </div>
      )}

      {/* Barre progression globale */}
      {stats && (
        <div className="bg-bg-card border border-border rounded-lg p-4 mb-6">
          <div className="flex justify-between text-sm text-text-secondary mb-2">
            <span>Progression totale</span>
            <span className="font-medium text-text-primary">
              {stats.total ? Math.round(stats.traduits / stats.total * 100) : 0}%
            </span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${stats.total ? stats.traduits / stats.total * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Arcs */}
      <div className="grid grid-cols-1 gap-3 mb-8">
        {arcStats.map(arc => {
          const pct = arc.total ? Math.round(arc.traduits / arc.total * 100) : 0
          return (
            <div key={arc.id} className="bg-bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors cursor-pointer"
              onClick={() => loadChapitres(arc.id)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted font-mono">Arc {arc.id}</span>
                  <span className="text-text-primary font-medium">{arc.nom}</span>
                  <span className="text-xs text-text-muted">ch.{arc.debut}–{arc.fin}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-secondary">{arc.traduits}/{arc.total}</span>
                  <button onClick={e => { e.stopPropagation(); start(arc.id) }} disabled={running}
                    className="text-accent hover:text-accent-light disabled:opacity-30 transition-colors">
                    <Play size={14} />
                  </button>
                  <ChevronRight size={14} className="text-text-muted" />
                </div>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent/70 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Réinitialiser une plage */}
      <ResetPlage onDone={loadStats} />

      {/* Panneau chapitres */}
      {selectedArc && (
        <div className="bg-bg-card border border-border rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">
              Arc {selectedArc} — {chapitres.length} chapitres
            </h3>
            <button onClick={() => setSelectedArc(null)} className="text-text-muted hover:text-text-secondary">
              <X size={16} />
            </button>
          </div>
          <div className="p-4 grid grid-cols-10 gap-1.5 max-h-64 overflow-y-auto">
            {chapitres.map(c => (
              <div key={c.id} title={`${c.titre_fr} — ${c.statut}`}
                className={`h-7 rounded text-xs flex items-center justify-center cursor-pointer
                  font-mono transition-all hover:scale-110 hover:z-10
                  ${STATUS_COLOR[c.statut] || 'bg-border'} text-white/70`}
                onClick={() => setEditChapitre(c.id)}>
                {c.id}
              </div>
            ))}
          </div>
          <div className="px-4 pb-3 flex gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-status-waiting/40 inline-block" />En attente</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-status-progress inline-block" />En cours</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-status-done inline-block" />Traduit</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-status-reviewed inline-block" />Relu</span>
          </div>
        </div>
      )}

      {/* Modal édition chapitre */}
      {editChapitre && (
        <ChapitreModal
          id={editChapitre}
          chapitreIds={chapitres.map(c => c.id)}
          onNavigate={setEditChapitre}
          onClose={() => { setEditChapitre(null); if (selectedArc) loadChapitres(selectedArc) }}
          onRetranslate={retranslate}
        />
      )}
    </div>
  )
}

function ResetPlage({ onDone }) {
  const [open, setOpen]     = useState(false)
  const [debut, setDebut]   = useState('')
  const [fin, setFin]       = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    const d = parseInt(debut), f = parseInt(fin)
    if (!d || !f || d > f) return
    if (!confirm(`Remettre les chapitres ${d} à ${f} en attente et effacer leur traduction ?`)) return
    setLoading(true)
    setResult(null)
    try {
      const res = await api.resetPlage({ debut: d, fin: f })
      setResult({ ok: true, n: res.chapitres_remis_en_attente })
      onDone()
    } catch (e) {
      setResult({ ok: false, error: e.message })
    }
    setLoading(false)
  }

  return (
    <div className="mb-6">
      <button onClick={() => { setOpen(v => !v); setResult(null) }}
        className="flex items-center gap-2 text-sm text-text-muted hover:text-status-error transition-colors">
        <Trash2 size={13} />
        {open ? 'Masquer' : 'Réinitialiser une plage de chapitres'}
      </button>

      {open && (
        <div className="mt-3 bg-bg-card border border-status-error/20 rounded-lg p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs text-text-muted block mb-1">Chapitre début</label>
            <input type="number" value={debut} onChange={e => setDebut(e.target.value)}
              placeholder="1"
              className="w-28 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-status-error/50" />
          </div>
          <span className="text-text-muted pb-2">→</span>
          <div>
            <label className="text-xs text-text-muted block mb-1">Chapitre fin</label>
            <input type="number" value={fin} onChange={e => setFin(e.target.value)}
              placeholder="138"
              className="w-28 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-status-error/50" />
          </div>
          <button onClick={run} disabled={loading || !debut || !fin}
            className="flex items-center gap-2 bg-status-error/20 border border-status-error/40 text-status-error hover:bg-status-error/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? <RotateCcw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Réinitialiser
          </button>
          {result && (
            <p className={`text-sm ${result.ok ? 'text-status-done' : 'text-status-error'}`}>
              {result.ok ? `✓ ${result.n} chapitre(s) remis en attente` : result.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ChapitreModal({ id, chapitreIds, onNavigate, onClose, onRetranslate }) {
  const [data, setData]   = useState(null)
  const [texte, setTexte] = useState('')
  const [saving, setSaving] = useState(false)

  const idx  = chapitreIds.indexOf(id)
  const prev = idx > 0 ? chapitreIds[idx - 1] : null
  const next = idx < chapitreIds.length - 1 ? chapitreIds[idx + 1] : null

  useEffect(() => {
    setData(null)
    api.getChapitre(id).then(d => { setData(d); setTexte(d.texte_fr || '') })
  }, [id])

  const save = async (andClose = true) => {
    setSaving(true)
    await api.updateChapitre(id, { texte_fr: texte, statut: 'relu' })
    setSaving(false)
    if (andClose) onClose()
  }

  const navigate = async (targetId) => {
    if (texte !== (data?.texte_fr || '')) await save(false)
    onNavigate(targetId)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card border border-border rounded-xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="font-semibold text-text-primary text-base">
                {data ? data.titre_fr : `Chapitre ${id}`}
              </h3>
              {data && (
                <p className="text-xs text-text-muted mt-0.5">
                  {data.mots_fr} mots · Ch.{id}
                  {data.statut === 'relu' && <span className="text-status-reviewed ml-2">· Relu</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onRetranslate(id)}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light px-3 py-1.5 border border-accent/30 rounded-lg">
              <RefreshCw size={12} /> Retraduire
            </button>
            <button onClick={onClose} className="text-text-muted hover:text-text-secondary ml-2">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Textarea pleine hauteur */}
        {data ? (
          <textarea
            value={texte}
            onChange={e => setTexte(e.target.value)}
            className="flex-1 bg-transparent text-text-primary text-sm px-8 py-6 outline-none resize-none leading-relaxed min-h-0"
            style={{ fontFamily: 'Georgia, serif', fontSize: '15px', lineHeight: '1.8' }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Chargement...</div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => prev && navigate(prev)} disabled={!prev}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-2 border border-border rounded-lg disabled:opacity-30 transition-colors">
              <ChevronLeft size={13} /> Précédent
            </button>
            <button onClick={() => next && navigate(next)} disabled={!next}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-2 border border-border rounded-lg disabled:opacity-30 transition-colors">
              Suivant <ChevronRight size={13} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
              Fermer sans sauver
            </button>
            <button onClick={() => save(true)} disabled={saving || !data}
              className="px-5 py-2 bg-accent hover:bg-accent-glow text-white text-sm rounded-lg font-medium disabled:opacity-50">
              {saving ? 'Sauvegarde...' : 'Marquer comme relu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
