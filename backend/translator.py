import asyncio
import logging
import re
import time
from mistralai.client import Mistral
import config as cfg
from database import get_db

logger = logging.getLogger("ebook.translator")

def clean_markdown(text: str) -> str:
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'_(.+?)_', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    return text.strip()

async def _call_with_retry(fn, *args, max_retries=8, **kwargs):
    delay = 10
    for attempt in range(max_retries):
        try:
            return await asyncio.to_thread(fn, *args, **kwargs)
        except Exception as e:
            msg = str(e).lower()
            is_rate_limit = '429' in msg or 'rate_limit' in msg or 'rate limited' in msg
            is_transient = (
                'timed out' in msg
                or 'timeout' in msg
                or 'read operation' in msg
                or 'connection' in msg
            )
            if (is_rate_limit or is_transient) and attempt < max_retries - 1:
                wait = min(delay * 2, 300) if is_rate_limit else min(delay, 120)
                await asyncio.sleep(wait)
                delay = wait
                continue
            raise

def get_client():
    return Mistral(api_key=cfg.get("mistral_api_key"), timeout_ms=300_000)

def _build_system_prompt(langue_source: str, langue_cible: str) -> str:
    return f"""Tu es un traducteur littéraire professionnel spécialisé dans les romans de fantasy et science-fiction.
Tu traduis de l'{langue_source} vers le {langue_cible} avec le niveau de qualité d'une traduction publiée.
Tu restructures les phrases si nécessaire pour qu'elles sonnent naturellement en {langue_cible}.
Tu respectes scrupuleusement le glossaire fourni.
Tu ne traduis que le texte, sans commentaires ni explications."""

def build_glossary_context(conn) -> str:
    rows = conn.execute("""
        SELECT terme_en, terme_fr, decision, notes FROM glossaire
        WHERE decision IN ('traduire', 'adapter', 'garder')
        ORDER BY categorie, terme_en
    """).fetchall()
    if not rows:
        return ""
    lignes = []
    for r in rows:
        if r['decision'] == 'garder':
            line = f"- {r['terme_en']} → conserver en anglais"
        else:
            line = f"- {r['terme_en']} → {r['terme_fr'] or r['terme_en']}"
        if r['notes']:
            line += f" | {r['notes']}"
        lignes.append(line)
    return "GLOSSAIRE (à respecter impérativement) :\n" + "\n".join(lignes)

def get_arc_resume(conn, arc_id: int) -> str:
    row = conn.execute("SELECT resume FROM arc_resumes WHERE arc_id=?", (arc_id,)).fetchone()
    return row["resume"] if row else ""

def get_previous_chapter_resume(conn, chapter_id: int) -> str:
    row = conn.execute("""
        SELECT resume_fr FROM chapitres
        WHERE id < ? AND resume_fr IS NOT NULL
        ORDER BY id DESC LIMIT 1
    """, (chapter_id,)).fetchone()
    return row["resume_fr"] if row else ""

async def translate_chapter(nom_projet: str, chapter_id: int) -> dict:
    client = get_client()
    model_trad    = cfg.get("mistral_model")        or "mistral-large-latest"
    model_resume  = cfg.get("mistral_model_resume") or "mistral-small-latest"
    langue_source = cfg.get("langue_source")        or "anglais"
    langue_cible  = cfg.get("langue_cible")         or "français"
    system_prompt = _build_system_prompt(langue_source, langue_cible)

    conn = get_db(nom_projet)
    chapter = conn.execute("SELECT * FROM chapitres WHERE id=?", (chapter_id,)).fetchone()
    if not chapter:
        conn.close()
        return {"error": "Chapitre introuvable", "id": chapter_id}

    conn.execute("UPDATE chapitres SET statut='en_cours' WHERE id=?", (chapter_id,))
    conn.commit()

    glossaire  = build_glossary_context(conn)
    arc_resume = get_arc_resume(conn, chapter["arc_id"])
    prev_resume = get_previous_chapter_resume(conn, chapter_id)

    context_parts = []
    if glossaire:
        context_parts.append(glossaire)
    if arc_resume:
        context_parts.append(f"RÉSUMÉ DE L'ARC EN COURS :\n{arc_resume}")
    if prev_resume:
        context_parts.append(f"RÉSUMÉ DU CHAPITRE PRÉCÉDENT :\n{prev_resume}")

    context  = "\n\n".join(context_parts)
    titre_fr = chapter["titre_fr"] or f"Chapitre {chapter_id}"

    prompt = f"""{context}

Traduis le chapitre suivant en {langue_cible}. Commence directement par le titre.

TITRE ORIGINAL : {chapter['titre_en']}
TITRE EN {langue_cible.upper()} ATTENDU : {titre_fr}

TEXTE À TRADUIRE :
{chapter['texte_en']}"""

    try:
        response = await _call_with_retry(
            client.chat.complete,
            model=model_trad,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.3,
        )
        texte_fr = clean_markdown(response.choices[0].message.content)
        usage_trad = response.usage

        # Extract French title from the first line the LLM generated
        # Only use it if richer than the existing title (not a bare "Chapitre N")
        first_line = texte_fr.split('\n')[0].strip()
        is_bare = bool(re.match(r'^[Cc]hapitre\s+\d+\s*$', first_line))
        titre_fr_traduit = titre_fr if is_bare else (first_line if first_line else titre_fr)

        resume_response = await _call_with_retry(
            client.chat.complete,
            model=model_resume,
            messages=[{"role": "user", "content":
                f"En 2-3 phrases, résume ce chapitre en {langue_cible} pour maintenir la cohérence narrative :\n\n{texte_fr}"}],
            temperature=0.1,
        )
        resume = resume_response.choices[0].message.content.strip()
        usage_resume = resume_response.usage

        conn.execute("""
            UPDATE chapitres
            SET texte_fr=?, mots_fr=?, statut='traduit', resume_fr=?, titre_fr=?
            WHERE id=?
        """, (texte_fr, len(texte_fr.split()), resume, titre_fr_traduit, chapter_id))
        conn.commit()
        conn.close()
        return {
            "id": chapter_id, "statut": "traduit",
            "mots_fr": len(texte_fr.split()), "titre_fr": titre_fr_traduit,
            "usage": {
                "trad":   {"model": model_trad,   "prompt": usage_trad.prompt_tokens,   "completion": usage_trad.completion_tokens},
                "resume": {"model": model_resume, "prompt": usage_resume.prompt_tokens, "completion": usage_resume.completion_tokens},
            }
        }

    except Exception as e:
        import traceback
        logger.error(f"translate_chapter {chapter_id} échoué: {traceback.format_exc()}")
        conn.execute("UPDATE chapitres SET statut='en_attente' WHERE id=?", (chapter_id,))
        conn.commit()
        conn.close()
        return {"statut": "erreur", "erreur": str(e), "id": chapter_id}

async def update_arc_resume(nom_projet: str, arc_id: int):
    client = get_client()
    model_resume = cfg.get("mistral_model_resume") or "mistral-small-latest"

    conn = get_db(nom_projet)
    rows = conn.execute("""
        SELECT resume_fr FROM chapitres
        WHERE arc_id=? AND resume_fr IS NOT NULL
        ORDER BY id DESC LIMIT 20
    """, (arc_id,)).fetchall()

    if not rows:
        conn.close()
        return

    langue_cible = cfg.get("langue_cible") or "français"
    resumes = "\n".join(r["resume_fr"] for r in rows)
    try:
        response = await asyncio.to_thread(
            client.chat.complete,
            model=model_resume,
            messages=[{"role": "user", "content":
                f"Synthétise en un paragraphe en {langue_cible} l'état actuel de l'arc narratif à partir de ces résumés récents :\n\n{resumes}"}],
            temperature=0.1,
        )
        resume_arc = response.choices[0].message.content.strip()

        last = conn.execute("""
            SELECT MAX(id) as last FROM chapitres
            WHERE arc_id=? AND statut IN ('traduit','relu')
        """, (arc_id,)).fetchone()["last"] or 0

        conn.execute("""
            INSERT OR REPLACE INTO arc_resumes (arc_id, resume, derniere_mise_a_jour)
            VALUES (?, ?, ?)
        """, (arc_id, resume_arc, last))
        conn.commit()
    except Exception:
        logger.warning(f"update_arc_resume arc_id={arc_id} échoué", exc_info=True)
    finally:
        conn.close()
