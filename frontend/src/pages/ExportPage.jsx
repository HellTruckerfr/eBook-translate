import React, { useState, useEffect } from 'react'
import { Download, FileJson, FileText, BookOpen, List, Loader, CheckCircle, FolderOpen, ExternalLink } from 'lucide-react'
import { api } from '../api'
import { useNavigate } from 'react-router-dom'

export default function ExportPage() {
  const [tab, setTab]           = useState('texte')
  const [results, setResults]   = useState({})
  const [loading, setLoading]   = useState({})
  const [projet, setProjet]     = useState(null)
  const [stats, setStats]       = useState(null)
  const [outputDir, setOutputDir] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    api.listProjets().then(({ actif }) => {
      if (!actif) return
      api.getProjet(actif).then(p => setProjet(p))
      api.getStats().then(s => setStats(s))
    })
    api.getConfig().then(c => setOutputDir(c.output_dir || ''))
  }, [])

  const nbArcs   = projet?.arcs?.length ?? '?'
  const nbChap   = stats?.global?.traduits ?? '?'

  const run = async (key, fn) => {
    setLoading(l => ({ ...l, [key]: true }))
    try {
      const res = await fn()
      setResults(r => ({ ...r, [key]: res }))
    } catch (e) {
      setResults(r => ({ ...r, [key]: { error: e.message } }))
    }
    setLoading(l => ({ ...l, [key]: false }))
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Export</h2>
          <p className="text-text-secondary text-sm mt-1">
            {stats ? `${stats.global?.traduits ?? 0} / ${stats.global?.total ?? 0} chapitres traduits` : 'Chargement...'}
          </p>
        </div>
      </div>

      {/* Dossier de sortie */}
      <div className="bg-bg-card border border-border rounded-lg px-4 py-3 mb-6 flex items-center gap-3 text-sm">
        <FolderOpen size={15} className="text-text-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-text-muted text-xs">Sortie : </span>
          <span className="text-text-secondary font-mono text-xs truncate">{outputDir || 'Non défini'}</span>
        </div>
        <button onClick={() => nav('/parametres')}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-light shrink-0">
          <ExternalLink size={12} /> Modifier
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-bg-card border border-border rounded-lg p-1">
        {[
          { key: 'texte',    label: 'Fichiers texte' },
          { key: 'epub',     label: 'EPUB par arc' },
          { key: 'glossaire', label: 'Glossaire' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors
              ${tab === t.key ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'texte' && (
        <div className="space-y-4">
          <ExportCard
            icon={<FileJson size={20} className="text-status-progress" />}
            label="Fichiers JSON"
            desc={`${nbChap} fichiers JSON — interface vers le projet audiobook`}
            result={results.json}
            loading={loading.json}
            onExport={() => run('json', api.exportJson)}
            resultLabel={r => r.exported != null ? `${r.exported} fichiers générés` : null}
          />
          <ExportCard
            icon={<FileText size={20} className="text-status-done" />}
            label="Fichiers TXT"
            desc={`${nbChap} fichiers texte brut, un par chapitre`}
            result={results.txt}
            loading={loading.txt}
            onExport={() => run('txt', api.exportTxt)}
            resultLabel={r => r.exported != null ? `${r.exported} fichiers générés` : null}
          />
          <button
            onClick={() => run('all', async () => {
              const r = await api.exportTout()
              setResults(prev => ({ ...prev, json: { exported: r.json }, txt: { exported: r.txt } }))
              return r
            })}
            disabled={loading.all}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-glow text-white py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {loading.all ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
            Tout exporter (JSON + TXT)
          </button>
        </div>
      )}

      {tab === 'epub' && (
        <EpubTab nbArcs={nbArcs} />
      )}

      {tab === 'glossaire' && (
        <GlossaireTab />
      )}
    </div>
  )
}

function EpubTab({ nbArcs }) {
  const [mode, setMode]     = useState('arcs')
  const [debut, setDebut]   = useState('')
  const [fin, setFin]       = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const body = mode === 'range' ? { debut: parseInt(debut) || 1, fin: parseInt(fin) || 999999 } : null
      const res = await api.exportEpub(body)
      setResult({ ok: true, files: res.files })
    } catch (e) {
      setResult({ ok: false, error: e.message })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-4 mb-5">
          <BookOpen size={20} className="text-accent-light" />
          <div className="text-text-primary font-medium">EPUBs français</div>
        </div>

        {/* Mode */}
        <div className="flex gap-2 mb-5">
          {[
            { key: 'arcs', label: `Par arc (${nbArcs} fichiers)` },
            { key: 'range', label: 'Plage de chapitres' },
          ].map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors border
                ${mode === m.key ? 'bg-accent/20 border-accent/50 text-accent-light' : 'border-border text-text-secondary hover:border-accent/30'}`}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'arcs' && (
          <p className="text-sm text-text-muted mb-4">
            Génère un EPUB par arc narratif, selon la configuration de la page Projets.
          </p>
        )}

        {mode === 'range' && (
          <div className="flex items-center gap-3 mb-4">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Chapitre début</label>
              <input type="number" value={debut} onChange={e => setDebut(e.target.value)}
                placeholder="1"
                className="w-32 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
            </div>
            <span className="text-text-muted mt-5">→</span>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Chapitre fin</label>
              <input type="number" value={fin} onChange={e => setFin(e.target.value)}
                placeholder="138"
                className="w-32 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
            </div>
            {debut && fin && (
              <div className="mt-5 text-xs text-text-muted">
                → 1 EPUB · Ch.{debut}–{fin}
              </div>
            )}
          </div>
        )}

        <button onClick={run} disabled={loading || (mode === 'range' && (!debut || !fin))}
          className="flex items-center gap-2 bg-accent hover:bg-accent-glow text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          {loading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
          {loading ? 'Génération...' : 'Générer EPUB'}
        </button>

        {result && (
          <div className={`mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-lg border
            ${result.ok ? 'border-status-done/30 bg-status-done/10 text-status-done' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>
            {result.ok
              ? <><CheckCircle size={14} /> {Array.isArray(result.files) ? result.files.length : result.files} EPUB{Array.isArray(result.files) && result.files.length > 1 ? 's' : ''} généré{Array.isArray(result.files) && result.files.length > 1 ? 's' : ''}</>
              : result.error}
          </div>
        )}
      </div>
    </div>
  )
}

function GlossaireTab() {
  const [exportResult, setExportResult] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [loadingExport, setLoadingExport] = useState(false)
  const [loadingImport, setLoadingImport] = useState(false)

  const handleExport = async () => {
    setLoadingExport(true)
    setExportResult(null)
    try {
      const res = await api.exportGlossaire()
      setExportResult({ ok: true, ...res })
    } catch (e) {
      setExportResult({ ok: false, error: e.message })
    }
    setLoadingExport(false)
  }

  const handleImport = async () => {
    setLoadingImport(true)
    setImportResult(null)
    try {
      const res = await api.importGlossaire()
      setImportResult({ ok: true, ...res })
    } catch (e) {
      setImportResult({ ok: false, error: e.message })
    }
    setLoadingImport(false)
  }

  return (
    <div className="space-y-4">
      {/* Export */}
      <div className="bg-bg-card border border-border rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <List size={20} className="text-status-progress" />
          <div>
            <div className="text-text-primary font-medium">Exporter le glossaire</div>
            <div className="text-text-muted text-sm mt-0.5">Génère <span className="font-mono text-xs">glossaire.csv</span> dans le dossier du projet</div>
            {exportResult && exportResult.ok && (
              <div className="flex items-center gap-1.5 text-xs text-status-done mt-1">
                <CheckCircle size={12} /> {exportResult.exported} termes exportés
              </div>
            )}
            {exportResult?.error && <div className="text-xs text-status-error mt-1">{exportResult.error}</div>}
          </div>
        </div>
        <button onClick={handleExport} disabled={loadingExport}
          className="flex items-center gap-2 border border-border hover:border-accent/50 text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 shrink-0 ml-4">
          {loadingExport ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
          Exporter
        </button>
      </div>

      {/* Import */}
      <div className="bg-bg-card border border-border rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <List size={20} className="text-status-done" />
          <div>
            <div className="text-text-primary font-medium">Importer le glossaire</div>
            <div className="text-text-muted text-sm mt-0.5">Lit <span className="font-mono text-xs">glossaire.csv</span> et met à jour la base (upsert)</div>
            {importResult && importResult.ok && (
              <div className="flex items-center gap-1.5 text-xs text-status-done mt-1">
                <CheckCircle size={12} /> {importResult.inserted} ajoutés · {importResult.updated} mis à jour
              </div>
            )}
            {importResult?.error && <div className="text-xs text-status-error mt-1">{importResult.error}</div>}
          </div>
        </div>
        <button onClick={handleImport} disabled={loadingImport}
          className="flex items-center gap-2 border border-border hover:border-accent/50 text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 shrink-0 ml-4">
          {loadingImport ? <Loader size={14} className="animate-spin" /> : <Download size={14} className="rotate-180" />}
          Importer
        </button>
      </div>

      <p className="text-xs text-text-muted px-1">
        Format CSV : <span className="font-mono">terme_en, terme_fr, categorie, decision</span> — éditable dans Excel ou LibreOffice.
      </p>
    </div>
  )
}

function ExportCard({ icon, label, desc, result, loading, onExport, resultLabel }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {icon}
        <div>
          <div className="text-text-primary font-medium">{label}</div>
          <div className="text-text-muted text-sm mt-0.5">{desc}</div>
          {result && !result.error && resultLabel(result) && (
            <div className="flex items-center gap-1.5 text-xs text-status-done mt-1">
              <CheckCircle size={12} /> {resultLabel(result)}
            </div>
          )}
          {result?.error && <div className="text-xs text-status-error mt-1">{result.error}</div>}
        </div>
      </div>
      <button onClick={onExport} disabled={loading}
        className="flex items-center gap-2 border border-border hover:border-accent/50 text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 shrink-0 ml-4">
        {loading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
        Exporter
      </button>
    </div>
  )
}
