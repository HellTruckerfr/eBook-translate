# eBook Translate

Outil de traduction automatique d'EPUBs vers le français, conçu pour les romans longs (fantasy, science-fiction, light novels).

Traduction propulsée par **Mistral Large** avec respect d'un glossaire personnalisable, résumés d'arcs narratifs, et export EPUB/TXT/JSON.

---

## Fonctionnalités

- **Import EPUB** — parsing multi-fichiers, découpage par arcs narratifs, nettoyage des notes d'auteur
- **Traduction parallèle** — N workers asynchrones, reprise automatique en cas d'interruption
- **Glossaire** — extraction des termes, décisions par terme (traduire / adapter / garder), CSV import/export
- **Résumés d'arcs** — génération automatique tous les N chapitres pour maintenir la cohérence narrative
- **Export** — EPUB par arc, TXT, JSON (compatible avec un pipeline audiobook)
- **Interface Electron** — application desktop Windows, sans dépendance externe pour l'utilisateur final

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | Python 3.11 · FastAPI · uvicorn · SQLite (WAL) |
| LLM | Mistral Large (traduction) · Mistral Small (résumés) |
| Frontend | React 18 · Vite · Tailwind CSS · React Router |
| Desktop | Electron 31 · electron-builder (NSIS installer) |
| Packaging | PyInstaller `--onefile` |

Communication frontend ↔ backend via REST + WebSocket (progression en temps réel).

---

## Structure du projet

```
ebook-translate/
├── backend/              # API FastAPI
│   ├── main.py           # Endpoints REST + WebSocket
│   ├── translator.py     # Appels Mistral, retry, résumés
│   ├── database.py       # SQLite, migrations
│   ├── epub_parser.py    # Parsing EPUB, découpage arcs
│   ├── glossary.py       # Génération et gestion glossaire
│   ├── exporter.py       # Export EPUB/TXT/JSON/CSV
│   ├── config.py         # Config JSON persistante
│   └── requirements.txt
├── frontend/             # Interface React
│   └── src/
│       ├── pages/        # ProjetPage, TraductionPage, GlossairePage...
│       ├── api.js        # Client HTTP
│       └── useWebSocket.js
├── electron/             # Wrapper desktop
│   ├── main.js           # Fenêtre, cycle de vie backend
│   └── preload.js
├── build.bat             # Build complet (backend + frontend + installer)
├── rebuild-electron.bat  # Rebuild frontend + installer uniquement
└── lancer-dev.bat        # Démarrage en mode développement
```

---

## Prérequis (développement)

- [Python 3.11+](https://www.python.org/downloads/)
- [Node.js 20+](https://nodejs.org/)
- Clé API [Mistral](https://console.mistral.ai/)

---

## Démarrage rapide (dev)

```bat
lancer-dev.bat
```

Lance automatiquement le backend (port 8000) et le frontend Vite (port 3000), avec rechargement à chaud.

---

## Build — installeur Windows

```bat
build.bat
```

Produit un installeur NSIS dans `dist-electron/`. Effectue dans l'ordre :

1. `npm run build` — bundle React (Vite)
2. `pyinstaller --onefile` — compile le backend en `ebook-backend.exe`
3. `electron-builder --win` — package + installeur NSIS

> Pour les modifications **frontend/Electron uniquement** (pas de changement Python), utiliser `rebuild-electron.bat` qui saute l'étape PyInstaller.

---

## Configuration

Au premier lancement, renseigner la **clé API Mistral** dans l'onglet Paramètres.

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `mistral_model` | `mistral-large-latest` | Modèle de traduction |
| `mistral_model_resume` | `mistral-small-latest` | Modèle pour les résumés |
| `workers` | `5` | Chapitres traduits en parallèle |
| `arc_resume_frequence` | `50` | Mise à jour résumé d'arc tous les N chapitres |
| `output_dir` | `Documents/eBook-Translate` | Dossier de sortie des projets |

La configuration est stockée dans `%APPDATA%\eBook-Translate\config.json`.

---

## Données d'un projet

Chaque projet crée un sous-dossier dans `output_dir` :

```
MonProjet/
├── projet.db       # Base SQLite (chapitres, glossaire, résumés d'arcs)
├── project.json    # Métadonnées (arcs, chemins EPUB)
├── json/           # Export JSON par arc
├── txt/            # Export TXT par arc
└── epub/           # Export EPUB par arc
```

---

## Logs

En production (après installation), le log backend se trouve dans :

```
%APPDATA%\eBook-Translate\ebook-backend.log
```

Soit typiquement `C:\Users\<nom>\AppData\Roaming\eBook-Translate\ebook-backend.log`.

---

## Licence

Usage personnel / éducatif.
