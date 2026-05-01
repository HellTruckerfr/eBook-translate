import re
from pathlib import Path
from bs4 import BeautifulSoup
import ebooklib
from ebooklib import epub
from database import get_db

def arc_for_chapter(num: int, arcs: list) -> dict:
    for arc in arcs:
        if arc["debut"] <= num <= arc["fin"]:
            return arc
    return arcs[-1]

def load_titres_fr(titres_path: str) -> dict[int, str]:
    titres = {}
    p = Path(titres_path)
    if not p.exists():
        return titres

    # Fichier unique ou dossier
    fichiers = [p] if p.is_file() else list(p.glob("*.txt"))

    for fichier in fichiers:
        try:
            contenu = fichier.read_text(encoding="utf-8")
        except Exception:
            continue
        for ligne in contenu.splitlines():
            ligne = ligne.strip()
            if not ligne:
                continue
            match = re.match(r"(?:Chapitre\s+)?(\d+)\s*[:\-–]\s*(.+)", ligne)
            if match:
                num = int(match.group(1))
                titres[num] = f"Chapitre {num} : {match.group(2).strip()}"
    return titres

_AUTHOR_NOTE_RE = re.compile(
    # Séparateurs génériques (3+ pour ne pas attraper le bold **)
    r'\*{3,}'
    # Mots-clés explicites de note/annonce
    r'|^\s*(?:NOTE|MESSAGE|ANNOUNCEMENT|REMINDER|NOTICE)\s*:'
    r'|-{3,}.*ANNOUNCEMENT.*-{3,}'
    r'|IMPORTANT MESSAGE'
    r'|^\s*READ BELOW'
    r'|author.{0,15}(?:note|message|word)'
    r'|From JKSManga'
    r'|jksmanga|jsmanga'
    r'|Devils.?Advocate'
    r'|MVS EVENT'
    r'|For M\.?V\.?S'
    r'|^\s*Edit\s*:'
    r'|Big Update'
    r'|follow me on.*social media'
    r'|^\s*(?:End\s+of\s+)?Volume\s+\d'
    r'|back from my holiday'
    r'|^\s*Hey everyone'
    r'|^\s*Hi everyone'
    # Plateformes / monétisation / autres romans de l'auteur
    r'|patreon\.com'
    r'|P\.A\.T\.R\.E\.O\.N'
    r'|discord\.gg'
    r'|web.?novel'
    r'|webtoon'
    r'|royalroad'
    r'|scribblehub'
    r'|\bAmazon\b'
    r'|[Aa]\.m\.a\.z\.o\.n'
    r'|\$\s*\d+\s*dollar'
    r'|per month'
    r'|get access to'
    r'|mass release'
    r'|Priv tier'
    r'|My Dragon System'
    r'|Raze Cromwell'
    r'|Dark Magus'
    # Réseaux sociaux
    r'|[Ff]acebook'
    r'|insta?gram'
    r'|Ukraine'
    # Actions de l'auteur / objectifs de pierres
    r'|remember to vote'
    r'|keep voting'
    r'|Schedule.?Change'
    r'|support.*novel'
    r'|vote.*stone'
    r'|[\d,]+\s*[Ss]tones?\s*='
    r'|Rank\s+\d+\s*='
    r'|\d+-chapter release'
    r'|leave a (?:review|rating)'
    r'|chapter schedule'
    r'|chapters will be (?:back|posted|released)'
    # Promotions spécifiques à l'auteur
    r'|My Werewolf System'
    r'|[Kk]ickstarter'
    r'|[Ss]earch\s*(?:for it on|:)'
    r'|[Ss]ide story winner'
    r'|[Ee]vent winner',
    re.IGNORECASE
)

def strip_author_notes(text: str) -> str:
    paragraphs = text.split('\n\n')
    result = []
    for i, para in enumerate(paragraphs):
        m = _AUTHOR_NOTE_RE.search(para)
        if not m:
            result.append(para)
            continue

        real_words = sum(len(p.split()) for p in result if p.strip())

        # Séparateur étoiles (*** ou *** *** ***) : scène ou fin de chapitre ?
        stripped = para.strip()
        if all(c in '* \t' for c in stripped):
            next_story = None
            for fp in paragraphs[i + 1:]:
                fp_s = fp.strip()
                if not fp_s:
                    continue
                if all(c in '* \t' for c in fp_s):
                    continue
                next_story = fp_s
                break
            if next_story and not _AUTHOR_NOTE_RE.search(next_story):
                # Séparateur de scène → supprimer (inutile pour le TTS)
                continue

        before = para[:m.start()].strip()

        if real_words < 200:
            result = []
            if before:
                result.append(before)
        else:
            if before and not all(c in '* \t' for c in stripped):
                # Note en milieu de paragraphe : conserver le texte avant et continuer
                result.append(before)
            else:
                break

    return '\n\n'.join(result).strip()

def extract_text_from_html(html_content: str) -> tuple[str, str]:
    soup = BeautifulSoup(html_content, "lxml")
    title_tag = soup.find(["h1", "h2", "h3"])
    title = title_tag.get_text(strip=True) if title_tag else ""
    if title_tag:
        title_tag.decompose()
    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p") if p.get_text(strip=True)]
    return title, strip_author_notes("\n\n".join(paragraphs))

def parse_epubs(nom_projet: str, epub_paths: list[str], arcs: list,
                titres_dir: str = None, progress_cb=None) -> int:
    titres_fr = load_titres_fr(titres_dir) if titres_dir else {}
    conn = get_db(nom_projet)
    total_inserted = 0

    for epub_path in epub_paths:
        book = epub.read_epub(epub_path)
        pages = sorted(
            [i for i in book.get_items()
             if re.search(r"(?:page|chapter)-\d+\.html", i.get_name())],
            key=lambda x: x.get_name()
        )
        for page in pages:

            title_en, text_en = extract_text_from_html(page.get_content().decode("utf-8"))
            if not text_en.strip():
                continue

            # Extraire le numéro de chapitre depuis le titre ("Chapter 42: ...") — fiable sur tous les EPUBs
            title_match = re.search(r'[Cc]hapter\s+(\d+)', title_en)
            if not title_match:
                continue
            num = int(title_match.group(1))

            arc = arc_for_chapter(num, arcs)
            titre_fr = titres_fr.get(num, f"Chapitre {num}")

            if not conn.execute("SELECT id FROM chapitres WHERE id=?", (num,)).fetchone():
                conn.execute("""
                    INSERT INTO chapitres (id, arc_id, titre_en, titre_fr, texte_en, mots_en, statut)
                    VALUES (?, ?, ?, ?, ?, ?, 'en_attente')
                """, (num, arc["id"], title_en, titre_fr, text_en, len(text_en.split())))
                total_inserted += 1

            if progress_cb:
                progress_cb(num)

    conn.commit()
    conn.close()
    return total_inserted

def reparer_chapitres(nom_projet: str, epub_paths: list[str], arcs: list,
                      titres_dir: str = None, progress_cb=None) -> dict:
    """Réimporte les chapitres manquants ou vides (mots_en == 0) depuis les EPUBs."""
    titres_fr = load_titres_fr(titres_dir) if titres_dir else {}
    conn = get_db(nom_projet)
    inseres = 0
    repares = 0

    for epub_path in epub_paths:
        book = epub.read_epub(epub_path)
        pages = sorted(
            [i for i in book.get_items()
             if re.search(r"(?:page|chapter)-\d+\.html", i.get_name())],
            key=lambda x: x.get_name()
        )
        for page in pages:
            title_en, text_en = extract_text_from_html(page.get_content().decode("utf-8"))
            title_match = re.search(r'[Cc]hapter\s+(\d+)', title_en)
            if not title_match:
                continue
            num = int(title_match.group(1))
            arc = arc_for_chapter(num, arcs)
            titre_fr = titres_fr.get(num, f"Chapitre {num}")

            existing = conn.execute("SELECT id, mots_en FROM chapitres WHERE id=?", (num,)).fetchone()
            if not existing:
                # Insérer même si texte vide — le chapitre doit exister en base
                conn.execute("""
                    INSERT INTO chapitres (id, arc_id, titre_en, titre_fr, texte_en, mots_en, statut)
                    VALUES (?, ?, ?, ?, ?, ?, 'en_attente')
                """, (num, arc["id"], title_en, titre_fr, text_en, len(text_en.split())))
                inseres += 1
            elif existing["mots_en"] == 0 and text_en.strip():
                conn.execute("""
                    UPDATE chapitres SET texte_en=?, mots_en=?, titre_en=? WHERE id=?
                """, (text_en, len(text_en.split()), title_en, num))
                repares += 1

            if progress_cb:
                progress_cb(num)

    conn.commit()
    conn.close()
    return {"inseres": inseres, "repares": repares}

def mettre_a_jour_titres_fr(nom_projet: str, titres_dir: str) -> dict:
    """Met à jour titre_fr en DB depuis les fichiers TXT.
    Pour les chapitres déjà traduits, corrige aussi la première ligne de texte_fr."""
    titres = load_titres_fr(titres_dir)
    if not titres:
        return {"updated": 0, "texte_fixed": 0, "error": "Aucun titre chargé depuis le chemin fourni"}

    conn = get_db(nom_projet)
    updated = 0
    texte_fixed = 0

    for num, titre_fr in titres.items():
        row = conn.execute("SELECT statut, titre_fr, texte_fr FROM chapitres WHERE id=?", (num,)).fetchone()
        if not row:
            continue

        titre_actuel = row["titre_fr"] or ""
        is_bare = bool(re.match(r'^[Cc]hapitre\s+\d+\s*$', titre_actuel.strip()))

        if not is_bare and titre_actuel == titre_fr:
            continue

        if row["statut"] in ("traduit", "relu") and row["texte_fr"]:
            texte = row["texte_fr"]
            lines = texte.split('\n', 2)
            first_line = lines[0].strip()
            if re.match(r'^[Cc]hapitre\s+\d+\s*$', first_line):
                rest = lines[2] if len(lines) > 2 else (lines[1] if len(lines) > 1 else "")
                texte_new = f"{titre_fr}\n\n{rest.lstrip()}"
                conn.execute("UPDATE chapitres SET titre_fr=?, texte_fr=? WHERE id=?",
                             (titre_fr, texte_new, num))
                texte_fixed += 1
            else:
                conn.execute("UPDATE chapitres SET titre_fr=? WHERE id=?", (titre_fr, num))
        else:
            conn.execute("UPDATE chapitres SET titre_fr=? WHERE id=?", (titre_fr, num))
        updated += 1

    conn.commit()
    conn.close()
    return {"updated": updated, "texte_fixed": texte_fixed}


_COMMON_EN = {
    "The","A","An","I","He","She","It","We","You","They",
    "My","His","Her","Its","Our","Your","Their",
    "This","That","These","Those","Me","Him","Us","Them",
    "And","Or","But","Nor","For","Yet","So",
    "As","At","By","In","Of","On","To","Up",
    "With","From","Into","Onto","Upon","Over","Under",
    "About","Above","Across","After","Against","Along",
    "Among","Around","Before","Behind","Below","Beneath",
    "Beside","Between","Beyond","During","Except",
    "Inside","Near","Off","Outside","Past","Since",
    "Through","Throughout","Until","Within","Without",
    "Is","Are","Was","Were","Be","Been","Being",
    "Have","Has","Had","Do","Does","Did",
    "Will","Would","Could","Should","May","Might","Must","Can",
    "Let","Get","Got","Go","Come","Came","See","Saw","Know","Think","Thought",
    "Say","Said","Tell","Told","Ask","Asked","Look","Looked","Make","Made",
    "Take","Took","Keep","Kept","Put","Run","Ran","Give","Gave","Find","Found",
    "Hold","Held","Stand","Stood","Move","Moved","Turn","Turned",
    "Want","Wanted","Need","Needed","Try","Tried","Use","Used",
    "Not","No","Yes","Now","Then","When","Where",
    "How","Why","What","Which","Who","Whose",
    "All","Both","Each","Every","Any","Some","Many","Much",
    "More","Most","Less","Few","Several","Another","Other",
    "Just","Even","Still","Only","Also","Too","Very",
    "Well","Here","There","Back","Down","Out","Away",
    "Already","Always","Never","Often","Soon","Again",
    "Perhaps","Maybe","However","Therefore","Although",
    "Because","Though","While","Since","Once","If","Whether",
    "First","Second","Third","Last","Next","New","Old","Own",
    "Good","Great","Right","Same","Such","Sure","True","Real",
    "Long","Short","Big","Small","Large","Little","High","Low",
    "Chapter","Part","Volume","Section","Note",
    "One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
    "Didn","Don","Wasn","Aren","Isn","Won","Couldn","Wouldn","Shouldn",
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
    "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
    # Interjections / apostrophes fréquentes en dialogue
    "Hey","Oh","Ah","Ugh","Hmm","Huh","Wow","Hm",
    "Please","Sorry","Thanks","Thank","Excuse","Wait","Listen","Watch",
    # Adverbes fréquents en début de réplique
    "Suddenly","Quickly","Slowly","Luckily","Finally","Clearly","Surely",
    "Honestly","Apparently","Obviously","Seriously","Probably","Certainly",
    "Immediately","Eventually","Generally","Basically","Typically",
    # Conjonctions / prépositions manquantes
    "Unlike","Like","Despite","Instead","Rather","Except","Including",
    "Regarding","Considering","Following","According","Depending",
    "Whenever","Whatever","Whoever","However","Wherever","Whichever",
    # Verbes courants en début de phrase
    "Replied","Answered","Continued","Explained","Shouted","Whispered",
    "Nodded","Smiled","Frowned","Laughed","Sighed","Paused",
}

def extract_glossary_candidates(nom_projet: str) -> list[str]:
    from collections import Counter
    conn = get_db(nom_projet)
    rows = conn.execute("SELECT texte_en FROM chapitres WHERE texte_en IS NOT NULL").fetchall()
    conn.close()
    all_text = " ".join(r[0] for r in rows if r[0])

    # Compter les occurrences en minuscule (mot commun) vs capitalisé en mid-phrase
    lowercase_count = Counter(m.group(1) for m in re.finditer(r'\b([a-z]{3,})\b', all_text))
    mid_cap_count   = Counter()
    for m in re.finditer(r'(?<=[a-z,;:\-"]) +([A-Z][a-z]{2,})\b', all_text):
        mid_cap_count[m.group(1)] += 1

    candidates = set()

    # Mots seuls : vrai nom propre si capitalisé mid-phrase souvent
    # ET apparaît rarement en minuscule (ratio faible = toujours capitalisé = nom propre)
    for word, cap_count in mid_cap_count.items():
        if cap_count < 2:
            continue
        if word in _COMMON_EN:
            continue
        lc = lowercase_count.get(word.lower(), 0)
        if lc < cap_count:
            candidates.add(word)

    # Syntagmes multi-mots : "Vampire System", "Blood Crystal", etc.
    phrase_count = Counter()
    for m in re.finditer(r'\b([A-Z][a-zA-Z]{1,}(?:\s+[A-Z][a-zA-Z]{1,})+)\b', all_text):
        phrase = m.group(1)
        words  = phrase.split()
        # Rejeter si un mot est commun, verbe en -ed/-ing, ou article
        if any(w in _COMMON_EN or w.endswith('ing') or (w.endswith('ed') and len(w) > 5) for w in words):
            continue
        phrase_count[phrase] += 1

    for phrase, count in phrase_count.items():
        if count >= 2:
            candidates.add(phrase)

    return sorted(candidates)
