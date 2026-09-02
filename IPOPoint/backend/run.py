"""Entry point — run with: python run.py"""
import os
import sys

# ── Load .env (local dev only) ────────────────────────────────────────────────
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    port  = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "production") == "development"
    print(f"[IPOPoint] Starting on http://0.0.0.0:{port}  debug={debug}")
    app.run(debug=debug, host="0.0.0.0", port=port)
