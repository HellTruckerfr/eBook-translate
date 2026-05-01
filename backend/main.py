import asyncio
import json
import logging
import sys
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

import config as cfg
from database import init_db, get_db, get_stats
from epub_parser import parse_epubs, extract_glossary_candidates, mettre_a_jour_titres_fr
from glossary import generate_glossary, get_glossary, update_glossary_term
from translator import translate_chapter, update_arc_resume
from exporter import export_json_chapters, export_txt_chapters, export_epub_by_arc, recover_from_json, export_glossary_csv, import_glossary_csv

# ── Logging ────────────────────────────────────────────────
# Toujours AppData — C:\ racine nécessite des droits admin et déclenche UAC
_LOG_FILE = Path(cfg.APP_DATA) / "ebook-backend.log"
try:
    _LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
except Exception:
    _LOG_FILE = Path.home() / "ebook-backend.log"

_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
_file_handler = logging.FileHandler(_LOG_FILE, encoding="utf-8")
_file_handler.setFormatter(_fmt)
_console_handler = logging.StreamHandler(sys.stdout)
_console_handler.setFormatter(_fmt)

logging.basicConfig(level=logging.DEBUG, handlers=[_file_handler, _console_handler])
# Silence noisy uvicorn access logs in the file (keep errors)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

logger = logging.getLogger("ebook")
logger.info(f"=== eBook Translate backend démarrage — log: {_LOG_FILE} ===")

app = FastAPI(title="eBook Translate")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    nom = cfg.get("projet_actif")
    if not nom:
        return
    try:
        # Migration des colonnes manquantes sur les DBs existantes
        init_db(nom)
    except Exception as e:
        logger.warning(f"startup: migration ignorée: {e}")
    try:
        conn = get_db(nom)
        fixed = conn.execute(
            "UPDATE chapitres SET statut='en_attente' WHERE statut='en_cours'"
        ).rowcount
        conn.commit()
        conn.close()
        if fixed:
            logger.info(f"startup: {fixed} chapitre(s) bloqués remis en attente")
    except Exception as e:
        logger.warning(f"startup: reset en_cours ignoré: {e}")

active_ws: list[WebSocket] = []
translation_running = False
glossary_running    = False

async def broadcast(msg: dict):
    for ws in active_ws:
        try:
            await ws.send_json(msg)
        except Exception:
            pass

# ── WebSocket ──────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    active_ws.append(ws)
    try:
        projet = cfg.get("projet_actif")
        if projet:
            await ws.send_json({"type": "stats", "data": get_stats(projet)})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in active_ws:
            active_ws.remove(ws)

# ── Config globale ─────────────────────────────────────────
@app.get("/api/config")
def get_config():
    c = cfg.load_config()
    c.pop("mistral_api_key", None)
    return {**c, "has_api_key": bool(cfg.get("mistral_api_key"))}

class ConfigUpdate(BaseModel):
    mistral_api_key: Optional[str] = None
    mistral_model: Optional[str] = None
    mistral_model_resume: Optional[str] = None
    workers: Optional[int] = None
    arc_resume_frequence: Optional[int] = None
    output_dir: Optional[str] = None

@app.put("/api/config")
def update_config(body: ConfigUpdate):
    cfg.save_config({k: v for k, v in body.model_dump().items() if v is not None})
    return {"ok": True}

@app.get("/api/logs")
def get_log_tail(lines: int = 200):
    try:
        text = _LOG_FILE.read_text(encoding="utf-8", errors="replace")
        tail = "\n".join(text.splitlines()[-lines:])
        return {"path": str(_LOG_FILE), "content": tail}
    except Exception as e:
        return {"path": str(_LOG_FILE), "content": f"Erreur lecture log: {e}"}

@app.get("/api/config/models")
def get_models():
    return {
        "translation": [
            {"id": "mistral-large-latest",  "label": "Mistral Large  — Qualité maximale (~$45 total)"},
            {"id": "mistral-medium-latest", "label": "Mistral Medium — Bon équilibre (~$15 total)"},
            {"id": "mistral-small-latest",  "label": "Mistral Small  — Économique (~$4.50 total)"},
        ],
        "resume": [
            {"id": "mistral-small-latest",  "label": "Mistral Small  — Recommandé (résumés)"},
            {"id": "mistral-medium-latest", "label": "Mistral Medium"},
        ]
    }

# ── Projets ────────────────────────────────────────────────
@app.get("/api/projets")
def list_projets():
    projets = cfg.list_projects()
    actif = cfg.get("projet_actif")
    # actif est toujours dans la liste, même si list_projects() ne l'a pas trouvé
    if actif and actif not in projets:
        projets.append(actif)
    return {"projets": projets, "actif": actif}

class ProjetCreate(BaseModel):
    nom: str
    epub_paths: list[str]
    output_dir: Optional[str] = None
    arcs: Optional[list] = None
    titres_dir: Optional[str] = None

@app.post("/api/projets")
def create_projet(body: ProjetCreate):
    if body.nom in cfg.list_projects():
        raise HTTPException(400, "Un projet avec ce nom existe déjà")
    try:
        arcs = body.arcs or [{"id": 1, "nom": "Arc 1", "debut": 1, "fin": 9999}]
        paths = cfg.get_project_paths(body.nom)
        for key in ("base", "json", "txt", "epub"):
            paths[key].mkdir(parents=True, exist_ok=True)

        cfg.save_project_config(body.nom, {
            "nom": body.nom,
            "epub_paths": body.epub_paths,
            "arcs": arcs,
            "titres_dir": body.titres_dir or "",
            "output_dir": body.output_dir or cfg.get("output_dir"),
        })
        init_db(body.nom)
        cfg.save_config({"projet_actif": body.nom})
        return {"ok": True, "nom": body.nom}
    except Exception as e:
        import traceback
        logger.error(f"ERREUR create_projet:\n{traceback.format_exc()}")
        raise HTTPException(500, str(e))

@app.post("/api/projets/{nom}/activer")
def activer_projet(nom: str):
    paths = cfg.get_project_paths(nom)
    if nom not in cfg.list_projects() and not paths["db"].exists():
        raise HTTPException(404, "Projet introuvable")
    cfg.save_config({"projet_actif": nom})
    return {"ok": True}

@app.get("/api/projets/{nom}")
def get_projet(nom: str):
    pc = cfg.get_project_config(nom)
    paths = cfg.get_project_paths(nom)
    if not pc and not paths["db"].exists():
        raise HTTPException(404)
    stats = get_stats(nom) if paths["db"].exists() else {}
    return {**pc, "nom": nom, "stats": stats}

class ProjetUpdate(BaseModel):
    epub_paths: Optional[list[str]] = None
    arcs: Optional[list] = None
    titres_dir: Optional[str] = None

@app.put("/api/projets/{nom}")
def update_projet(nom: str, body: ProjetUpdate):
    cfg.save_project_config(nom, {k: v for k, v in body.model_dump().items() if v is not None})
    return {"ok": True}

def _projet_actif() -> str:
    p = cfg.get("projet_actif")
    if not p:
        raise HTTPException(400, "Aucun projet actif")
    return p

# ── Reset import chapitres ────────────────────────────────
@app.delete("/api/import/chapitres")
def reset_chapitres():
    nom = _projet_actif()
    conn = get_db(nom)
    deleted = conn.execute("DELETE FROM chapitres").rowcount
    conn.commit()
    conn.close()
    return {"deleted": deleted}

# ── Nettoyage notes auteur ────────────────────────────────
@app.post("/api/import/clean")
def clean_author_notes():
    from epub_parser import strip_author_notes
    nom = _projet_actif()
    conn = get_db(nom)
    rows = conn.execute("SELECT id, texte_en FROM chapitres WHERE texte_en IS NOT NULL").fetchall()
    cleaned = 0
    for row in rows:
        original = row["texte_en"]
        new_text = strip_author_notes(original)
        if new_text != original:
            conn.execute("UPDATE chapitres SET texte_en=?, mots_en=? WHERE id=?",
                         (new_text, len(new_text.split()), row["id"]))
            cleaned += 1
    conn.commit()
    conn.close()
    return {"cleaned": cleaned}

# ── Mise à jour titres FR depuis fichiers TXT ─────────────
@app.post("/api/import/titres")
def mettre_a_jour_titres():
    nom = _projet_actif()
    pc = cfg.get_project_config(nom)
    titres_dir = pc.get("titres_dir")
    if not titres_dir:
        raise HTTPException(400, "Aucun titres_dir configuré pour ce projet")
    result = mettre_a_jour_titres_fr(nom, titres_dir)
    return {**result, "stats": get_stats(nom)}

# ── Réparation chapitres manquants / vides ────────────────
@app.post("/api/import/reparer")
def reparer_chapitres():
    from epub_parser import reparer_chapitres as _reparer
    from config import get_project_config
    nom = _projet_actif()
    cfg = get_project_config(nom)
    epub_paths = cfg.get("epub_paths", [])
    arcs       = cfg.get("arcs", [])
    titres_dir = cfg.get("titres_dir")
    if not epub_paths or not arcs:
        raise HTTPException(400, "Pas d'EPUBs ou d'arcs configurés")
    result = _reparer(nom, epub_paths, arcs, titres_dir)
    return result

# ── File picker natif ─────────────────────────────────────
@app.post("/api/browse")
def browse_files():
    import subprocess, sys, json
    result = subprocess.run(
        [sys.executable, "-c", """
import tkinter as tk
from tkinter import filedialog
import json, sys
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
files = filedialog.askopenfilenames(
    title='Sélectionner des fichiers EPUB',
    filetypes=[('EPUB', '*.epub'), ('Tous les fichiers', '*.*')]
)
print(json.dumps(list(files)))
root.destroy()
"""],
        capture_output=True, text=True, timeout=60
    )
    try:
        paths = json.loads(result.stdout.strip() or "[]")
    except Exception:
        paths = []
    return {"paths": paths}

# ── Import EPUBs ───────────────────────────────────────────
class ImportBody(BaseModel):
    epub_paths: Optional[list[str]] = None
    titres_dir: Optional[str] = None

@app.post("/api/import")
async def import_epubs(body: ImportBody = None):
    nom = _projet_actif()
    pc = cfg.get_project_config(nom)
    arcs = pc.get("arcs", [{"id": 1, "nom": "Arc 1", "debut": 1, "fin": 9999}])

    epub_paths = (body.epub_paths if body and body.epub_paths else None) or pc.get("epub_paths", [])
    titres_dir = (body.titres_dir if body and body.titres_dir else None) or pc.get("titres_dir")

    if not epub_paths:
        raise HTTPException(400, "Aucun fichier EPUB spécifié")

    from pathlib import Path
    manquants = [p for p in epub_paths if not Path(p).exists()]
    if manquants:
        raise HTTPException(400, f"Fichier(s) introuvable(s) : {', '.join(manquants)}")

    cfg.save_project_config(nom, {"epub_paths": epub_paths})

    def progress(num):
        asyncio.create_task(broadcast({"type": "import_progress", "chapitre": num}))

    try:
        total = parse_epubs(nom, epub_paths, arcs, titres_dir, progress)
    except Exception as e:
        import traceback
        logger.error(f"ERREUR import_epubs:\n{traceback.format_exc()}")
        raise HTTPException(500, str(e))

    await broadcast({"type": "import_done", "total": total, "stats": get_stats(nom)})
    return {"inserted": total}

# ── Glossaire ──────────────────────────────────────────────
@app.post("/api/glossaire/generer")
async def generer_glossaire():
    global glossary_running
    if glossary_running:
        return {"error": "Génération déjà en cours"}
    nom = _projet_actif()
    glossary_running = True
    asyncio.create_task(_run_glossary(nom))
    return {"ok": True}

async def _run_glossary(nom: str):
    global glossary_running
    try:
        async def progress(batch_idx, total_batches, inserted_so_far, error=None):
            await broadcast({"type": "glossaire_progress",
                             "batch": batch_idx, "total": total_batches,
                             "inseres": inserted_so_far,
                             **({"error": error} if error else {})})
        count = await generate_glossary(nom, progress_cb=progress)
        await broadcast({"type": "glossaire_termine", "termes": count})
    except Exception as e:
        await broadcast({"type": "glossaire_termine", "termes": 0, "error": str(e)})
    finally:
        glossary_running = False

@app.get("/api/glossaire")
def get_glossaire(categorie: str = None, decision: str = None):
    return get_glossary(_projet_actif(), categorie, decision)

class GlossaireUpdate(BaseModel):
    terme_fr: str
    decision: str
    categorie: Optional[str] = None
    notes: Optional[str] = None

class GlossaireAdd(BaseModel):
    terme_en: str
    terme_fr: Optional[str] = None
    categorie: Optional[str] = None
    decision: str = 'en_attente'
    notes: Optional[str] = None

@app.post("/api/glossaire")
def ajouter_terme(body: GlossaireAdd):
    conn = get_db(_projet_actif())
    try:
        conn.execute(
            "INSERT INTO glossaire (terme_en, terme_fr, categorie, decision, notes) VALUES (?, ?, ?, ?, ?)",
            (body.terme_en, body.terme_fr, body.categorie, body.decision, body.notes or None)
        )
        conn.commit()
        term_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    except Exception as e:
        conn.close()
        raise HTTPException(400, str(e))
    conn.close()
    return {"ok": True, "id": term_id}

@app.put("/api/glossaire/{term_id}")
def update_terme(term_id: int, body: GlossaireUpdate):
    conn = get_db(_projet_actif())
    conn.execute(
        "UPDATE glossaire SET terme_fr=?, decision=?, categorie=COALESCE(?, categorie), notes=? WHERE id=?",
        (body.terme_fr, body.decision, body.categorie, body.notes or None, term_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/glossaire/{term_id}/contexte")
def get_contexte(term_id: int, limit: int = 5):
    nom  = _projet_actif()
    conn = get_db(nom)
    term = conn.execute("SELECT terme_en FROM glossaire WHERE id=?", (term_id,)).fetchone()
    if not term:
        conn.close()
        raise HTTPException(404)
    mot = term["terme_en"]
    rows = conn.execute(
        "SELECT id, titre_fr, texte_en FROM chapitres WHERE texte_en LIKE ? LIMIT 50",
        (f"%{mot}%",)
    ).fetchall()
    conn.close()

    import re
    pattern = re.compile(r'\b' + re.escape(mot) + r'\b', re.IGNORECASE)
    extraits = []
    for row in rows:
        texte = row["texte_en"] or ""
        for m in pattern.finditer(texte):
            debut = max(0, m.start() - 120)
            fin   = min(len(texte), m.end() + 120)
            extrait = texte[debut:fin].replace("\n", " ").strip()
            # Mettre le terme en évidence avec >>><<<
            extrait = pattern.sub(lambda x: f">>>{x.group()}<<<", extrait)
            extraits.append({"chapitre_id": row["id"], "titre": row["titre_fr"], "extrait": extrait})
            if len(extraits) >= limit:
                break
        if len(extraits) >= limit:
            break

    return {"terme": mot, "extraits": extraits}

@app.delete("/api/glossaire")
def vider_glossaire():
    conn = get_db(_projet_actif())
    deleted = conn.execute("DELETE FROM glossaire").rowcount
    conn.commit()
    conn.close()
    return {"deleted": deleted}

@app.delete("/api/glossaire/decision/{decision}")
def supprimer_par_decision(decision: str):
    conn = get_db(_projet_actif())
    deleted = conn.execute("DELETE FROM glossaire WHERE decision=?", (decision,)).rowcount
    conn.commit()
    conn.close()
    return {"deleted": deleted}

@app.delete("/api/glossaire/{term_id}")
def supprimer_terme(term_id: int):
    conn = get_db(_projet_actif())
    conn.execute("DELETE FROM glossaire WHERE id=?", (term_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Traduction ─────────────────────────────────────────────
@app.post("/api/traduction/lancer")
async def lancer_traduction(arc_id: Optional[int] = None):
    global translation_running
    if translation_running:
        logger.warning("lancer_traduction: déjà en cours, ignoré")
        return {"error": "Traduction déjà en cours"}
    nom = _projet_actif()
    translation_running = True
    logger.info(f"lancer_traduction: projet={nom} arc_id={arc_id}")
    asyncio.create_task(_run_translation(nom, arc_id))
    return {"ok": True}

@app.post("/api/traduction/arreter")
async def arreter_traduction():
    global translation_running
    translation_running = False
    logger.info("arreter_traduction: demande d'arrêt")
    return {"ok": True}

@app.post("/api/traduction/reset")
async def reset_traduction():
    global translation_running
    translation_running = False
    nom = cfg.get("projet_actif")
    if nom:
        conn = get_db(nom)
        fixed = conn.execute("UPDATE chapitres SET statut='en_attente' WHERE statut='en_cours'").rowcount
        conn.commit()
        conn.close()
        return {"ok": True, "chapitres_remis_en_attente": fixed}
    return {"ok": True}

@app.post("/api/traduction/reset-tout")
async def reset_traduction_tout():
    global translation_running
    translation_running = False
    nom = cfg.get("projet_actif")
    if nom:
        conn = get_db(nom)
        fixed = conn.execute(
            "UPDATE chapitres SET statut='en_attente' WHERE statut IN ('traduit','relu','en_cours')"
        ).rowcount
        conn.commit()
        conn.close()
        return {"ok": True, "chapitres_remis_en_attente": fixed}
    return {"ok": True}

class ResetPlageBody(BaseModel):
    debut: int
    fin: int

@app.post("/api/traduction/reset-plage")
def reset_plage(body: ResetPlageBody):
    nom = _projet_actif()
    conn = get_db(nom)
    fixed = conn.execute(
        "UPDATE chapitres SET statut='en_attente', texte_fr=NULL, mots_fr=0, resume_fr=NULL WHERE id BETWEEN ? AND ?",
        (body.debut, body.fin)
    ).rowcount
    conn.commit()
    conn.close()
    return {"ok": True, "chapitres_remis_en_attente": fixed}

@app.post("/api/traduction/chapitre/{chapter_id}")
async def traduire_chapitre(chapter_id: int):
    nom = _projet_actif()
    result = await translate_chapter(nom, chapter_id)
    await broadcast({"type": "chapitre_traduit", "data": result, "stats": get_stats(nom)})
    return result

async def _run_translation(nom: str, arc_id: Optional[int]):
    global translation_running
    try:
        workers = cfg.get("workers") or 5
        arc_freq = cfg.get("arc_resume_frequence") or 50
        conn = get_db(nom)
        query = "SELECT id FROM chapitres WHERE statut='en_attente'"
        params = []
        if arc_id:
            query += " AND arc_id=?"
            params.append(arc_id)
        ids = [r[0] for r in conn.execute(query, params).fetchall()]
        conn.close()

        logger.info(f"_run_translation: projet={nom} arc_id={arc_id} chapitres={len(ids)} workers={workers}")

        if not ids:
            await broadcast({"type": "error", "message": "Aucun chapitre en attente de traduction"})
            return

        queue: asyncio.Queue = asyncio.Queue()
        for cid in ids:
            queue.put_nowait(cid)
        arc_counter: dict[int, int] = {}

        async def worker_loop():
            while True:
                if not translation_running:
                    break
                try:
                    cid = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
                if not translation_running:
                    break
                logger.debug(f"traduire chapitre {cid}")
                result = await translate_chapter(nom, cid)
                if result.get("statut") == "erreur":
                    logger.warning(f"chapitre {cid} erreur: {result.get('erreur')}")
                await broadcast({"type": "chapitre_traduit", "data": result, "stats": get_stats(nom)})
                conn2 = get_db(nom)
                row = conn2.execute("SELECT arc_id FROM chapitres WHERE id=?", (cid,)).fetchone()
                conn2.close()
                if row:
                    aid = row[0]
                    arc_counter[aid] = arc_counter.get(aid, 0) + 1
                    if arc_counter[aid] % arc_freq == 0:
                        await update_arc_resume(nom, aid)

        await asyncio.gather(*[worker_loop() for _ in range(workers)])
        logger.info(f"_run_translation: terminée pour {nom}")
    except Exception as e:
        import traceback
        logger.error(f"ERREUR _run_translation:\n{traceback.format_exc()}")
        await broadcast({"type": "error", "message": f"Erreur traduction : {e}"})
    finally:
        translation_running = False
        await broadcast({"type": "traduction_terminee", "stats": get_stats(nom)})

# ── Chapitres ──────────────────────────────────────────────
@app.get("/api/chapitres")
def get_chapitres(arc_id: int = None, statut: str = None, page: int = 1, limit: int = 200):
    nom = _projet_actif()
    conn = get_db(nom)
    query = "SELECT id, arc_id, titre_fr, titre_en, mots_fr, statut FROM chapitres WHERE 1=1"
    params = []
    if arc_id:
        query += " AND arc_id=?"
        params.append(arc_id)
    if statut:
        query += " AND statut=?"
        params.append(statut)
    query += f" ORDER BY id LIMIT {limit} OFFSET {(page-1)*limit}"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/chapitres/{chapter_id}")
def get_chapitre(chapter_id: int):
    conn = get_db(_projet_actif())
    row = conn.execute("SELECT * FROM chapitres WHERE id=?", (chapter_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404)
    return dict(row)

class ChapitreUpdate(BaseModel):
    texte_fr: str
    statut: Optional[str] = "relu"

@app.put("/api/chapitres/{chapter_id}")
def update_chapitre(chapter_id: int, body: ChapitreUpdate):
    nom = _projet_actif()
    conn = get_db(nom)
    conn.execute("UPDATE chapitres SET texte_fr=?, mots_fr=?, statut=? WHERE id=?",
                 (body.texte_fr, len(body.texte_fr.split()), body.statut, chapter_id))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Stats ──────────────────────────────────────────────────
@app.get("/api/traduction/status")
def traduction_status():
    return {"running": translation_running}

@app.get("/api/glossaire/status")
def glossaire_status():
    return {"running": glossary_running}

@app.get("/api/stats")
def stats():
    nom = _projet_actif()
    pc = cfg.get_project_config(nom)
    arcs = pc.get("arcs", [])
    conn = get_db(nom)
    arc_stats = []
    for arc in arcs:
        total    = conn.execute("SELECT COUNT(*) FROM chapitres WHERE arc_id=?", (arc["id"],)).fetchone()[0]
        traduits = conn.execute("SELECT COUNT(*) FROM chapitres WHERE arc_id=? AND statut IN ('traduit','relu')", (arc["id"],)).fetchone()[0]
        arc_stats.append({**arc, "total": total, "traduits": traduits})
    conn.close()
    return {"global": get_stats(nom), "arcs": arc_stats}

# ── Récupération depuis exports ────────────────────────────
@app.post("/api/import/recover")
def recover_exports():
    nom = _projet_actif()
    result = recover_from_json(nom)
    return {**result, "stats": get_stats(nom)}

# ── Export ─────────────────────────────────────────────────
@app.post("/api/export/tout")
def export_tout():
    nom = _projet_actif()
    return {
        "json": export_json_chapters(nom),
        "txt":  export_txt_chapters(nom),
        "epub": len(export_epub_by_arc(nom)),
    }

@app.post("/api/export/json")
def export_json():
    return {"exported": export_json_chapters(_projet_actif())}

@app.post("/api/export/txt")
def export_txt():
    return {"exported": export_txt_chapters(_projet_actif())}

class EpubExportBody(BaseModel):
    debut: Optional[int] = None
    fin:   Optional[int] = None

@app.post("/api/export/epub")
def export_epub(body: EpubExportBody = None):
    nom = _projet_actif()
    if body and (body.debut or body.fin):
        from exporter import export_epub_custom_range
        files = export_epub_custom_range(nom, body.debut or 1, body.fin or 999999)
    else:
        files = export_epub_by_arc(nom)
    return {"files": files}

@app.post("/api/export/glossaire")
def export_glossaire():
    return export_glossary_csv(_projet_actif())

@app.post("/api/import/glossaire")
def import_glossaire():
    try:
        return import_glossary_csv(_projet_actif())
    except FileNotFoundError as e:
        raise HTTPException(404, f"Fichier introuvable : {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
