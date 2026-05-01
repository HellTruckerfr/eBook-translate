import React, { useState, useEffect } from 'react'
import { Plus, FolderOpen, Play, Upload, ChevronDown, ChevronUp, Trash2, PlusCircle, Save } from 'lucide-react'
import { api } from '../api'
import { useNavigate } from 'react-router-dom'

export default function ProjetPage() {
  const [projets, setProjets]   = useState([])
  const [actif, setActif]       = useState(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const nav = useNavigate()

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const data = await api.listProjets()
      const liste = data.projets || []
      // Si le projet actif existe en DB mais pas encore dans la liste (project.json vient d'être créé)
      if (data.actif && !liste.includes(data.actif)) liste.push(data.actif)
      setProjets(liste)
      setActif(data.actif)
    } catch (e) {
      console.error('listProjets failed:', e)
    }
  }

  const activer = async (nom) => {
    await api.activerProjet(nom)
    setActif(nom)
  }

  const toggle = (nom) => setExpanded(e => e === nom ? null : nom)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Projets</h2>
          <p className="text-text-secondary text-sm mt-1">Chaque projet correspond à un roman ou une série</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-accent hover:bg-accent-glow text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
          <Plus size={14} /> Nouveau projet
        </button>
      </div>

      {projets.length === 0 && !creating && (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <p className="text-text-muted mb-4">Aucun projet — commencez par en créer un</p>
          <button onClick={() => setCreating(true)} className="text-accent hover:text-accent-light text-sm">
            Créer mon premier projet →
          </button>
        </div>
      )}

      <div className="space-y-3">
        {projets.map(nom => (
          <div key={nom} className={`bg-bg-card border rounded-lg transition-colors ${actif === nom ? 'border-accent/50' : 'border-border'}`}>
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => toggle(nom)}>
                <FolderOpen size={18} className={actif === nom ? 'text-accent-light' : 'text-text-muted'} />
                <div>
                  <div className="text-text-primary font-medium">{nom}</div>
                  {actif === nom && <div className="text-xs text-accent-light mt-0.5">Projet actif</div>}
                </div>
                {expanded === nom ? <ChevronUp size={14} className="text-text-muted ml-2" /> : <ChevronDown size={14} className="text-text-muted ml-2" />}
              </div>
              <div className="flex items-center gap-2">
                {actif !== nom && (
                  <button onClick={() => activer(nom)}
                    className="text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 border border-border rounded-lg transition-colors">
                    Activer
                  </button>
                )}
                {actif === nom && (
                  <>
                    <button onClick={() => nav('/import')}
                      className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 border border-border rounded-lg transition-colors">
                      <Upload size={12} /> Import
                    </button>
                    <button onClick={() => nav('/traduction')}
                      className="flex items-center gap-1.5 text-xs text-white bg-accent hover:bg-accent-glow px-3 py-1.5 rounded-lg transition-colors">
                      <Play size={12} /> Traduire
                    </button>
                  </>
                )}
              </div>
            </div>

            {expanded === nom && (
              <div className="border-t border-border px-5 pb-5 pt-4">
                <ArcEditor nom={nom} />
              </div>
            )}
          </div>
        ))}
      </div>

      {creating && (
        <CreateProjetModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load() }}
        />
      )}
    </div>
  )
}

function ArcEditor({ nom }) {
  const [arcs, setArcs]     = useState([])
  const [saved, setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getProjet(nom).then(pc => {
      setArcs(pc.arcs || [{ id: 1, nom: 'Arc 1', debut: 1, fin: 9999 }])
      setLoading(false)
    })
  }, [nom])

  const update = (i, key, val) => {
    setArcs(prev => prev.map((a, idx) => idx === i ? { ...a, [key]: val } : a))
    setSaved(false)
  }

  const addArc = () => {
    const last = arcs[arcs.length - 1]
    setArcs(prev => [...prev, { id: prev.length + 1, nom: `Arc ${prev.length + 1}`, debut: (last?.fin ?? 0) + 1, fin: 9999 }])
    setSaved(false)
  }

  const removeArc = (i) => {
    setArcs(prev => prev.filter((_, idx) => idx !== i).map((a, idx) => ({ ...a, id: idx + 1 })))
    setSaved(false)
  }

  const save = async () => {
    const normalized = arcs.map((a, i) => ({
      id: i + 1,
      nom: a.nom,
      debut: parseInt(a.debut) || 1,
      fin: parseInt(a.fin) || 9999,
    }))
    await api.updateProjet(nom, { arcs: normalized })
    setArcs(normalized)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <p className="text-text-muted text-sm">Chargement...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-text-primary">Arcs narratifs</span>
        <div className="flex items-center gap-2">
          <button onClick={addArc}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-light">
            <PlusCircle size={13} /> Ajouter un arc
          </button>
          <button onClick={save}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors
              ${saved ? 'bg-status-done/20 text-status-done' : 'bg-accent/20 text-accent hover:bg-accent/30'}`}>
            <Save size={12} /> {saved ? 'Sauvegardé !' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-text-muted px-1 mb-1">
          <span className="col-span-5">Nom</span>
          <span className="col-span-3">Ch. début</span>
          <span className="col-span-3">Ch. fin</span>
          <span className="col-span-1" />
        </div>
        {arcs.map((arc, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input value={arc.nom} onChange={e => update(i, 'nom', e.target.value)}
              className="col-span-5 bg-bg border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50" />
            <input type="number" value={arc.debut} onChange={e => update(i, 'debut', e.target.value)}
              className="col-span-3 bg-bg border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50" />
            <input type="number" value={arc.fin} onChange={e => update(i, 'fin', e.target.value)}
              className="col-span-3 bg-bg border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50" />
            <button onClick={() => removeArc(i)}
              className="col-span-1 text-text-muted hover:text-status-error transition-colors flex justify-center">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted mt-3">Les arcs définissent comment les chapitres seront groupés dans les EPUBs et JSON d'export.</p>
    </div>
  )
}

function CreateProjetModal({ onClose, onCreated }) {
  const [nom, setNom]             = useState('')
  const [epubs, setEpubs]         = useState([])
  const [titresDir, setTitresDir] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [dragging, setDragging]         = useState(false)
  const [draggingTitres, setDraggingTitres] = useState(false)
  const fileInputRef                    = React.useRef()
  const titresInputRef                  = React.useRef()

  const addFiles = (files) => {
    const paths = Array.from(files)
      .filter(f => f.name.endsWith('.epub'))
      .map(f => f.path || f.name)
    setEpubs(prev => [...new Set([...prev, ...paths])])
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const removeEpub = (i) => setEpubs(prev => prev.filter((_, idx) => idx !== i))

  const submit = async () => {
    if (!nom.trim()) return setError('Le nom du projet est requis')
    if (epubs.length === 0) return setError('Au moins un fichier EPUB est requis')
    setLoading(true)
    try {
      await api.createProjet({
        nom: nom.trim(),
        epub_paths: epubs,
        titres_dir: titresDir || null,
      })
      onCreated()
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-text-primary">Nouveau projet</h3>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">Nom du projet</label>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Overlord, Solo Leveling..."
              className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-text-secondary">
                Fichiers EPUB
                {epubs.length > 0 && <span className="text-text-muted ml-2">({epubs.length} fichier{epubs.length > 1 ? 's' : ''})</span>}
              </label>
              <button onClick={() => fileInputRef.current.click()}
                className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light">
                <FolderOpen size={13} /> Parcourir
              </button>
            </div>

            <input ref={fileInputRef} type="file" accept=".epub" multiple className="hidden"
              onChange={e => addFiles(e.target.files)} />

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => epubs.length === 0 && fileInputRef.current.click()}
              className={`border-2 border-dashed rounded-lg transition-colors
                ${dragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/40'}
                ${epubs.length === 0 ? 'cursor-pointer' : ''}`}>
              {epubs.length === 0 ? (
                <div className="p-8 text-center">
                  <FolderOpen size={24} className="mx-auto text-text-muted mb-2" />
                  <p className="text-sm text-text-secondary">Glisser-déposer les fichiers EPUB ici</p>
                  <p className="text-xs text-text-muted mt-1">ou cliquer pour parcourir — multi-sélection possible</p>
                </div>
              ) : (
                <div className="p-3 space-y-1.5">
                  {epubs.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2 group">
                      <FolderOpen size={13} className="text-text-muted flex-shrink-0" />
                      <span className="flex-1 text-xs text-text-secondary truncate" title={p}>
                        {p.split(/[\\/]/).pop()}
                      </span>
                      <button onClick={() => removeEpub(i)}
                        className="text-text-muted hover:text-status-error opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-base leading-none">
                        ×
                      </button>
                    </div>
                  ))}
                  <button onClick={() => fileInputRef.current.click()}
                    className="w-full text-center text-xs text-text-muted hover:text-text-secondary py-1.5">
                    + Ajouter d'autres fichiers
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-text-secondary">
                Dossier de titres traduits <span className="text-text-muted">(optionnel)</span>
              </label>
              {titresDir && (
                <button onClick={() => setTitresDir('')}
                  className="text-xs text-text-muted hover:text-status-error">Retirer</button>
              )}
            </div>

            <input ref={titresInputRef} type="file" accept=".txt" className="hidden"
              onChange={e => e.target.files[0] && setTitresDir(e.target.files[0].path || e.target.files[0].name)} />

            {titresDir ? (
              <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2.5">
                <FolderOpen size={13} className="text-text-muted flex-shrink-0" />
                <span className="flex-1 text-xs text-text-secondary truncate">{titresDir.split(/[\\/]/).pop()}</span>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDraggingTitres(true) }}
                onDragLeave={() => setDraggingTitres(false)}
                onDrop={e => {
                  e.preventDefault(); setDraggingTitres(false)
                  const f = e.dataTransfer.files[0]
                  if (f?.name.endsWith('.txt')) setTitresDir(f.path || f.name)
                }}
                onClick={() => titresInputRef.current.click()}
                className={`border-2 border-dashed rounded-lg px-4 py-4 text-center cursor-pointer transition-colors
                  ${draggingTitres ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/40'}`}>
                <p className="text-xs text-text-secondary">Glisser un fichier .txt ou <span className="text-accent">parcourir</span></p>
                <p className="text-xs text-text-muted mt-0.5">Fichier avec les titres traduits, un par ligne</p>
              </div>
            )}
            <p className="text-xs text-text-muted mt-1.5">Les arcs se configurent dans la page Projets après création.</p>
          </div>

          {error && <p className="text-status-error text-sm">{error}</p>}
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Annuler</button>
          <button onClick={submit} disabled={loading}
            className="px-5 py-2 bg-accent hover:bg-accent-glow text-white text-sm rounded-lg font-medium disabled:opacity-50">
            {loading ? 'Création...' : 'Créer le projet'}
          </button>
        </div>
      </div>
    </div>
  )
}
