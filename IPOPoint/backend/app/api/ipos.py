"""IPOs Blueprint — /api/ipos/* and /api/stats, /api/refresh-all, /api/export"""
import re

from flask import Blueprint, request, jsonify, send_file
from ..models.ipo import IPO, UPDATABLE_FIELDS
from ..services.scraper import fetch_investorgain, parse_ipo_block
from ..services.export import build_excel
from ..utils.auth_helpers import require_auth

ipos_bp = Blueprint("ipos", __name__)


# ── List / Add ────────────────────────────────────────────────────────────────

@ipos_bp.route("/ipos", methods=["GET"])
@require_auth
def list_ipos():
    return jsonify(IPO.list_for_user(request.user_id))


@ipos_bp.route("/ipos", methods=["POST"])
@require_auth
def add_ipo():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400

    if IPO.exists(name, request.user_id):
        return jsonify({"error": f"'{name}' already in your tracker"}), 409

    # Auto-fetch from InvestorGain
    fetched: dict = {}
    lines = fetch_investorgain()
    if lines:
        result, _ = parse_ipo_block(lines, name)
        if result:
            fetched = result

    row = IPO.create(request.user_id, name, fetched)
    return jsonify(row), 201


# ── Update ────────────────────────────────────────────────────────────────────

@ipos_bp.route("/ipos/<int:ipo_id>", methods=["PUT"])
@require_auth
def update_ipo(ipo_id: int):
    data = request.json or {}
    updates = {k: v for k, v in data.items() if k in UPDATABLE_FIELDS}
    if not updates:
        return jsonify({"error": "Nothing to update"}), 400

    if not IPO.find(ipo_id, request.user_id):
        return jsonify({"error": "Not found"}), 404

    return jsonify(IPO.update(ipo_id, updates))


# ── Refresh ───────────────────────────────────────────────────────────────────

@ipos_bp.route("/ipos/<int:ipo_id>/refresh", methods=["POST"])
@require_auth
def refresh_ipo(ipo_id: int):
    row = IPO.find(ipo_id, request.user_id)
    if not row:
        return jsonify({"error": "Not found"}), 404

    lines = fetch_investorgain()
    if not lines:
        return jsonify({"error": "Could not reach investorgain.com"}), 503

    result, _ = parse_ipo_block(lines, row["name"])
    if result:
        return jsonify(IPO.refresh(ipo_id, result))
    return jsonify(row)


@ipos_bp.route("/refresh-all", methods=["POST"])
@require_auth
def refresh_all():
    lines = fetch_investorgain()
    if not lines:
        return jsonify({"error": "Could not reach investorgain.com"}), 503

    minimal_rows = IPO.list_all_for_user_names(request.user_id)
    updated = 0
    for r in minimal_rows:
        result, _ = parse_ipo_block(lines, r["name"])
        if result:
            IPO.refresh(r["id"], result)
            updated += 1

    return jsonify({"updated": updated})


# ── Delete ────────────────────────────────────────────────────────────────────

@ipos_bp.route("/ipos/<int:ipo_id>", methods=["DELETE"])
@require_auth
def delete_ipo(ipo_id: int):
    IPO.delete(ipo_id, request.user_id)
    return jsonify({"ok": True})


# ── Stats ─────────────────────────────────────────────────────────────────────

@ipos_bp.route("/stats", methods=["GET"])
@require_auth
def get_stats():
    rows = IPO.list_for_user(request.user_id)

    total        = len(rows)
    applied      = sum(1 for r in rows if _any_applied(r))
    allotted     = sum(1 for r in rows if _any_status(r, "Allotted"))
    not_allotted = sum(1 for r in rows if _any_status(r, "Not Allotted"))

    total_gain = 0.0
    gain_count = 0
    for r in rows:
        if r.get("listing_gain"):
            m = re.search(r"₹([+-]?\d+(?:\.\d+)?)", r["listing_gain"])
            if m:
                shares = int(r.get("shares_allotted") or 0)
                total_gain += float(m.group(1)) * (shares if shares > 0 else 1)
                gain_count += 1

    win_rate = round(allotted / applied * 100) if applied > 0 else 0

    return jsonify({
        "total":        total,
        "applied":      applied,
        "allotted":     allotted,
        "not_allotted": not_allotted,
        "total_gain":   round(total_gain, 2),
        "win_rate":     win_rate,
        "gain_count":   gain_count,
    })


# ── Export ────────────────────────────────────────────────────────────────────

@ipos_bp.route("/export", methods=["GET"])
@require_auth
def export_excel():
    rows = IPO.list_for_user(request.user_id)
    buf  = build_excel(rows)
    return send_file(
        buf,
        download_name="IPO_Tracker.xlsx",
        as_attachment=True,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _any_applied(r: dict) -> bool:
    return (r.get("acc1_applied") == "Applied" or
            r.get("acc2_applied") == "Applied" or
            r.get("acc3_applied") == "Applied")


def _any_status(r: dict, status: str) -> bool:
    return (r.get("acc1_status") == status or
            r.get("acc2_status") == status or
            r.get("acc3_status") == status)
