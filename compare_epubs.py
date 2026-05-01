"""
Compare le nombre de mots par chapitre entre les EPUBs originaux et leurs versions clean.
Signale les chapitres où la version clean a plus de 15% de mots en moins.

Usage :
    python compare_epubs.py original1.epub clean1.epub [original2.epub clean2.epub ...]
    python compare_epubs.py          (détecte automatiquement les paires *.epub / *_clean.epub)
"""

import sys
import re
import zipfile
from pathlib import Path
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import warnings
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

THRESHOLD = 0.85  # alerte si clean < 85% des mots de l'original


def extract_chapters(epub_path: Path) -> dict[int, int]:
    """Retourne {num_chapitre: nb_mots} pour tous les chapitres d'un EPUB."""
    chapters = {}
    with zipfile.ZipFile(epub_path, 'r') as zin:
        for item in zin.infolist():
            if not re.search(r'(?:page|chapter)-\d+\.html', item.filename):
                continue
            data = zin.read(item.filename)
            html = data.decode("utf-8", errors="replace")
            soup = BeautifulSoup(html, "lxml")
            title_tag = soup.find(["h1", "h2", "h3"])
            if not title_tag:
                continue
            m = re.search(r'[Cc]hapter\s+(\d+)', title_tag.get_text())
            if not m:
                continue
            num = int(m.group(1))
            text = " ".join(p.get_text(" ", strip=True) for p in soup.find_all("p") if p.get_text(strip=True))
            chapters[num] = len(text.split())
    return chapters


def compare_pair(orig_path: Path, clean_path: Path) -> list[tuple]:
    """Retourne la liste des chapitres avec réduction > seuil : (num, orig_words, clean_words, pct)."""
    print(f"\n{orig_path.name}  vs  {clean_path.name}")
    orig = extract_chapters(orig_path)
    clean = extract_chapters(clean_path)
    common = sorted(set(orig) & set(clean))
    print(f"  {len(orig)} chapitres originaux, {len(clean)} chapitres clean, {len(common)} en commun")

    diffs = []
    for num in common:
        o, c = orig[num], clean[num]
        if o > 0 and c < o * THRESHOLD:
            diffs.append((num, o, c, c / o * 100))

    if diffs:
        print(f"  {len(diffs)} chapitre(s) avec reduction > {int((1-THRESHOLD)*100)}% :")
        for num, o, c, pct in sorted(diffs, key=lambda x: x[3]):
            print(f"    Ch.{num:4d} : {o:5d} -> {c:5d} mots  ({pct:.0f}%)")
    else:
        print(f"  Aucune reduction significative detectee.")
    return diffs


def find_pairs(folder: Path) -> list[tuple[Path, Path]]:
    pairs = []
    for orig in sorted(folder.glob("*.epub")):
        if orig.stem.endswith("_clean"):
            continue
        clean = orig.with_stem(orig.stem + "_clean")
        if clean.exists():
            pairs.append((orig, clean))
    return pairs


def main():
    args = sys.argv[1:]
    if len(args) >= 2 and len(args) % 2 == 0:
        pairs = [(Path(args[i]), Path(args[i+1])) for i in range(0, len(args), 2)]
    elif not args:
        pairs = find_pairs(Path("."))
        if not pairs:
            print("Aucune paire (original / _clean) trouvee dans le dossier courant.")
            return
    else:
        print("Usage : compare_epubs.py [orig1.epub clean1.epub orig2.epub clean2.epub ...]")
        return

    all_diffs = []
    for orig, clean in pairs:
        if not orig.exists():
            print(f"Introuvable : {orig}")
            continue
        if not clean.exists():
            print(f"Introuvable : {clean}")
            continue
        all_diffs.extend(compare_pair(orig, clean))

    print(f"\n=== Total : {len(all_diffs)} chapitre(s) potentiellement tronque(s) ===")


if __name__ == "__main__":
    main()
