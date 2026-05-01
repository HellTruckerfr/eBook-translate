import csv
import json
import re
from pathlib import Path
from ebooklib import epub
from database import get_db
from config import get_project_paths, get_project_config

def export_json_chapters(nom_projet: str) -> int:
    paths = get_project_paths(nom_projet)
    paths["json"].mkdir(parents=True, exist_ok=True)
    pc   = get_project_config(nom_projet)
    arcs = {a["id"]: a["nom"] for a in pc.get("arcs", [])}

    conn = get_db(nom_projet)
    rows = conn.execute("""
        SELECT * FROM chapitres
        WHERE statut IN ('traduit','relu')
        ORDER BY id
    """).fetchall()
    conn.close()

    for row in rows:
        data = {
            "id":           row["id"],
            "arc":          row["arc_id"],
            "arc_nom":      arcs.get(row["arc_id"], f"Arc {row['arc_id']}"),
            "titre_fr":     row["titre_fr"],
            "titre_en":     row["titre_en"],
            "texte":        row["texte_fr"],
            "mots":         row["mots_fr"],
            "statut":       "traduit",
            "statut_audio": "en_attente",
            "fichier_audio": None,
            "duree_secondes": None,
        }
        path = paths["json"] / f"Chapitre_{row['id']:04d}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return len(rows)

def export_txt_chapters(nom_projet: str) -> int:
    paths = get_project_paths(nom_projet)
    paths["txt"].mkdir(parents=True, exist_ok=True)

    conn = get_db(nom_projet)
    rows = conn.execute("""
        SELECT id, titre_fr, texte_fr FROM chapitres
        WHERE statut IN ('traduit','relu') ORDER BY id
    """).fetchall()
    conn.close()

    for row in rows:
        path = paths["txt"] / f"Chapitre_{row['id']:04d}.txt"
        titre = row["titre_fr"] or ""
        texte = row["texte_fr"] or ""
        first_para = texte.split("\n\n")[0].strip().lstrip("# ").strip()
        if first_para == titre:
            texte = texte.split("\n\n", 1)[1] if "\n\n" in texte else texte
        path.write_text(f"# {titre}\n\n{texte}", encoding="utf-8")

    return len(rows)

def recover_from_json(nom_projet: str) -> dict:
    paths = get_project_paths(nom_projet)
    json_dir = paths["json"]
    txt_dir  = paths["txt"]

    conn = get_db(nom_projet)
    recovered = 0
    skipped   = 0

    # Scan JSON exports first
    if json_dir.exists():
        for f in sorted(json_dir.glob("Chapitre_*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                ch_id   = data.get("id")
                texte   = data.get("texte") or data.get("texte_fr")
                titre   = data.get("titre_fr")
                if not ch_id or not texte:
                    continue
                existing = conn.execute("SELECT statut FROM chapitres WHERE id=?", (ch_id,)).fetchone()
                if existing and existing["statut"] in ("traduit", "relu"):
                    skipped += 1
                    continue
                conn.execute("""
                    UPDATE chapitres
                    SET texte_fr=?, mots_fr=?, statut='traduit', titre_fr=COALESCE(NULLIF(titre_fr,''), ?)
                    WHERE id=?
                """, (texte, len(texte.split()), titre, ch_id))
                recovered += 1
            except Exception:
                continue

    # Scan TXT exports for chapters still missing
    if txt_dir.exists() and recovered == 0:
        for f in sorted(txt_dir.glob("Chapitre_*.txt")):
            try:
                m = re.search(r"Chapitre_(\d+)\.txt", f.name)
                if not m:
                    continue
                ch_id = int(m.group(1))
                content = f.read_text(encoding="utf-8")
                lines = content.split("\n", 2)
                titre = lines[0].lstrip("# ").strip() if lines else ""
                texte = lines[2].strip() if len(lines) > 2 else content
                if not texte:
                    continue
                existing = conn.execute("SELECT statut FROM chapitres WHERE id=?", (ch_id,)).fetchone()
                if existing and existing["statut"] in ("traduit", "relu"):
                    skipped += 1
                    continue
                conn.execute("""
                    UPDATE chapitres
                    SET texte_fr=?, mots_fr=?, statut='traduit'
                    WHERE id=?
                """, (texte, len(texte.split()), ch_id))
                recovered += 1
            except Exception:
                continue

    conn.commit()
    conn.close()
    return {"recovered": recovered, "skipped": skipped}


def export_glossary_csv(nom_projet: str) -> dict:
    paths = get_project_paths(nom_projet)
    conn  = get_db(nom_projet)
    rows  = conn.execute(
        "SELECT terme_en, terme_fr, categorie, decision, notes FROM glossaire ORDER BY categorie, terme_en"
    ).fetchall()
    conn.close()

    csv_path = paths["base"] / "glossaire.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["terme_en", "terme_fr", "categorie", "decision", "notes"])
        for row in rows:
            writer.writerow([row["terme_en"], row["terme_fr"] or "", row["categorie"] or "", row["decision"] or "", row["notes"] or ""])
    return {"exported": len(rows), "path": str(csv_path)}


def import_glossary_csv(nom_projet: str) -> dict:
    paths    = get_project_paths(nom_projet)
    csv_path = paths["base"] / "glossaire.csv"
    if not csv_path.exists():
        raise FileNotFoundError(str(csv_path))

    conn     = get_db(nom_projet)
    inserted = 0
    updated  = 0

    with csv_path.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            terme_en = (row.get("terme_en") or "").strip()
            if not terme_en:
                continue
            terme_fr  = (row.get("terme_fr")  or "").strip()
            categorie = (row.get("categorie") or "autre").strip()
            decision  = (row.get("decision")  or "en_attente").strip()
            notes     = (row.get("notes")     or "").strip() or None
            existing  = conn.execute("SELECT id FROM glossaire WHERE terme_en=?", (terme_en,)).fetchone()
            if existing:
                conn.execute(
                    "UPDATE glossaire SET terme_fr=?, categorie=?, decision=?, notes=? WHERE terme_en=?",
                    (terme_fr, categorie, decision, notes, terme_en)
                )
                updated += 1
            else:
                conn.execute(
                    "INSERT INTO glossaire (terme_en, terme_fr, categorie, decision, notes) VALUES (?, ?, ?, ?, ?)",
                    (terme_en, terme_fr, categorie, decision, notes)
                )
                inserted += 1

    conn.commit()
    conn.close()
    return {"inserted": inserted, "updated": updated}


def export_epub_custom_range(nom_projet: str, debut: int, fin: int) -> list[str]:
    paths = get_project_paths(nom_projet)
    paths["epub"].mkdir(parents=True, exist_ok=True)

    conn = get_db(nom_projet)
    rows = conn.execute("""
        SELECT id, titre_fr, texte_fr FROM chapitres
        WHERE id BETWEEN ? AND ? AND statut IN ('traduit','relu')
        ORDER BY id
    """, (debut, fin)).fetchall()
    conn.close()

    if not rows:
        return []

    book = epub.EpubBook()
    book.set_identifier(f"{nom_projet}-ch{debut}-{fin}")
    book.set_title(f"{nom_projet} — Ch.{debut} à {fin}")
    book.set_language("fr")

    chapters = []
    for row in rows:
        ch = epub.EpubHtml(title=row["titre_fr"], file_name=f"chap_{row['id']:04d}.xhtml", lang="fr")
        body = (row["texte_fr"] or "").replace("\n\n", "</p><p>")
        ch.content = f"<h2>{row['titre_fr']}</h2><p>{body}</p>"
        book.add_item(ch)
        chapters.append(ch)

    book.toc   = tuple(epub.Link(c.file_name, c.title, c.file_name) for c in chapters)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav"] + chapters

    filename = f"{nom_projet}_Ch{debut}-{fin}.epub"
    out_path  = paths["epub"] / filename
    epub.write_epub(str(out_path), book)
    return [str(out_path)]


def export_epub_by_arc(nom_projet: str) -> list[str]:
    paths = get_project_paths(nom_projet)
    paths["epub"].mkdir(parents=True, exist_ok=True)
    pc   = get_project_config(nom_projet)
    arcs = pc.get("arcs", [])

    conn    = get_db(nom_projet)
    created = []

    for arc in arcs:
        rows = conn.execute("""
            SELECT id, titre_fr, texte_fr FROM chapitres
            WHERE arc_id=? AND statut IN ('traduit','relu') ORDER BY id
        """, (arc["id"],)).fetchall()

        if not rows:
            continue

        book = epub.EpubBook()
        book.set_identifier(f"{nom_projet}-arc-{arc['id']}")
        book.set_title(f"{nom_projet} - Arc {arc['id']} - {arc['nom']}")
        book.set_language("fr")

        chapters = []
        for row in rows:
            ch = epub.EpubHtml(
                title=row["titre_fr"],
                file_name=f"chap_{row['id']:04d}.xhtml",
                lang="fr"
            )
            body = row["texte_fr"].replace("\n\n", "</p><p>")
            ch.content = f"<h2>{row['titre_fr']}</h2><p>{body}</p>"
            book.add_item(ch)
            chapters.append(ch)

        book.toc  = tuple(epub.Link(c.file_name, c.title, c.file_name) for c in chapters)
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())
        book.spine = ["nav"] + chapters

        safe_nom = arc["nom"].replace(" ", "_").replace("'", "").replace("!", "").replace("(", "").replace(")", "")
        filename = f"{nom_projet}_Arc{arc['id']}_{safe_nom}.epub"
        out_path = paths["epub"] / filename
        epub.write_epub(str(out_path), book)
        created.append(str(out_path))

    conn.close()
    return created
