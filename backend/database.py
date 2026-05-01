import sqlite3
import json
from pathlib import Path
from config import get_project_paths

def get_db(nom_projet: str):
    paths = get_project_paths(nom_projet)
    paths["db"].parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(paths["db"], timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn

def init_db(nom_projet: str):
    conn = get_db(nom_projet)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS chapitres (
            id INTEGER PRIMARY KEY,
            arc_id INTEGER NOT NULL,
            titre_en TEXT,
            titre_fr TEXT,
            texte_en TEXT,
            texte_fr TEXT,
            mots_en INTEGER DEFAULT 0,
            mots_fr INTEGER DEFAULT 0,
            statut TEXT DEFAULT 'en_attente',
            resume_fr TEXT
        );
        CREATE TABLE IF NOT EXISTS glossaire (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            terme_en TEXT NOT NULL UNIQUE,
            terme_fr TEXT,
            categorie TEXT,
            decision TEXT DEFAULT 'en_attente',
            notes TEXT
        );
        CREATE TABLE IF NOT EXISTS arc_resumes (
            arc_id INTEGER PRIMARY KEY,
            resume TEXT,
            derniere_mise_a_jour INTEGER DEFAULT 0
        );
    """)
    conn.commit()
    # Migration : ajout colonne notes si absente (DB existantes)
    try:
        conn.execute("ALTER TABLE glossaire ADD COLUMN notes TEXT")
        conn.commit()
    except Exception:
        pass
    conn.close()

def get_stats(nom_projet: str) -> dict:
    conn = get_db(nom_projet)
    total    = conn.execute("SELECT COUNT(*) FROM chapitres").fetchone()[0]
    traduits = conn.execute("SELECT COUNT(*) FROM chapitres WHERE statut IN ('traduit','relu')").fetchone()[0]
    en_cours = conn.execute("SELECT COUNT(*) FROM chapitres WHERE statut='en_cours'").fetchone()[0]
    conn.close()
    return {"total": total, "traduits": traduits, "en_cours": en_cours,
            "en_attente": max(0, total - traduits - en_cours)}
