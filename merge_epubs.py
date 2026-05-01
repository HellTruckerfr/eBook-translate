"""
Fusionne plusieurs EPUBs en un seul fichier propre.
Le numéro de chapitre est extrait depuis le titre HTML (fiable, indépendant du nom de page).
La table des matières est reconstruite dans l'ordre.

Usage :
    python merge_epubs.py fichier1.epub fichier2.epub ... -o merged.epub
    python merge_epubs.py *_clean.epub -o my_vampire_system_complet.epub
"""

import sys
import re
import argparse
from pathlib import Path
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import warnings
import ebooklib
from ebooklib import epub

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)


def get_chapter_info(page_item):
    """Retourne (num, titre) depuis le contenu HTML, ou None si non trouvé."""
    soup = BeautifulSoup(page_item.get_content(), "lxml")
    title_tag = soup.find(["h1", "h2", "h3"])
    if not title_tag:
        return None
    title_text = title_tag.get_text(strip=True)
    m = re.search(r'[Cc]hapter\s+(\d+)', title_text)
    if not m:
        return None
    return int(m.group(1)), title_text


def collect_css(book):
    """Retourne la liste des items CSS d'un livre."""
    return [i for i in book.get_items() if i.get_type() == ebooklib.ITEM_STYLE]


def merge_epubs(input_paths, output_path):
    chapters = {}  # num → (titre, html_bytes)
    css_items = []

    print(f"\nLecture de {len(input_paths)} fichier(s)...")
    for path in input_paths:
        print(f"  {Path(path).name}", end=" ... ", flush=True)
        book = epub.read_epub(path)

        # Récupérer les CSS du premier livre seulement
        if not css_items:
            css_items = collect_css(book)

        pages = [i for i in book.get_items()
                 if re.search(r'(?:page|chapter)-\d+\.html', i.get_name())]

        found = 0
        for page in pages:
            info = get_chapter_info(page)
            if not info:
                continue
            num, titre = info
            if num not in chapters:
                chapters[num] = (titre, page.get_content())
                found += 1

        print(f"{found} chapitres")

    if not chapters:
        print("Aucun chapitre trouvé.")
        return

    print(f"\nConstruction du EPUB fusionné ({len(chapters)} chapitres)...")

    merged = epub.EpubBook()
    merged.set_identifier("mvs-complet")
    merged.set_title("My Vampire System — Complet")
    merged.set_language("en")

    # Ajouter les CSS
    css_map = {}
    for css in css_items:
        new_css = epub.EpubItem(
            uid=css.id,
            file_name=css.file_name,
            media_type=css.media_type,
            content=css.get_content()
        )
        merged.add_item(new_css)
        css_map[css.file_name] = new_css

    # Ajouter les chapitres dans l'ordre
    spine_items = []
    toc_items   = []

    for num in sorted(chapters.keys()):
        titre, html_bytes = chapters[num]

        # Corriger les liens CSS relatifs si besoin
        content = html_bytes.decode("utf-8", errors="replace")
        # Normaliser les chemins CSS (garder les refs existantes)

        chapter_item = epub.EpubHtml(
            title=titre,
            file_name=f"chapter-{num:04d}.html",
            lang="en",
        )
        chapter_item.content = content.encode("utf-8")

        # Lier les CSS
        for css in css_map.values():
            chapter_item.add_link(
                href=css.file_name,
                rel="stylesheet",
                type="text/css"
            )

        merged.add_item(chapter_item)
        spine_items.append(chapter_item)
        toc_items.append(epub.Link(f"chapter-{num:04d}.html", titre, f"ch{num}"))

    merged.toc   = toc_items
    merged.spine = ["nav"] + spine_items

    merged.add_item(epub.EpubNcx())
    merged.add_item(epub.EpubNav())

    epub.write_epub(output_path, merged)
    size_mb = Path(output_path).stat().st_size / 1024 / 1024
    print(f"\nFichier créé : {output_path}  ({size_mb:.1f} MB, {len(chapters)} chapitres)")


def main():
    parser = argparse.ArgumentParser(description="Fusionne plusieurs EPUBs en un seul.")
    parser.add_argument("epubs", nargs="+", help="Fichiers EPUB sources (dans l'ordre)")
    parser.add_argument("-o", "--output", default="merged.epub", help="Fichier de sortie")
    args = parser.parse_args()

    input_paths = sorted(args.epubs)  # tri alphabétique = ordre chronologique si nommés correctement
    merge_epubs(input_paths, args.output)


if __name__ == "__main__":
    main()
