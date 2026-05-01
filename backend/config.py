import json
import os
from pathlib import Path

APP_DATA = Path(os.environ.get("APPDATA", Path.home())) / "eBook-Translate"
APP_DATA.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = APP_DATA / "config.json"

DEFAULT_CONFIG = {
    "mistral_api_key": "",
    "mistral_model": "mistral-large-latest",
    "mistral_model_resume": "mistral-small-latest",
    "workers": 5,
    "arc_resume_frequence": 50,
    "output_dir": str(Path.home() / "Documents" / "eBook-Translate"),
    "projet_actif": None,
    "langue_source": "anglais",
    "langue_cible": "français",
}

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            return {**DEFAULT_CONFIG, **data}
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()

def save_config(data: dict):
    merged = {**load_config(), **data}
    CONFIG_FILE.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

def get(key: str):
    return load_config().get(key, DEFAULT_CONFIG.get(key))

# ── Projet actif ──────────────────────────────────────────
def get_project_dir(nom_projet: str) -> Path:
    output = Path(get("output_dir"))
    return output / nom_projet

def get_project_config(nom_projet: str) -> dict:
    path = get_project_dir(nom_projet) / "project.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}

def save_project_config(nom_projet: str, data: dict):
    d = get_project_dir(nom_projet)
    d.mkdir(parents=True, exist_ok=True)
    path = d / "project.json"
    existing = get_project_config(nom_projet)
    path.write_text(json.dumps({**existing, **data}, ensure_ascii=False, indent=2), encoding="utf-8")

def get_project_paths(nom_projet: str) -> dict:
    base = get_project_dir(nom_projet)
    return {
        "base":     base,
        "db":       base / "projet.db",
        "json":     base / "json",
        "txt":      base / "txt",
        "epub":     base / "epub",
    }

def list_projects() -> list[str]:
    output = Path(get("output_dir"))
    if not output.exists():
        return []
    projects = []
    for d in output.iterdir():
        if not d.is_dir():
            continue
        has_json = (d / "project.json").exists()
        has_db   = (d / "projet.db").exists()
        if not has_json and not has_db:
            continue
        if not has_json and has_db:
            # DB orpheline sans project.json — on recrée un fichier minimal
            _create_minimal_project_json(d)
        projects.append(d.name)
    return projects

def _create_minimal_project_json(project_dir: Path):
    path = project_dir / "project.json"
    try:
        path.write_text(
            json.dumps({"nom": project_dir.name, "epub_paths": []}, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    except Exception:
        pass
