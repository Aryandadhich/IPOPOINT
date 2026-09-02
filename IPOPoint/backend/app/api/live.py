"""Live IPO Blueprint — /api/live-ipos and /api/search (no auth required)."""
from flask import Blueprint, request, jsonify
from ..services.scraper import fetch_investorgain, parse_all_ipos, parse_ipo_block

live_bp = Blueprint("live", __name__)


@live_bp.route("/live-ipos", methods=["GET"])
def live_ipos():
    """Return all IPOs scraped live from InvestorGain — public endpoint."""
    lines = fetch_investorgain()
    if not lines:
        return jsonify({"error": "Could not reach investorgain.com", "ipos": []}), 503
    return jsonify(parse_all_ipos(lines))


@live_bp.route("/search", methods=["POST"])
def search():
    """Fuzzy-search InvestorGain for a specific IPO name and return its data."""
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "IPO name required"}), 400

    lines = fetch_investorgain()
    if not lines:
        return jsonify({"error": "Could not reach investorgain.com"}), 503

    result, score = parse_ipo_block(lines, name)
    if result is None:
        return jsonify({"error": f"No match found for '{name}' (score {score:.2f})"}), 404

    return jsonify(result)
