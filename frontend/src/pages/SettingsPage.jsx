import React, { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, CheckCircle, FolderOpen } from 'lucide-react'
import { api } from '../api'

const SECTION = ({ title, children }) => (
  <div className="bg-bg-card border border-border rounded-lg p-6 space-y-5">
    <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">{title}</h3>
    {children}
  </div>
)

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm text-text-secondary mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
  </div>
)

export default function SettingsPage() {
  const [config, setConfig]   = useState(null)
  const [models, setModels]   = useState({ translation: [], resume: [] })
  const [apiKey, setApiKey]   = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    Promise.all([api.getConfig(), api.getModels()]).then(([c, m]) => {
      setConfig(c)
      setModels(m)
    })
  }, [])

  const save = async () => {
    const payload = { ...config }
    if (apiKey) payload.mistral_api_key = apiKey
    await api.updateConfig(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!config) return <div className="p-8 text-text-muted text-sm">Chargement...</div>

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Paramètres</h2>
          <p className="text-text-secondary text-sm mt-1">Configuration globale de l'application</p>
        </div>
        <button onClick={save}
          className="flex items-center gap-2 bg-accent hover:bg-accent-glow text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
          {saved ? <CheckCircle size={14} /> : <Save size={14} />}
          {saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      {/* API Mistral */}
      <SECTION title="API Mistral">
        <Field label="Clé API" hint="Disponible sur console.mistral.ai — jamais partagée, stockée localement">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={config.has_api_key ? '••••••••••••••••••••••••' : 'Entrer la clé API Mistral'}
                className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 pr-10"
              />
              <button onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {config.has_api_key && (
              <span className="flex items-center gap-1.5 text-xs text-status-done px-3 border border-status-done/30 rounded-lg bg-status-done/10">
                <CheckCircle size={12} /> Configurée
              </span>
            )}
          </div>
        </Field>

        <Field label="Modèle de traduction">
          <select value={config.mistral_model}
            onChange={e => setConfig(c => ({...c, mistral_model: e.target.value}))}
            className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-secondary outline-none focus:border-accent/50">
            {models.translation.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Modèle pour les résumés" hint="Utilisé pour générer les résumés de chapitres — modèle léger suffisant">
          <select value={config.mistral_model_resume}
            onChange={e => setConfig(c => ({...c, mistral_model_resume: e.target.value}))}
            className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-secondary outline-none focus:border-accent/50">
            {models.resume.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </Field>
      </SECTION>

      {/* Traduction */}
      <SECTION title="Traduction">
        <Field label={`Workers parallèles : ${config.workers}`}
          hint="Plus de workers = plus rapide, mais consomme plus de quota API">
          <input type="range" min={1} max={10} value={config.workers}
            onChange={e => setConfig(c => ({...c, workers: Number(e.target.value)}))}
            className="w-full accent-violet-500" />
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>1 (lent, stable)</span><span>10 (rapide)</span>
          </div>
        </Field>

        <Field label={`Mise à jour résumé d'arc : tous les ${config.arc_resume_frequence} chapitres`}
          hint="Le résumé d'arc aide le LLM à maintenir la cohérence narrative">
          <input type="range" min={10} max={100} step={10} value={config.arc_resume_frequence}
            onChange={e => setConfig(c => ({...c, arc_resume_frequence: Number(e.target.value)}))}
            className="w-full accent-violet-500" />
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>10 (fréquent)</span><span>100 (économique)</span>
          </div>
        </Field>
      </SECTION>

      {/* Langue */}
      <SECTION title="Langue de traduction">
        <Field label="Langue source" hint="Langue originale des textes à traduire">
          <input value={config.langue_source || ''}
            onChange={e => setConfig(c => ({...c, langue_source: e.target.value}))}
            className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50"
            placeholder="Ex : anglais, japonais, coréen..." />
        </Field>
        <Field label="Langue cible" hint="Langue dans laquelle le texte sera traduit">
          <input value={config.langue_cible || ''}
            onChange={e => setConfig(c => ({...c, langue_cible: e.target.value}))}
            className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50"
            placeholder="Ex : français, espagnol, allemand..." />
        </Field>
      </SECTION>

      {/* Dossier de sortie */}
      <SECTION title="Dossier de sortie par défaut">
        <Field label="Dossier racine" hint="Coller le chemin complet. Les exports iront dans [dossier]\[nom_projet]\epub, json, txt">
          <input value={config.output_dir || ''}
            onChange={e => setConfig(c => ({...c, output_dir: e.target.value}))}
            className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 focus:bg-bg-card"
            placeholder="Ex : C:\Users\winte\Documents\eBook-Translate" />
          {config.output_dir && (
            <p className="text-xs text-text-muted mt-1 font-mono">→ {config.output_dir}</p>
          )}
        </Field>
      </SECTION>
    </div>
  )
}
