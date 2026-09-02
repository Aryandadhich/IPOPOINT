"""Shared SQLite initialisation and connection helper.

We use raw sqlite3 (no ORM) to stay lightweight and keep the same schema
as the original app.py. Switching to PostgreSQL later only requires
swapping the connection layer here.
"""
import os
import sqlite3
from flask import Flask, g


def get_db(app: Flask = None) -> sqlite3.Connection:
    """Return a per-request SQLite connection stored in Flask's `g`."""
    if "db" not in g:
        db_path = (app or _current_app()).config["DB_PATH"]
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db


def _current_app():
    from flask import current_app
    return current_app._get_current_object()


def close_db(error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def db_init(app: Flask) -> None:
    """Create tables and run any lightweight migrations."""
    app.teardown_appcontext(close_db)

    db_path = app.config["DB_PATH"]
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT    NOT NULL,
            email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            password     TEXT    NOT NULL,
            is_premium   INTEGER DEFAULT 0,
            created_at   TEXT
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS ipos (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id          INTEGER,
            name             TEXT    NOT NULL,
            open_date        TEXT,
            close_date       TEXT,
            allotment_date   TEXT,
            gmp              TEXT,
            issue_price      TEXT,
            listing_price    TEXT,
            acc1_applied     TEXT DEFAULT '',
            acc1_status      TEXT DEFAULT '',
            acc2_applied     TEXT DEFAULT '',
            acc2_status      TEXT DEFAULT '',
            acc3_applied     TEXT DEFAULT '',
            acc3_status      TEXT DEFAULT '',
            total_lots       TEXT DEFAULT '',
            allotment_status TEXT DEFAULT '',
            shares_allotted  TEXT DEFAULT '',
            listing_gain     TEXT DEFAULT '',
            notes            TEXT DEFAULT '',
            updated_at       TEXT
        )
    """)

    # Migration: add user_id column for older DBs
    try:
        conn.execute("ALTER TABLE ipos ADD COLUMN user_id INTEGER")
    except Exception:
        pass  # already exists

    conn.commit()
    conn.close()
