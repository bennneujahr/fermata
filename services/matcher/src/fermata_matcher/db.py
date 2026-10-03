"""Datenbankzugang des Jobs.

Der Job verbindet sich mit einer Login-Rolle und wechselt sofort in die Rolle fermata_matcher (SET ROLE). Damit
arbeitet er mit genau deren Rechten: lesen, was die Auswahl braucht; schreiben nur Läufe, Kandidaten, Paare,
Lauf-Teilnahmen und Embeddings; Art.-9-Daten nur als Ja/Nein über Prüffunktionen. Einrichtung der Login-Rolle:
docs/bereiche/matcher.md, Abschnitt „Betrieb“.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import psycopg
from psycopg import sql

from .config import SETTING_KEYS, MatchSettings


def connect(
    db_url: str, role: str | None = "fermata_matcher", *, application_name: str = "fermata-matcher"
) -> psycopg.Connection:
    conn = psycopg.connect(db_url, autocommit=True, application_name=application_name)
    if role:
        set_role(conn, role)
    return conn


def set_role(conn: psycopg.Connection, role: str) -> None:
    conn.execute(sql.SQL("set role {}").format(sql.Identifier(role)))


@contextmanager
def transaction(conn: psycopg.Connection) -> Iterator[psycopg.Connection]:
    with conn.transaction():
        yield conn


def current_role(conn: psycopg.Connection) -> str:
    return conn.execute("select current_user").fetchone()[0]


def db_now(conn: psycopg.Connection) -> datetime:
    return conn.execute("select app.now()").fetchone()[0]


def load_settings(conn: psycopg.Connection) -> MatchSettings:
    """Einstellungen über ops.setting() (fermata_matcher darf die Tabelle selbst nicht lesen)."""
    keys = list(SETTING_KEYS)
    values: dict[str, Any] = {}
    for key in keys:
        try:
            with conn.transaction():
                row = conn.execute("select ops.setting(%s)", (key,)).fetchone()
        except psycopg.errors.NoDataFound:
            continue
        values[key] = row[0]
    return MatchSettings.from_mapping(values)


def environment(conn: psycopg.Connection) -> str:
    """Umgebung laut ops.deployment (fermata_matcher darf ops.environment() seit 20261003000907 aufrufen)."""
    return conn.execute("select ops.environment()").fetchone()[0]


def environment_or_none(conn: psycopg.Connection) -> str | None:
    """Wie environment(), aber None, wenn die Datenbank es nicht verrät (z. B. fehlendes Recht)."""
    try:
        with conn.transaction():
            row = conn.execute("select ops.environment()").fetchone()
    except psycopg.Error:
        return None
    return None if row is None else row[0]
