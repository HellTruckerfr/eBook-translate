"""
Script standalone pour supprimer les notes auteur des EPUBs.
Cherche "****" dans chaque chapitre et coupe tout ce qui suit.
Génère des fichiers *_clean.epub à côté des originaux.

Usage :
    python clean_epubs.py fichier1.epub fichier2.epub ...
    python clean_epubs.py                              (cherche tous les .epub dans le dossier courant)
"""

import sys
import re
import shutil
import zipfile
from pathlib import Path
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import warnings
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)


_AUTHOR_PATTERNS = re.compile(
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

def clean_html_content(html_bytes: bytes) -> tuple[bytes, bool]:
    html = html_bytes.decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "lxml")

    paragraphs = soup.find_all("p")
    modified = False
    real_paras = []

    for i, p in enumerate(paragraphs):
        text = p.get_text().strip()
        if not text:
            continue
        m = _AUTHOR_PATTERNS.search(text)
        if m:
            real_words = sum(len(rp.get_text().split()) for rp in real_paras)

            # Séparateur étoiles (*** ou *** *** ***) : scène ou fin de chapitre ?
            if all(c in '* \t' for c in text):
                # Chercher le prochain paragraphe de contenu non-étoile
                next_story = None
                for pf in paragraphs[i + 1:]:
                    pf_text = pf.get_text().strip()
                    if not pf_text:
                        continue
                    if all(c in '* \t' for c in pf_text):
                        continue
                    next_story = pf_text
                    break
                if next_story and not _AUTHOR_PATTERNS.search(next_story):
                    # Le contenu suivant est de l'histoire → séparateur de scène → supprimer
                    p.decompose()
                    modified = True
                    continue
                # Sinon : fin de chapitre → tomber dans la logique de coupe

            before = text[:m.start()].strip()

            if real_words < 200:
                # Reset : pas assez de vrai contenu avant → supprimer les paras précédents
                for rp in real_paras:
                    rp.decompose()
                real_paras = []
                if before:
                    p.clear()
                    p.append(soup.new_string(before))
                    real_paras.append(p)
                else:
                    p.decompose()
                modified = True
            else:
                # Note en milieu de paragraphe (texte histoire avant la note) : conserver et continuer
                if before and not all(c in '* \t' for c in text):
                    p.clear()
                    p.append(soup.new_string(before))
                    real_paras.append(p)
                    modified = True
                else:
                    # Note autonome ou étoiles de fin de chapitre : couper ici
                    if before:
                        p.clear()
                        p.append(soup.new_string(before))
                    else:
                        p.decompose()
                    for p_after in paragraphs[i + 1:]:
                        p_after.decompose()
                    modified = True
                    break
        else:
            real_paras.append(p)

    if modified:
        return str(soup).encode("utf-8"), True
    return html_bytes, False


def clean_epub(input_path: Path) -> tuple:
    output_path = input_path.with_stem(input_path.stem + "_clean")
    pages_modified = 0

    total = 0
    with zipfile.ZipFile(input_path, 'r') as zin, \
         zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if re.search(r'(?:page|chapter)-\d+\.html', item.filename):
                total += 1
                cleaned, was_modified = clean_html_content(data)
                if was_modified:
                    data = cleaned
                    pages_modified += 1
            zout.writestr(item, data)

    return output_path, pages_modified, total


def main():
    if len(sys.argv) > 1:
        paths = [Path(p) for p in sys.argv[1:] if p.endswith(".epub")]
    else:
        paths = list(Path(".").glob("*.epub"))
        paths = [p for p in paths if not p.stem.endswith("_clean")]

    if not paths:
        print("Aucun fichier EPUB trouvé.")
        return

    for path in paths:
        if not path.exists():
            print(f"  ✗ Fichier introuvable : {path}")
            continue
        print(f"Traitement : {path.name} ...", end=" ", flush=True)
        try:
            out, n, total = clean_epub(path)
            print(f"{total} chapitres traites, {n} nettoye(s) -> {out.name}")
        except Exception as e:
            print(f"ERREUR : {e}")


if __name__ == "__main__":
    main()
