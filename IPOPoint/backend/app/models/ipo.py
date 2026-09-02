"""IPO model helpers — thin wrappers over raw sqlite3 rows."""
from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from ..extensions import get_db

# Fields the caller is allowed to update via PUT /api/ipos/<id>
UPDATABLE_FIELDS = frozenset([
    "acc1_applied", "acc1_status",
    "acc2_applied", "acc2_status",
    "acc3_applied", "acc3_status",
    "total_lots", "allotment_status", "shares_allotted",
    "listing_price", "listing_gain", "notes",
    "open_date", "close_date", "allotment_date",
    "gmp", "issue_price",
])


def _row_to_dict(row) -> dict:
    return dict(row)


class IPO:
    """Lightweight IPO data-class."""

    # ── Queries ───────────────────────────────────────────────────────────────

    @staticmethod
    def list_for_user(user_id: int) -> List[dict]:
        rows = get_db().execute(
            "SELECT * FROM ipos WHERE user_id = ? ORDER BY id DESC",
            (user_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]

    @staticmethod
    def find(ipo_id: int, user_id: int) -> Optional[dict]:
        row = get_db().execute(
            "SELECT * FROM ipos WHERE id = ? AND user_id = ?",
            (ipo_id, user_id),
        ).fetchone()
        return _row_to_dict(row) if row else None

    @staticmethod
    def find_any(ipo_id: int) -> Optional[dict]:
        row = get_db().execute(
            "SELECT * FROM ipos WHERE id = ?", (ipo_id,)
        ).fetchone()
        return _row_to_dict(row) if row else None

    @staticmethod
    def exists(name: str, user_id: int) -> bool:
        row = get_db().execute(
            "SELECT id FROM ipos WHERE LOWER(name) = LOWER(?) AND user_id = ?",
            (name, user_id),
        ).fetchone()
        return row is not None

    @staticmethod
    def create(user_id: int, name: str, fetched: dict) -> dict:
        now = datetime.now().strftime("%d-%b %H:%M")
        db = get_db()
        db.execute(
            """INSERT INTO ipos
               (user_id, name, open_date, close_date, allotment_date,
                gmp, issue_price, updated_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                user_id, name,
                fetched.get("open_date", ""),
                fetched.get("close_date", ""),
                fetched.get("allotment_date", ""),
                fetched.get("gmp", ""),
                fetched.get("issue_price", ""),
                now,
            ),
        )
        db.commit()
        row = db.execute(
            "SELECT * FROM ipos WHERE LOWER(name) = LOWER(?) AND user_id = ?",
            (name, user_id),
        ).fetchone()
        return _row_to_dict(row)

    @staticmethod
    def update(ipo_id: int, updates: dict) -> dict:
        db = get_db()
        for k, v in updates.items():
            if k in UPDATABLE_FIELDS:
                db.execute(f"UPDATE ipos SET {k} = ? WHERE id = ?", (v, ipo_id))

        # Auto-calculate listing_gain
        row = db.execute("SELECT * FROM ipos WHERE id = ?", (ipo_id,)).fetchone()
        if row:
            try:
                lp = float(row["listing_price"] or 0)
                ip = float(row["issue_price"] or 0)
                if lp > 0 and ip > 0:
                    gain_pct = round((lp - ip) / ip * 100, 2)
                    gain_abs = round(lp - ip, 2)
                    db.execute(
                        "UPDATE ipos SET listing_gain = ? WHERE id = ?",
                        (f"₹{gain_abs} ({gain_pct:+.1f}%)", ipo_id),
                    )
            except (TypeError, ValueError, ZeroDivisionError):
                pass

        db.execute(
            "UPDATE ipos SET updated_at = ? WHERE id = ?",
            (datetime.now().strftime("%d-%b %H:%M"), ipo_id),
        )
        db.commit()
        return _row_to_dict(db.execute("SELECT * FROM ipos WHERE id = ?", (ipo_id,)).fetchone())

    @staticmethod
    def refresh(ipo_id: int, fetched: dict) -> dict:
        now = datetime.now().strftime("%d-%b %H:%M")
        db = get_db()
        db.execute(
            """UPDATE ipos SET open_date=?, close_date=?, allotment_date=?,
               gmp=?, issue_price=?, updated_at=? WHERE id=?""",
            (
                fetched["open_date"], fetched["close_date"],
                fetched["allotment_date"], fetched["gmp"],
                fetched["issue_price"], now, ipo_id,
            ),
        )
        db.commit()
        return _row_to_dict(db.execute("SELECT * FROM ipos WHERE id = ?", (ipo_id,)).fetchone())

    @staticmethod
    def delete(ipo_id: int, user_id: int) -> None:
        db = get_db()
        db.execute("DELETE FROM ipos WHERE id = ? AND user_id = ?", (ipo_id, user_id))
        db.commit()

    @staticmethod
    def list_all_for_user_names(user_id: int) -> List[dict]:
        """Returns minimal id + name rows for bulk refresh."""
        rows = get_db().execute(
            "SELECT id, name FROM ipos WHERE user_id = ?", (user_id,)
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
