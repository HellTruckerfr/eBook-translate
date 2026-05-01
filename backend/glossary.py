import json
import asyncio
from mistralai.client import Mistral
import config as cfg
from database import get_db
from epub_parser import extract_glossary_candidates
from translator import _call_with_retry

CATEGORIES = ["personnage", "lieu", "capacité", "terme_système", "organisation", "objet", "autre"]

def get_client():
    return Mistral(api_key=cfg.get("mistral_api_key"))

async def generate_glossary(nom_projet: str, progress_cb=None) -> int:
    client     = get_client()
    model      = cfg.get("mistral_model_resume") or "mistral-small-latest"
    candidates = extract_glossary_candidates(nom_projet)
    if not candidates:
        return 0

    batch_size   = 50
    batches      = [candidates[i:i+batch_size] for i in range(0, len(candidates), batch_size)]
    total_batches = len(batches)
    conn         = get_db(nom_projet)
    inserted     = 0

    for idx, batch in enumerate(batches):
        langue_source = cfg.get("langue_source") or "anglais"
        langue_cible  = cfg.get("langue_cible")  or "français"
        prompt = f"""Voici une liste de termes extraits d'un web novel de fantasy/sci-fi.
Pour chaque terme, indique sa catégorie parmi : {', '.join(CATEGORIES)}
et une proposition de traduction en {langue_cible} (ou "garder" si le terme doit rester en {langue_source}).

Réponds en JSON, tableau d'objets avec les clés : terme_en, categorie, terme_fr, decision.
Les valeurs de decision sont : "traduire", "garder", "adapter".

Termes :
{chr(10).join(f'- {t}' for t in batch)}"""

        try:
            response = await _call_with_retry(
                client.chat.complete,
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                timeout_ms=120000,
            )
            content = response.choices[0].message.content.strip()
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            data = json.loads(content)
            items = data if isinstance(data, list) else next(
                (v for v in data.values() if isinstance(v, list)), []
            )
            for item in items:
                terme_en = item.get("terme_en", "").strip()
                if not terme_en:
                    continue
                if not conn.execute("SELECT id FROM glossaire WHERE terme_en=?", (terme_en,)).fetchone():
                    conn.execute("""
                        INSERT INTO glossaire (terme_en, terme_fr, categorie, decision)
                        VALUES (?, ?, ?, ?)
                    """, (terme_en, item.get("terme_fr"), item.get("categorie", "autre"),
                          item.get("decision", "en_attente")))
                    inserted += 1
            conn.commit()
        except Exception as e:
            print(f"[glossaire] batch {idx+1} erreur : {e}")
            if progress_cb:
                await progress_cb(idx + 1, total_batches, inserted, error=str(e))

        if progress_cb:
            await progress_cb(idx + 1, total_batches, inserted)

    conn.close()
    return inserted

def get_glossary(nom_projet: str, categorie: str = None, decision: str = None) -> list:
    conn   = get_db(nom_projet)
    query  = "SELECT * FROM glossaire WHERE 1=1"
    params = []
    if categorie:
        query += " AND categorie=?"
        params.append(categorie)
    if decision:
        query += " AND decision=?"
        params.append(decision)
    query += " ORDER BY categorie, terme_en"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_glossary_term(nom_projet: str, term_id: int, terme_fr: str,
                         decision: str, categorie: str = None):
    conn = get_db(nom_projet)
    if categorie:
        conn.execute(
            "UPDATE glossaire SET terme_fr=?, decision=?, categorie=? WHERE id=?",
            (terme_fr, decision, categorie, term_id)
        )
    else:
        conn.execute(
            "UPDATE glossaire SET terme_fr=?, decision=? WHERE id=?",
            (terme_fr, decision, term_id)
        )
    conn.commit()
    conn.close()
