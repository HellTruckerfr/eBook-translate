const BASE = window.location.protocol === 'file:' ? 'http://localhost:8000/api' : '/api'

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  // Config
  getConfig:      ()           => req('GET',  '/config'),
  getModels:      ()           => req('GET',  '/config/models'),
  updateConfig:   (data)       => req('PUT',  '/config', data),

  // Projets
  listProjets:    ()           => req('GET',  '/projets'),
  getProjet:      (nom)        => req('GET',  `/projets/${encodeURIComponent(nom)}`),
  createProjet:   (data)       => req('POST', '/projets', data),
  updateProjet:   (nom, data)  => req('PUT',  `/projets/${encodeURIComponent(nom)}`, data),
  activerProjet:  (nom)        => req('POST', `/projets/${encodeURIComponent(nom)}/activer`),

  // Import
  browseFiles:      ()          => req('POST',   '/browse'),
  importEpubs:      (data)     => req('POST',   '/import', data || undefined),
  recoverExports:   ()         => req('POST',   '/import/recover'),
  cleanAuthorNotes: ()         => req('POST',   '/import/clean'),
  reparerChapitres: ()         => req('POST',   '/import/reparer'),
  resetChapitres:   ()         => req('DELETE', '/import/chapitres'),

  // Glossaire
  genererGlossaire:       ()         => req('POST',   '/glossaire/generer'),
  viderGlossaire:         ()         => req('DELETE', '/glossaire'),
  supprimerParDecision:   (decision) => req('DELETE', `/glossaire/decision/${decision}`),
  supprimerTerme:         (id)       => req('DELETE', `/glossaire/${id}`),
  getGlossaire:           (params={})=> req('GET',    `/glossaire?${new URLSearchParams(params)}`),
  getGlossaireStatus:     ()         => req('GET',    '/glossaire/status'),
  getContexteTerme:       (id, n=8)  => req('GET',    `/glossaire/${id}/contexte?limit=${n}`),
  updateTerme:            (id, data) => req('PUT',    `/glossaire/${id}`, data),
  ajouterTerme:           (data)     => req('POST',   '/glossaire', data),

  // Traduction
  statutTraduction:     ()        => req('GET',  '/traduction/status'),
  lancerTraduction:     (arc_id)  => req('POST', `/traduction/lancer${arc_id ? `?arc_id=${arc_id}` : ''}`),
  arreterTraduction:    ()        => req('POST', '/traduction/arreter'),
  traduireChapitre:     (id)      => req('POST', `/traduction/chapitre/${id}`),
  resetTraductionBloques: ()      => req('POST', '/traduction/reset'),
  resetTraductionTout:  ()        => req('POST', '/traduction/reset-tout'),
  resetPlage:           (data)    => req('POST', '/traduction/reset-plage', data),

  // Chapitres
  getChapitres:       (params={})  => req('GET',  `/chapitres?${new URLSearchParams(params)}`),
  getChapitre:        (id)         => req('GET',  `/chapitres/${id}`),
  updateChapitre:     (id, data)   => req('PUT',  `/chapitres/${id}`, data),
  searchChapitres:    (params={})  => req('GET',  `/chapitres/search?${new URLSearchParams(params)}`),
  replaceInChapitres: (data)       => req('POST', '/chapitres/replace', data),

  // Stats
  getStats:       ()           => req('GET',  '/stats'),

  // Export
  exportTout:       ()     => req('POST', '/export/tout'),
  exportJson:       ()     => req('POST', '/export/json'),
  exportTxt:        ()     => req('POST', '/export/txt'),
  exportEpub:       (data) => req('POST', '/export/epub', data || undefined),
  exportGlossaire:  ()     => req('POST', '/export/glossaire'),
  importGlossaire:  ()     => req('POST', '/import/glossaire'),
}
