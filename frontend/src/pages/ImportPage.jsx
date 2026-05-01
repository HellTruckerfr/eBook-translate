import React, { useState, useEffect } from 'react'
import { FolderOpen, CheckCircle, AlertCircle, Loader, X, RotateCcw, Scissors, Trash2, Wrench } from 'lucide-react'
import { api } from '../api'

export default function ImportPage() {
  const [projet, setProjet] = useState(null)
  const [paths, setPaths]       = useState([])
  const [status, setStatus]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [cleaning, setCleaning]     = useState(false)
  const [repairing, setRepairing]   = useState(false)
  const [browsing, setBrowsing]     = useState(false)

  useEffect(() => {
    api.listProjets().then(({ actif }) => {
      if (!actif) return
      api.getProjet(actif).then(pc => {
        setProjet(pc)
        setPaths(pc.epub_paths || [])
      })
    })
  }, [])

  const browse = async () => {
    setBrowsing(true)
    try {
      const res = await api.browseFiles()
      if (res.paths?.length) {
        setPaths(prev => [...new Set([...prev, ...res.paths])])
      }
    } catch (e) {
      setStatus({ ok: false, message: `Erreur file picker : ${e.message}` })
    }
    setBrowsing(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    // Le drag/drop navigateur ne donne pas le chemin complet — on suggère de parcourir
    setStatus({ ok: false, message: "Le drag & drop ne fournit pas le chemin complet. Utilisez le bouton « Parcourir »." })
  }

  const removePath = (i) => setPaths(prev => prev.filter((_, idx) => idx !== i))

  const handleRecover = async () => {
    setRecovering(true)
    setStatus(null)
    try {
      const res = await api.recoverExports()
      setStatus({ ok: true, message: `${res.recovered} chapitres récupérés depuis les exports existants (${res.skipped} déjà traduits ignorés).` })
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    }
    setRecovering(false)
  }

  const handleReset = async () => {
    if (!confirm(`Supprimer les ${projet?.stats?.total} chapitres en base ? (glossaire et traductions conservés)`)) return
    setStatus(null)
    try {
      const res = await api.resetChapitres()
      setStatus({ ok: true, message: `${res.deleted} chapitres supprimés. Vous pouvez réimporter.` })
      setProjet(p => ({ ...p, stats: { ...p.stats, total: 0 } }))
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    }
  }

  const handleClean = async () => {
    setCleaning(true)
    setStatus(null)
    try {
      const res = await api.cleanAuthorNotes()
      setStatus({ ok: true, message: `Notes auteur supprimées dans ${res.cleaned} chapitre${res.cleaned > 1 ? 's' : ''}.` })
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    }
    setCleaning(false)
  }

  const handleReparer = async () => {
    setRepairing(true)
    setStatus(null)
    try {
      const res = await api.reparerChapitres()
      const msg = []
      if (res.inseres > 0) msg.push(`${res.inseres} chapitre${res.inseres > 1 ? 's' : ''} manquant${res.inseres > 1 ? 's' : ''} inséré${res.inseres > 1 ? 's' : ''}`)
      if (res.repares > 0) msg.push(`${res.repares} chapitre${res.repares > 1 ? 's' : ''} vide${res.repares > 1 ? 's' : ''} réparé${res.repares > 1 ? 's' : ''}`)
      setStatus({ ok: true, message: msg.length ? msg.join(', ') + '.' : 'Aucun chapitre à réparer.' })
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    }
    setRepairing(false)
  }

  const handleImport = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const res = await api.importEpubs({ epub_paths: paths.filter(Boolean) })
      setStatus({ ok: true, message: `${res.inserted} chapitre${res.inserted > 1 ? 's' : ''} importé${res.inserted > 1 ? 's' : ''} avec succès.` })
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    }
    setLoading(false)
  }

  if (!projet) return (
    <div className="p-8">
      <p className="text-text-muted">Aucun projet actif. Créez ou activez un projet d'abord.</p>
    </div>
  )

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-text-primary mb-1">Import des EPUBs</h2>
      <p className="text-text-secondary text-sm mb-8">
        Projet actif : <span className="text-accent-light font-medium">{projet.nom}</span>
        {projet.stats?.total > 0 && (
          <span className="text-text-muted ml-2">· {projet.stats.total} chapitres déjà importés</span>
        )}
      </p>

      <div className="mb-3 flex items-center justify-between">
        <label className="text-sm text-text-secondary">
          Fichiers EPUB {paths.length > 0 && <span className="text-text-muted">({paths.length})</span>}
        </label>
        <button onClick={browse} disabled={browsing}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light disabled:opacity-50">
          {browsing ? <Loader size={13} className="animate-spin" /> : <FolderOpen size={13} />}
          Parcourir...
        </button>
      </div>

      {paths.length === 0 ? (
        <div
          onDragOver={e => e.preventDefault()} onDrop={onDrop}
          onClick={browse}
          className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-accent/40 transition-colors mb-6">
          <FolderOpen size={24} className="mx-auto text-text-muted mb-2" />
          <p className="text-sm text-text-secondary">Cliquer pour parcourir les fichiers EPUB</p>
          <p className="text-xs text-text-muted mt-1">Multi-sélection possible</p>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {paths.map((p, i) => (
            <div key={i} className="flex items-center gap-3 bg-bg-card border border-border rounded-lg px-4 py-3 group">
              <FolderOpen size={14} className="text-text-muted shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm text-text-secondary outline-none font-mono text-xs"
                value={p}
                onChange={e => { const n = [...paths]; n[i] = e.target.value; setPaths(n) }}
              />
              <button onClick={() => removePath(i)}
                className="text-text-muted hover:text-status-error opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={browse} disabled={browsing}
            className="w-full text-center text-xs text-text-muted hover:text-text-secondary py-1.5 flex items-center justify-center gap-1.5">
            {browsing ? <Loader size={11} className="animate-spin" /> : null}
            + Ajouter d'autres fichiers
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleImport}
          disabled={loading || paths.length === 0}
          className="flex items-center gap-2 bg-accent hover:bg-accent-glow text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50">
          {loading ? <Loader size={16} className="animate-spin" /> : <FolderOpen size={16} />}
          {loading ? 'Import en cours...' : 'Importer les EPUBs'}
        </button>
        {projet?.stats?.total > 0 && (
          <button
            onClick={handleRecover}
            disabled={recovering}
            className="flex items-center gap-2 border border-border hover:border-accent/50 text-text-secondary hover:text-text-primary px-5 py-3 rounded-lg font-medium transition-colors disabled:opacity-50">
            {recovering ? <Loader size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            {recovering ? 'Récupération...' : 'Récupérer depuis exports'}
          </button>
        )}
        {projet?.stats?.total > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 border border-status-error/40 text-status-error hover:bg-status-error/10 px-5 py-3 rounded-lg font-medium transition-colors disabled:opacity-50">
            <Trash2 size={16} /> Vider les chapitres
          </button>
        )}
        {projet?.stats?.total > 0 && (
          <button
            onClick={handleClean}
            disabled={cleaning}
            className="flex items-center gap-2 border border-border hover:border-accent/50 text-text-secondary hover:text-text-primary px-5 py-3 rounded-lg font-medium transition-colors disabled:opacity-50">
            {cleaning ? <Loader size={16} className="animate-spin" /> : <Scissors size={16} />}
            {cleaning ? 'Nettoyage...' : 'Supprimer notes auteur'}
          </button>
        )}
        {projet?.stats?.total > 0 && (
          <button
            onClick={handleReparer}
            disabled={repairing}
            className="flex items-center gap-2 border border-status-waiting/40 text-status-waiting hover:bg-status-waiting/10 px-5 py-3 rounded-lg font-medium transition-colors disabled:opacity-50">
            {repairing ? <Loader size={16} className="animate-spin" /> : <Wrench size={16} />}
            {repairing ? 'Réparation...' : 'Réparer chapitres manquants'}
          </button>
        )}
      </div>

      {status && (
        <div className={`mt-4 flex items-center gap-3 px-4 py-3 rounded-lg border
          ${status.ok ? 'border-status-done/30 bg-status-done/10 text-status-done' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>
          {status.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm">{status.message}</span>
        </div>
      )}
    </div>
  )
}
