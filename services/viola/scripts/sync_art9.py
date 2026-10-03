"""Überträgt die Art.-9-Muster aus src/viola/art9_patterns.json in den Block der SQL-Migration.

Aufruf (aus services/viola):  uv run python scripts/sync_art9.py
Der pytest ``test_art9_sql_in_sync`` schlägt fehl, wenn beide Seiten auseinanderlaufen.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_FILE = ROOT / "src" / "viola" / "art9_patterns.json"
MIGRATION = ROOT.parents[1] / "supabase" / "migrations" / "20261003000310_viola.sql"
BLOCK = re.compile(r"(\$art9\$)(.*?)(\$art9\$)", re.DOTALL)


def render_patterns() -> str:
    data = json.loads(JSON_FILE.read_text(encoding="utf-8"))
    lines = [json.dumps(p, ensure_ascii=False) for p in data["patterns"]]
    return "[\n  " + ",\n  ".join(lines) + "\n]"


def main() -> int:
    sql = MIGRATION.read_text(encoding="utf-8")
    if not BLOCK.search(sql):
        print("Block $art9$…$art9$ nicht gefunden", file=sys.stderr)
        return 1
    new_sql = BLOCK.sub(lambda m: m.group(1) + render_patterns() + m.group(3), sql, count=1)
    if new_sql != sql:
        MIGRATION.write_text(new_sql, encoding="utf-8")
        print(f"aktualisiert: {MIGRATION}")
    else:
        print("unverändert")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
