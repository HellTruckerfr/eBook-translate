import React, { useState, useEffect } from 'react'
import { Sparkles, Check, X, Loader, Trash2, BookOpen, Plus, Search, FileText } from 'lucide-react'
import { api } from '../api'

const DECISIONS = ['en_attente', 'traduire', 'garder', 'adapter']
const CATEGORIES = ['personnage', 'lieu', 'capacité', 'terme_système', 'organisation', 'objet', 'autre']

const DECISION_STYLE = {
  en_attente: 'bg-status-waiting/20 text-status-waiting border-status-waiting/30',
  traduire:   'bg-status-done/20 text-status-done border-status-done/30',
  garder:     'bg-accent/20 text-accent-light border-accent/30',
  adapter:    'bg-status-progress/20 text-status-progress border-status-progress/30',
}

function ContexteModal({ terme, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    api.getContexteTerme(terme.id, 8)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setErreur(e.message); setLoading(false) })
  }, [terme.id])

  const highlightTerm = (text, mot) => {
    const parts = text.split(new RegExp(`(>>>${mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<<<)`, 'gi'))
    return parts.map((part, i) =>
      part.startsWith('>>>') && part.endsWith('<<<')
        ? <mark key={i} className="bg-accent/30 text-accent-light rounded px-0.5 not-italic font-semibold">{part.slice(3, -3)}</mark>
        : <span key={i}>{part}</span>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="font-semibold text-text-primary">Contexte : <span className="text-accent-light">{terme.terme_en}</span></h3>
            <p className="text-xs text-text-muted mt-0.5">Extraits des chapitres où le terme apparaît</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {loading && <p className="text-text-muted text-sm text-center py-8">Recherche en cours...</p>}
          {!loading && erreur && (
            <p className="text-status-error text-sm text-center py-8">Erreur : {erreur}</p>
          )}
          {!loading && !erreur && data?.extraits?.length === 0 && (
            <p className="text-text-muted text-sm text-center py-8">Aucun extrait trouvé dans le texte anglais.</p>
          )}
          {data?.extraits?.map((e, i) => (
            <div key={i} className="bg-bg border border-border/60 rounded-lg p-4">
              <p className="text-xs text-text-muted mb-2 font-mono">{e.titre} — Ch.{e.chapitre_id}</p>
              <p className="text-sm text-text-secondary leading-relaxed italic">
                "…{highlightTerm(e.extrait, data.terme)}…"
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const EMPTY_NEW = { terme_en: '', terme_fr: '', categorie: 'autre', decision: 'en_attente', notes: '' }

export default function GlossairePage({ wsEvents = [] }) {
  const [termes, setTermes] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(null)
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [filtreDecision, setFiltreDecision] = useState('')
  const [recherche, setRecherche] = useState('')
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [contexteTerme, setContexteTerme] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newTerme, setNewTerme] = useState(EMPTY_NEW)
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    const params = {}
    if (filtreCategorie) params.categorie = filtreCategorie
    if (filtreDecision) params.decision = filtreDecision
    const data = await api.getGlossaire(params)
    setTermes(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    api.getGlossaireStatus().then(s => setGenerating(s.running)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [filtreCategorie, filtreDecision])

  useEffect(() => {
    const last = wsEvents[0]
    if (!last) return
    if (last.type === 'glossaire_progress') {
      setGenerating(true)
      setProgress({ batch: last.batch, total: last.total, inseres: last.inseres })
    }
    if (last.type === 'glossaire_termine') {
      setGenerating(false)
      setProgress(null)
      load()
    }
  }, [wsEvents])

  const generate = async () => {
    setGenerating(true)
    setProgress(null)
    await api.genererGlossaire()
  }

  const vider = async () => {
    if (!confirm(`Supprimer les ${termes.length} termes du glossaire ?`)) return
    await api.viderGlossaire()
    setTermes([])
  }

  const supprimerEnAttente = async () => {
    const nb = termes.filter(t => t.decision === 'en_attente').length
    if (!nb) return
    if (!confirm(`Supprimer les ${nb} termes "en_attente" ?`)) return
    await api.supprimerParDecision('en_attente')
    await load()
  }

  const supprimerTerme = async (id) => {
    await api.supprimerTerme(id)
    setTermes(prev => prev.filter(t => t.id !== id))
  }

  const saveEdit = async (id) => {
    await api.updateTerme(id, editData)
    setEditId(null)
    setTermes(prev => prev.map(t => t.id === id ? { ...t, ...editData } : t))
  }

  const ajouterTerme = async () => {
    if (!newTerme.terme_en.trim()) return
    setAdding(true)
    try {
      const res = await api.ajouterTerme(newTerme)
      setTermes(prev => [{ ...newTerme, id: res.id }, ...prev])
      setNewTerme(EMPTY_NEW)
      setShowAdd(false)
    } catch (e) {
      alert(e.message)
    }
    setAdding(false)
  }

  const termesFiltres = termes.filter(t => {
    if (!recherche) return true
    const q = recherche.toLowerCase()
    return t.terme_en.toLowerCase().includes(q) || (t.terme_fr || '').toLowerCase().includes(q)
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Glossaire</h2>
          <p className="text-text-secondary text-sm mt-1">
            {termesFiltres.length}{termesFiltres.length !== termes.length ? ` / ${termes.length}` : ''} termes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {termes.some(t => t.decision === 'en_attente') && (
            <button onClick={supprimerEnAttente} disabled={generating}
              className="flex items-center gap-2 border border-status-waiting/40 text-status-waiting hover:bg-status-waiting/10 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <Trash2 size={14} /> Supprimer en_attente
            </button>
          )}
          {termes.length > 0 && (
            <button onClick={vider} disabled={generating}
              className="flex items-center gap-2 border border-status-error/40 text-status-error hover:bg-status-error/10 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <Trash2 size={14} /> Vider tout
            </button>
          )}
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-2 bg-accent hover:bg-accent-glow text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {generating ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? 'Analyse en cours...' : 'Générer / Mettre à jour le glossaire'}
          </button>
        </div>
      </div>

      {/* Barre de progression */}
      {generating && (
        <div className="bg-bg-card border border-border rounded-lg p-4 mb-6">
          <div className="flex justify-between text-sm text-text-secondary mb-2">
            <span>
              {progress
                ? `Batch ${progress.batch} / ${progress.total} — ${progress.inseres} termes insérés`
                : 'Démarrage de l\'analyse…'}
            </span>
            <span className="font-medium text-text-primary">
              {progress ? Math.round(progress.batch / progress.total * 100) : 0}%
            </span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progress ? progress.batch / progress.total * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Filtres + Recherche */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un terme…"
            className="bg-bg-card border border-border text-text-secondary text-sm rounded-lg pl-8 pr-3 py-2 outline-none w-52 focus:border-accent/50"
          />
        </div>
        <select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)}
          className="bg-bg-card border border-border text-text-secondary text-sm rounded-lg px-3 py-2 outline-none">
          <option value="">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtreDecision} onChange={e => setFiltreDecision(e.target.value)}
          className="bg-bg-card border border-border text-text-secondary text-sm rounded-lg px-3 py-2 outline-none">
          <option value="">Toutes décisions</option>
          {DECISIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 border border-accent/40 text-accent-light hover:bg-accent/10 px-3 py-2 rounded-lg text-sm transition-colors ml-auto">
          <Plus size={14} /> Ajouter un terme
        </button>
      </div>

      {/* Formulaire ajout */}
      {showAdd && (
        <div className="bg-bg-card border border-accent/30 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Terme EN *</label>
            <input autoFocus value={newTerme.terme_en} onChange={e => setNewTerme(d => ({...d, terme_en: e.target.value}))}
              className="bg-bg border border-border rounded px-2 py-1.5 text-text-primary text-sm outline-none w-44 focus:border-accent/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Traduction FR</label>
            <input value={newTerme.terme_fr} onChange={e => setNewTerme(d => ({...d, terme_fr: e.target.value}))}
              className="bg-bg border border-border rounded px-2 py-1.5 text-text-primary text-sm outline-none w-44 focus:border-accent/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Catégorie</label>
            <select value={newTerme.categorie} onChange={e => setNewTerme(d => ({...d, categorie: e.target.value}))}
              className="bg-bg border border-border rounded px-2 py-1.5 text-text-secondary text-sm outline-none">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Décision</label>
            <select value={newTerme.decision} onChange={e => setNewTerme(d => ({...d, decision: e.target.value}))}
              className="bg-bg border border-border rounded px-2 py-1.5 text-text-secondary text-sm outline-none">
              {DECISIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs text-text-muted">Notes (optionnel)</label>
            <input value={newTerme.notes} onChange={e => setNewTerme(d => ({...d, notes: e.target.value}))}
              placeholder="Règles contextuelles pour le LLM..."
              className="bg-bg border border-border rounded px-2 py-1.5 text-text-secondary text-sm outline-none focus:border-accent/50" />
          </div>
          <div className="flex gap-2">
            <button onClick={ajouterTerme} disabled={adding || !newTerme.terme_en.trim()}
              className="flex items-center gap-1.5 bg-accent hover:bg-accent-glow text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50">
              {adding ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Ajouter
            </button>
            <button onClick={() => { setShowAdd(false); setNewTerme(EMPTY_NEW) }}
              className="text-text-muted hover:text-text-secondary px-2 py-1.5">
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* État vide */}
      {!loading && !generating && termes.length === 0 && (
        <div className="bg-bg-card border border-dashed border-border rounded-lg p-10 text-center mb-6">
          <Sparkles size={28} className="mx-auto text-text-muted mb-3" />
          <p className="text-text-primary font-medium mb-2">Aucun terme dans le glossaire</p>
          <p className="text-text-secondary text-sm max-w-md mx-auto mb-4">
            Le glossaire analyse le texte anglais importé et propose des traductions cohérentes
            pour les noms propres, lieux, capacités et termes du système.
          </p>
          <p className="text-text-muted text-xs max-w-md mx-auto mb-6">
            Conseil : générez le glossaire <strong className="text-text-secondary">avant</strong> de lancer la traduction
            pour que le LLM garde les termes cohérents sur tous les chapitres.
          </p>
          <button onClick={generate} disabled={generating}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-glow text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {generating ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? 'Analyse en cours...' : 'Générer le glossaire maintenant'}
          </button>
        </div>
      )}

      {/* Table */}
      {(termes.length > 0 || loading) && (
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Terme EN</th>
              <th className="text-left px-4 py-3">Traduction FR</th>
              <th className="text-left px-4 py-3">Catégorie</th>
              <th className="text-left px-4 py-3">Décision</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-text-muted">Chargement...</td></tr>
            ) : termesFiltres.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-text-muted text-sm italic">Aucun terme trouvé</td></tr>
            ) : termesFiltres.map(t => (
              <React.Fragment key={t.id}>
              <tr className="border-b border-border/50 hover:bg-bg-hover transition-colors group">
                <td className="px-4 py-3 text-text-primary font-medium">
                  <span className="flex items-center gap-1.5">
                    {t.terme_en}
                    {t.notes && (
                      <span title={t.notes} className="text-accent-light/60 hover:text-accent-light cursor-help shrink-0">
                        <FileText size={12} />
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {editId === t.id ? (
                    <input autoFocus value={editData.terme_fr || ''} onChange={e => setEditData(d => ({...d, terme_fr: e.target.value}))}
                      className="bg-bg border border-accent/50 rounded px-2 py-1 text-text-primary text-sm outline-none w-full" />
                  ) : (
                    <span className="text-text-secondary">{t.terme_fr || <span className="text-text-muted italic">—</span>}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editId === t.id ? (
                    <select value={editData.categorie || t.categorie} onChange={e => setEditData(d => ({...d, categorie: e.target.value}))}
                      className="bg-bg border border-border rounded px-2 py-1 text-text-secondary text-sm outline-none">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <span className="text-text-muted text-xs">{t.categorie}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editId === t.id ? (
                    <select value={editData.decision || t.decision} onChange={e => setEditData(d => ({...d, decision: e.target.value}))}
                      className="bg-bg border border-border rounded px-2 py-1 text-text-secondary text-sm outline-none">
                      {DECISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded border ${DECISION_STYLE[t.decision] || ''}`}>{t.decision}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editId === t.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(t.id)} className="text-status-done hover:text-status-done/80"><Check size={15} /></button>
                      <button onClick={() => setEditId(null)} className="text-status-error hover:text-status-error/80"><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setContexteTerme(t)}
                        className="text-text-muted hover:text-accent-light" title="Voir le contexte">
                        <BookOpen size={13} />
                      </button>
                      <button onClick={() => { setEditId(t.id); setEditData({terme_fr: t.terme_fr, decision: t.decision, categorie: t.categorie, notes: t.notes || ''}) }}
                        className="text-text-muted hover:text-text-secondary text-xs">Éditer</button>
                      <button onClick={() => supprimerTerme(t.id)}
                        className="text-text-muted hover:text-status-error">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
              {editId === t.id && (
                <tr className="border-b border-border bg-bg-card/30">
                  <td colSpan={5} className="px-4 pb-3 pt-1">
                    <label className="text-xs text-text-muted block mb-1 flex items-center gap-1">
                      <FileText size={11} /> Notes pour le LLM (contexte, règles, variantes)
                    </label>
                    <textarea
                      value={editData.notes || ''}
                      onChange={e => setEditData(d => ({...d, notes: e.target.value}))}
                      placeholder="Ex: spike = pointe (jamais écaille). one-spike Dalki = Dalki à une pointe, two-spike = Dalki à deux pointes..."
                      rows={2}
                      className="w-full bg-bg border border-border rounded px-2 py-1.5 text-text-secondary text-sm outline-none focus:border-accent/50 resize-none"
                    />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {contexteTerme && (
        <ContexteModal terme={contexteTerme} onClose={() => setContexteTerme(null)} />
      )}
    </div>
  )
}
