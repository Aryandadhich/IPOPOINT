import os
import re
import secrets
import sqlite3
import time
import io
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from functools import wraps
from flask import Flask, request, jsonify, render_template, send_file, g
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager
import openpyxl
import bcrypt
import jwt

# ── Load .env file if present (local dev only) ────────────────────────────────
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

app = Flask(__name__)

# ── Secret key — MUST be set via SECRET_KEY env var in production ─────────────
_secret = os.environ.get("SECRET_KEY", "")
if not _secret:
    # Dev fallback — auto-generate a random key per process restart
    # This means JWT sessions invalidate on restart, which is fine for dev.
    # In production, always set SECRET_KEY in your environment.
    _secret = secrets.token_hex(32)
    print("WARNING: SECRET_KEY not set. Using a random key — set SECRET_KEY in production!")
app.config["SECRET_KEY"] = _secret

DB = os.path.join(os.path.dirname(__file__), "ipo_data.db")
JWT_EXPIRY_HOURS = 24 * 7   # 7 days

BROKER_LINKS = {
    "Zerodha":  "https://zerodha.com/ipo/",
    "Groww":    "https://groww.in/ipo/mainboard",
    "Dhan":     "https://dhan.co/ipo/",
}

CURRENT_GMP_RE = re.compile(r"\(([+-]?\d+(?:\.\d+)?)%\)")
DATE_RE        = re.compile(r"^\d{1,2}-[A-Za-z]{3}$")

# ── DB Setup ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
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
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER,
            name            TEXT    NOT NULL,
            open_date       TEXT,
            close_date      TEXT,
            allotment_date  TEXT,
            gmp             TEXT,
            issue_price     TEXT,
            listing_price   TEXT,
            acc1_applied    TEXT DEFAULT '',
            acc1_status     TEXT DEFAULT '',
            acc2_applied    TEXT DEFAULT '',
            acc2_status     TEXT DEFAULT '',
            acc3_applied    TEXT DEFAULT '',
            acc3_status     TEXT DEFAULT '',
            total_lots      TEXT DEFAULT '',
            allotment_status TEXT DEFAULT '',
            shares_allotted TEXT DEFAULT '',
            listing_gain    TEXT DEFAULT '',
            notes           TEXT DEFAULT '',
            updated_at      TEXT
        )
    """)
    # Migration: add user_id column if it doesn't exist yet (for existing DBs)
    try:
        conn.execute("ALTER TABLE ipos ADD COLUMN user_id INTEGER")
        conn.commit()
    except Exception:
        pass   # column already exists — ignore
    conn.commit()
    conn.close()

# ── Auth Helpers ──────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def make_token(user_id: int, email: str) -> str:
    payload = {
        "sub":   str(user_id),   # PyJWT v2 requires sub to be a string
        "email": email,
        "exp":   datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat":   datetime.now(timezone.utc),
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")

def decode_token(token: str) -> dict:
    payload = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
    payload["sub"] = int(payload["sub"])   # convert back to int
    return payload

def require_auth(f):
    """Decorator — verifies JWT from Authorization header or cookie."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            token = request.cookies.get("auth_token")
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
    """Decorator — sets request.user_id if token present, else None."""
    @wraps(f)
    def decorated(*args, **kwargs):
        request.user_id = None
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            token = request.cookies.get("auth_token")
        if token:
            try:
                payload = decode_token(token)
                request.user_id = payload["sub"]
            except Exception:
                pass
        return f(*args, **kwargs)
    return decorated

# Validation helpers
def validate_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))

def validate_password(pwd: str) -> list:
    errors = []
    if len(pwd) < 8:
        errors.append("At least 8 characters required")
    if not re.search(r"[A-Z]", pwd):
        errors.append("At least one uppercase letter required")
    if not re.search(r"[0-9]", pwd):
        errors.append("At least one number required")
    return errors

# ── Scraper ───────────────────────────────────────────────────────────────────

# Cache scraped lines for 10 minutes so multiple requests don't re-scrape
_scrape_cache = {"lines": [], "ts": 0}
CACHE_TTL = 600   # seconds

def similarity(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def fetch_investorgain():
    """Scrape investorgain IPO table using Selenium (JS-rendered page)."""
    global _scrape_cache
    now = time.time()
    if now - _scrape_cache["ts"] < CACHE_TTL and _scrape_cache["lines"]:
        return _scrape_cache["lines"]
    try:
        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=opts
        )
        driver.get("https://www.investorgain.com/report/live-ipo-gmp/331/")
        time.sleep(10)
        table_text = driver.find_element(By.TAG_NAME, "table").text
        driver.quit()
        lines = [x.strip() for x in table_text.split("\n") if x.strip()]
        _scrape_cache = {"lines": lines, "ts": now}
        return lines
    except Exception as e:
        print(f"Scrape error: {e}")
        return []

def parse_all_ipos(lines):
    """Parse ALL IPO entries from scraped lines into structured list."""
    ipos = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # IPO entry lines end with IPOC / IPOU / IPOO / IPOCT / BSE SME etc.
        is_ipo = (
            re.search(r"IPO[A-Z]*\s*$", line) or
            re.search(r"(BSE|NSE)\s+SME[A-Z]*\s*$", line)
        )
        if not is_ipo:
            i += 1
            continue

        # Clean name — strip suffix like " IPOC", " IPOU", " BSE SMEC" etc.
        raw_name = re.sub(r"\s+(IPO[A-Z]*|BSE SME[A-Z]*|NSE SME[A-Z]*)$", "", line).strip()

        # Collect block until ✅
        block = []
        j = i + 1
        while j < len(lines) and lines[j] != "✅":
            block.append(lines[j])
            j += 1

        # GMP from first price line e.g. "₹31 (15.50%)"
        gmp = None
        if block:
            m = CURRENT_GMP_RE.search(block[0])
            if m:
                gmp = round(float(m.group(1)))

        # Dates — standalone date strings
        dates = [l for l in block if DATE_RE.match(l)]

        # Issue price — "₹200.00 Cr" line gives lot price, standalone ₹NNN
        issue_price = None
        for bl in block:
            mp = re.search(r"^₹([\d,]+(?:\.\d+)?)$", bl)
            if mp:
                issue_price = mp.group(1).replace(",", "")
                break

        # Status — ALLOTTED / LISTED in the name suffix
        status = "upcoming"
        if "ALLOTTED" in line.upper():
            status = "allotted"
        elif "LISTED" in line.upper():
            status = "listed"
        elif len(dates) >= 2:
            status = "open"

        ipos.append({
            "name":           raw_name,
            "gmp":            f"{gmp}%" if gmp is not None else "",
            "gmp_num":        gmp or 0,
            "open_date":      dates[0] if len(dates) > 0 else "",
            "close_date":     dates[1] if len(dates) > 1 else "",
            "allotment_date": dates[2] if len(dates) > 2 else "",
            "issue_price":    issue_price or "",
            "status":         status,
        })
        i = j + 1   # skip past ✅
    return ipos

def parse_ipo_block(lines, name):
    """Find best match for 'name' in scraped lines and extract dates + GMP."""
    best_idx   = None
    best_score = 0

    for i, line in enumerate(lines):
        score = similarity(name, line)
        if score > best_score:
            best_score = score
            best_idx   = i

    if best_idx is None or best_score < 0.40:
        return None, best_score

    # Collect block until next ✅
    block = []
    for j in range(best_idx + 1, min(len(lines), best_idx + 30)):
        if lines[j] == "✅":
            break
        block.append(lines[j])

    dates = [l for l in block if DATE_RE.match(l)]

    gmp = None
    if block:
        m = CURRENT_GMP_RE.search(block[0])
        if m:
            gmp = round(float(m.group(1)))

    # Issue price — first ₹NNN.NN pattern in block
    issue_price = None
    for bl in block:
        mp = re.search(r"₹([\d,]+(?:\.\d+)?)", bl)
        if mp and bl.startswith("₹") and "%" not in bl:
            issue_price = mp.group(1).replace(",", "")
            break

    matched_name = lines[best_idx]

    return {
        "matched_name":    matched_name,
        "score":           round(best_score, 2),
        "open_date":       dates[0] if len(dates) > 0 else "",
        "close_date":      dates[1] if len(dates) > 1 else "",
        "allotment_date":  dates[2] if len(dates) > 2 else "",
        "gmp":             f"{gmp}%" if gmp is not None else "",
        "issue_price":     issue_price or "",
    }, best_score

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", brokers=BROKER_LINKS)

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/register")
def register_page():
    return render_template("register.html")

@app.route("/tracker")
def tracker_page():
    return render_template("tracker.html")

# ── Auth API ──────────────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def register():
    data  = request.json or {}
    name  = (data.get("name")  or "").strip()
    email = (data.get("email") or "").strip().lower()
    pwd   = data.get("password") or ""

    # Validations
    errors = {}
    if not name or len(name) < 2:
        errors["name"] = "Name must be at least 2 characters"
    if not validate_email(email):
        errors["email"] = "Enter a valid email address"
    pwd_errors = validate_password(pwd)
    if pwd_errors:
        errors["password"] = pwd_errors[0]

    if errors:
        return jsonify({"errors": errors}), 422

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"errors": {"email": "An account with this email already exists"}}), 409

    hashed = hash_password(pwd)
    conn.execute(
        "INSERT INTO users (name, email, password, created_at) VALUES (?,?,?,?)",
        (name, email, hashed, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    )
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    conn.close()

    token = make_token(user["id"], user["email"])
    resp  = jsonify({
        "message": "Account created successfully",
        "token":   token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]}
    })
    resp.set_cookie("auth_token", token, httponly=True, samesite="Lax",
                    max_age=JWT_EXPIRY_HOURS * 3600)
    return resp, 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data  = request.json or {}
    email = (data.get("email") or "").strip().lower()
    pwd   = data.get("password") or ""

    errors = {}
    if not validate_email(email):
        errors["email"] = "Enter a valid email address"
    if not pwd:
        errors["password"] = "Password is required"
    if errors:
        return jsonify({"errors": errors}), 422

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    conn.close()

    if not user or not check_password(pwd, user["password"]):
        return jsonify({"errors": {"general": "Invalid email or password"}}), 401

    token = make_token(user["id"], user["email"])
    resp  = jsonify({
        "message": "Logged in successfully",
        "token":   token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]}
    })
    resp.set_cookie("auth_token", token, httponly=True, samesite="Lax",
                    max_age=JWT_EXPIRY_HOURS * 3600)
    return resp


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    resp = jsonify({"message": "Logged out"})
    resp.delete_cookie("auth_token")
    return resp


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    conn = get_db()
    user = conn.execute("SELECT id, name, email, is_premium, created_at FROM users WHERE id=?",
                        (request.user_id,)).fetchone()
    conn.close()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(dict(user))

@app.route("/api/live-ipos", methods=["GET"])
def live_ipos():
    """Return all IPOs scraped live from investorgain — no login needed."""
    lines = fetch_investorgain()
    if not lines:
        return jsonify({"error": "Could not reach investorgain.com", "ipos": []}), 503
    ipos = parse_all_ipos(lines)
    return jsonify(ipos)


@app.route("/api/search", methods=["POST"])
def search():
    """Search investorgain for an IPO name and return fetched data."""
    data = request.json
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

@app.route("/api/ipos", methods=["GET"])
@require_auth
def list_ipos():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM ipos WHERE user_id=? ORDER BY id DESC",
        (request.user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/ipos", methods=["POST"])
@require_auth
def add_ipo():
    """Add IPO name → auto-fetch data → save to DB."""
    data = request.json
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400

    # Check duplicate per user
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM ipos WHERE LOWER(name)=LOWER(?) AND user_id=?",
        (name, request.user_id)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": f"'{name}' already in your tracker"}), 409

    # Fetch from investorgain
    lines = fetch_investorgain()
    fetched = {}
    if lines:
        result, _ = parse_ipo_block(lines, name)
        if result:
            fetched = result

    now = datetime.now().strftime("%d-%b %H:%M")
    conn.execute("""
        INSERT INTO ipos (user_id, name, open_date, close_date, allotment_date,
                          gmp, issue_price, updated_at)
        VALUES (?,?,?,?,?,?,?,?)
    """, (
        request.user_id,
        name,
        fetched.get("open_date", ""),
        fetched.get("close_date", ""),
        fetched.get("allotment_date", ""),
        fetched.get("gmp", ""),
        fetched.get("issue_price", ""),
        now,
    ))
    conn.commit()
    row = conn.execute(
        "SELECT * FROM ipos WHERE LOWER(name)=LOWER(?) AND user_id=?",
        (name, request.user_id)
    ).fetchone()
    conn.close()
    return jsonify(dict(row)), 201

@app.route("/api/ipos/<int:ipo_id>", methods=["PUT"])
@require_auth
def update_ipo(ipo_id):
    """Update any field of an IPO row (only owner can edit)."""
    data   = request.json
    fields = [
        "acc1_applied","acc1_status","acc2_applied","acc2_status",
        "acc3_applied","acc3_status","total_lots","allotment_status",
        "shares_allotted","listing_price","listing_gain","notes",
        "open_date","close_date","allotment_date","gmp","issue_price"
    ]
    updates = {k: v for k, v in data.items() if k in fields}
    if not updates:
        return jsonify({"error": "Nothing to update"}), 400

    conn = get_db()
    row = conn.execute("SELECT * FROM ipos WHERE id=? AND user_id=?",
                       (ipo_id, request.user_id)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    for k, v in updates.items():
        conn.execute(f"UPDATE ipos SET {k}=? WHERE id=?", (v, ipo_id))

    # Auto-calculate listing_gain if listing_price or issue_price updated
    row2 = conn.execute("SELECT * FROM ipos WHERE id=?", (ipo_id,)).fetchone()
    try:
        lp = float(row2["listing_price"] or 0)
        ip = float(row2["issue_price"]   or 0)
        if lp > 0 and ip > 0:
            gain_pct = round((lp - ip) / ip * 100, 2)
            gain_abs = round(lp - ip, 2)
            conn.execute(
                "UPDATE ipos SET listing_gain=? WHERE id=?",
                (f"₹{gain_abs} ({gain_pct:+.1f}%)", ipo_id)
            )
    except (TypeError, ValueError, ZeroDivisionError):
        pass

    conn.execute(
        "UPDATE ipos SET updated_at=? WHERE id=?",
        (datetime.now().strftime("%d-%b %H:%M"), ipo_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM ipos WHERE id=?", (ipo_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/ipos/<int:ipo_id>/refresh", methods=["POST"])
@require_auth
def refresh_ipo(ipo_id):
    """Re-fetch latest GMP + dates for an IPO (owner only)."""
    conn = get_db()
    row  = conn.execute("SELECT * FROM ipos WHERE id=? AND user_id=?",
                        (ipo_id, request.user_id)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    lines = fetch_investorgain()
    if not lines:
        conn.close()
        return jsonify({"error": "Could not reach investorgain.com"}), 503

    result, _ = parse_ipo_block(lines, row["name"])
    if result:
        conn.execute("""
            UPDATE ipos SET open_date=?, close_date=?, allotment_date=?,
                            gmp=?, issue_price=?, updated_at=? WHERE id=?
        """, (
            result["open_date"], result["close_date"], result["allotment_date"],
            result["gmp"], result["issue_price"],
            datetime.now().strftime("%d-%b %H:%M"), ipo_id
        ))
        conn.commit()

    row = conn.execute("SELECT * FROM ipos WHERE id=?", (ipo_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/ipos/<int:ipo_id>", methods=["DELETE"])
@require_auth
def delete_ipo(ipo_id):
    conn = get_db()
    conn.execute("DELETE FROM ipos WHERE id=? AND user_id=?",
                 (ipo_id, request.user_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/refresh-all", methods=["POST"])
@require_auth
def refresh_all():
    """Refresh GMP + dates for all of the current user's IPOs."""
    lines = fetch_investorgain()
    if not lines:
        return jsonify({"error": "Could not reach investorgain.com"}), 503

    conn = get_db()
    rows = conn.execute("SELECT id, name FROM ipos WHERE user_id=?",
                        (request.user_id,)).fetchall()
    updated = 0
    for row in rows:
        result, _ = parse_ipo_block(lines, row["name"])
        if result:
            conn.execute("""
                UPDATE ipos SET open_date=?, close_date=?, allotment_date=?,
                                gmp=?, issue_price=?, updated_at=? WHERE id=?
            """, (
                result["open_date"], result["close_date"],
                result["allotment_date"], result["gmp"],
                result["issue_price"],
                datetime.now().strftime("%d-%b %H:%M"), row["id"]
            ))
            updated += 1
    conn.commit()
    conn.close()
    return jsonify({"updated": updated})

@app.route("/api/stats", methods=["GET"])
@require_auth
def get_stats():
    """Return P&L summary for the current user's tracker."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM ipos WHERE user_id=?", (request.user_id,)
    ).fetchall()
    conn.close()

    total = len(rows)
    applied = sum(1 for r in rows if r["acc1_applied"] == "Applied"
                  or r["acc2_applied"] == "Applied" or r["acc3_applied"] == "Applied")
    allotted = sum(1 for r in rows if r["acc1_status"] == "Allotted"
                   or r["acc2_status"] == "Allotted" or r["acc3_status"] == "Allotted")
    not_allotted = sum(1 for r in rows if r["acc1_status"] == "Not Allotted"
                       or r["acc2_status"] == "Not Allotted" or r["acc3_status"] == "Not Allotted")

    total_gain = 0.0
    gain_count = 0
    for r in rows:
        if r["listing_gain"]:
            # Parse "₹45.0 (+12.5%)" — extract the ₹ amount
            m = re.search(r"₹([+-]?\d+(?:\.\d+)?)", r["listing_gain"])
            if m:
                shares = int(r["shares_allotted"] or 0)
                if shares > 0:
                    total_gain += float(m.group(1)) * shares
                else:
                    total_gain += float(m.group(1))
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

@app.route("/api/export", methods=["GET"])
@require_auth
def export_excel():
    """Export current user's tracked IPOs as Excel file."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM ipos WHERE user_id=? ORDER BY id",
        (request.user_id,)
    ).fetchall()
    conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "IPO Tracker"

    headers = [
        "IPO Name","Open Date","Close Date","Allotment Date",
        "Issue Price","GMP",
        "(S)ACC 1","Status","(A)ACC 2","Status","(R)ACC 3","Status",
        "Total Lots","Allotment Status","Shares Allotted",
        "Listing Price","Listing Gain/Loss","Notes","Updated At"
    ]
    ws.append(headers)

    for r in rows:
        ws.append([
            r["name"], r["open_date"], r["close_date"], r["allotment_date"],
            r["issue_price"], r["gmp"],
            r["acc1_applied"], r["acc1_status"],
            r["acc2_applied"], r["acc2_status"],
            r["acc3_applied"], r["acc3_status"],
            r["total_lots"], r["allotment_status"], r["shares_allotted"],
            r["listing_price"], r["listing_gain"], r["notes"], r["updated_at"]
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        download_name="IPO_Tracker.xlsx",
        as_attachment=True,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

# ── Security headers on every response ───────────────────────────────────────
@app.after_request
def set_security_headers(resp):
    resp.headers["X-Content-Type-Options"]  = "nosniff"
    resp.headers["X-Frame-Options"]         = "DENY"
    resp.headers["X-XSS-Protection"]        = "1; mode=block"
    resp.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
    # Only add HSTS in production (when served over HTTPS)
    if not app.debug:
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "production") == "development"
    app.run(debug=debug, host="0.0.0.0", port=port)
