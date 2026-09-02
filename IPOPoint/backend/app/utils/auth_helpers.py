"""Authentication helpers: password hashing, JWT, decorators, validation."""
from __future__ import annotations
import re
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
import jwt
from flask import request, jsonify, current_app


# ── Password ──────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT ───────────────────────────────────────────────────────────────────────

def make_token(user_id: int, email: str) -> str:
    expiry_hours = current_app.config.get("JWT_EXPIRY_HOURS", 24 * 7)
    payload = {
        "sub":   str(user_id),
        "email": email,
        "exp":   datetime.now(timezone.utc) + timedelta(hours=expiry_hours),
        "iat":   datetime.now(timezone.utc),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def decode_token(token: str) -> dict:
    payload = jwt.decode(
        token,
        current_app.config["SECRET_KEY"],
        algorithms=["HS256"],
    )
    payload["sub"] = int(payload["sub"])
    return payload


# ── Decorators ────────────────────────────────────────────────────────────────

def require_auth(f):
    """Verify JWT from Authorization header or cookie. Aborts 401 if missing/invalid."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired, please log in again"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        request.user_id    = payload["sub"]
        request.user_email = payload["email"]
        return f(*args, **kwargs)
    return decorated


def optional_auth(f):
    """Sets request.user_id if token present, else None. Never blocks the request."""
    @wraps(f)
    def decorated(*args, **kwargs):
        request.user_id = None
        token = _extract_token()
        if token:
            try:
                payload = decode_token(token)
                request.user_id = payload["sub"]
            except Exception:
                pass
        return f(*args, **kwargs)
    return decorated


def _extract_token() -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return request.cookies.get("auth_token") or None


# ── Input validation ──────────────────────────────────────────────────────────

def validate_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))


def validate_password(pwd: str) -> list[str]:
    errors = []
    if len(pwd) < 8:
        errors.append("At least 8 characters required")
    if not re.search(r"[A-Z]", pwd):
        errors.append("At least one uppercase letter required")
    if not re.search(r"[0-9]", pwd):
        errors.append("At least one number required")
    return errors
