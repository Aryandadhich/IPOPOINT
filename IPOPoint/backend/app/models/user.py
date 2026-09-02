"""User model helpers — thin wrappers over raw sqlite3 rows."""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from ..extensions import get_db


class User:
    """Lightweight data-class representing a users row."""

    def __init__(self, row):
        self.id         = row["id"]
        self.name       = row["name"]
        self.email      = row["email"]
        self.password   = row["password"]
        self.is_premium = bool(row["is_premium"])
        self.created_at = row["created_at"]

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "name":       self.name,
            "email":      self.email,
            "is_premium": self.is_premium,
            "created_at": self.created_at,
        }

    # ── Queries ───────────────────────────────────────────────────────────────

    @staticmethod
    def find_by_email(email: str) -> Optional["User"]:
        row = get_db().execute(
            "SELECT * FROM users WHERE email = ?", (email.lower(),)
        ).fetchone()
        return User(row) if row else None

    @staticmethod
    def find_by_id(user_id: int) -> Optional["User"]:
        row = get_db().execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return User(row) if row else None

    @staticmethod
    def create(name: str, email: str, hashed_password: str) -> "User":
        db = get_db()
        db.execute(
            "INSERT INTO users (name, email, password, created_at) VALUES (?,?,?,?)",
            (name, email.lower(), hashed_password, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        db.commit()
        return User.find_by_email(email)

    @staticmethod
    def email_exists(email: str) -> bool:
        row = get_db().execute(
            "SELECT id FROM users WHERE email = ?", (email.lower(),)
        ).fetchone()
        return row is not None
